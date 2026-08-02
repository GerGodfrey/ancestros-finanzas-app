import { beforeEach, describe, expect, it, vi } from "vitest";

const { chatMock } = vi.hoisted(() => ({ chatMock: vi.fn() }));

vi.mock("@/lib/ai/gateway", async () => {
  const actual = await vi.importActual<typeof import("./gateway")>("./gateway");
  return { ...actual, chat: chatMock };
});

import { categorizeTransactions } from "./categorize-transactions";

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
});
