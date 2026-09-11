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

/**
 * Los meses que puede elegir el alta manual, en 'YYYY-MM-01' y del más
 * reciente al más viejo.
 *
 * Sale de la cobertura de subidas, que ya arranca en el corte más antiguo que
 * el cliente subió y llega hasta el mes en curso. Antes eran "los últimos 12"
 * a secas, y eso ofrecía meses de 2025 a alguien que empezó a usar la app este
 * año: opciones que no significan nada para él.
 *
 * El mes en curso se fuerza siempre. La cobertura ya lo incluye, pero sin
 * tarjetas dadas de alta viene vacía — y aun así hay que poder capturar un
 * ingreso de este mes.
 */
export function monthOptionsFromCoverage(coverageMonths: string[]): string[] {
  const current = currentMonthFirstDay();
  const fromCoverage = coverageMonths.map((m) => `${m.slice(0, 7)}-01`);
  return Array.from(new Set([current, ...fromCoverage]))
    .sort()
    .reverse();
}
