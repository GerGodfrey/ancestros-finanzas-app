import { createClient } from "@/lib/supabase/server";

export interface MonthAccountStatus {
  accountId: string;
  issuer: string;
  productName: string;
  uploaded: boolean;
  // Fecha de corte (period_end) y fecha límite de pago (due_date) del
  // statement que cayó en este mes — el corte determina a qué mes
  // pertenece, pero el pago casi siempre vence ya en el mes siguiente, así
  // que mostrar ambas evita la confusión de "yo pensé que era de
  // septiembre" cuando el corte fue en agosto.
  periodEnd: string | null;
  dueDate: string | null;
}

export interface MonthCoverage {
  month: string; // 'YYYY-MM'
  expectedCount: number;
  uploadedCount: number;
  percentage: number | null; // null si ese mes todavía no existía ninguna tarjeta
  accounts: MonthAccountStatus[];
}

export interface UploadCoverage {
  // Ascendente, desde el mes en que "empieza a existir" la tarjeta más
  // antigua hasta el mes actual — cada mes cuenta contra las tarjetas que ya
  // existían en ese momento. Una tarjeta "empieza a existir" en el mínimo
  // entre su `created_at` (cuándo la diste de alta en la app) y el corte más
  // antiguo que le hayas subido: si dieron de alta una tarjeta en septiembre
  // pero le subes un corte de agosto, sí existía en agosto — no contarla
  // ahí escondería ese PDF del historial. Dar de alta una tarjeta genuinamente
  // nueva (sin cortes previos) sigue sin afectar meses pasados, porque su
  // mínimo sigue siendo su propio created_at.
  months: MonthCoverage[];
  // El mes que de verdad necesita atención — NO es simplemente "el mes
  // calendario de hoy": el día 2 de septiembre ningún corte de septiembre
  // existe todavía, así que mostrarlo como "pendiente" sería una alarma
  // falsa. Regla: el más reciente de los últimos HIGHLIGHT_LOOKBACK_MONTHS
  // (sin contar el mes actual) que no llegó al 100%; si ninguno de esos
  // está incompleto, cae al mes actual. Deliberadamente NO busca en todo el
  // historial hacia atrás sin límite — un mes que se quedó atorado en, ej.,
  // 30% para siempre (una tarjeta que ya no se usa) no debe dejar la caja de
  // aviso pegada en ese mes por meses/años; ese hueco se sigue viendo para
  // siempre en `months` (el heatmap completo), solo deja de ser "lo
  // urgente".
  highlightMonth: MonthCoverage | null;
}

// Cuántos meses hacia atrás (sin contar el actual) se consideran "todavía
// urgentes" para la caja de pendientes — ver nota en `highlightMonth`.
const HIGHLIGHT_LOOKBACK_MONTHS = 2;

const EMPTY: UploadCoverage = { months: [], highlightMonth: null };

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

function nextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function pickHighlightMonth(months: MonthCoverage[]): MonthCoverage | null {
  if (months.length === 0) return null;
  const currentIndex = months.length - 1;
  // De más reciente a más antigua, sin contar el mes actual, acotado a
  // HIGHLIGHT_LOOKBACK_MONTHS — ver nota en la definición de la interfaz.
  const from = Math.max(0, currentIndex - HIGHLIGHT_LOOKBACK_MONTHS);
  for (let i = currentIndex - 1; i >= from; i--) {
    const candidate = months[i];
    if (candidate.percentage !== null && candidate.percentage < 1) {
      return candidate;
    }
  }
  return months[currentIndex];
}

export interface AccountForCoverage {
  id: string;
  issuer: string;
  product_name: string;
  created_at: string;
}

export interface StatementForCoverage {
  account_id: string;
  period_end: string | null;
  due_date: string | null;
}

// Lógica pura (sin I/O) para poder probarla sin mockear Supabase — separada
// de getUploadCoverage(), que solo se encarga de traer los datos.
export function buildUploadCoverage(
  accounts: AccountForCoverage[],
  parsedStatements: StatementForCoverage[],
  currentMonth: string,
): UploadCoverage {
  if (accounts.length === 0) return EMPTY;

  const uploadedByMonth = new Map<
    string,
    Map<string, { periodEnd: string; dueDate: string | null }>
  >();
  // Corte más antiguo (period_end) subido por tarjeta — para saber desde
  // cuándo "existía" de verdad, sin importar cuándo se dio de alta en la app.
  const earliestStatementMonthByAccount = new Map<string, string>();
  for (const s of parsedStatements) {
    if (!s.period_end) continue;
    const m = monthKey(s.period_end);
    const byAccount = uploadedByMonth.get(m) ?? new Map();
    byAccount.set(s.account_id, { periodEnd: s.period_end, dueDate: s.due_date });
    uploadedByMonth.set(m, byAccount);

    const earliest = earliestStatementMonthByAccount.get(s.account_id);
    if (!earliest || m < earliest) {
      earliestStatementMonthByAccount.set(s.account_id, m);
    }
  }

  const effectiveStartMonth = new Map<string, string>();
  for (const a of accounts) {
    const createdMonth = monthKey(a.created_at);
    const earliestStatement = earliestStatementMonthByAccount.get(a.id);
    effectiveStartMonth.set(
      a.id,
      earliestStatement && earliestStatement < createdMonth
        ? earliestStatement
        : createdMonth,
    );
  }

  const sortedAccounts = [...accounts].sort((a, b) => {
    const ma = effectiveStartMonth.get(a.id)!;
    const mb = effectiveStartMonth.get(b.id)!;
    return ma < mb ? -1 : ma > mb ? 1 : 0;
  });

  const firstMonth = effectiveStartMonth.get(sortedAccounts[0].id)!;

  const months: MonthCoverage[] = [];
  // Tope de seguridad: nunca deberíamos tener más de unas décadas de meses.
  const MAX_MONTHS = 600;
  let m = firstMonth;
  for (let i = 0; i < MAX_MONTHS; i++) {
    const expectedAccounts = sortedAccounts.filter(
      (a) => effectiveStartMonth.get(a.id)! <= m,
    );
    const uploaded = uploadedByMonth.get(m) ?? new Map();
    const accountsStatus: MonthAccountStatus[] = expectedAccounts.map((a) => {
      const statement = uploaded.get(a.id);
      return {
        accountId: a.id,
        issuer: a.issuer,
        productName: a.product_name,
        uploaded: statement !== undefined,
        periodEnd: statement?.periodEnd ?? null,
        dueDate: statement?.dueDate ?? null,
      };
    });
    const uploadedCount = accountsStatus.filter((a) => a.uploaded).length;

    months.push({
      month: m,
      expectedCount: expectedAccounts.length,
      uploadedCount,
      percentage:
        expectedAccounts.length > 0
          ? uploadedCount / expectedAccounts.length
          : null,
      accounts: accountsStatus,
    });

    if (m === currentMonth) break;
    m = nextMonth(m);
  }

  return {
    months,
    highlightMonth: pickHighlightMonth(months),
  };
}

export async function getUploadCoverage(): Promise<UploadCoverage> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return EMPTY;

  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, issuer, product_name, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (!accounts || accounts.length === 0) return EMPTY;

  const { data: parsedStatements } = await supabase
    .from("statements")
    .select("account_id, period_end, due_date")
    .eq("user_id", user.id)
    .eq("status", "parsed");

  return buildUploadCoverage(
    accounts,
    parsedStatements ?? [],
    monthKey(new Date().toISOString()),
  );
}
