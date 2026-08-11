import { chat, type Provider } from "@/lib/ai/gateway";
import { extractJson } from "@/lib/ai/extract-json";
import {
  isTransactionCategory,
  type TransactionCategory,
} from "@/lib/transaction-categories";

// Backfill de categoría para transacciones que ya se guardaron antes de que
// el Skill empezara a asignar `category` al parsear (o si el Skill no pudo
// asignarla con confianza). Es texto-only, no vuelve a leer el PDF — barato
// y rápido comparado con re-parsear.

const CATEGORIZE_MAX_TOKENS: Record<Provider, number> = {
  anthropic: 4096,
  openai: 4096,
  gemini: 8192,
  deepseek: 4096,
};

const SYSTEM_PROMPT = `Clasificas movimientos de tarjetas de crédito mexicanas por categoría de gasto, a partir de su descripción, monto y tipo.

Categorías válidas y cómo reconocerlas por el nombre del comercio:
- comida: restaurantes, cafés, comida rápida, delivery (Rappi, Uber Eats).
- ropa: tiendas de ropa/calzado/accesorios.
- transporte: Uber, Didi, gasolineras, casetas, estacionamientos, taxis.
- hogar: renta, servicios (CFE, agua, gas), muebles, artículos para la casa, ferreterías.
- entretenimiento: cine, streaming (Netflix, Spotify, Disney+), boletos de eventos (Ticketmaster), bares.
- tech: Apple, Google, software/SaaS (Anthropic/Claude, ChatGPT, Wix), electrónica, celulares.
- viaje: aerolíneas, hoteles, agencias de viaje, cargos en moneda extranjera asociados a un viaje.
- salud: farmacias, gimnasios (TotalPass, Smart Fit), consultorios, seguros médicos.
- intereses_comisiones: SIEMPRE que type sea "interest" o "fee", sin excepción.
- otros: cualquier cosa que no encaje con claridad, y SIEMPRE para type "payment" (abonos).

Si la descripción no da pistas suficientes (nombres crípticos tipo "MERPAGO*XYZ123"), usa "otros" — no inventes.

Te doy un array de movimientos con su "id". Responde SOLO con un array JSON del mismo tamaño, en el mismo orden, con {"id": "...", "category": "..."}. Nada de texto antes o después, ni fences de markdown.`;

export interface TransactionToCategorize {
  id: string;
  description: string;
  amount: number;
  type: string;
}

// Distinguible de otros errores para que categorizeTransactionsInBatches
// pueda reaccionar partiendo el lote a la mitad en vez de solo reportarlo.
export class MaxTokensTruncatedError extends Error {}

export async function categorizeTransactions(opts: {
  provider: Provider;
  apiKey: string;
  transactions: TransactionToCategorize[];
}): Promise<Map<string, TransactionCategory>> {
  const userContent = [
    "Movimientos a categorizar:",
    JSON.stringify(opts.transactions),
    "\nResponde solo con el array JSON de {id, category}.",
  ].join("\n");

  const result = await chat({
    provider: opts.provider,
    apiKey: opts.apiKey,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
    maxTokens: CATEGORIZE_MAX_TOKENS[opts.provider],
  });

  if (result.finishReason === "max_tokens") {
    throw new MaxTokensTruncatedError(
      `La respuesta se cortó por el límite de tokens de salida (${CATEGORIZE_MAX_TOKENS[opts.provider]}) con un lote de ${opts.transactions.length} transacciones.`,
    );
  }

  const json = extractJson(result.text);
  if (!Array.isArray(json)) {
    throw new Error("El modelo no devolvió un array de categorías.");
  }

  const byId = new Map<string, TransactionCategory>();
  for (const item of json) {
    if (typeof item !== "object" || item === null) continue;
    const { id, category } = item as { id?: unknown; category?: unknown };
    if (typeof id === "string" && isTransactionCategory(category)) {
      byId.set(id, category);
    }
  }
  return byId;
}

// Un lote grande de transacciones (el backfill puede tener decenas o cientos
// pendientes) fácilmente rebasa el maxTokens de salida si se manda todo en
// un solo call — ver CATEGORIZE_MAX_TOKENS arriba, en particular el tope
// duro de 8192 de DeepSeek. Se empieza en lotes de este tamaño; si uno se
// trunca igual (MaxTokensTruncatedError), se parte a la mitad y se
// reintenta cada mitad por separado — auto-ajustable en vez de una sola
// constante que puede volver a quedarse corta con descripciones largas o un
// modelo más verboso de lo esperado.
const INITIAL_CHUNK_SIZE = 50;
const MIN_CHUNK_SIZE = 1;

export interface CategorizeBatchResult {
  categoryById: Map<string, TransactionCategory>;
  errors: string[];
}

async function categorizeChunkWithRetry(opts: {
  provider: Provider;
  apiKey: string;
  transactions: TransactionToCategorize[];
  categoryById: Map<string, TransactionCategory>;
  errors: string[];
}): Promise<void> {
  try {
    const chunkResult = await categorizeTransactions({
      provider: opts.provider,
      apiKey: opts.apiKey,
      transactions: opts.transactions,
    });
    for (const [id, category] of chunkResult) {
      opts.categoryById.set(id, category);
    }
  } catch (err) {
    if (
      err instanceof MaxTokensTruncatedError &&
      opts.transactions.length > MIN_CHUNK_SIZE
    ) {
      const mid = Math.ceil(opts.transactions.length / 2);
      await categorizeChunkWithRetry({
        ...opts,
        transactions: opts.transactions.slice(0, mid),
      });
      await categorizeChunkWithRetry({
        ...opts,
        transactions: opts.transactions.slice(mid),
      });
      return;
    }
    opts.errors.push(err instanceof Error ? err.message : "error desconocido");
  }
}

export async function categorizeTransactionsInBatches(opts: {
  provider: Provider;
  apiKey: string;
  transactions: TransactionToCategorize[];
}): Promise<CategorizeBatchResult> {
  const categoryById = new Map<string, TransactionCategory>();
  const errors: string[] = [];

  for (let i = 0; i < opts.transactions.length; i += INITIAL_CHUNK_SIZE) {
    const chunk = opts.transactions.slice(i, i + INITIAL_CHUNK_SIZE);
    await categorizeChunkWithRetry({
      provider: opts.provider,
      apiKey: opts.apiKey,
      transactions: chunk,
      categoryById,
      errors,
    });
  }

  return { categoryById, errors };
}
