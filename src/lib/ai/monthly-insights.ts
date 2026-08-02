import type { SupabaseClient } from "@supabase/supabase-js";
import { chat, type Provider } from "@/lib/ai/gateway";
import { extractJson } from "@/lib/ai/extract-json";

export type InsightTone = "good" | "bad" | "warning";

export interface MonthlyInsight {
  text: string;
  tone: InsightTone;
}

// Igual límite de salida por proveedor que en parse-statement.ts — aquí la
// respuesta es mucho más corta (3 frases), pero reutiliza los mismos topes
// reales de cada API por consistencia.
const INSIGHTS_MAX_TOKENS: Record<Provider, number> = {
  anthropic: 2048,
  openai: 2048,
  gemini: 4096,
  deepseek: 2048,
};

const SYSTEM_PROMPT = `Eres un asistente financiero que ayuda a un usuario mexicano a entender qué pasó con sus tarjetas de crédito cada mes — el mismo criterio que usaría alguien que lee los estados de cuenta a mano y le explica al usuario lo importante, no un resumen genérico.

Te doy los datos ya extraídos (JSON) de los estados de cuenta del mes actual y, si existen, del mes anterior (para comparar y darle seguimiento a cosas que ya habías visto antes).

Tu tarea: identificar EXACTAMENTE 3 cosas concretas y específicas que pasaron este mes y que vale la pena que el usuario vea. No genéricas ("gastaste en varias cosas"), sino específicas: menciona montos exactos, fechas, el nombre de la tarjeta y la causa real cuando esté en los datos. Ejemplos del tono esperado:
- "Explora generó intereses por primera vez este año: $2,556.77. Pagaste el saldo completo de junio, pero en dos abonos... la fecha límite era el 8 de julio — el segundo abono llegó un día tarde."
- "Un retiro de efectivo en Joy te costó $114.91 en intereses y comisión. Evita usar la tarjeta de crédito como cajero."
- "El pago de $15,035 (iShopmixup) ya se resolvió — se cobró completo, una sola vez. No se te cobró dos veces."

Prioriza en este orden: 1) intereses o comisiones que se generaron y por qué, 2) algo que se resolvió o mejoró respecto al mes anterior, 3) un patrón de gasto o riesgo a vigilar (MSI que se acaba, tarjeta cerca del límite, cargo recurrente nuevo). Si no hay suficiente material para 3 cosas realmente específicas, usa la que sea más genérica al final, pero prioriza siempre lo concreto.

Cada item lleva un "tone": "good" (buena noticia o algo resuelto), "bad" (te costó dinero — interés, comisión, error), "warning" (alerta a vigilar, no necesariamente ya costó dinero).

No inventes datos que no estén en el contexto que te doy. Responde SOLO con un array JSON de exactamente 3 objetos: [{"text": "...", "tone": "good"|"bad"|"warning"}, ...]. Nada de texto antes o después, ni fences de markdown.`;

function isInsightTone(value: unknown): value is InsightTone {
  return value === "good" || value === "bad" || value === "warning";
}

function parseInsights(text: string): MonthlyInsight[] {
  const json = extractJson(text);
  if (!Array.isArray(json)) {
    throw new Error("El modelo no devolvió un array de insights.");
  }
  const insights = json
    .filter(
      (item): item is { text: unknown; tone: unknown } =>
        typeof item === "object" && item !== null,
    )
    .map((item) => ({
      text: typeof item.text === "string" ? item.text : null,
      tone: isInsightTone(item.tone) ? item.tone : null,
    }))
    .filter(
      (item): item is MonthlyInsight => item.text !== null && item.tone !== null,
    )
    .slice(0, 3);

  if (insights.length === 0) {
    throw new Error("El modelo no devolvió ningún insight válido.");
  }
  return insights;
}

export async function generateMonthlyInsights(opts: {
  provider: Provider;
  apiKey: string;
  monthLabel: string;
  currentMonthDigest: unknown[];
  previousMonthDigest?: unknown[];
}): Promise<MonthlyInsight[]> {
  const userContent = [
    `Mes actual (${opts.monthLabel}) — estados de cuenta ya extraídos:`,
    JSON.stringify(opts.currentMonthDigest),
    opts.previousMonthDigest && opts.previousMonthDigest.length > 0
      ? `\nMes anterior (para comparar):\n${JSON.stringify(opts.previousMonthDigest)}`
      : "",
    "\nResponde solo con el array JSON de 3 insights.",
  ].join("\n");

  const result = await chat({
    provider: opts.provider,
    apiKey: opts.apiKey,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
    maxTokens: INSIGHTS_MAX_TOKENS[opts.provider],
  });

  return parseInsights(result.text);
}

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

function previousMonthLabel(month: string): string {
  const [year, m] = month.slice(0, 7).split("-").map(Number);
  const prevM = m === 1 ? 12 : m - 1;
  const prevYear = m === 1 ? year - 1 : year;
  return `${prevYear}-${String(prevM).padStart(2, "0")}-01`;
}

async function fetchMonthDigest(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  userId: string,
  month: string,
): Promise<unknown[]> {
  const { data: statements } = await supabase
    .from("statements")
    .select("period_end, raw_extraction")
    .eq("user_id", userId)
    .eq("status", "parsed")
    .not("period_end", "is", null)
    .not("raw_extraction", "is", null);

  return (statements ?? [])
    .filter((s) => monthKey(s.period_end as string) === month.slice(0, 7))
    .map((s) => s.raw_extraction);
}

/**
 * Regenera los insights del mes dado y los guarda en monthly_summaries.
 * Se llama automáticamente al terminar de parsear un statement (para el mes
 * de ese statement) y también manualmente desde el botón "Regenerar análisis"
 * del dashboard. No lanza si falla la generación — el llamador decide si
 * quiere tratarlo como error fatal o solo loguearlo.
 */
export async function regenerateMonthlyInsights(opts: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>;
  userId: string;
  provider: Provider;
  apiKey: string;
  month: string; // 'YYYY-MM-01'
}): Promise<MonthlyInsight[]> {
  const [currentMonthDigest, previousMonthDigest] = await Promise.all([
    fetchMonthDigest(opts.supabase, opts.userId, opts.month),
    fetchMonthDigest(opts.supabase, opts.userId, previousMonthLabel(opts.month)),
  ]);

  if (currentMonthDigest.length === 0) {
    throw new Error("No hay estados de cuenta parseados para ese mes.");
  }

  const insights = await generateMonthlyInsights({
    provider: opts.provider,
    apiKey: opts.apiKey,
    monthLabel: opts.month.slice(0, 7),
    currentMonthDigest,
    previousMonthDigest,
  });

  await opts.supabase.from("monthly_summaries").upsert(
    {
      user_id: opts.userId,
      month: opts.month,
      insights,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,month" },
  );

  return insights;
}
