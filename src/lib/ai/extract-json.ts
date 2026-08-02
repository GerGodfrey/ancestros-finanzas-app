// El modelo a veces envuelve el JSON en fences de markdown (```json ... ```)
// aunque se le pida que no lo haga — se usa en cualquier lugar del gateway
// que le pida al modelo una respuesta JSON (parseo de PDFs, insights).
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonText = fenced ? fenced[1] : trimmed;
  try {
    return JSON.parse(jsonText);
  } catch {
    const preview =
      text.length > 1000
        ? `${text.slice(0, 500)}\n...[${text.length - 1000} caracteres omitidos]...\n${text.slice(-500)}`
        : text;
    throw new Error(`El modelo no devolvió JSON válido. Respuesta cruda: ${preview}`);
  }
}
