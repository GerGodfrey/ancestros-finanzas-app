// Utilidades de mes. La app usa dos formas y conviene no confundirlas:
//   'YYYY-MM'     — clave de mes (cobertura de subidas, heatmap)
//   'YYYY-MM-01'  — el primer día, que es como se guardan `incomes.month`,
//                   `fixed_costs.month` y como viene `monthLabel` del dashboard.

const MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** 'YYYY-MM' del mes en curso. */
export function currentMonthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

/** 'YYYY-MM-01' del mes en curso — la forma que esperan las tablas. */
export function currentMonthFirstDay(): string {
  return `${currentMonthKey()}-01`;
}

/** 'YYYY-MM' o 'YYYY-MM-01' → "septiembre 2026". */
export function monthLongLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}
