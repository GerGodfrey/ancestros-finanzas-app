import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

// Gateway multi-proveedor: una sola interfaz para llamar a Anthropic u OpenAI
// con la API key del propio usuario (BYOK). Equivalente casero al patrón de
// LiteLLM, pero en TypeScript puro para no salir del runtime de Vercel.
//
// Usado por: el Skill de parseo de PDFs (Fase 2) y el chatbot (Fase 4).
// El "modo orquestador" (combinar más de un proveedor) se construye encima
// de esta función en una fase posterior — esta capa ya lo deja preparado
// porque cada llamada es independiente y normalizada.

export type Provider = "anthropic" | "openai";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export interface GatewayChatOptions {
  provider: Provider;
  apiKey: string;
  model?: string;
  system?: string;
  messages: ChatMessage[];
  maxTokens?: number;
  /**
   * PDF adjunto en base64. Solo soportado nativamente por Anthropic (lee el
   * documento completo, incluyendo tablas y layout). Para OpenAI, quien
   * llama debe extraer el texto del PDF antes (ver src/lib/ai/parse-statement.ts)
   * e incluirlo como texto en `messages` — pasar `pdfBase64` con provider
   * 'openai' lanza un error.
   */
  pdfBase64?: string;
}

export interface GatewayChatResult {
  text: string;
  provider: Provider;
  model: string;
  raw: unknown;
}

const DEFAULT_MODELS: Record<Provider, string> = {
  anthropic: process.env.ANTHROPIC_DEFAULT_MODEL ?? "claude-sonnet-5",
  // Ajustar cuando se confirme el modelo por defecto que se quiera ofrecer;
  // se puede sobreescribir por request y por variable de entorno.
  openai: process.env.OPENAI_DEFAULT_MODEL ?? "gpt-4o",
};

export async function chat(
  opts: GatewayChatOptions,
): Promise<GatewayChatResult> {
  const model = opts.model ?? DEFAULT_MODELS[opts.provider];

  if (opts.provider === "anthropic") {
    return chatAnthropic({ ...opts, model });
  }
  if (opts.pdfBase64) {
    throw new Error(
      "OpenAI no soporta adjuntar PDF directamente en este gateway — extrae el texto primero (ver parse-statement.ts).",
    );
  }
  return chatOpenAI({ ...opts, model });
}

async function chatAnthropic(
  opts: GatewayChatOptions & { model: string },
): Promise<GatewayChatResult> {
  const client = new Anthropic({ apiKey: opts.apiKey });

  const messages: Anthropic.MessageParam[] = opts.messages.map((m, i) => {
    // El PDF se adjunta al último mensaje de usuario.
    const isLastUserMessage =
      m.role === "user" && i === opts.messages.length - 1;

    if (isLastUserMessage && opts.pdfBase64) {
      return {
        role: m.role,
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: opts.pdfBase64,
            },
          },
          { type: "text", text: m.content },
        ],
      };
    }

    return { role: m.role, content: m.content };
  });

  const response = await client.messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens ?? 4096,
    system: opts.system,
    messages,
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");

  return { text, provider: "anthropic", model: opts.model, raw: response };
}

async function chatOpenAI(
  opts: GatewayChatOptions & { model: string },
): Promise<GatewayChatResult> {
  const client = new OpenAI({ apiKey: opts.apiKey });

  const response = await client.chat.completions.create({
    model: opts.model,
    max_tokens: opts.maxTokens ?? 4096,
    messages: [
      ...(opts.system
        ? [{ role: "system" as const, content: opts.system }]
        : []),
      ...opts.messages.map((m) => ({ role: m.role, content: m.content })),
    ],
  });

  const text = response.choices[0]?.message?.content ?? "";

  return { text, provider: "openai", model: opts.model, raw: response };
}

// Prueba rápida de que una API key es válida, para usarla en la pantalla de
// Configuración antes de guardar la credencial.
export async function verifyApiKey(
  provider: Provider,
  apiKey: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await chat({
      provider,
      apiKey,
      messages: [{ role: "user", content: "ping" }],
      maxTokens: 8,
    });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Error desconocido",
    };
  }
}
