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

export const CATEGORY_LABEL: Record<TransactionCategory, string> = {
  comida: "🍽️ Comida",
  ropa: "👗 Ropa",
  transporte: "🚗 Transporte",
  hogar: "🏠 Hogar",
  entretenimiento: "🎭 Entretenimiento",
  tech: "💻 Tech",
  viaje: "✈️ Viaje",
  salud: "💪 Salud",
  intereses_comisiones: "📉 Intereses/Comisiones",
  otros: "🗂️ Otros",
};

export const CATEGORY_COLOR: Record<TransactionCategory, string> = {
  comida: "#F97316",
  ropa: "#EC4899",
  transporte: "#14B8A6",
  hogar: "#EF4444",
  entretenimiento: "#7C3AED",
  tech: "#6366F1",
  viaje: "#3B82F6",
  salud: "#34D399",
  intereses_comisiones: "#F87171",
  otros: "#6B7589",
};

export function isTransactionCategory(
  value: unknown,
): value is TransactionCategory {
  return (
    typeof value === "string" &&
    (TRANSACTION_CATEGORIES as readonly string[]).includes(value)
  );
}
