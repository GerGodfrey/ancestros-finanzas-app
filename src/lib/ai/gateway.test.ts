import { beforeEach, describe, expect, it, vi } from "vitest";

const { anthropicCreateMock, openaiCreateMock } = vi.hoisted(() => ({
  anthropicCreateMock: vi.fn(),
  openaiCreateMock: vi.fn(),
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
      constructor(public opts: { apiKey: string }) {}
    },
  };
});

import { chat, runAgent } from "./gateway";

beforeEach(() => {
  anthropicCreateMock.mockReset();
  openaiCreateMock.mockReset();
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
