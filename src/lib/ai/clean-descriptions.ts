import { chat, type Provider } from "@/lib/ai/gateway";
import { extractJson } from "@/lib/ai/extract-json";

// Backfill de limpieza de descripción para transacciones que ya se
// guardaron antes de que el Skill empezara a limpiarla al parsear (ver
// "Limpieza de la description" en skills/pdf-statement-parser/SKILL.md —
// mismas reglas, reutilizadas aquí en versión condensada). Es texto-only,
// no vuelve a leer el PDF.

const CLEAN_MAX_TOKENS: Record<Provider, number> = {
  anthropic: 4096,
  openai: 4096,
  gemini: 8192,
  deepseek: 4096,
};

const SYSTEM_PROMPT = `Limpias descripciones de movimientos de tarjetas de crédito mexicanas para que sean legibles — vienen en el formato crudo del banco (mayúsculas, prefijos de procesador de pagos, folios/referencias sin valor).

Reglas:
- Capitalización tipo título (Mayúscula Inicial), no todo mayúsculas ni todo minúsculas.
- Quita prefijos de procesador de pagos si el nombre real del comercio viene después: MERPAGO*, CLIP*, NETPAY*, SR*, etc. — deja solo el nombre del comercio.
- Quita números de referencia/autorización/folio que no aportan nada (secuencias largas de dígitos sueltas, "001 DE 001", códigos de sucursal puramente numéricos) — pero conserva ubicación/sucursal si es parte reconocible del nombre.
- Nunca inventes ni completes información que no esté en el texto original — es limpieza de forma, no de contenido. Si al limpiar queda ambiguo (solo un código sin nombre reconocible), déjalo tal cual mejor que inventar un comercio.
- Si la descripción ya está limpia, regrésala igual.

Ejemplos:
- "ISHOPMIXUP OASIS COYOA 001 DE 001" -> "iShopMixup Oasis Coyoacán"
- "MERPAGO*GARMIN DEL MAZ" -> "Garmin del Maz"
- "0947 EL ANGEL 3" -> "Cajero El Ángel 3"
- "WINGSTOP DEL VALLE" -> "Wingstop del Valle"

Te doy un array de movimientos con su "id" y "description" cruda. Responde SOLO con un array JSON del mismo tamaño, en el mismo orden, con {"id": "...", "description": "..."} (la versión limpia). Nada de texto antes o después, ni fences de markdown.`;

export interface TransactionToClean {
  id: string;
  description: string;
}

// Distinguible de otros errores para que cleanDescriptionsInBatches pueda
// reaccionar partiendo el lote a la mitad en vez de solo reportarlo.
export class MaxTokensTruncatedError extends Error {}

export async function cleanDescriptions(opts: {
  provider: Provider;
  apiKey: string;
  transactions: TransactionToClean[];
}): Promise<Map<string, string>> {
  const userContent = [
    "Movimientos a limpiar:",
    JSON.stringify(opts.transactions),
    "\nResponde solo con el array JSON de {id, description}.",
  ].join("\n");

  const result = await chat({
    provider: opts.provider,
    apiKey: opts.apiKey,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
    maxTokens: CLEAN_MAX_TOKENS[opts.provider],
  });

  if (result.finishReason === "max_tokens") {
    throw new MaxTokensTruncatedError(
      `La respuesta se cortó por el límite de tokens de salida (${CLEAN_MAX_TOKENS[opts.provider]}) con un lote de ${opts.transactions.length} transacciones.`,
    );
  }

  const json = extractJson(result.text);
  if (!Array.isArray(json)) {
    throw new Error("El modelo no devolvió un array de descripciones.");
  }

  const byId = new Map<string, string>();
  for (const item of json) {
    if (typeof item !== "object" || item === null) continue;
    const { id, description } = item as { id?: unknown; description?: unknown };
    if (
      typeof id === "string" &&
      typeof description === "string" &&
      description.trim().length > 0
    ) {
      byId.set(id, description.trim());
    }
  }
  return byId;
}

// Mismo criterio que categorizeTransactionsInBatches: empieza en lotes de
// este tamaño, y si uno se trunca igual (MaxTokensTruncatedError), se parte
// a la mitad y se reintenta cada mitad por separado, recursivamente.
const INITIAL_CHUNK_SIZE = 50;
const MIN_CHUNK_SIZE = 1;

export interface CleanBatchResult {
  descriptionById: Map<string, string>;
  errors: string[];
}

async function cleanChunkWithRetry(opts: {
  provider: Provider;
  apiKey: string;
  transactions: TransactionToClean[];
  descriptionById: Map<string, string>;
  errors: string[];
}): Promise<void> {
  try {
    const chunkResult = await cleanDescriptions({
      provider: opts.provider,
      apiKey: opts.apiKey,
      transactions: opts.transactions,
    });
    for (const [id, description] of chunkResult) {
      opts.descriptionById.set(id, description);
    }
  } catch (err) {
    if (
      err instanceof MaxTokensTruncatedError &&
      opts.transactions.length > MIN_CHUNK_SIZE
    ) {
      const mid = Math.ceil(opts.transactions.length / 2);
      await cleanChunkWithRetry({ ...opts, transactions: opts.transactions.slice(0, mid) });
      await cleanChunkWithRetry({ ...opts, transactions: opts.transactions.slice(mid) });
      return;
    }
    opts.errors.push(err instanceof Error ? err.message : "error desconocido");
  }
}

export async function cleanDescriptionsInBatches(opts: {
  provider: Provider;
  apiKey: string;
  transactions: TransactionToClean[];
}): Promise<CleanBatchResult> {
  const descriptionById = new Map<string, string>();
  const errors: string[] = [];

  for (let i = 0; i < opts.transactions.length; i += INITIAL_CHUNK_SIZE) {
    const chunk = opts.transactions.slice(i, i + INITIAL_CHUNK_SIZE);
    await cleanChunkWithRetry({
      provider: opts.provider,
      apiKey: opts.apiKey,
      transactions: chunk,
      descriptionById,
      errors,
    });
  }

  return { descriptionById, errors };
}
