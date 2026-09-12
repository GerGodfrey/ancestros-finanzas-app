import type { SupabaseClient } from "@supabase/supabase-js";
import { canonicalMerchantKey } from "./merchant-key";
import { classifyRecurring, type Occurrence } from "./recurring-rules";

/**
 * Detección de domiciliaciones. Determinístico, sin IA, sobre datos ya
 * guardados.
 *
 * La versión anterior tenía una sola regla: la misma descripción exacta en 2 de
 * los últimos 3 estados de cuenta, aceptando `type` 'regular' y 'fee'. Tres
 * defectos, y el segundo no era obvio:
 *
 * 1. `fee` son cargos del banco. «Gastos de Cobranza» se repite cada mes y
 *    entraba como domiciliación; no es un servicio que contrataste.
 * 2. Las descripciones las limpia una IA al parsear, y comparar por igualdad de
 *    cadenas contra una salida que varía cada mes garantiza falsos negativos.
 *    Ahora se agrupa por `canonicalMerchantKey`.
 * 3. No miraba monto ni fecha, que son las dos señales que separan una
 *    suscripción de una compra habitual en el mismo comercio.
 *
 * Y una cosa que no era un defecto de detección sino de trato: cuando una
 * domiciliación confirmada dejaba de aparecer, se ponía `active = false` y
 * desaparecía sin decir nada. Ahora se marca `missing_since` y se pregunta.
 */

const HISTORY_LIMIT = 3;
/** `fee` fuera: son comisiones del banco, no servicios contratados. */
const RECURRING_TYPES = ["regular"];

export interface Group {
  merchantKey: string;
  description: string;
  occurrences: Occurrence[];
}

/**
 * Lee los últimos cortes de una cuenta y agrupa sus movimientos por comercio.
 *
 * Se exporta para que el script de reevaluación pueda mirar lo mismo que ve el
 * detector sin repetir la consulta — y sobre todo sin repetir el criterio, que
 * es donde se desincronizan dos copias de la misma lógica.
 */
export async function loadAccountGroups(opts: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>;
  userId: string;
  accountId: string;
}): Promise<{
  groups: Map<string, Group>;
  monthByStatement: Map<string, string>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  txs: any[];
}> {
  const { data: recentStatements } = await opts.supabase
    .from("statements")
    .select("id, period_end")
    .eq("user_id", opts.userId)
    .eq("account_id", opts.accountId)
    .eq("status", "parsed")
    .not("period_end", "is", null)
    .order("period_end", { ascending: false })
    .limit(HISTORY_LIMIT);

  const monthByStatement = new Map(
    (recentStatements ?? []).map((s) => [
      s.id as string,
      (s.period_end as string).slice(0, 7),
    ]),
  );

  const groups = new Map<string, Group>();
  if (monthByStatement.size === 0) return { groups, monthByStatement, txs: [] };

  const { data: txs } = await opts.supabase
    .from("transactions")
    .select("statement_id, description, amount, tx_date, type")
    .eq("user_id", opts.userId)
    .eq("account_id", opts.accountId)
    .in("statement_id", [...monthByStatement.keys()])
    .in("type", RECURRING_TYPES);

  for (const t of txs ?? []) {
    const description = t.description as string;
    const merchantKey = canonicalMerchantKey(description);
    const month = monthByStatement.get(t.statement_id as string);
    if (!month) continue;

    const group = groups.get(merchantKey) ?? {
      merchantKey,
      description,
      occurrences: [],
    };
    group.occurrences.push({
      month,
      amount: Number(t.amount),
      dayOfMonth: Number((t.tx_date as string).slice(8, 10)),
    });
    groups.set(merchantKey, group);
  }

  return { groups, monthByStatement, txs: txs ?? [] };
}

export async function detectRecurringCharges(opts: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>;
  userId: string;
  accountId: string;
  statementId: string; // el statement recién parseado
}): Promise<void> {
  const { groups, monthByStatement, txs } = await loadAccountGroups(opts);
  if (monthByStatement.size === 0) return;

  // Lo que el usuario ya respondió manda sobre cualquier score. Un 'dismissed'
  // es "no me vuelvas a sugerir esto" y se respeta para siempre; un 'confirmed'
  // sobrevive aunque un mes no aparezca. Es el aprendizaje que se pidió:
  // determinístico, explicable, y el usuario puede deshacerlo.
  const { data: existingRows } = await opts.supabase
    .from("recurring_charges")
    .select("id, merchant_key, status")
    .eq("user_id", opts.userId)
    .eq("account_id", opts.accountId);

  const existingByKey = new Map(
    (existingRows ?? [])
      .filter((r) => r.merchant_key)
      .map((r) => [r.merchant_key as string, r]),
  );

  const currentMonth = monthByStatement.get(opts.statementId);

  for (const group of groups.values()) {
    const existing = existingByKey.get(group.merchantKey);
    if (existing?.status === "dismissed") continue;

    const verdict = classifyRecurring({
      description: group.description,
      occurrences: group.occurrences,
    });

    const typicalAmount =
      group.occurrences.reduce((s, o) => s + o.amount, 0) /
      group.occurrences.length;
    const dates = group.occurrences.map((o) => o.month);

    if (!verdict.isRecurring) {
      // Si ya estaba confirmada, no se toca: el usuario sabe más que el score.
      if (existing?.status === "confirmed") continue;
      if (existing) {
        await opts.supabase
          .from("recurring_charges")
          .update({ status: "dismissed", confidence: verdict.confidence })
          .eq("id", existing.id);
      }
      continue;
    }

    const payload = {
      description: group.description,
      merchant_key: group.merchantKey,
      typical_amount: typicalAmount,
      confidence: verdict.confidence,
      day_of_month: verdict.dayOfMonth,
      amount_cv: verdict.amountCv,
      last_seen: `${dates.reduce((a, b) => (a > b ? a : b))}-01`,
      missing_since: null,
      active: true,
    };

    if (existing) {
      await opts.supabase
        .from("recurring_charges")
        .update(payload)
        .eq("id", existing.id);
    } else {
      await opts.supabase.from("recurring_charges").insert({
        ...payload,
        user_id: opts.userId,
        account_id: opts.accountId,
        frequency: "monthly",
        first_seen: `${dates.reduce((a, b) => (a < b ? a : b))}-01`,
        status: "suggested",
      });
    }
  }

  // --- Ausencias -----------------------------------------------------------
  // Una domiciliación confirmada que no apareció en el statement recién
  // parseado no se apaga: se marca desde cuándo falta, para poder preguntar
  // "¿la cancelaste?" en vez de borrarla a espaldas del usuario.
  if (!currentMonth) return;

  const seenThisStatement = new Set(
    (txs ?? [])
      .filter((t) => t.statement_id === opts.statementId)
      .map((t) => canonicalMerchantKey(t.description as string)),
  );

  for (const row of existingRows ?? []) {
    if (row.status !== "confirmed" || !row.merchant_key) continue;
    if (seenThisStatement.has(row.merchant_key as string)) continue;

    await opts.supabase
      .from("recurring_charges")
      .update({ missing_since: `${currentMonth}-01` })
      .eq("id", row.id)
      .is("missing_since", null);
  }
}
