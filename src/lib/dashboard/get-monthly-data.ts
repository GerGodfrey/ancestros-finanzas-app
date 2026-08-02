import { createClient } from "@/lib/supabase/server";
import type { MonthlyInsight } from "@/lib/ai/monthly-insights";

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
}

export interface RelevantTransaction {
  id: string;
  accountLabel: string;
  description: string;
  amount: number;
  type: string;
  date: string;
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

export interface MonthlyDashboardData {
  hasData: boolean;
  monthLabel: string | null; // 'YYYY-MM-01'
  ingresoTotal: number;
  egresoDebito: number;
  gastoTarjetas: number;
  egresoTotal: number;
  balance: number;
  msiMensualTotal: number;
  saldoDisponibleGastoLibre: number;
  cards: CardSummary[];
  incomes: { concept: string; amount: number }[];
  fixedCosts: { concept: string; amount: number }[];
  msiPlans: MsiPlanSummary[];
  relevantTransactions: RelevantTransaction[];
  validationIssues: ValidationIssue[];
  insights: MonthlyInsight[] | null;
  previousMonthCardsTotal: number | null;
  msiDebts: MsiDebtSummary[];
  standingDebts: StandingDebt[];
}

const EMPTY_DATA: MonthlyDashboardData = {
  hasData: false,
  monthLabel: null,
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
  relevantTransactions: [],
  validationIssues: [],
  insights: null,
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
  ] = await Promise.all([
    supabase
      .from("incomes")
      .select("concept, amount")
      .eq("user_id", user.id)
      .eq("month", month),
    supabase
      .from("fixed_costs")
      .select("concept, amount")
      .eq("user_id", user.id)
      .eq("month", month),
    supabase
      .from("msi_plans")
      .select(
        "concept, account_id, monthly_payment, installments_paid, total_installments",
      )
      .eq("user_id", user.id)
      .eq("status", "active"),
    supabase
      .from("monthly_summaries")
      .select("insights")
      .eq("user_id", user.id)
      .eq("month", month)
      .maybeSingle(),
    supabase
      .from("debts")
      .select("id, concept, amount, note")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true }),
  ]);

  const statementIds = statementsInMonth.map((s) => s.id);
  const { data: transactions } = statementIds.length
    ? await supabase
        .from("transactions")
        .select("id, account_id, statement_id, tx_date, description, amount, type")
        .eq("user_id", user.id)
        .in("statement_id", statementIds)
    : { data: [] };

  const accountLabel = (accountId: string) => {
    const a = accountById.get(accountId);
    return a ? `${a.issuer} ${a.product_name}` : "Cuenta";
  };

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
      interesGenerado: Number(s.interest_charged ?? 0),
    };
  });

  // --- Total del mes anterior (para comparar en "Próximos Pagos") ---
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

  // --- Movimientos relevantes: top 10 por monto absoluto ---
  const relevantTransactions: RelevantTransaction[] = (transactions ?? [])
    .slice()
    .sort((a, b) => Math.abs(Number(b.amount)) - Math.abs(Number(a.amount)))
    .slice(0, 10)
    .map((t) => ({
      id: t.id,
      accountLabel: accountLabel(t.account_id),
      description: t.description,
      amount: Number(t.amount),
      type: t.type,
      date: t.tx_date,
    }));

  // --- MSI plans (para pestaña Próximo Mes) ---
  const msiPlans: MsiPlanSummary[] = (msiPlansRaw ?? []).map((p) => ({
    concept: p.concept,
    accountLabel: accountLabel(p.account_id),
    monthlyPayment: Number(p.monthly_payment ?? 0),
    installmentsPaid: p.installments_paid ?? 0,
    totalInstallments: p.total_installments,
  }));

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

  return {
    hasData: true,
    monthLabel: month,
    ingresoTotal,
    egresoDebito,
    gastoTarjetas,
    egresoTotal,
    balance,
    msiMensualTotal,
    saldoDisponibleGastoLibre,
    cards,
    incomes: (incomes ?? []).map((i) => ({
      concept: i.concept,
      amount: Number(i.amount),
    })),
    fixedCosts: (fixedCosts ?? []).map((f) => ({
      concept: f.concept,
      amount: Number(f.amount),
    })),
    msiPlans,
    relevantTransactions,
    validationIssues,
    insights: (monthlySummary?.insights as MonthlyInsight[] | null) ?? null,
    previousMonthCardsTotal,
    msiDebts,
    standingDebts,
  };
}
