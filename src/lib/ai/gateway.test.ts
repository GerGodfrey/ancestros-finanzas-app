import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  anthropicCreateMock,
  openaiCreateMock,
  openaiConstructorMock,
  geminiGenerateContentMock,
} = vi.hoisted(() => ({
  anthropicCreateMock: vi.fn(),
  openaiCreateMock: vi.fn(),
  openaiConstructorMock: vi.fn(),
  geminiGenerateContentMock: vi.fn(),
}));

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class AnthropicMock {
      messages = { create: anthropicCreateMock };
      constructor(public opts: { apiKey: string }) {}
    },
  };
});

vi.mock("openai", () => {
  return {
    default: class OpenAIMock {
      chat = { completions: { create: openaiCreateMock } };
      constructor(opts: { apiKey: string; baseURL?: string }) {
        openaiConstructorMock(opts);
      }
    },
  };
});

vi.mock("@google/genai", () => {
  return {
    GoogleGenAI: class GoogleGenAIMock {
      models = { generateContent: geminiGenerateContentMock };
      constructor(public opts: { apiKey: string }) {}
    },
    ThinkingLevel: { MINIMAL: "MINIMAL" },
  };
});

import { chat, runAgent } from "./gateway";

beforeEach(() => {
  anthropicCreateMock.mockReset();
  openaiCreateMock.mockReset();
  openaiConstructorMock.mockReset();
  geminiGenerateContentMock.mockReset();
});

describe("gateway: chat", () => {
  it("llama al SDK de Anthropic y normaliza la respuesta de texto", async () => {
    anthropicCreateMock.mockResolvedValue({
      content: [{ type: "text", text: "hola desde claude" }],
    });

    const result = await chat({
      provider: "anthropic",
      apiKey: "fake-key",
      messages: [{ role: "user", content: "hola" }],
    });

    expect(result.text).toBe("hola desde claude");
    expect(result.provider).toBe("anthropic");
    expect(anthropicCreateMock).toHaveBeenCalledTimes(1);
  });

  it("normaliza finishReason='max_tokens' cuando Anthropic corta por stop_reason='max_tokens'", async () => {
    anthropicCreateMock.mockResolvedValue({
      stop_reason: "max_tokens",
      content: [{ type: "text", text: '{ "incompleto":' }],
    });

    const result = await chat({
      provider: "anthropic",
      apiKey: "fake-key",
      messages: [{ role: "user", content: "hola" }],
    });

    expect(result.finishReason).toBe("max_tokens");
  });

  it("llama al SDK de OpenAI y normaliza la respuesta de texto", async () => {
    openaiCreateMock.mockResolvedValue({
      choices: [{ message: { content: "hola desde gpt" } }],
    });

    const result = await chat({
      provider: "openai",
      apiKey: "fake-key",
      messages: [{ role: "user", content: "hola" }],
    });

    expect(result.text).toBe("hola desde gpt");
    expect(result.provider).toBe("openai");
    expect(openaiCreateMock).toHaveBeenCalledTimes(1);
  });

  it("normaliza finishReason='max_tokens' cuando OpenAI corta por finish_reason='length'", async () => {
    openaiCreateMock.mockResolvedValue({
      choices: [
        { message: { content: '{ "incompleto":' }, finish_reason: "length" },
      ],
    });

    const result = await chat({
      provider: "openai",
      apiKey: "fake-key",
      messages: [{ role: "user", content: "hola" }],
    });

    expect(result.finishReason).toBe("max_tokens");
  });

  it("adjunta el PDF como bloque 'document' en el último mensaje de usuario para Anthropic", async () => {
    anthropicCreateMock.mockResolvedValue({
      content: [{ type: "text", text: "{}" }],
    });

    await chat({
      provider: "anthropic",
      apiKey: "fake-key",
      messages: [{ role: "user", content: "extrae esto" }],
      pdfBase64: "ZmFrZS1wZGY=",
    });

    const callArgs = anthropicCreateMock.mock.calls[0][0];
    const lastMessageContent = callArgs.messages.at(-1).content;
    expect(lastMessageContent).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "document",
          source: expect.objectContaining({ type: "base64" }),
        }),
      ]),
    );
  });

  it("rechaza pdfBase64 con proveedor openai (no soportado en este gateway)", async () => {
    await expect(
      chat({
        provider: "openai",
        apiKey: "fake-key",
        messages: [{ role: "user", content: "hola" }],
        pdfBase64: "ZmFrZS1wZGY=",
      }),
    ).rejects.toThrow(/PDF/);
    expect(openaiCreateMock).not.toHaveBeenCalled();
  });

  it("llama al SDK de Gemini y normaliza la respuesta de texto", async () => {
    geminiGenerateContentMock.mockResolvedValue({ text: "hola desde gemini" });

    const result = await chat({
      provider: "gemini",
      apiKey: "fake-key",
      messages: [{ role: "user", content: "hola" }],
    });

    expect(result.text).toBe("hola desde gemini");
    expect(result.provider).toBe("gemini");
    expect(geminiGenerateContentMock).toHaveBeenCalledTimes(1);
  });

  it("normaliza finishReason='max_tokens' cuando Gemini corta por finishReason='MAX_TOKENS'", async () => {
    geminiGenerateContentMock.mockResolvedValue({
      text: '{ "incompleto":',
      candidates: [{ finishReason: "MAX_TOKENS" }],
    });

    const result = await chat({
      provider: "gemini",
      apiKey: "fake-key",
      messages: [{ role: "user", content: "hola" }],
    });

    expect(result.finishReason).toBe("max_tokens");
  });

  it("adjunta el PDF como inlineData en el último mensaje de usuario para Gemini", async () => {
    geminiGenerateContentMock.mockResolvedValue({ text: "{}" });

    await chat({
      provider: "gemini",
      apiKey: "fake-key",
      messages: [{ role: "user", content: "extrae esto" }],
      pdfBase64: "ZmFrZS1wZGY=",
    });

    const callArgs = geminiGenerateContentMock.mock.calls[0][0];
    const lastContentParts = callArgs.contents.at(-1).parts;
    expect(lastContentParts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          inlineData: expect.objectContaining({
            mimeType: "application/pdf",
          }),
        }),
      ]),
    );
  });

  it("llama al SDK de OpenAI apuntando a DeepSeek cuando provider='deepseek'", async () => {
    openaiCreateMock.mockResolvedValue({
      choices: [{ message: { content: "hola desde deepseek" } }],
    });

    const result = await chat({
      provider: "deepseek",
      apiKey: "fake-key",
      messages: [{ role: "user", content: "hola" }],
    });

    expect(result.text).toBe("hola desde deepseek");
    expect(result.provider).toBe("deepseek");
    expect(openaiConstructorMock).toHaveBeenCalledWith(
      expect.objectContaining({ baseURL: "https://api.deepseek.com" }),
    );
  });

  it("OpenAI normal no manda baseURL personalizado", async () => {
    openaiCreateMock.mockResolvedValue({
      choices: [{ message: { content: "hola" } }],
    });

    await chat({
      provider: "openai",
      apiKey: "fake-key",
      messages: [{ role: "user", content: "hola" }],
    });

    expect(openaiConstructorMock).toHaveBeenCalledWith(
      expect.objectContaining({ baseURL: undefined }),
    );
  });

  it("rechaza pdfBase64 con proveedor deepseek (no soportado en este gateway)", async () => {
    await expect(
      chat({
        provider: "deepseek",
        apiKey: "fake-key",
        messages: [{ role: "user", content: "hola" }],
        pdfBase64: "ZmFrZS1wZGY=",
      }),
    ).rejects.toThrow(/PDF/);
    expect(openaiCreateMock).not.toHaveBeenCalled();
  });

  it("reintenta con backoff cuando el proveedor responde un error transitorio (503) y luego funciona", async () => {
    vi.useFakeTimers();
    const overloaded = Object.assign(new Error("UNAVAILABLE"), {
      status: 503,
    });
    geminiGenerateContentMock
      .mockRejectedValueOnce(overloaded)
      .mockResolvedValueOnce({ text: "hola desde gemini" });

    const resultPromise = chat({
      provider: "gemini",
      apiKey: "fake-key",
      messages: [{ role: "user", content: "hola" }],
    });
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.text).toBe("hola desde gemini");
    expect(geminiGenerateContentMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("reintenta cuando falla la conexión de red (fetch failed / ECONNRESET) y luego funciona", async () => {
    // Node's fetch lanza TypeError("fetch failed") con la causa real (ej.
    // ECONNRESET) en err.cause — mismo trato que un 503: transitorio, se
    // reintenta.
    vi.useFakeTimers();
    const networkError = new TypeError("fetch failed");
    (networkError as { cause?: unknown }).cause = Object.assign(
      new Error("read ECONNRESET"),
      { code: "ECONNRESET" },
    );
    geminiGenerateContentMock
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce({ text: "hola desde gemini" });

    const resultPromise = chat({
      provider: "gemini",
      apiKey: "fake-key",
      messages: [{ role: "user", content: "hola" }],
    });
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.text).toBe("hola desde gemini");
    expect(geminiGenerateContentMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("no reintenta errores no transitorios (ej. API key inválida)", async () => {
    const authError = Object.assign(new Error("invalid api key"), {
      status: 401,
    });
    geminiGenerateContentMock.mockRejectedValue(authError);

    await expect(
      chat({
        provider: "gemini",
        apiKey: "fake-key",
        messages: [{ role: "user", content: "hola" }],
      }),
    ).rejects.toThrow(/invalid api key/);
    expect(geminiGenerateContentMock).toHaveBeenCalledTimes(1);
  });

  it("usa el modelo por defecto cuando no se especifica uno", async () => {
    anthropicCreateMock.mockResolvedValue({
      content: [{ type: "text", text: "ok" }],
    });

    await chat({
      provider: "anthropic",
      apiKey: "fake-key",
      messages: [{ role: "user", content: "hola" }],
    });

    const callArgs = anthropicCreateMock.mock.calls[0][0];
    expect(typeof callArgs.model).toBe("string");
    expect(callArgs.model.length).toBeGreaterThan(0);
  });
});

const FAKE_TOOL = {
  name: "get_transactions",
  description: "test tool",
  inputSchema: { type: "object", properties: {} },
};

describe("gateway: runAgent (tool-calling)", () => {
  it("Anthropic: ejecuta la herramienta pedida y regresa la respuesta final", async () => {
    anthropicCreateMock
      .mockResolvedValueOnce({
        stop_reason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "call_1",
            name: "get_transactions",
            input: { limit: 3 },
          },
        ],
      })
      .mockResolvedValueOnce({
        stop_reason: "end_turn",
        content: [{ type: "text", text: "Gastaste $500 en total." }],
      });

    const executeTool = vi.fn().mockResolvedValue([{ amount: 500 }]);

    const result = await runAgent({
      provider: "anthropic",
      apiKey: "fake-key",
      messages: [{ role: "user", content: "¿cuánto gasté?" }],
      tools: [FAKE_TOOL],
      executeTool,
    });

    expect(executeTool).toHaveBeenCalledWith({
      name: "get_transactions",
      input: { limit: 3 },
    });
    expect(result.text).toBe("Gastaste $500 en total.");
    expect(result.toolCalls).toHaveLength(1);
    expect(anthropicCreateMock).toHaveBeenCalledTimes(2);
  });

  it("OpenAI: ejecuta la herramienta pedida y regresa la respuesta final", async () => {
    openaiCreateMock
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call_1",
                  type: "function",
                  function: {
                    name: "get_transactions",
                    arguments: JSON.stringify({ limit: 3 }),
                  },
                },
              ],
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              role: "assistant",
              content: "Gastaste $500 en total.",
            },
          },
        ],
      });

    const executeTool = vi.fn().mockResolvedValue([{ amount: 500 }]);

    const result = await runAgent({
      provider: "openai",
      apiKey: "fake-key",
      messages: [{ role: "user", content: "¿cuánto gasté?" }],
      tools: [FAKE_TOOL],
      executeTool,
    });

    expect(executeTool).toHaveBeenCalledWith({
      name: "get_transactions",
      input: { limit: 3 },
    });
    expect(result.text).toBe("Gastaste $500 en total.");
    expect(openaiCreateMock).toHaveBeenCalledTimes(2);
  });

  it("Gemini: ejecuta la herramienta pedida y regresa la respuesta final", async () => {
    geminiGenerateContentMock
      .mockResolvedValueOnce({
        text: undefined,
        functionCalls: [{ name: "get_transactions", args: { limit: 3 } }],
        candidates: [
          {
            content: {
              parts: [
                {
                  functionCall: {
                    name: "get_transactions",
                    args: { limit: 3 },
                  },
                },
              ],
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        text: "Gastaste $500 en total.",
        functionCalls: undefined,
        candidates: [
          { content: { parts: [{ text: "Gastaste $500 en total." }] } },
        ],
      });

    const executeTool = vi.fn().mockResolvedValue([{ amount: 500 }]);

    const result = await runAgent({
      provider: "gemini",
      apiKey: "fake-key",
      messages: [{ role: "user", content: "¿cuánto gasté?" }],
      tools: [FAKE_TOOL],
      executeTool,
    });

    expect(executeTool).toHaveBeenCalledWith({
      name: "get_transactions",
      input: { limit: 3 },
    });
    expect(result.text).toBe("Gastaste $500 en total.");
    expect(result.toolCalls).toHaveLength(1);
    expect(geminiGenerateContentMock).toHaveBeenCalledTimes(2);

    // Verifica que la herramienta se declaró con parametersJsonSchema (JSON
    // Schema plano), no con el enum Type propietario de Gemini.
    const firstCallArgs = geminiGenerateContentMock.mock.calls[0][0];
    expect(
      firstCallArgs.config.tools[0].functionDeclarations[0]
        .parametersJsonSchema,
    ).toEqual(FAKE_TOOL.inputSchema);
  });

  it("DeepSeek: reutiliza el loop de tool-calling estilo OpenAI", async () => {
    openaiCreateMock
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call_1",
                  type: "function",
                  function: {
                    name: "get_transactions",
                    arguments: JSON.stringify({ limit: 3 }),
                  },
                },
              ],
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [
          { message: { role: "assistant", content: "Gastaste $500 en total." } },
        ],
      });

    const executeTool = vi.fn().mockResolvedValue([{ amount: 500 }]);

    const result = await runAgent({
      provider: "deepseek",
      apiKey: "fake-key",
      messages: [{ role: "user", content: "¿cuánto gasté?" }],
      tools: [FAKE_TOOL],
      executeTool,
    });

    expect(result.text).toBe("Gastaste $500 en total.");
    expect(result.provider).toBe("deepseek");
    expect(openaiConstructorMock).toHaveBeenCalledWith(
      expect.objectContaining({ baseURL: "https://api.deepseek.com" }),
    );
  });

  it("lanza un error si se alcanza el límite de pasos sin respuesta final", async () => {
    anthropicCreateMock.mockResolvedValue({
      stop_reason: "tool_use",
      content: [
        {
          type: "tool_use",
          id: "call_x",
          name: "get_transactions",
          input: {},
        },
      ],
    });

    await expect(
      runAgent({
        provider: "anthropic",
        apiKey: "fake-key",
        messages: [{ role: "user", content: "hola" }],
        tools: [FAKE_TOOL],
        executeTool: vi.fn().mockResolvedValue({}),
        maxSteps: 2,
      }),
    ).rejects.toThrow(/límite de 2 pasos/);
  });
});
