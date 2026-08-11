import { createClient } from "@/lib/supabase/server";
import type { MonthlyInsight, Recommendation } from "@/lib/ai/monthly-insights";
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
  estadoTags: string[];
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
  statusBadge: StatusBadge | null;
  ingresoTotal: number;
  egresoDebito: number;
  gastoTarjetas: number;
  egresoTotal: number;
  balance: number;
  msiMensualTotal: number;
  saldoDisponibleGastoLibre: number;
  cards: CardSummary[];
  incomes: { id: string; concept: string; amount: number; isRecurring: boolean }[];
  fixedCosts: { id: string; concept: string; amount: number; isRecurring: boolean }[];
  msiPlans: MsiPlanSummary[];
  recurringCharges: RecurringChargeSummary[];
  relevantTransactionsByAccount: {
    accountId: string;
    accountLabel: string;
    transactions: RelevantTransaction[];
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
  statusBadge: null,
  ingresoTotal: 0,
  egresoDebito: 0,
  gastoTarjetas: 0,
  egresoTotal: 0,
  balance: 0,
  msiMensualTotal: 0,
  saldoDisponibleGastoLibre: 0,
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

function firstOfMonth(dateStr: string): string {
  return `${monthKey(dateStr)}-01`;
}

const CASH_WITHDRAWAL_RE = /retiro|disposici[oó]n|cajero/i;

// Anota cada tarjeta con lo que le pasó este mes comparado con el anterior —
// mismo criterio que la columna "Estado" del dashboard viejo (ej. "🚨 Generó
// intereses", "✅ Mejoró vs mes pasado"), calculado con datos ya guardados,
// sin IA — así es instantáneo y no depende de qué proveedor tenga activo.
function computeCardStatusTags(opts: {
  current: { utilizacion: number | null; interesGenerado: number };
  previous: { utilizacion: number | null; interesGenerado: number } | null;
  hasCashWithdrawal: boolean;
}): string[] {
  const tags: string[] = [];

  if (opts.hasCashWithdrawal) tags.push("⚠️ Retiro de efectivo");

  if (opts.current.interesGenerado > 0) {
    if (!opts.previous || opts.previous.interesGenerado === 0) {
      tags.push("🚨 Generó intereses");
    } else {
      tags.push("🚨 Volvió a generar intereses");
    }
  } else if (opts.previous && opts.previous.interesGenerado > 0) {
    tags.push("✅ Ya no generó intereses");
  }

  if (
    opts.current.utilizacion !== null &&
    opts.previous?.utilizacion !== null &&
    opts.previous?.utilizacion !== undefined
  ) {
    const prevPct = opts.previous.utilizacion * 100;
    const currPct = opts.current.utilizacion * 100;
    if (prevPct - currPct >= 8) {
      tags.push(
        `✅ Mejoró vs mes pasado (${prevPct.toFixed(1)}% → ${currPct.toFixed(1)}%)`,
      );
    } else if (currPct - prevPct >= 8) {
      tags.push(
        `⚠️ Subió utilización (${prevPct.toFixed(1)}% → ${currPct.toFixed(1)}%)`,
      );
    }
  }

  if (
    tags.length === 0 &&
    opts.current.utilizacion !== null &&
    opts.current.utilizacion <= 0.4
  ) {
    tags.push("✅ OK");
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

  if (!accounts || accounts.length === 0) return EMPTY_DATA;

  const accountById = new Map(accounts.map((a) => [a.id, a]));

  const { data: parsedStatements } = await supabase
    .from("statements")
    .select(
      "id, account_id, period_end, due_date, payment_no_interest, previous_balance, new_charges, interest_charged, raw_extraction",
    )
    .eq("user_id", user.id)
    .eq("status", "parsed")
    .not("period_end", "is", null)
    .order("period_end", { ascending: false });

  if (!parsedStatements || parsedStatements.length === 0) return EMPTY_DATA;

  const month =
    targetMonth ?? firstOfMonth(parsedStatements[0].period_end as string);
  const monthPrefix = month.slice(0, 7);

  const statementsInMonth = parsedStatements.filter(
    (s) => s.period_end && monthKey(s.period_end as string) === monthPrefix,
  );

  const [
    { data: incomes },
    { data: fixedCosts },
    { data: msiPlansRaw },
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
      .from("msi_plans")
      .select(
        "concept, account_id, monthly_payment, installments_paid, total_installments",
      )
      .eq("user_id", user.id)
      .eq("status", "active"),
    supabase
      .from("monthly_summaries")
      .select("insights, recommendations")
      .eq("user_id", user.id)
      .eq("month", month)
      .maybeSingle(),
    supabase
      .from("debts")
      .select("id, concept, amount, note")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("recurring_charges")
      .select("id, account_id, description, typical_amount, last_seen")
      .eq("user_id", user.id)
      .eq("active", true)
      .order("typical_amount", { ascending: false }),
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
  const previousMonthStatements = parsedStatements.filter(
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
    const deudaMsi = (msiPlansRaw ?? [])
      .filter((p) => p.account_id === s.account_id)
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

  // --- Panorama de deudas: MSI restante por cuenta (todas las cuentas, no
  // solo las que tuvieron statement este mes) ---
  const msiDebts: MsiDebtSummary[] = accounts.map((account) => {
    const plans = (msiPlansRaw ?? []).filter(
      (p) => p.account_id === account.id,
    );
    const remainingDebt = plans.reduce(
      (sum, p) =>
        sum +
        Number(p.monthly_payment ?? 0) *
          Math.max(
            0,
            Number(p.total_installments ?? 0) -
              Number(p.installments_paid ?? 0),
          ),
      0,
    );
    return {
      accountId: account.id,
      accountLabel: `${account.issuer} ${account.product_name}`,
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
  const msiMensualTotal = (msiPlansRaw ?? []).reduce(
    (sum, p) => sum + Number(p.monthly_payment ?? 0),
    0,
  );
  const saldoDisponibleGastoLibre =
    ingresoTotal - (egresoDebito + msiMensualTotal);

  // --- Movimientos relevantes: top 6 por tarjeta ---
  // Claves "accountId::DESCRIPCIÓN" de domiciliaciones activas — se usan
  // para bloquear la edición manual de descripción en esos movimientos (ver
  // RelevantTransaction.isEditable).
  const recurringDescriptionKeys = new Set(
    (recurringChargesRaw ?? []).map(
      (r) => `${r.account_id}::${String(r.description).trim().toUpperCase()}`,
    ),
  );

  const transactionsList = transactions ?? [];
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
      const txs = transactionsList
        .filter((t) => t.account_id === s.account_id && t.type !== "payment")
        .slice()
        .sort((a, b) => Math.abs(Number(b.amount)) - Math.abs(Number(a.amount)))
        .slice(0, 6)
        .map(toRelevant);
      return {
        accountId: s.account_id,
        accountLabel: accountLabel(s.account_id),
        transactions: txs,
      };
    })
    .filter((group) => group.transactions.length > 0);

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

  // --- MSI plans (para pestaña Próximo Mes) ---
  const msiPlans: MsiPlanSummary[] = (msiPlansRaw ?? []).map((p) => ({
    concept: p.concept,
    accountLabel: accountLabel(p.account_id),
    monthlyPayment: Number(p.monthly_payment ?? 0),
    installmentsPaid: p.installments_paid ?? 0,
    totalInstallments: p.total_installments,
  }));

  // --- Domiciliaciones activas (detectadas automáticamente al parsear) ---
  const recurringCharges: RecurringChargeSummary[] = (recurringChargesRaw ?? []).map(
    (r) => ({
      id: r.id,
      description: r.description,
      accountLabel: accountLabel(r.account_id as string),
      typicalAmount: Number(r.typical_amount ?? 0),
      lastSeen: r.last_seen,
    }),
  );

  // --- Validación: avisos del Skill + checks de consistencia ---
  const validationIssues: ValidationIssue[] = [];
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
    ? { text: "⚠️ Balance negativo este mes", tone: "bad" }
    : { text: "✅ Balance positivo este mes", tone: "good" };

  return {
    hasData: true,
    monthLabel: month,
    statusBadge,
    ingresoTotal,
    egresoDebito,
    gastoTarjetas,
    egresoTotal,
    balance,
    msiMensualTotal,
    saldoDisponibleGastoLibre,
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
    recurringCharges,
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
    standingDebts,
  };
}
