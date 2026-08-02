import type { SupabaseClient } from "@supabase/supabase-js";
import { chat, type Provider } from "@/lib/ai/gateway";
import { extractJson } from "@/lib/ai/extract-json";

export type InsightTone = "good" | "bad" | "warning";

export interface MonthlyInsight {
  text: string;
  tone: InsightTone;
}

export type RecommendationType = "strength" | "action";

export interface Recommendation {
  text: string;
  type: RecommendationType;
}

export interface MonthlySummaryResult {
  insights: MonthlyInsight[];
  recommendations: Recommendation[];
}

// Un solo call genera insights + recomendaciones juntos (mismo contexto, un
// solo costo de API) — la respuesta es corta en ambos casos, pero
// recomendaciones incluye historial de hasta 6 meses en el prompt, así que
// se deja algo más de margen de salida.
const SUMMARY_MAX_TOKENS: Record<Provider, number> = {
  anthropic: 3072,
  openai: 3072,
  gemini: 6144,
  deepseek: 3072,
};

const SYSTEM_PROMPT = `Eres un asistente financiero que ayuda a un usuario mexicano a entender qué pasó con sus tarjetas de crédito cada mes — el mismo criterio que usaría alguien que lee los estados de cuenta a mano y le explica al usuario lo importante, no un resumen genérico.

Te doy los datos ya extraídos (JSON) de los estados de cuenta del mes actual y, si existen, del mes anterior (para comparar y darle seguimiento a cosas que ya habías visto antes). También te puedo dar un historial resumido de hasta 6 meses anteriores (los insights que ya se generaron esos meses) para que detectes patrones a lo largo del tiempo.

Tu respuesta tiene DOS partes:

1) "insights": EXACTAMENTE 3 cosas concretas y específicas que pasaron ESTE MES y que vale la pena que el usuario vea. No genéricas ("gastaste en varias cosas"), sino específicas: menciona montos exactos, fechas, el nombre de la tarjeta y la causa real cuando esté en los datos. Ejemplos del tono esperado:
- "Explora generó intereses por primera vez este año: $2,556.77. Pagaste el saldo completo de junio, pero en dos abonos... la fecha límite era el 8 de julio — el segundo abono llegó un día tarde."
- "Un retiro de efectivo en Joy te costó $114.91 en intereses y comisión. Evita usar la tarjeta de crédito como cajero."
- "El pago de $15,035 (iShopmixup) ya se resolvió — se cobró completo, una sola vez. No se te cobró dos veces."
Prioriza en este orden: intereses/comisiones generados y por qué, algo que se resolvió o mejoró vs. el mes anterior, un patrón o riesgo a vigilar. Cada item lleva "tone": "good" (buena noticia o algo resuelto), "bad" (te costó dinero), "warning" (alerta a vigilar).

2) "recommendations": entre 2 y 4 recomendaciones basadas en el PATRÓN HISTÓRICO (no solo este mes) — mezcla de:
- "strength": cosas que el usuario ha hecho bien de forma consistente a lo largo de varios meses (ej. "llevas 4 meses seguidos pagando el saldo completo de Explora antes de la fecha límite").
- "action": cosas concretas que debería empezar a cambiar para sanar sus gastos, sustentadas en un patrón repetido (ej. "Joy ha generado intereses 3 de los últimos 4 meses — revisa si vale la pena bajar el gasto en esa tarjeta o cambiar la fecha de pago").
No fuerces la misma cantidad de cada tipo — depende de lo que realmente encuentres en los datos. Si hay poco historial, da recomendaciones más generales pero basadas en lo que sí tengas, nunca inventadas.

No inventes datos que no estén en el contexto que te doy. Responde SOLO con este JSON, nada de texto antes o después, ni fences de markdown:
{"insights": [{"text": "...", "tone": "good"|"bad"|"warning"}, ...exactamente 3], "recommendations": [{"text": "...", "type": "strength"|"action"}, ...entre 2 y 4]}`;

function isInsightTone(value: unknown): value is InsightTone {
  return value === "good" || value === "bad" || value === "warning";
}

function isRecommendationType(value: unknown): value is RecommendationType {
  return value === "strength" || value === "action";
}

function parseInsightsField(raw: unknown): MonthlyInsight[] {
  if (!Array.isArray(raw)) return [];
  return raw
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
}

function parseRecommendationsField(raw: unknown): Recommendation[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (item): item is { text: unknown; type: unknown } =>
        typeof item === "object" && item !== null,
    )
    .map((item) => ({
      text: typeof item.text === "string" ? item.text : null,
      type: isRecommendationType(item.type) ? item.type : null,
    }))
    .filter(
      (item): item is Recommendation => item.text !== null && item.type !== null,
    )
    .slice(0, 4);
}

function parseMonthlySummary(text: string): MonthlySummaryResult {
  const json = extractJson(text);
  if (typeof json !== "object" || json === null) {
    throw new Error("El modelo no devolvió un objeto JSON con insights/recommendations.");
  }
  const obj = json as { insights?: unknown; recommendations?: unknown };
  const insights = parseInsightsField(obj.insights);
  const recommendations = parseRecommendationsField(obj.recommendations);

  if (insights.length === 0) {
    throw new Error("El modelo no devolvió ningún insight válido.");
  }
  return { insights, recommendations };
}

export async function generateMonthlySummary(opts: {
  provider: Provider;
  apiKey: string;
  monthLabel: string;
  currentMonthDigest: unknown[];
  previousMonthDigest?: unknown[];
  history?: { month: string; insights: unknown }[];
}): Promise<MonthlySummaryResult> {
  const userContent = [
    `Mes actual (${opts.monthLabel}) — estados de cuenta ya extraídos:`,
    JSON.stringify(opts.currentMonthDigest),
    opts.previousMonthDigest && opts.previousMonthDigest.length > 0
      ? `\nMes anterior (para comparar):\n${JSON.stringify(opts.previousMonthDigest)}`
      : "",
    opts.history && opts.history.length > 0
      ? `\nHistorial resumido de meses previos (insights ya generados esos meses, del más reciente al más viejo):\n${JSON.stringify(opts.history)}`
      : "",
    "\nResponde solo con el JSON de insights + recommendations.",
  ].join("\n");

  const result = await chat({
    provider: opts.provider,
    apiKey: opts.apiKey,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
    maxTokens: SUMMARY_MAX_TOKENS[opts.provider],
  });

  return parseMonthlySummary(result.text);
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

const HISTORY_MONTHS_LIMIT = 6;

async function fetchHistory(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  userId: string,
  excludeMonths: string[],
): Promise<{ month: string; insights: unknown }[]> {
  const { data } = await supabase
    .from("monthly_summaries")
    .select("month, insights")
    .eq("user_id", userId)
    .not("insights", "is", null)
    .order("month", { ascending: false })
    .limit(HISTORY_MONTHS_LIMIT + excludeMonths.length);

  return (data ?? [])
    .filter((r) => !excludeMonths.includes(r.month as string))
    .slice(0, HISTORY_MONTHS_LIMIT);
}

/**
 * Regenera los insights + recomendaciones del mes dado y los guarda en
 * monthly_summaries. Se llama automáticamente al terminar de parsear un
 * statement (para el mes de ese statement) y también manualmente desde el
 * botón "Regenerar análisis" del dashboard. No hay try/catch aquí a
 * propósito — el llamador decide si quiere tratar el fallo como fatal o
 * solo loguearlo.
 */
export async function regenerateMonthlySummary(opts: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>;
  userId: string;
  provider: Provider;
  apiKey: string;
  month: string; // 'YYYY-MM-01'
}): Promise<MonthlySummaryResult> {
  const prevMonth = previousMonthLabel(opts.month);
  const [currentMonthDigest, previousMonthDigest, history] = await Promise.all([
    fetchMonthDigest(opts.supabase, opts.userId, opts.month),
    fetchMonthDigest(opts.supabase, opts.userId, prevMonth),
    fetchHistory(opts.supabase, opts.userId, [opts.month, prevMonth]),
  ]);

  if (currentMonthDigest.length === 0) {
    throw new Error("No hay estados de cuenta parseados para ese mes.");
  }

  const summary = await generateMonthlySummary({
    provider: opts.provider,
    apiKey: opts.apiKey,
    monthLabel: opts.month.slice(0, 7),
    currentMonthDigest,
    previousMonthDigest,
    history,
  });

  await opts.supabase.from("monthly_summaries").upsert(
    {
      user_id: opts.userId,
      month: opts.month,
      insights: summary.insights,
      recommendations: summary.recommendations,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,month" },
  );

  return summary;
}
