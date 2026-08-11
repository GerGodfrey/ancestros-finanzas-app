import { beforeEach, describe, expect, it, vi } from "vitest";

const { chatMock } = vi.hoisted(() => ({ chatMock: vi.fn() }));

vi.mock("@/lib/ai/gateway", async () => {
  const actual = await vi.importActual<typeof import("./gateway")>("./gateway");
  return { ...actual, chat: chatMock };
});

import {
  categorizeTransactions,
  categorizeTransactionsInBatches,
} from "./categorize-transactions";

beforeEach(() => {
  chatMock.mockReset();
});

describe("categorizeTransactions", () => {
  it("mapea id -> category para respuestas válidas", async () => {
    chatMock.mockResolvedValue({
      text: JSON.stringify([
        { id: "tx-1", category: "comida" },
        { id: "tx-2", category: "transporte" },
      ]),
      provider: "anthropic",
      model: "claude-sonnet-5",
      finishReason: "stop",
      raw: {},
    });

    const result = await categorizeTransactions({
      provider: "anthropic",
      apiKey: "fake-key",
      transactions: [
        { id: "tx-1", description: "TOKS", amount: 100, type: "regular" },
        { id: "tx-2", description: "UBER", amount: 50, type: "regular" },
      ],
    });

    expect(result.get("tx-1")).toBe("comida");
    expect(result.get("tx-2")).toBe("transporte");
  });

  it("ignora entradas con category inválida o id faltante", async () => {
    chatMock.mockResolvedValue({
      text: JSON.stringify([
        { id: "tx-1", category: "no-existe" },
        { category: "comida" },
        { id: "tx-2", category: "salud" },
      ]),
      provider: "anthropic",
      model: "claude-sonnet-5",
      finishReason: "stop",
      raw: {},
    });

    const result = await categorizeTransactions({
      provider: "anthropic",
      apiKey: "fake-key",
      transactions: [
        { id: "tx-1", description: "X", amount: 1, type: "regular" },
        { id: "tx-2", description: "Y", amount: 1, type: "regular" },
      ],
    });

    expect(result.size).toBe(1);
    expect(result.get("tx-2")).toBe("salud");
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
      categorizeTransactions({
        provider: "anthropic",
        apiKey: "fake-key",
        transactions: [{ id: "tx-1", description: "X", amount: 1, type: "regular" }],
      }),
    ).rejects.toThrow(/array/);
  });

  it("lanza un error específico si la respuesta se corta por límite de tokens", async () => {
    chatMock.mockResolvedValue({
      text: '[{"id":"tx-1","category":"comida"},{"id":"tx-2","cat',
      provider: "deepseek",
      model: "deepseek-chat",
      finishReason: "max_tokens",
      raw: {},
    });

    await expect(
      categorizeTransactions({
        provider: "deepseek",
        apiKey: "fake-key",
        transactions: [{ id: "tx-1", description: "X", amount: 1, type: "regular" }],
      }),
    ).rejects.toThrow(/límite de tokens de salida/);
  });
});

describe("categorizeTransactionsInBatches", () => {
  it("parte un lote grande en chunks de 50 y junta los resultados de cada call", async () => {
    const transactions = Array.from({ length: 120 }, (_, i) => ({
      id: `tx-${i}`,
      description: "X",
      amount: 1,
      type: "regular",
    }));

    chatMock.mockImplementation(async (opts: { messages: { content: string }[] }) => {
      const sent = JSON.parse(
        opts.messages[0].content.split("Movimientos a categorizar:\n")[1].split("\n")[0],
      ) as { id: string }[];
      return {
        text: JSON.stringify(sent.map((t) => ({ id: t.id, category: "comida" }))),
        provider: "anthropic",
        model: "claude-sonnet-5",
        finishReason: "stop",
        raw: {},
      };
    });

    const { categoryById, errors } = await categorizeTransactionsInBatches({
      provider: "anthropic",
      apiKey: "fake-key",
      transactions,
    });

    expect(chatMock).toHaveBeenCalledTimes(3); // 50 + 50 + 20
    expect(categoryById.size).toBe(120);
    expect(errors).toEqual([]);
  });

  it("sigue con los demás chunks si uno falla, y reporta el error", async () => {
    const transactions = Array.from({ length: 100 }, (_, i) => ({
      id: `tx-${i}`,
      description: "X",
      amount: 1,
      type: "regular",
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
        opts.messages[0].content.split("Movimientos a categorizar:\n")[1].split("\n")[0],
      ) as { id: string }[];
      return {
        text: JSON.stringify(sent.map((t) => ({ id: t.id, category: "comida" }))),
        provider: "anthropic",
        model: "claude-sonnet-5",
        finishReason: "stop",
        raw: {},
      };
    });

    const { categoryById, errors } = await categorizeTransactionsInBatches({
      provider: "anthropic",
      apiKey: "fake-key",
      transactions,
    });

    expect(categoryById.size).toBe(50); // segundo chunk sí se categorizó
    expect(errors).toHaveLength(1);
  });
});
