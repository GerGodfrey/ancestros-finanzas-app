import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decryptSecret } from "@/lib/crypto";
import { parseStatementPdf } from "@/lib/ai/parse-statement";
import { regenerateMonthlySummary } from "@/lib/ai/monthly-insights";
import { detectRecurringCharges } from "@/lib/recurring-charges";
import type { Provider } from "@/lib/ai/gateway";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { data: statement, error: statementError } = await supabase
    .from("statements")
    .select("id, account_id, file_path, status")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (statementError || !statement) {
    return NextResponse.json(
      { error: "Estado de cuenta no encontrado" },
      { status: 404 },
    );
  }

  const { data: credential, error: credentialError } = await supabase
    .from("provider_credentials")
    .select("provider, api_key_encrypted")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .single();

  if (credentialError || !credential) {
    return NextResponse.json(
      {
        error:
          "No tienes ningún proveedor de IA activo. Ve a Configuración y agrega una API key.",
      },
      { status: 400 },
    );
  }

  const { data: fileBlob, error: downloadError } = await supabase.storage
    .from("statements")
    .download(statement.file_path);

  if (downloadError || !fileBlob) {
    return NextResponse.json(
      { error: `No se pudo descargar el PDF: ${downloadError?.message}` },
      { status: 500 },
    );
  }

  const pdfBuffer = Buffer.from(await fileBlob.arrayBuffer());
  const apiKey = decryptSecret(credential.api_key_encrypted);
  const provider = credential.provider as Provider;

  let result;
  try {
    result = await parseStatementPdf({ provider, apiKey, pdfBuffer });
  } catch (err) {
    await supabase
      .from("statements")
      .update({ status: "error" })
      .eq("id", id);
    return NextResponse.json(
      {
        error: `Falló el parseo: ${err instanceof Error ? err.message : "error desconocido"}`,
      },
      { status: 500 },
    );
  }

  const { data: parsed, warnings } = result;
  const s = parsed.statement as Record<string, unknown>;
  const a = parsed.account as Record<string, unknown>;

  // 0) Sincroniza límite/tasas de la cuenta con lo que diga el PDF más
  // reciente (el usuario suele crear la tarjeta sin estos datos a mano,
  // antes de tener un PDF que los traiga — y el banco los puede cambiar).
  const accountUpdate: Record<string, unknown> = {};
  if (a.credit_limit !== undefined && a.credit_limit !== null) {
    accountUpdate.credit_limit = a.credit_limit;
  }
  if (a.rate_ordinaria !== undefined && a.rate_ordinaria !== null) {
    accountUpdate.rate_ordinaria = a.rate_ordinaria;
  }
  if (a.rate_moratoria !== undefined && a.rate_moratoria !== null) {
    accountUpdate.rate_moratoria = a.rate_moratoria;
  }
  if (Object.keys(accountUpdate).length > 0) {
    await supabase
      .from("accounts")
      .update(accountUpdate)
      .eq("id", statement.account_id)
      .eq("user_id", user.id);
  }

  // 1) Actualiza la fila de statements con los datos extraídos
  const { error: updateError } = await supabase
    .from("statements")
    .update({
      period_start: s.period_start ?? null,
      period_end: s.period_end ?? null,
      cut_date: s.cut_date ?? null,
      due_date: s.due_date ?? null,
      previous_balance: s.previous_balance ?? null,
      new_charges: s.new_charges ?? null,
      payment_no_interest: s.payment_no_interest ?? null,
      payment_minimum: s.payment_minimum ?? null,
      interest_charged: s.interest_charged ?? 0,
      iva_interest: s.iva_interest ?? 0,
      status: "parsed",
      raw_extraction: parsed,
      parsed_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // 2) Upsert de planes MSI (por account_id + concepto, mientras estén activos)
  const msiPlanIdByConcept: Record<string, string> = {};
  for (const plan of parsed.msi_plans ?? []) {
    const concept = String(plan.concept);
    const { data: existing } = await supabase
      .from("msi_plans")
      .select("id")
      .eq("account_id", statement.account_id)
      .eq("concept", concept)
      .eq("status", "active")
      .maybeSingle();

    const installmentNumber = Number(plan.installment_number ?? 0);
    const totalInstallments = Number(plan.total_installments ?? 0);
    const isFinished =
      totalInstallments > 0 && installmentNumber >= totalInstallments;

    if (existing) {
      await supabase
        .from("msi_plans")
        .update({
          installments_paid: installmentNumber,
          monthly_payment: plan.monthly_payment,
          status: isFinished ? "finished" : "active",
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      msiPlanIdByConcept[concept] = existing.id;
    } else {
      const { data: inserted } = await supabase
        .from("msi_plans")
        .insert({
          user_id: user.id,
          account_id: statement.account_id,
          concept,
          original_amount: plan.original_amount,
          monthly_payment: plan.monthly_payment,
          total_installments: totalInstallments || null,
          installments_paid: installmentNumber,
          first_statement_id: id,
          status: isFinished ? "finished" : "active",
        })
        .select("id")
        .single();
      if (inserted) msiPlanIdByConcept[concept] = inserted.id;
    }
  }

  // 3) Inserta las transacciones
  const transactionRows = (parsed.transactions ?? []).map((tx) => ({
    user_id: user.id,
    statement_id: id,
    account_id: statement.account_id,
    tx_date: tx.tx_date,
    description: tx.description,
    amount: tx.amount,
    type: tx.type,
    category: tx.category ?? null,
    msi_plan_id: tx.msi_ref
      ? (msiPlanIdByConcept[String(tx.msi_ref)] ?? null)
      : null,
  }));

  if (transactionRows.length > 0) {
    const { error: txError } = await supabase
      .from("transactions")
      .insert(transactionRows);
    if (txError) {
      return NextResponse.json({ error: txError.message }, { status: 500 });
    }
  }

  // 4) Detecta domiciliaciones (compara descripciones repetidas entre los
  // últimos statements de esta cuenta) — determinístico, sin IA, no bloquea
  // la respuesta si falla.
  try {
    await detectRecurringCharges({
      supabase,
      userId: user.id,
      accountId: statement.account_id,
      statementId: id,
    });
  } catch {
    // No es crítico para el flujo de parseo — se puede reintentar en el
    // próximo statement de esta cuenta.
  }

  // 5) Regenera los insights + recomendaciones del mes ("3 cosas que
  // pasaron este mes" y "Recomendaciones y Próximos Pasos") con los datos
  // ya guardados — no bloquea la respuesta si falla, ya que el parseo en sí
  // ya terminó bien.
  let insightsError: string | null = null;
  if (s.period_end) {
    try {
      await regenerateMonthlySummary({
        supabase,
        userId: user.id,
        provider,
        apiKey,
        month: `${String(s.period_end).slice(0, 7)}-01`,
      });
    } catch (err) {
      insightsError = err instanceof Error ? err.message : "error desconocido";
    }
  }

  return NextResponse.json({
    ok: true,
    transactionsInserted: transactionRows.length,
    msiPlans: Object.keys(msiPlanIdByConcept).length,
    warnings,
    insightsError,
  });
}
