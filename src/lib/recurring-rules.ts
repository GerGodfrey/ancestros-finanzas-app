import { normalizeDescription } from "./merchant-key";

/**
 * Decide si un cargo repetido es una domiciliación.
 *
 * La regla anterior era una sola: la misma descripción exacta en 2 de los
 * últimos 3 estados de cuenta. No miraba el monto, ni el día, ni qué comercio
 * era — por eso entraban «Oxxo General León» y «Soriana Tacubaya», que también
 * se repiten todos los meses sin ser domiciliaciones.
 *
 * Ahora son tres señales. Una domiciliación real cobra **casi lo mismo** y cae
 * **el mismo día del mes**; una compra habitual en el mismo comercio no cumple
 * ninguna de las dos. Es lo que usan los productos del ramo: concentración de
 * la distribución de montos y del día de autorización.
 */

/** Nunca es domiciliación, por muy repetido que esté. */
const BLOCKLIST = [
  // Cargos del banco. No es un servicio que contrataste: es una comisión.
  // Entraban enteros porque el detector aceptaba `type: 'fee'`.
  "gastos de cobranza", "gasto de cobranza", "comision", "comisiones",
  "anualidad", "interes", "intereses", "iva", "sobregiro", "penalizacion",
  "recargo", "seguro de vida", "pago minimo",
  // Tiendas de conveniencia y súper: repetición sin recurrencia.
  "oxxo", "seven eleven", "7 eleven", "circle k", "soriana", "walmart",
  "chedraui", "bodega aurrera", "aurrera", "superama", "costco", "sams",
  "la comer", "heb", "merc", "fresko",
  // Gasolineras.
  "pemex", "shell", "mobil", "gasolin", "combustible", "bp ",
  // Restaurantes y comida.
  "restaurant", "restaurante", "taqueria", "cafeteria", "starbucks",
  "fast food", "food", "pizza", "sushi", "bar ",
  // Movilidad de monto variable: cambia cada viaje.
  "didi", "uber", "rappi", "cabify", "beat", "cornershop",
];

/**
 * Casi siempre es domiciliación. **Baja el umbral, no lo salta** — sigue
 * necesitando repetirse en meses distintos. Un único cargo a Netflix no es una
 * suscripción todavía; podría ser el primero y último.
 */
const ALLOWLIST = [
  "netflix", "spotify", "icloud", "apple music", "apple tv", "youtube",
  "hbo", "max", "disney", "paramount", "crunchyroll", "prime video",
  "anthropic", "openai", "chatgpt", "claude", "midjourney", "github",
  "google one", "google storage", "microsoft", "office", "adobe", "dropbox",
  "notion", "figma", "canva", "linkedin",
  "telcel", "at t", "att", "izzi", "totalplay", "megacable", "telmex",
  "dish", "sky", "cfe", "gas natural", "agua", "predial",
  "gimnasio", "smart fit", "sportsworld", "seguro gastos medicos",
];

export interface Occurrence {
  /** 'YYYY-MM' del estado de cuenta donde apareció. */
  month: string;
  amount: number;
  /** Día del mes, 1..31. */
  dayOfMonth: number;
}

export interface Classification {
  isRecurring: boolean;
  /** 0..1 — qué tan segura es la sugerencia. */
  confidence: number;
  /** Por qué, en palabras. Se guarda para poder explicarle al usuario. */
  reason: string;
  /** Coeficiente de variación del monto. */
  amountCv: number;
  /** Día típico del mes. */
  dayOfMonth: number;
  monthsSeen: number;
}

/** Un cargo del banco o una tienda: nunca domiciliación. */
export function isBlocked(description: string): boolean {
  const n = ` ${normalizeDescription(description)} `;
  return BLOCKLIST.some((term) => n.includes(` ${term.trim()} `) || n.includes(term));
}

/** Un servicio que casi siempre se domicilia. */
export function isAllowed(description: string): boolean {
  const n = normalizeDescription(description);
  return ALLOWLIST.some((term) => n.includes(term.trim()));
}

/** Coeficiente de variación: desviación estándar sobre la media. */
export function amountVariation(amounts: number[]): number {
  if (amounts.length === 0) return 1;
  const mean = amounts.reduce((s, a) => s + a, 0) / amounts.length;
  if (mean === 0) return 1;
  const variance =
    amounts.reduce((s, a) => s + (a - mean) ** 2, 0) / amounts.length;
  return Math.sqrt(variance) / Math.abs(mean);
}

/**
 * Dispersión del día del mes, en días. Trata el mes como un círculo: el 1 y el
 * 30 están a un día, no a veintinueve. Sin eso, un cargo que cae el último día
 * de un mes y el primero del siguiente parecería errático cuando es el más
 * puntual de todos.
 */
export function dayOfMonthSpread(days: number[]): number {
  if (days.length <= 1) return 0;
  let best = Infinity;
  for (const anchor of days) {
    const worst = Math.max(
      ...days.map((d) => {
        const raw = Math.abs(d - anchor);
        return Math.min(raw, 31 - raw);
      }),
    );
    best = Math.min(best, worst);
  }
  return best;
}

const MAX_AMOUNT_CV = 0.15;
const MAX_DAY_SPREAD = 3;
const MIN_MONTHS = 2;

export function classifyRecurring(opts: {
  description: string;
  occurrences: Occurrence[];
}): Classification {
  const months = new Set(opts.occurrences.map((o) => o.month));
  const monthsSeen = months.size;
  const amounts = opts.occurrences.map((o) => o.amount);
  const days = opts.occurrences.map((o) => o.dayOfMonth);
  const amountCv = amountVariation(amounts);
  const spread = dayOfMonthSpread(days);
  const dayOfMonth = days.length > 0 ? median(days) : 0;

  const base = { amountCv, dayOfMonth, monthsSeen };

  if (isBlocked(opts.description)) {
    return {
      ...base,
      isRecurring: false,
      confidence: 0,
      reason: "Es un cargo del banco o un comercio de compra suelta.",
    };
  }

  // Repetirse en meses distintos es condición previa para todo lo demás. Dos
  // cargos del mismo comercio dentro del mismo mes son dos compras, no una
  // suscripción — y el detector viejo los contaba igual.
  if (monthsSeen < MIN_MONTHS) {
    return {
      ...base,
      isRecurring: false,
      confidence: 0,
      reason: `Solo aparece en ${monthsSeen} mes.`,
    };
  }

  const stableAmount = amountCv <= MAX_AMOUNT_CV;
  const stableDay = spread <= MAX_DAY_SPREAD;
  const allowed = isAllowed(opts.description);

  // La allowlist baja el umbral: a un servicio conocido le basta una de las
  // dos señales. Un comercio cualquiera necesita las dos, porque es la única
  // forma de separar «Netflix cada día 4 por $219» de «Soriana casi cada mes».
  const passes = allowed ? stableAmount || stableDay : stableAmount && stableDay;

  if (!passes) {
    return {
      ...base,
      isRecurring: false,
      confidence: 0,
      reason: !stableAmount
        ? "El monto cambia demasiado entre meses."
        : "No cae en una fecha fija del mes.",
    };
  }

  // La confianza sube con los meses vistos y con lo estable que sea; se guarda
  // para ordenar las sugerencias y para poder explicar por qué se propuso.
  const monthScore = Math.min(monthsSeen / 3, 1);
  const amountScore = stableAmount ? 1 - amountCv / MAX_AMOUNT_CV / 2 : 0.4;
  const dayScore = stableDay ? 1 - spread / (MAX_DAY_SPREAD * 2) : 0.4;
  const confidence = Math.min(
    1,
    Number(
      (
        (monthScore * 0.4 + amountScore * 0.3 + dayScore * 0.3) *
        (allowed ? 1.1 : 1)
      ).toFixed(2),
    ),
  );

  return {
    ...base,
    isRecurring: true,
    confidence,
    reason: `Aparece en ${monthsSeen} meses, ${
      stableAmount ? "por un monto casi igual" : "con monto variable"
    } y ${stableDay ? `alrededor del día ${dayOfMonth}` : "en fechas distintas"}.`,
  };
}

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}
