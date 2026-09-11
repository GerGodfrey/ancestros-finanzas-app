/**
 * Decide qué mes muestra el dashboard y cuáles se pueden navegar.
 *
 * Vivía embebido en `getMonthlyDashboardData` y ahí tenía un bug: los meses
 * salían **solo** de los statements parseados. Como el formulario de
 * "Actualiza tu mes" siempre escribe al mes en curso, un ingreso capturado en
 * septiembre quedaba invisible mientras el PDF más reciente fuera de agosto —
 * el dashboard se paraba en agosto y septiembre ni siquiera aparecía en el
 * selector para poder ir a verlo. El dinero estaba guardado y no había forma
 * de llegar a él.
 *
 * La regla ahora: un mes existe si tiene un estado de cuenta **o** dinero
 * capturado a mano. Que la plata la haya puesto una IA leyendo un PDF o el
 * usuario tecleándola no cambia que sea un mes con datos.
 */
export function resolveDashboardMonths(opts: {
  /** Meses con statement parseado, 'YYYY-MM'. */
  statementMonths: string[];
  /** Meses con ingresos o costos fijos capturados, 'YYYY-MM'. */
  manualMonths: string[];
  /** El mes pedido por la URL, 'YYYY-MM-01'. */
  targetMonth?: string;
}): { month: string | null; availableMonths: string[] } {
  const availableMonths = Array.from(
    new Set([...opts.statementMonths, ...opts.manualMonths]),
  ).sort();

  if (availableMonths.length === 0) {
    return { month: null, availableMonths };
  }

  // Sin mes pedido, el más reciente con datos de cualquier tipo.
  const month =
    opts.targetMonth ?? `${availableMonths[availableMonths.length - 1]}-01`;

  return { month, availableMonths };
}
