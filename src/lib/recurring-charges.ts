import type { SupabaseClient } from "@supabase/supabase-js";

// Detección de domiciliaciones: compara descripciones repetidas entre los
// últimos statements parseados de una cuenta (sin IA — es determinístico,
// basado en datos ya guardados). Un cargo se considera domiciliación activa
// si su descripción normalizada aparece en 2+ de los últimos 3 statements.
// Coincidencia por texto exacto (normalizado) — no hay fuzzy matching; si el
// banco cambia ligeramente la descripción entre meses, no se detecta.

const HISTORY_LIMIT = 3;
const MIN_OCCURRENCES = 2;
const RECURRING_TYPES = ["regular", "fee"];

function normalizeDescription(description: string): string {
  return description.trim().toUpperCase();
}

export async function detectRecurringCharges(opts: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>;
  userId: string;
  accountId: string;
  statementId: string; // el statement recién parseado
}): Promise<void> {
  const { data: recentStatements } = await opts.supabase
    .from("statements")
    .select("id, period_end")
    .eq("user_id", opts.userId)
    .eq("account_id", opts.accountId)
    .eq("status", "parsed")
    .not("period_end", "is", null)
    .order("period_end", { ascending: false })
    .limit(HISTORY_LIMIT);

  const statementIds = (recentStatements ?? []).map((s) => s.id as string);
  if (statementIds.length < MIN_OCCURRENCES) return;

  const { data: txs } = await opts.supabase
    .from("transactions")
    .select("statement_id, description, amount, tx_date, type")
    .eq("user_id", opts.userId)
    .eq("account_id", opts.accountId)
    .in("statement_id", statementIds)
    .in("type", RECURRING_TYPES);

  const groups = new Map<
    string,
    {
      originalDescription: string;
      statementIds: Set<string>;
      amounts: number[];
      dates: string[];
    }
  >();

  for (const t of txs ?? []) {
    const key = normalizeDescription(t.description as string);
    const group = groups.get(key) ?? {
      originalDescription: t.description as string,
      statementIds: new Set<string>(),
      amounts: [],
      dates: [],
    };
    group.statementIds.add(t.statement_id as string);
    group.amounts.push(Number(t.amount));
    group.dates.push(t.tx_date as string);
    groups.set(key, group);
  }

  for (const [, group] of groups) {
    if (group.statementIds.size < MIN_OCCURRENCES) continue;

    const typicalAmount =
      group.amounts.reduce((sum, a) => sum + a, 0) / group.amounts.length;
    const firstSeen = group.dates.reduce((a, b) => (a < b ? a : b));
    const lastSeen = group.dates.reduce((a, b) => (a > b ? a : b));

    const { data: existing } = await opts.supabase
      .from("recurring_charges")
      .select("id")
      .eq("user_id", opts.userId)
      .eq("account_id", opts.accountId)
      .eq("description", group.originalDescription)
      .maybeSingle();

    if (existing) {
      await opts.supabase
        .from("recurring_charges")
        .update({
          typical_amount: typicalAmount,
          last_seen: lastSeen,
          active: true,
        })
        .eq("id", existing.id);
    } else {
      await opts.supabase.from("recurring_charges").insert({
        user_id: opts.userId,
        account_id: opts.accountId,
        description: group.originalDescription,
        typical_amount: typicalAmount,
        frequency: "monthly",
        first_seen: firstSeen,
        last_seen: lastSeen,
        active: true,
      });
    }
  }

  // Desactiva domiciliaciones que ya no aparecieron en el statement recién
  // parseado (el usuario canceló el servicio o dejó de usarse esa tarjeta).
  const { data: activeCharges } = await opts.supabase
    .from("recurring_charges")
    .select("id, description")
    .eq("user_id", opts.userId)
    .eq("account_id", opts.accountId)
    .eq("active", true);

  const seenThisStatement = new Set(
    (txs ?? [])
      .filter((t) => t.statement_id === opts.statementId)
      .map((t) => normalizeDescription(t.description as string)),
  );

  for (const charge of activeCharges ?? []) {
    if (!seenThisStatement.has(normalizeDescription(charge.description as string))) {
      await opts.supabase
        .from("recurring_charges")
        .update({ active: false })
        .eq("id", charge.id);
    }
  }
}
