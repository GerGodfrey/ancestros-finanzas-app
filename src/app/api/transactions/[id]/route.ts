import { NextResponse } from "next/server";
import { canonicalMerchantKey } from "@/lib/merchant-key";
import { createClient } from "@/lib/supabase/server";
import { isTransactionCategory } from "@/lib/transaction-categories";

// Edición manual de un movimiento (curar descripción y/o categoría) — el
// usuario puede corregir lo que la IA dejó mal. Bloqueado para MSI (la
// mensualidad ya está descrita por msi_plans.concept) y para movimientos
// que ya son una domiciliación conocida — mismo criterio que
// RelevantTransaction.isEditable en get-monthly-data.ts, revalidado aquí
// server-side.
//
// El motivo cambió con 0011: el emparejamiento ya no es por texto exacto sino
// por `merchant_key`, así que una edición menor ya no rompe la cadena. Se sigue
// bloqueando por otra razón — la descripción es lo que el usuario reconoce como
// "su Netflix", y renombrarla desde aquí deja la regla apuntando a un nombre
// que ya no existe en ningún estado de cuenta.
export async function PATCH(
  request: Request,
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

  const { data: tx, error: txError } = await supabase
    .from("transactions")
    .select("id, type, account_id, description")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (txError || !tx) {
    return NextResponse.json({ error: "Movimiento no encontrado" }, { status: 404 });
  }

  if (tx.type === "msi") {
    return NextResponse.json(
      { error: "No se puede editar un movimiento de MSI — edita el plan en su lugar." },
      { status: 400 },
    );
  }

  // Por `merchant_key` y por `status`, igual que el dashboard. Antes era
  // `ilike` sobre la descripción y `active = true`: el `ilike` fallaba en
  // cuanto la IA escribía el nombre distinto, y `active` dejó de ser la fuente
  // de verdad en 0011.
  const { data: recurringMatch } = await supabase
    .from("recurring_charges")
    .select("id")
    .eq("user_id", user.id)
    .eq("account_id", tx.account_id)
    .in("status", ["suggested", "confirmed"])
    .eq("merchant_key", canonicalMerchantKey(tx.description as string))
    .maybeSingle();

  if (recurringMatch) {
    return NextResponse.json(
      {
        error:
          "Este movimiento es parte de una domiciliación detectada — no se puede editar para no perder el reconocimiento automático.",
      },
      { status: 400 },
    );
  }

  const body = await request.json();
  const update: Record<string, unknown> = {};

  if (typeof body.description === "string" && body.description.trim()) {
    update.description = body.description.trim();
    update.description_cleaned = true;
  }
  if (isTransactionCategory(body.category)) {
    update.category = body.category;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { error: "Nada que actualizar — manda description y/o category." },
      { status: 400 },
    );
  }

  const { error: updateError } = await supabase
    .from("transactions")
    .update(update)
    .eq("id", id)
    .eq("user_id", user.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
