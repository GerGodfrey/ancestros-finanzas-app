import { beforeEach, describe, expect, it, vi } from "vitest";

const { chatMock } = vi.hoisted(() => ({ chatMock: vi.fn() }));

vi.mock("@/lib/ai/gateway", async () => {
  const actual = await vi.importActual<typeof import("./gateway")>("./gateway");
  return { ...actual, chat: chatMock };
});

import {
  generateMonthlyInsights,
  regenerateMonthlyInsights,
} from "./monthly-insights";

beforeEach(() => {
  chatMock.mockReset();
});

const VALID_INSIGHTS = [
  { text: "Explora generó intereses por primera vez: $2,556.77.", tone: "bad" },
  { text: "El pago de $15,035 ya se resolvió.", tone: "good" },
  { text: "Un MSI de Joy termina el próximo mes.", tone: "warning" },
];

describe("generateMonthlyInsights", () => {
  it("parsea un array JSON válido de 3 insights", async () => {
    chatMock.mockResolvedValue({
      text: JSON.stringify(VALID_INSIGHTS),
      provider: "anthropic",
      model: "claude-sonnet-5",
      finishReason: "stop",
      raw: {},
    });

    const insights = await generateMonthlyInsights({
      provider: "anthropic",
      apiKey: "fake-key",
      monthLabel: "2026-07",
      currentMonthDigest: [{ account: { issuer: "Banamex" } }],
    });

    expect(insights).toHaveLength(3);
    expect(insights[0].tone).toBe("bad");
  });

  it("extrae el JSON aunque venga envuelto en fences de markdown", async () => {
    chatMock.mockResolvedValue({
      text: "```json\n" + JSON.stringify(VALID_INSIGHTS) + "\n```",
      provider: "anthropic",
      model: "claude-sonnet-5",
      finishReason: "stop",
      raw: {},
    });

    const insights = await generateMonthlyInsights({
      provider: "anthropic",
      apiKey: "fake-key",
      monthLabel: "2026-07",
      currentMonthDigest: [],
    });

    expect(insights).toHaveLength(3);
  });

  it("ignora items con tone inválido o sin texto y se queda con los válidos", async () => {
    chatMock.mockResolvedValue({
      text: JSON.stringify([
        { text: "válido", tone: "good" },
        { text: "sin tono" },
        { tone: "bad" },
      ]),
      provider: "anthropic",
      model: "claude-sonnet-5",
      finishReason: "stop",
      raw: {},
    });

    const insights = await generateMonthlyInsights({
      provider: "anthropic",
      apiKey: "fake-key",
      monthLabel: "2026-07",
      currentMonthDigest: [],
    });

    expect(insights).toEqual([{ text: "válido", tone: "good" }]);
  });

  it("lanza un error si el modelo no devuelve ningún insight válido", async () => {
    chatMock.mockResolvedValue({
      text: "[]",
      provider: "anthropic",
      model: "claude-sonnet-5",
      finishReason: "stop",
      raw: {},
    });

    await expect(
      generateMonthlyInsights({
        provider: "anthropic",
        apiKey: "fake-key",
        monthLabel: "2026-07",
        currentMonthDigest: [],
      }),
    ).rejects.toThrow(/ningún insight/);
  });
});

function makeSupabaseMock(statementsByMonth: Record<string, unknown[]>) {
  const upsertMock = vi.fn().mockResolvedValue({ data: null, error: null });
  const calls: string[] = [];
  let callIndex = 0;
  const monthOrder = Object.keys(statementsByMonth);

  const from = vi.fn((table: string) => {
    if (table === "statements") {
      const month = monthOrder[callIndex] ?? monthOrder[monthOrder.length - 1];
      callIndex++;
      calls.push(month);
      const data = (statementsByMonth[month] ?? []).map((raw_extraction) => ({
        period_end: `${month}-15`,
        raw_extraction,
      }));
      const builder = {
        select: () => builder,
        eq: () => builder,
        not: () => builder,
        then: (resolve: (v: unknown) => unknown) => resolve({ data }),
      };
      return builder;
    }
    if (table === "monthly_summaries") {
      return { upsert: upsertMock };
    }
    throw new Error(`tabla inesperada en el mock: ${table}`);
  });

  return { from: from as unknown, upsertMock };
}

describe("regenerateMonthlyInsights", () => {
  it("junta el digest del mes actual y anterior, y guarda el resultado en monthly_summaries", async () => {
    const supabase = makeSupabaseMock({
      "2026-07": [{ account: { issuer: "Banamex" } }],
      "2026-06": [{ account: { issuer: "Banamex" }, warnings: ["algo"] }],
    });
    chatMock.mockResolvedValue({
      text: JSON.stringify(VALID_INSIGHTS),
      provider: "anthropic",
      model: "claude-sonnet-5",
      finishReason: "stop",
      raw: {},
    });

    const insights = await regenerateMonthlyInsights({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: supabase as any,
      userId: "user-1",
      provider: "anthropic",
      apiKey: "fake-key",
      month: "2026-07-01",
    });

    expect(insights).toHaveLength(3);
    expect(supabase.upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        month: "2026-07-01",
        insights: VALID_INSIGHTS,
      }),
      { onConflict: "user_id,month" },
    );

    const chatCallArgs = chatMock.mock.calls[0][0];
    expect(chatCallArgs.messages[0].content).toContain("Mes anterior");
    expect(chatCallArgs.messages[0].content).toContain("\"algo\"");
  });

  it("lanza un error si no hay statements parseados ese mes", async () => {
    const supabase = makeSupabaseMock({ "2026-07": [], "2026-06": [] });

    await expect(
      regenerateMonthlyInsights({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: supabase as any,
        userId: "user-1",
        provider: "anthropic",
        apiKey: "fake-key",
        month: "2026-07-01",
      }),
    ).rejects.toThrow(/No hay estados de cuenta/);
    expect(chatMock).not.toHaveBeenCalled();
  });
});
