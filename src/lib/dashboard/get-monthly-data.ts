import { createClient } from "@/lib/supabase/server";
import type { MonthlyInsight, Recommendation } from "@/lib/ai/monthly-insights";
import { resolveDashboardMonths } from "./resolve-months";
import {
  isTransactionCategory,
  type TransactionCategory,
} from "@/lib/transaction-categories";

export interface CardSummary {
  accountId: string;
  issuer: string;
  productName: string;
  statementId: string | null;
  gasto: number | null;
  limite: number | null;
  disponible: number | null;
  utilizacion: number | null; // 0-1
  deudaMsi: number;
  fechaPago: string | null;
  tasaOrdinaria: number | null;
  interesGenerado: number;
  estadoTags: CardStatusTag[];
}

export interface RelevantTransaction {
  id: string;
  accountLabel: string;
  description: string;
  amount: number;
  type: string;
  date: string;
  category: TransactionCategory | null;
  // false para MSI (la mensualidad ya está descrita por msi_plans.concept)
  // y para movimientos que coinciden con una domiciliación activa
  // detectada (editar la descripción rompería el matching de texto exacto
  // que usa detectRecurringCharges) — el usuario puede curar todo lo demás.
  isEditable: boolean;
}

export interface MsiPlanSummary {
  concept: string;
  accountLabel: string;
  monthlyPayment: number;
  installmentsPaid: number;
  totalInstallments: number | null;
}

export interface ValidationIssue {
  accountLabel: string;
  message: string;
  severity: "warning" | "error";
}

export interface MsiDebtSummary {
  accountId: string;
  accountLabel: string;
  remainingDebt: number;
  concepts: string[];
}

export interface StandingDebt {
  id: string;
  concept: string;
  amount: number;
  note: string | null;
}

export interface CategoryBreakdownEntry {
  category: TransactionCategory;
  amount: number;
}

export interface RecurringChargeSummary {
  id: string;
  description: string;
  accountLabel: string;
  typicalAmount: number;
  lastSeen: string | null;
}

export interface StatusBadge {
  text: string;
  tone: "good" | "bad" | "warning";
}

export interface MonthlyDashboardData {
  hasData: boolean;
  monthLabel: string | null; // 'YYYY-MM-01'
  availableMonths: string[]; // 'YYYY-MM', ascending, meses con statement parseado o dinero capturado a mano
  statusBadge: StatusBadge | null;
  ingresoTotal: number;
  egresoDebito: number;
  gastoTarjetas: number;
  egresoTotal: number;
  balance: number;
  msiMensualTotal: number;
  saldoDisponibleGastoLibre: number;
  ingresoRecurrente: number;
  egresoDebitoRecurrente: number;
  domiciliacionesTotal: number;
  cards: CardSummary[];
  incomes: { id: string; concept: string; amount: number; isRecurring: boolean }[];
  fixedCosts: { id: string; concept: string; amount: number; isRecurring: boolean }[];
  msiPlans: MsiPlanSummary[];
  recurringCharges: RecurringChargeSummary[];
  relevantTransactionsByAccount: {
    accountId: string;
    accountLabel: string;
    transactions: RelevantTransaction[];
    // Todas las operaciones de la cuenta este mes (incluye pagos/abonos y
    // MSI, sin el tope de 6 ni el filtro de `transactions` arriba) — para
    // el pop-up "Ver más".
    allTransactions: RelevantTransaction[];
  }[];
  categoryBreakdown: CategoryBreakdownEntry[];
  uncategorizedCount: number;
  uncleanedDescriptionsCount: number;
  validationIssues: ValidationIssue[];
  insights: MonthlyInsight[] | null;
  recommendations: Recommendation[] | null;
  previousMonthCardsTotal: number | null;
  msiDebts: MsiDebtSummary[];
  standingDebts: StandingDebt[];
}

const EMPTY_DATA: MonthlyDashboardData = {
  hasData: false,
  monthLabel: null,
  availableMonths: [],
  statusBadge: null,
  ingresoTotal: 0,
  egresoDebito: 0,
  gastoTarjetas: 0,
  egresoTotal: 0,
  balance: 0,
  msiMensualTotal: 0,
  saldoDisponibleGastoLibre: 0,
  ingresoRecurrente: 0,
  egresoDebitoRecurrente: 0,
  domiciliacionesTotal: 0,
  cards: [],
  incomes: [],
  fixedCosts: [],
  msiPlans: [],
  recurringCharges: [],
  relevantTransactionsByAccount: [],
  categoryBreakdown: [],
  uncategorizedCount: 0,
  uncleanedDescriptionsCount: 0,
  validationIssues: [],
  insights: null,
  recommendations: null,
  previousMonthCardsTotal: null,
  msiDebts: [],
  standingDebts: [],
};

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7); // 'YYYY-MM'
}

// Regla dura: el dashboard de un mes solo puede mostrar datos extraídos del
// PDF de ESE mes — nunca el estado "en vivo" de otra tabla que ya se
// actualizó con statements más nuevos. msi_plans y recurring_charges son
// tablas mutables que reflejan el estado de HOY (se sobreescriben en cada
// parseo), así que para cualquier cifra que se muestre "para el mes X" se
// usa la extracción cruda (raw_extraction) del statement de ESE mes, que sí
// quedó congelada en el momento del parseo.
interface RawMsiPlanExtraction {
  concept: string;
  monthly_payment: number;
  installment_number: number;
  total_installments: number;
  balance_remaining?: number;
}

function getStatementMsiPlans(raw: unknown): RawMsiPlanExtraction[] {
  const parsed = raw as { msi_plans?: RawMsiPlanExtraction[] } | null | undefined;
  return parsed?.msi_plans ?? [];
}

function msiPlanRemainingBalance(plan: RawMsiPlanExtraction): number {
  if (typeof plan.balance_remaining === "number") return plan.balance_remaining;
  return (
    Number(plan.monthly_payment ?? 0) *
    Math.max(0, Number(plan.total_installments ?? 0) - Number(plan.installment_number ?? 0))
  );
}

const CASH_WITHDRAWAL_RE = /retiro|disposici[oó]n|cajero/i;

// Anota cada tarjeta con lo que le pasó este mes comparado con el anterior,
// calculado con datos ya guardados, sin IA — así es instantáneo y no depende
// de qué proveedor tenga activo.
//
// El tono viaja como dato, no como emoji al frente del texto. Antes la UI
// hacía `tag.startsWith("✅")` para elegir el color, así que cambiar un emoji
// aquí rompía un color allá. La regla está en docs/design-system.md.
export interface CardStatusTag {
  text: string;
  tone: "good" | "bad" | "warn";
}

function computeCardStatusTags(opts: {
  current: { utilizacion: number | null; interesGenerado: number };
  previous: { utilizacion: number | null; interesGenerado: number } | null;
  hasCashWithdrawal: boolean;
}): CardStatusTag[] {
  const tags: CardStatusTag[] = [];

  if (opts.hasCashWithdrawal)
    tags.push({ text: "Retiro de efectivo", tone: "warn" });

  if (opts.current.interesGenerado > 0) {
    if (!opts.previous || opts.previous.interesGenerado === 0) {
      tags.push({ text: "Generó intereses", tone: "bad" });
    } else {
      tags.push({ text: "Volvió a generar intereses", tone: "bad" });
    }
  } else if (opts.previous && opts.previous.interesGenerado > 0) {
    tags.push({ text: "Ya no generó intereses", tone: "good" });
  }

  if (
    opts.current.utilizacion !== null &&
    opts.previous?.utilizacion !== null &&
    opts.previous?.utilizacion !== undefined
  ) {
    const prevPct = opts.previous.utilizacion * 100;
    const currPct = opts.current.utilizacion * 100;
    if (prevPct - currPct >= 8) {
      tags.push({
        text: `Mejoró vs mes pasado (${prevPct.toFixed(1)}% → ${currPct.toFixed(1)}%)`,
        tone: "good",
      });
    } else if (currPct - prevPct >= 8) {
      tags.push({
        text: `Subió utilización (${prevPct.toFixed(1)}% → ${currPct.toFixed(1)}%)`,
        tone: "warn",
      });
    }
  }

  if (
    tags.length === 0 &&
    opts.current.utilizacion !== null &&
    opts.current.utilizacion <= 0.4
  ) {
    tags.push({ text: "OK", tone: "good" });
  }

  return tags;
}

export async function getMonthlyDashboardData(
  targetMonth?: string,
): Promise<MonthlyDashboardData> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return EMPTY_DATA;

  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, issuer, product_name, credit_limit, rate_ordinaria")
    .eq("user_id", user.id);

  // Sin tarjetas ya no se corta aquí. Se puede tener ingresos y costos fijos
  // capturados a mano sin haber dado de alta una sola tarjeta, y cortar en
  // este punto los escondía.
  const accountById = new Map((accounts ?? []).map((a) => [a.id, a]));

  const { data: parsedStatements } = await supabase
    .from("statements")
    .select(
      "id, account_id, period_end, due_date, payment_no_interest, previous_balance, new_charges, interest_charged, raw_extraction, uploaded_at",
    )
    .eq("user_id", user.id)
    .eq("status", "parsed")
    .not("period_end", "is", null)
    .order("period_end", { ascending: false });

  // Los meses no salen solo de los PDFs: un ingreso o un costo fijo capturado
  // a mano también hace que un mes exista. Ver resolve-months.ts — ahí está el
  // bug que esto arregla.
  const [{ data: incomeMonths }, { data: fixedCostMonths }] = await Promise.all([
    supabase.from("incomes").select("month").eq("user_id", user.id),
    supabase.from("fixed_costs").select("month").eq("user_id", user.id),
  ]);

  const { month, availableMonths } = resolveDashboardMonths({
    statementMonths: (parsedStatements ?? []).map((s) =>
      monthKey(s.period_end as string),
    ),
    manualMonths: [...(incomeMonths ?? []), ...(fixedCostMonths ?? [])]
      .map((r) => (r.month ? monthKey(r.month as string) : null))
      .filter((m): m is string => m !== null),
    targetMonth,
  });

  if (month === null) return EMPTY_DATA;
  const monthPrefix = month.slice(0, 7);

  const statementsInMonthRaw = (parsedStatements ?? []).filter(
    (s) => s.period_end && monthKey(s.period_end as string) === monthPrefix,
  );

  // Dos statements "parsed" de la misma tarjeta cayendo en el mismo mes casi
  // siempre es el mismo PDF subido dos veces (ej. un intento falló y se
  // reintentó, y el intento viejo también terminó quedando en 'parsed') — no
  // dos cortes reales distintos. Si se dejan ambos, sus transacciones se
  // suman dos veces en todo el dashboard (gasto, categorías, etc.), no solo
  // se ve la tarjeta repetida en "Estado de Tarjetas". Nos quedamos con el
  // más reciente (uploaded_at) por cuenta y avisamos en Validación.
  const byAccount = new Map<string, typeof statementsInMonthRaw>();
  for (const s of statementsInMonthRaw) {
    const list = byAccount.get(s.account_id) ?? [];
    list.push(s);
    byAccount.set(s.account_id, list);
  }
  const statementsInMonth: typeof statementsInMonthRaw = [];
  const duplicateStatementGroups: { accountId: string; dropped: typeof statementsInMonthRaw }[] = [];
  for (const [accountId, list] of byAccount) {
    if (list.length === 1) {
      statementsInMonth.push(list[0]);
      continue;
    }
    const sorted = [...list].sort((a, b) =>
      (b.uploaded_at as string).localeCompare(a.uploaded_at as string),
    );
    statementsInMonth.push(sorted[0]);
    duplicateStatementGroups.push({ accountId, dropped: sorted.slice(1) });
  }

  // Regla dura, ahora más estrecha. Seguía siendo cierto que sin PDF de este
  // mes no se deben mostrar los paneles "en vivo" que no están atados al mes
  // (MSI, domiciliaciones, deudas): pintarían saldos de otro periodo como si
  // fueran de este. Lo que no era cierto es que no hubiera "nada que mostrar" —
  // los ingresos y costos fijos capturados a mano sí son de este mes, y cortar
  // aquí los escondía por completo. El usuario capturaba un ingreso y no
  // aparecía en ningún lado.
  //
  // Ya no se corta: sin statements, `cards` queda vacío y `gastoTarjetas` en 0
  // por su propio cálculo, así que la ruta normal produce justo el dashboard
  // parcial que se quiere. Solo hay que apagar los paneles sin mes.
  const hasStatementsThisMonth = statementsInMonth.length > 0;

  const [
    { data: incomes },
    { data: fixedCosts },
    { data: monthlySummary },
    { data: standingDebtsRaw },
    { data: recurringChargesRaw },
  ] = await Promise.all([
    supabase
      .from("incomes")
      .select("id, concept, amount, is_recurring")
      .eq("user_id", user.id)
      // Un ingreso cuenta para este mes si: se capturó justo para este mes
      // (temporal), o si es "fijo" (is_recurring) y su mes de captura es
      // este mes o uno anterior — un fijo nunca cuenta hacia atrás, desde
      // que se crea aplica de ahí en adelante.
      .or(`month.eq.${month},and(is_recurring.eq.true,month.lte.${month})`),
    supabase
      .from("fixed_costs")
      .select("id, concept, amount, is_recurring")
      .eq("user_id", user.id)
      // Mismo criterio que incomes arriba: temporal (mes exacto) o fijo
      // (desde su mes de captura en adelante).
      .or(`month.eq.${month},and(is_recurring.eq.true,month.lte.${month})`),
    supabase
      .from("monthly_summaries")
      .select("insights, recommendations")
      .eq("user_id", user.id)
      .eq("month", month)
      .maybeSingle(),
    // Deudas familiares/largo plazo no tienen concepto de "mes" en el
    // esquema (son un tracker vivo, no un historial) — se listan igual en
    // cualquier mes que se esté viendo. Ver aviso en get-monthly-data sobre
    // esta limitación.
    supabase
      .from("debts")
      .select("id, concept, amount, note")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true }),
    // Solo se usa para saber qué descripciones cuentan como domiciliación
    // detectada (patrón repetido) — el monto y la fecha que se muestran
    // salen de las transacciones de ESTE mes (más abajo), nunca de estos
    // campos, que se sobreescriben con cada statement nuevo sin importar el
    // mes.
    supabase
      .from("recurring_charges")
      .select("id, account_id, description")
      .eq("user_id", user.id)
      .eq("active", true),
  ]);

  const statementIds = statementsInMonth.map((s) => s.id);
  const { data: transactions } = statementIds.length
    ? await supabase
        .from("transactions")
        .select(
          "id, account_id, statement_id, tx_date, description, amount, type, category, description_cleaned",
        )
        .eq("user_id", user.id)
        .in("statement_id", statementIds)
    : { data: [] };

  const accountLabel = (accountId: string) => {
    const a = accountById.get(accountId);
    return a ? `${a.issuer} ${a.product_name}` : "Cuenta";
  };

  // --- Mes anterior (para comparar en "Próximos Pagos" y en la columna
  // "Estado" de Estado de Tarjetas) ---
  const [prevYear, prevM] = monthPrefix.split("-").map(Number);
  const previousMonthPrefix = `${prevM === 1 ? prevYear - 1 : prevYear}-${String(prevM === 1 ? 12 : prevM - 1).padStart(2, "0")}`;
  const previousMonthStatements = (parsedStatements ?? []).filter(
    (s) => s.period_end && monthKey(s.period_end as string) === previousMonthPrefix,
  );
  const previousMonthCardsTotal =
    previousMonthStatements.length > 0
      ? previousMonthStatements.reduce(
          (sum, s) => sum + Number(s.payment_no_interest ?? 0),
          0,
        )
      : null;

  const previousMonthCardByAccount = new Map(
    previousMonthStatements.map((s) => {
      const account = accountById.get(s.account_id);
      const raw = s.raw_extraction as
        | { statement?: { available_credit?: number } }
        | null
        | undefined;
      const disponible = raw?.statement?.available_credit ?? null;
      const limite = account?.credit_limit ?? null;
      const utilizacion =
        limite && disponible !== null ? (limite - disponible) / limite : null;
      return [
        s.account_id,
        { utilizacion, interesGenerado: Number(s.interest_charged ?? 0) },
      ] as const;
    }),
  );

  const accountsWithCashWithdrawal = new Set(
    (transactions ?? [])
      .filter((t) => CASH_WITHDRAWAL_RE.test(t.description))
      .map((t) => t.account_id),
  );

  // --- Tarjetas ---
  const cards: CardSummary[] = statementsInMonth.map((s) => {
    const account = accountById.get(s.account_id);
    const raw = s.raw_extraction as
      | { statement?: { available_credit?: number } }
      | null
      | undefined;
    const disponible = raw?.statement?.available_credit ?? null;
    const limite = account?.credit_limit ?? null;
    const utilizacion =
      limite && disponible !== null ? (limite - disponible) / limite : null;
    const deudaMsi = getStatementMsiPlans(s.raw_extraction)
      .filter((p) => p.installment_number < p.total_installments)
      .reduce((sum, p) => sum + Number(p.monthly_payment ?? 0), 0);
    const interesGenerado = Number(s.interest_charged ?? 0);

    return {
      accountId: s.account_id,
      issuer: account?.issuer ?? "—",
      productName: account?.product_name ?? "—",
      statementId: s.id,
      gasto: s.payment_no_interest,
      limite,
      disponible,
      utilizacion,
      deudaMsi,
      fechaPago: s.due_date,
      tasaOrdinaria: account?.rate_ordinaria ?? null,
      interesGenerado,
      estadoTags: computeCardStatusTags({
        current: { utilizacion, interesGenerado },
        previous: previousMonthCardByAccount.get(s.account_id) ?? null,
        hasCashWithdrawal: accountsWithCashWithdrawal.has(s.account_id),
      }),
    };
  });

  // --- Panorama de deudas: MSI restante por cuenta, según lo que diga el
  // statement DE ESTE MES de cada cuenta — solo cuentas con statement este
  // mes (antes se mostraban todas las cuentas con su estado "en vivo" de
  // hoy, sin importar el mes que se estuviera viendo). ---
  const msiDebts: MsiDebtSummary[] = statementsInMonth.map((s) => {
    const account = accountById.get(s.account_id);
    const plans = getStatementMsiPlans(s.raw_extraction);
    const remainingDebt = plans.reduce(
      (sum, p) => sum + msiPlanRemainingBalance(p),
      0,
    );
    return {
      accountId: s.account_id,
      accountLabel: account
        ? `${account.issuer} ${account.product_name}`
        : "Cuenta",
      remainingDebt,
      concepts: plans.map((p) => p.concept),
    };
  });

  const standingDebts: StandingDebt[] = (standingDebtsRaw ?? []).map((d) => ({
    id: d.id,
    concept: d.concept,
    amount: Number(d.amount),
    note: d.note,
  }));

  const gastoTarjetas = cards.reduce((sum, c) => sum + (c.gasto ?? 0), 0);
  const ingresoTotal = (incomes ?? []).reduce(
    (sum, i) => sum + Number(i.amount),
    0,
  );
  const egresoDebito = (fixedCosts ?? []).reduce(
    (sum, f) => sum + Number(f.amount),
    0,
  );
  const egresoTotal = gastoTarjetas + egresoDebito;
  const balance = ingresoTotal - egresoTotal;

  // --- MSI: mensualidad total y lista de planes activos, calculados con lo
  // que dice el statement DE ESTE MES de cada tarjeta (no con la tabla
  // msi_plans, que es un estado mutable "de hoy" — ver nota arriba). ---
  const statementMsiPlansByAccount = statementsInMonth.map((s) => ({
    accountLabel: accountLabel(s.account_id),
    plans: getStatementMsiPlans(s.raw_extraction).filter(
      (p) => p.installment_number < p.total_installments,
    ),
  }));
  const msiMensualTotal = statementMsiPlansByAccount.reduce(
    (sum, group) =>
      sum +
      group.plans.reduce((s2, p) => s2 + Number(p.monthly_payment ?? 0), 0),
    0,
  );
  const msiPlans: MsiPlanSummary[] = statementMsiPlansByAccount.flatMap(
    (group) =>
      group.plans.map((p) => ({
        concept: p.concept,
        accountLabel: group.accountLabel,
        monthlyPayment: Number(p.monthly_payment ?? 0),
        installmentsPaid: p.installment_number,
        totalInstallments: p.total_installments,
      })),
  );

  const transactionsList = transactions ?? [];

  // --- Domiciliaciones activas ESTE MES: recurring_charges solo dice qué
  // descripciones son un patrón detectado (histórico, comparando varios
  // statements) — el monto y la fecha que se muestran salen de las
  // transacciones DE ESTE MES, nunca de las columnas de esa tabla (que se
  // sobreescriben con cada statement nuevo sin importar el mes que se esté
  // viendo). Si la domiciliación no cobró nada este mes, no aparece.
  const recurringChargeByKey = new Map(
    (recurringChargesRaw ?? []).map((r) => [
      `${r.account_id}::${String(r.description).trim().toUpperCase()}`,
      r,
    ]),
  );
  const recurringMatchesThisMonth = new Map<
    string,
    { amounts: number[]; dates: string[] }
  >();
  for (const t of transactionsList) {
    const key = `${t.account_id}::${t.description.trim().toUpperCase()}`;
    if (!recurringChargeByKey.has(key)) continue;
    const entry = recurringMatchesThisMonth.get(key) ?? {
      amounts: [],
      dates: [],
    };
    entry.amounts.push(Number(t.amount));
    entry.dates.push(t.tx_date);
    recurringMatchesThisMonth.set(key, entry);
  }
  const recurringCharges: RecurringChargeSummary[] = Array.from(
    recurringMatchesThisMonth.entries(),
  ).map(([key, match]) => {
    const r = recurringChargeByKey.get(key)!;
    return {
      id: r.id,
      description: r.description,
      accountLabel: accountLabel(r.account_id as string),
      typicalAmount:
        match.amounts.reduce((sum, a) => sum + a, 0) / match.amounts.length,
      lastSeen: match.dates.reduce((a, b) => (a > b ? a : b)),
    };
  });

  // --- Proyección a próximo mes: solo lo que sí va a repetirse ---
  // ingresoTotal/egresoDebito de arriba son el balance REAL de este mes
  // (incluyen ingresos/costos "temporales", que por definición no vuelven a
  // aparecer). Para proyectar el próximo mes hay que usar solo la parte
  // "fija" — si no, un ingreso de un solo mes (ej. un bono) infla
  // artificialmente cuánto parece que puedes gastar el mes que sigue.
  const ingresoRecurrente = (incomes ?? [])
    .filter((i) => i.is_recurring)
    .reduce((sum, i) => sum + Number(i.amount), 0);
  const egresoDebitoRecurrente = (fixedCosts ?? [])
    .filter((f) => f.is_recurring)
    .reduce((sum, f) => sum + Number(f.amount), 0);
  const domiciliacionesTotal = recurringCharges.reduce(
    (sum, r) => sum + r.typicalAmount,
    0,
  );
  const saldoDisponibleGastoLibre =
    ingresoRecurrente -
    (egresoDebitoRecurrente + msiMensualTotal + domiciliacionesTotal);

  // --- Movimientos relevantes: top 6 por tarjeta ---
  // Claves "accountId::DESCRIPCIÓN" de domiciliaciones detectadas (el set
  // global, no solo las de este mes) — se usan para bloquear la edición
  // manual de descripción en esos movimientos (ver
  // RelevantTransaction.isEditable), sin importar si cobraron justo este
  // mes o no.
  const recurringDescriptionKeys = new Set(recurringChargeByKey.keys());

  const toRelevant = (t: (typeof transactionsList)[number]): RelevantTransaction => ({
    id: t.id,
    accountLabel: accountLabel(t.account_id),
    description: t.description,
    amount: Number(t.amount),
    type: t.type,
    isEditable:
      t.type !== "msi" &&
      !recurringDescriptionKeys.has(
        `${t.account_id}::${t.description.trim().toUpperCase()}`,
      ),
    date: t.tx_date,
    category: isTransactionCategory(t.category) ? t.category : null,
  });

  const relevantTransactionsByAccount = statementsInMonth
    .map((s) => {
      const accountTxs = transactionsList.filter((t) => t.account_id === s.account_id);
      const txs = accountTxs
        .filter((t) => t.type !== "payment")
        .slice()
        .sort((a, b) => Math.abs(Number(b.amount)) - Math.abs(Number(a.amount)))
        .slice(0, 6)
        .map(toRelevant);
      const allTxs = accountTxs
        .slice()
        .sort((a, b) => (a.tx_date < b.tx_date ? 1 : -1))
        .map(toRelevant);
      return {
        accountId: s.account_id,
        accountLabel: accountLabel(s.account_id),
        transactions: txs,
        allTransactions: allTxs,
      };
    })
    .filter((group) => group.allTransactions.length > 0);

  // --- Gasto por categoría (excluye pagos/abonos, solo cargos positivos) ---
  const categoryTotals = new Map<TransactionCategory, number>();
  let uncategorizedCount = 0;
  for (const t of transactionsList) {
    const amount = Number(t.amount);
    if (t.type === "payment" || amount <= 0) continue;
    if (t.category === null || t.category === undefined) {
      uncategorizedCount++;
      continue;
    }
    const category = isTransactionCategory(t.category) ? t.category : "otros";
    categoryTotals.set(category, (categoryTotals.get(category) ?? 0) + amount);
  }
  const uncleanedDescriptionsCount = transactionsList.filter(
    (t) => !t.description_cleaned,
  ).length;

  const categoryBreakdown: CategoryBreakdownEntry[] = Array.from(
    categoryTotals.entries(),
  )
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  // --- Validación: avisos del Skill + checks de consistencia ---
  const validationIssues: ValidationIssue[] = [];
  for (const group of duplicateStatementGroups) {
    const label = accountLabel(group.accountId);
    const droppedDates = group.dropped
      .map((s) => new Date(s.uploaded_at as string).toLocaleDateString("es-MX"))
      .join(", ");
    validationIssues.push({
      accountLabel: label,
      message: `Se encontraron ${group.dropped.length + 1} estados de cuenta para este mes en esta tarjeta — se usó el más reciente y se ignoraron los subidos el ${droppedDates} para no contar el gasto dos veces. Si de verdad son cortes distintos (no un PDF duplicado), avisa para revisarlo.`,
      severity: "warning",
    });
  }
  for (const s of statementsInMonth) {
    const label = accountLabel(s.account_id);
    const raw = s.raw_extraction as { warnings?: string[] } | null | undefined;
    for (const w of raw?.warnings ?? []) {
      validationIssues.push({ accountLabel: label, message: w, severity: "warning" });
    }

    const prev = Number(s.previous_balance ?? 0);
    const nuevo = Number(s.new_charges ?? 0);
    const interes = Number(s.interest_charged ?? 0);
    const abonos = (transactions ?? [])
      .filter((t) => t.statement_id === s.id && t.type === "payment")
      .reduce((sum, t) => sum + Number(t.amount), 0); // negativo
    const esperado = prev + nuevo + interes + abonos;
    const declarado = Number(s.payment_no_interest ?? 0);
    if (Math.abs(esperado - declarado) > 1) {
      validationIssues.push({
        accountLabel: label,
        message: `El saldo declarado ($${declarado.toFixed(2)}) no cuadra con anterior + cargos + intereses + abonos ($${esperado.toFixed(2)}). Diferencia: $${(declarado - esperado).toFixed(2)}.`,
        severity: "error",
      });
    }
  }

  const statusBadge: StatusBadge = balance < 0
    ? { text: "Balance negativo este mes", tone: "bad" }
    : { text: "Balance positivo este mes", tone: "good" };

  return {
    // Un mes tiene datos si trae statement o si trae dinero capturado a mano.
    // Con `targetMonth` puesto a pelo en la URL se puede llegar a un mes sin
    // nada de nada, y ahí el dashboard debe decir que está vacío en vez de
    // pintar una fila de ceros como si fueran cifras reales.
    hasData:
      hasStatementsThisMonth ||
      (incomes ?? []).length > 0 ||
      (fixedCosts ?? []).length > 0,
    monthLabel: month,
    availableMonths,
    statusBadge,
    ingresoTotal,
    egresoDebito,
    gastoTarjetas,
    egresoTotal,
    balance,
    msiMensualTotal,
    saldoDisponibleGastoLibre,
    ingresoRecurrente,
    egresoDebitoRecurrente,
    domiciliacionesTotal,
    cards,
    incomes: (incomes ?? []).map((i) => ({
      id: i.id,
      concept: i.concept,
      amount: Number(i.amount),
      isRecurring: Boolean(i.is_recurring),
    })),
    fixedCosts: (fixedCosts ?? []).map((f) => ({
      id: f.id,
      concept: f.concept,
      amount: Number(f.amount),
      isRecurring: Boolean(f.is_recurring),
    })),
    msiPlans,
    recurringCharges: hasStatementsThisMonth ? recurringCharges : [],
    relevantTransactionsByAccount,
    categoryBreakdown,
    uncategorizedCount,
    uncleanedDescriptionsCount,
    validationIssues,
    insights: (monthlySummary?.insights as MonthlyInsight[] | null) ?? null,
    recommendations:
      (monthlySummary?.recommendations as Recommendation[] | null) ?? null,
    previousMonthCardsTotal,
    msiDebts,
    standingDebts: hasStatementsThisMonth ? standingDebts : [],
  };
}
