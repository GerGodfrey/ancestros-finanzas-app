// Taxonomía de categorías de gasto — debe coincidir exactamente con el enum
// "category" de skills/pdf-statement-parser/schema.json. Un solo lugar para
// no desincronizar el Skill (que asigna la categoría al parsear) de la UI
// (que la muestra).
export const TRANSACTION_CATEGORIES = [
  "comida",
  "ropa",
  "transporte",
  "hogar",
  "entretenimiento",
  "tech",
  "viaje",
  "salud",
  "intereses_comisiones",
  "otros",
] as const;

export type TransactionCategory = (typeof TRANSACTION_CATEGORIES)[number];

// El emoji vive aparte del texto a propósito: así se puede estilar, ocultar o
// sustituir sin tocar la etiqueta, y la etiqueta se puede buscar y ordenar sin
// arrastrar un glifo. La regla general está en docs/design-system.md — el
// emoji es presentación, nunca dato ni condición.
export const CATEGORY_LABEL: Record<TransactionCategory, string> = {
  comida: "Comida",
  ropa: "Ropa",
  transporte: "Transporte",
  hogar: "Hogar",
  entretenimiento: "Entretenimiento",
  tech: "Tech",
  viaje: "Viaje",
  salud: "Salud",
  intereses_comisiones: "Intereses/Comisiones",
  otros: "Otros",
};

export const CATEGORY_EMOJI: Record<TransactionCategory, string> = {
  comida: "🍽️",
  ropa: "👗",
  transporte: "🚗",
  hogar: "🏠",
  entretenimiento: "🎭",
  tech: "💻",
  viaje: "✈️",
  salud: "💪",
  intereses_comisiones: "📉",
  otros: "🗂️",
};

// Apuntan a los tokens de globals.css, que cambian con el tema: las mismas
// diez categorías se aclaran en Plano y se oscurecen en Papel para mantener
// el contraste. Sirven tanto en `style` como en props de Recharts, porque
// ambos terminan como atributos SVG o estilos del DOM.
export const CATEGORY_COLOR: Record<TransactionCategory, string> = {
  comida: "var(--cat-comida)",
  ropa: "var(--cat-ropa)",
  transporte: "var(--cat-transporte)",
  hogar: "var(--cat-hogar)",
  entretenimiento: "var(--cat-entretenimiento)",
  tech: "var(--cat-tech)",
  viaje: "var(--cat-viaje)",
  salud: "var(--cat-salud)",
  intereses_comisiones: "var(--cat-intereses-comisiones)",
  otros: "var(--cat-otros)",
};

/** Etiqueta con su emoji al frente. Para donde el emoji sí es parte del texto. */
export function categoryLabelWithEmoji(category: TransactionCategory): string {
  return `${CATEGORY_EMOJI[category]} ${CATEGORY_LABEL[category]}`;
}

export function isTransactionCategory(
  value: unknown,
): value is TransactionCategory {
  return (
    typeof value === "string" &&
    (TRANSACTION_CATEGORIES as readonly string[]).includes(value)
  );
}
