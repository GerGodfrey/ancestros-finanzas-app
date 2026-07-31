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

import { chat } from "./gateway";

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
