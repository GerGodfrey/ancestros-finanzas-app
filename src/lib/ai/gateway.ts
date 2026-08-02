import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenAI, type Content, type Part } from "@google/genai";

// Gateway multi-proveedor: una sola interfaz para llamar a Anthropic, OpenAI,
// Google Gemini o DeepSeek con la API key del propio usuario (BYOK).
// Equivalente casero al patrón de LiteLLM, pero en TypeScript puro para no
// salir del runtime de Vercel.
//
// DeepSeek expone una API compatible con la de OpenAI (mismo SDK, solo
// cambia baseURL), así que reutiliza la misma implementación que OpenAI.
// Gemini tiene su propio SDK (@google/genai) y su propio formato de
// tool-calling, por eso tiene funciones dedicadas.
//
// Usado por: el Skill de parseo de PDFs (Fase 2) y el chatbot (Fase 4).
// El "modo orquestador" (combinar más de un proveedor) se construye encima
// de esta función en una fase posterior — esta capa ya lo deja preparado
// porque cada llamada es independiente y normalizada.

export type Provider = "anthropic" | "openai" | "gemini" | "deepseek";

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
   * PDF adjunto en base64. Soportado nativamente por Anthropic y Gemini
   * (leen el documento completo, incluyendo tablas y layout). Para OpenAI y
   * DeepSeek, quien llama debe extraer el texto del PDF antes (ver
   * src/lib/ai/parse-statement.ts) e incluirlo como texto en `messages` —
   * pasar `pdfBase64` con esos proveedores lanza un error.
   */
  pdfBase64?: string;
}

export interface GatewayChatResult {
  text: string;
  provider: Provider;
  model: string;
  raw: unknown;
}

const DEEPSEEK_BASE_URL = "https://api.deepseek.com";

const DEFAULT_MODELS: Record<Provider, string> = {
  anthropic: process.env.ANTHROPIC_DEFAULT_MODEL ?? "claude-sonnet-5",
  // Ajustar cuando se confirme el modelo por defecto que se quiera ofrecer;
  // se puede sobreescribir por request y por variable de entorno.
  openai: process.env.OPENAI_DEFAULT_MODEL ?? "gpt-4o",
  gemini: process.env.GEMINI_DEFAULT_MODEL ?? "gemini-3.6-flash",
  deepseek: process.env.DEEPSEEK_DEFAULT_MODEL ?? "deepseek-chat",
};

export async function chat(
  opts: GatewayChatOptions,
): Promise<GatewayChatResult> {
  const model = opts.model ?? DEFAULT_MODELS[opts.provider];

  if (opts.provider === "anthropic") {
    return chatAnthropic({ ...opts, model });
  }
  if (opts.provider === "gemini") {
    return chatGemini({ ...opts, model });
  }
  if (opts.pdfBase64) {
    throw new Error(
      "Este proveedor no soporta adjuntar PDF directamente en este gateway — extrae el texto primero (ver parse-statement.ts).",
    );
  }
  return chatOpenAICompatible(
    { ...opts, model },
    opts.provider as "openai" | "deepseek",
  );
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

async function chatOpenAICompatible(
  opts: GatewayChatOptions & { model: string },
  provider: "openai" | "deepseek",
): Promise<GatewayChatResult> {
  const client = new OpenAI({
    apiKey: opts.apiKey,
    baseURL: provider === "deepseek" ? DEEPSEEK_BASE_URL : undefined,
  });

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

  return { text, provider, model: opts.model, raw: response };
}

function toGeminiRole(role: "user" | "assistant"): "user" | "model" {
  return role === "assistant" ? "model" : "user";
}

async function chatGemini(
  opts: GatewayChatOptions & { model: string },
): Promise<GatewayChatResult> {
  const client = new GoogleGenAI({ apiKey: opts.apiKey });

  const contents: Content[] = opts.messages.map((m, i) => {
    const isLastUserMessage =
      m.role === "user" && i === opts.messages.length - 1;
    const parts: Part[] = [];

    if (isLastUserMessage && opts.pdfBase64) {
      parts.push({
        inlineData: { mimeType: "application/pdf", data: opts.pdfBase64 },
      });
    }
    parts.push({ text: m.content });

    return { role: toGeminiRole(m.role), parts };
  });

  const response = await client.models.generateContent({
    model: opts.model,
    contents,
    config: {
      systemInstruction: opts.system,
      maxOutputTokens: opts.maxTokens ?? 4096,
    },
  });

  return {
    text: response.text ?? "",
    provider: "gemini",
    model: opts.model,
    raw: response,
  };
}

// ---------------------------------------------------------------------------
// Agente con tool-calling (usado por el chatbot, Fase 4). Mismo principio de
// gateway unificado: una sola función corre el loop de "modelo pide
// herramienta -> ejecutamos -> se la regresamos -> modelo sigue" sin
// importar el proveedor.
// ---------------------------------------------------------------------------

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>; // JSON Schema de los parámetros
}

export interface ToolCall {
  name: string;
  input: Record<string, unknown>;
}

export type ToolExecutor = (call: ToolCall) => Promise<unknown>;

export interface GatewayAgentOptions {
  provider: Provider;
  apiKey: string;
  model?: string;
  system?: string;
  messages: ChatMessage[];
  tools: ToolDefinition[];
  executeTool: ToolExecutor;
  maxTokens?: number;
  /** Límite de vueltas modelo->herramienta->modelo, para evitar loops infinitos. */
  maxSteps?: number;
}

export interface AgentToolCallTrace {
  name: string;
  input: unknown;
  result: unknown;
}

export interface GatewayAgentResult {
  text: string;
  provider: Provider;
  model: string;
  toolCalls: AgentToolCallTrace[];
}

export async function runAgent(
  opts: GatewayAgentOptions,
): Promise<GatewayAgentResult> {
  const model = opts.model ?? DEFAULT_MODELS[opts.provider];
  const maxSteps = opts.maxSteps ?? 6;

  if (opts.provider === "anthropic") {
    return runAgentAnthropic({ ...opts, model, maxSteps });
  }
  if (opts.provider === "gemini") {
    return runAgentGemini({ ...opts, model, maxSteps });
  }
  return runAgentOpenAICompatible(
    { ...opts, model, maxSteps },
    opts.provider as "openai" | "deepseek",
  );
}

async function runAgentAnthropic(
  opts: GatewayAgentOptions & { model: string; maxSteps: number },
): Promise<GatewayAgentResult> {
  const client = new Anthropic({ apiKey: opts.apiKey });
  const tools: Anthropic.Tool[] = opts.tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
  }));

  const messages: Anthropic.MessageParam[] = opts.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));
  const toolCalls: AgentToolCallTrace[] = [];

  for (let step = 0; step < opts.maxSteps; step++) {
    const response = await client.messages.create({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 4096,
      system: opts.system,
      messages,
      tools,
    });

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason !== "tool_use") {
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      return { text, provider: "anthropic", model: opts.model, toolCalls };
    }

    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of toolUseBlocks) {
      const input = block.input as Record<string, unknown>;
      const result = await opts.executeTool({ name: block.name, input });
      toolCalls.push({ name: block.name, input, result });
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: JSON.stringify(result),
      });
    }

    messages.push({ role: "user", content: toolResults });
  }

  throw new Error(
    `El agente alcanzó el límite de ${opts.maxSteps} pasos sin dar una respuesta final.`,
  );
}

async function runAgentOpenAICompatible(
  opts: GatewayAgentOptions & { model: string; maxSteps: number },
  provider: "openai" | "deepseek",
): Promise<GatewayAgentResult> {
  const client = new OpenAI({
    apiKey: opts.apiKey,
    baseURL: provider === "deepseek" ? DEEPSEEK_BASE_URL : undefined,
  });
  const tools: OpenAI.Chat.ChatCompletionTool[] = opts.tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    },
  }));

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    ...(opts.system
      ? [{ role: "system" as const, content: opts.system }]
      : []),
    ...opts.messages.map((m) => ({ role: m.role, content: m.content })),
  ];
  const toolCalls: AgentToolCallTrace[] = [];

  for (let step = 0; step < opts.maxSteps; step++) {
    const response = await client.chat.completions.create({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 4096,
      messages,
      tools,
    });

    const choice = response.choices[0];
    const message = choice.message;
    messages.push(message);

    if (!message.tool_calls || message.tool_calls.length === 0) {
      return {
        text: message.content ?? "",
        provider,
        model: opts.model,
        toolCalls,
      };
    }

    for (const call of message.tool_calls) {
      if (call.type !== "function") continue;
      const input = JSON.parse(call.function.arguments || "{}");
      const result = await opts.executeTool({
        name: call.function.name,
        input,
      });
      toolCalls.push({ name: call.function.name, input, result });
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }
  }

  throw new Error(
    `El agente alcanzó el límite de ${opts.maxSteps} pasos sin dar una respuesta final.`,
  );
}

async function runAgentGemini(
  opts: GatewayAgentOptions & { model: string; maxSteps: number },
): Promise<GatewayAgentResult> {
  const client = new GoogleGenAI({ apiKey: opts.apiKey });
  const tools = [
    {
      functionDeclarations: opts.tools.map((t) => ({
        name: t.name,
        description: t.description,
        parametersJsonSchema: t.inputSchema,
      })),
    },
  ];

  const contents: Content[] = opts.messages.map((m) => ({
    role: toGeminiRole(m.role),
    parts: [{ text: m.content }],
  }));
  const toolCalls: AgentToolCallTrace[] = [];

  for (let step = 0; step < opts.maxSteps; step++) {
    const response = await client.models.generateContent({
      model: opts.model,
      contents,
      config: {
        systemInstruction: opts.system,
        maxOutputTokens: opts.maxTokens ?? 4096,
        tools,
      },
    });

    const functionCalls = response.functionCalls ?? [];
    const responseParts =
      response.candidates?.[0]?.content?.parts ?? [{ text: response.text ?? "" }];
    contents.push({ role: "model", parts: responseParts });

    if (functionCalls.length === 0) {
      return {
        text: response.text ?? "",
        provider: "gemini",
        model: opts.model,
        toolCalls,
      };
    }

    const resultParts: Part[] = [];
    for (const call of functionCalls) {
      const name = call.name ?? "";
      const input = (call.args ?? {}) as Record<string, unknown>;
      const result = await opts.executeTool({ name, input });
      toolCalls.push({ name, input, result });
      resultParts.push({
        functionResponse: { name, response: { result } },
      });
    }

    contents.push({ role: "user", parts: resultParts });
  }

  throw new Error(
    `El agente alcanzó el límite de ${opts.maxSteps} pasos sin dar una respuesta final.`,
  );
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
