import { NextResponse } from "next/server";
import { canonicalMerchantKey } from "@/lib/merchant-key";
import { createClient } from "@/lib/supabase/server";

const STATUSES = ["suggested", "confirmed", "dismissed"] as const;
type Status = (typeof STATUSES)[number];

/**
 * La respuesta del usuario a una domiciliación: confirmarla, descartarla, o
 * marcar una que ya no aparece.
 *
 * Esto es el aprendizaje que se pidió, y es determinístico: la fila que queda
 * aquí gana sobre cualquier score del detector. Un 'dismissed' no se vuelve a
 * sugerir nunca; un 'confirmed' sobrevive a que un mes no aparezca. Y el
 * usuario puede deshacer las dos cosas, que es lo que lo separa de un modelo
 * que "aprendió" algo y no te deja corregirlo.
 */
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const id = body.id as string | undefined;
  const status = body.status as Status | undefined;

  if (!id || !status || !STATUSES.includes(status)) {
    return NextResponse.json(
      { error: "id y status ('confirmed' | 'dismissed' | 'suggested') son requeridos" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("recurring_charges")
    .update({
      status,
      // Responder cualquier cosa cierra la pregunta de la ausencia: si la
      // confirmas sigue vigente, y si la descartas ya no importa desde cuándo
      // faltaba.
      missing_since: null,
      active: status !== "dismissed",
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, status")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json(
      { error: "Domiciliación no encontrada" },
      { status: 404 },
    );
  }

  return NextResponse.json({ recurringCharge: data });
}

/**
 * Marcar a mano un movimiento como domiciliación desde Movimientos Relevantes,
 * sin esperar a que el detector lo proponga. Crea la regla directamente en
 * 'confirmed': el usuario ya respondió con el acto de marcarla.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const transactionId = body.transactionId as string | undefined;
  if (!transactionId) {
    return NextResponse.json(
      { error: "transactionId es requerido" },
      { status: 400 },
    );
  }

  const { data: tx } = await supabase
    .from("transactions")
    .select("id, account_id, description, amount, tx_date")
    .eq("id", transactionId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!tx) {
    return NextResponse.json(
      { error: "Movimiento no encontrado" },
      { status: 404 },
    );
  }

  const merchantKey = canonicalMerchantKey(tx.description as string);
  const txDate = tx.tx_date as string;

  // Puede existir ya como sugerencia o como descartada: marcarla a mano manda
  // sobre las dos, así que se actualiza en vez de chocar con el índice único.
  const { data: existing } = await supabase
    .from("recurring_charges")
    .select("id")
    .eq("user_id", user.id)
    .eq("account_id", tx.account_id)
    .eq("merchant_key", merchantKey)
    .maybeSingle();

  const payload = {
    description: tx.description,
    merchant_key: merchantKey,
    typical_amount: Number(tx.amount),
    day_of_month: Number(txDate.slice(8, 10)),
    status: "confirmed",
    active: true,
    missing_since: null,
    last_seen: txDate,
  };

  const { data, error } = existing
    ? await supabase
        .from("recurring_charges")
        .update(payload)
        .eq("id", existing.id)
        .select("id, status")
        .single()
    : await supabase
        .from("recurring_charges")
        .insert({
          ...payload,
          user_id: user.id,
          account_id: tx.account_id,
          frequency: "monthly",
          first_seen: txDate,
          // Marcada a mano: no hay score detrás, y decir 1 sería inventarlo.
          confidence: null,
        })
        .select("id, status")
        .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ recurringCharge: data });
}
