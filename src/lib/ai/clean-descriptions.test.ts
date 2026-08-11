import { beforeEach, describe, expect, it, vi } from "vitest";

const { chatMock } = vi.hoisted(() => ({ chatMock: vi.fn() }));

vi.mock("@/lib/ai/gateway", async () => {
  const actual = await vi.importActual<typeof import("./gateway")>("./gateway");
  return { ...actual, chat: chatMock };
});

import { cleanDescriptions, cleanDescriptionsInBatches } from "./clean-descriptions";

beforeEach(() => {
  chatMock.mockReset();
});

describe("cleanDescriptions", () => {
  it("mapea id -> description limpia para respuestas válidas", async () => {
    chatMock.mockResolvedValue({
      text: JSON.stringify([
        { id: "tx-1", description: "iShopMixup Oasis Coyoacán" },
        { id: "tx-2", description: "Garmin del Maz" },
      ]),
      provider: "anthropic",
      model: "claude-sonnet-5",
      finishReason: "stop",
      raw: {},
    });

    const result = await cleanDescriptions({
      provider: "anthropic",
      apiKey: "fake-key",
      transactions: [
        { id: "tx-1", description: "ISHOPMIXUP OASIS COYOA 001 DE 001" },
        { id: "tx-2", description: "MERPAGO*GARMIN DEL MAZ" },
      ],
    });

    expect(result.get("tx-1")).toBe("iShopMixup Oasis Coyoacán");
    expect(result.get("tx-2")).toBe("Garmin del Maz");
  });

  it("ignora entradas con description vacía o id faltante", async () => {
    chatMock.mockResolvedValue({
      text: JSON.stringify([
        { id: "tx-1", description: "" },
        { description: "Sin id" },
        { id: "tx-2", description: "Válida" },
      ]),
      provider: "anthropic",
      model: "claude-sonnet-5",
      finishReason: "stop",
      raw: {},
    });

    const result = await cleanDescriptions({
      provider: "anthropic",
      apiKey: "fake-key",
      transactions: [
        { id: "tx-1", description: "X" },
        { id: "tx-2", description: "Y" },
      ],
    });

    expect(result.size).toBe(1);
    expect(result.get("tx-2")).toBe("Válida");
  });

  it("lanza un error si el modelo no devuelve un array", async () => {
    chatMock.mockResolvedValue({
      text: JSON.stringify({ oops: true }),
      provider: "anthropic",
      model: "claude-sonnet-5",
      finishReason: "stop",
      raw: {},
    });

    await expect(
      cleanDescriptions({
        provider: "anthropic",
        apiKey: "fake-key",
        transactions: [{ id: "tx-1", description: "X" }],
      }),
    ).rejects.toThrow(/array/);
  });

  it("lanza un error específico si la respuesta se corta por límite de tokens", async () => {
    chatMock.mockResolvedValue({
      text: '[{"id":"tx-1","descrip',
      provider: "deepseek",
      model: "deepseek-chat",
      finishReason: "max_tokens",
      raw: {},
    });

    await expect(
      cleanDescriptions({
        provider: "deepseek",
        apiKey: "fake-key",
        transactions: [{ id: "tx-1", description: "X" }],
      }),
    ).rejects.toThrow(/límite de tokens de salida/);
  });
});

describe("cleanDescriptionsInBatches", () => {
  it("parte un lote grande en chunks de 50 y junta los resultados de cada call", async () => {
    const transactions = Array.from({ length: 120 }, (_, i) => ({
      id: `tx-${i}`,
      description: "X",
    }));

    chatMock.mockImplementation(async (opts: { messages: { content: string }[] }) => {
      const sent = JSON.parse(
        opts.messages[0].content.split("Movimientos a limpiar:\n")[1].split("\n")[0],
      ) as { id: string }[];
      return {
        text: JSON.stringify(sent.map((t) => ({ id: t.id, description: "Limpia" }))),
        provider: "anthropic",
        model: "claude-sonnet-5",
        finishReason: "stop",
        raw: {},
      };
    });

    const { descriptionById, errors } = await cleanDescriptionsInBatches({
      provider: "anthropic",
      apiKey: "fake-key",
      transactions,
    });

    expect(chatMock).toHaveBeenCalledTimes(3); // 50 + 50 + 20
    expect(descriptionById.size).toBe(120);
    expect(errors).toEqual([]);
  });

  it("sigue con los demás chunks si uno falla, y reporta el error", async () => {
    const transactions = Array.from({ length: 100 }, (_, i) => ({
      id: `tx-${i}`,
      description: "X",
    }));

    let call = 0;
    chatMock.mockImplementation(async (opts: { messages: { content: string }[] }) => {
      call++;
      if (call === 1) {
        return {
          text: "no es json",
          provider: "anthropic",
          model: "claude-sonnet-5",
          finishReason: "stop",
          raw: {},
        };
      }
      const sent = JSON.parse(
        opts.messages[0].content.split("Movimientos a limpiar:\n")[1].split("\n")[0],
      ) as { id: string }[];
      return {
        text: JSON.stringify(sent.map((t) => ({ id: t.id, description: "Limpia" }))),
        provider: "anthropic",
        model: "claude-sonnet-5",
        finishReason: "stop",
        raw: {},
      };
    });

    const { descriptionById, errors } = await cleanDescriptionsInBatches({
      provider: "anthropic",
      apiKey: "fake-key",
      transactions,
    });

    expect(descriptionById.size).toBe(50); // segundo chunk sí se limpió
    expect(errors).toHaveLength(1);
  });

  it("si un chunk se trunca por max_tokens, lo parte a la mitad y reintenta cada mitad", async () => {
    const transactions = Array.from({ length: 50 }, (_, i) => ({
      id: `tx-${i}`,
      description: "X",
    }));

    chatMock.mockImplementation(async (opts: { messages: { content: string }[] }) => {
      const sent = JSON.parse(
        opts.messages[0].content.split("Movimientos a limpiar:\n")[1].split("\n")[0],
      ) as { id: string }[];
      if (sent.length > 25) {
        return {
          text: '[{"id":"tx-0","descrip',
          provider: "gemini",
          model: "gemini-3.6-flash",
          finishReason: "max_tokens",
          raw: {},
        };
      }
      return {
        text: JSON.stringify(sent.map((t) => ({ id: t.id, description: "Limpia" }))),
        provider: "gemini",
        model: "gemini-3.6-flash",
        finishReason: "stop",
        raw: {},
      };
    });

    const { descriptionById, errors } = await cleanDescriptionsInBatches({
      provider: "gemini",
      apiKey: "fake-key",
      transactions,
    });

    expect(descriptionById.size).toBe(50);
    expect(errors).toEqual([]);
    expect(chatMock).toHaveBeenCalledTimes(3);
  });
});
