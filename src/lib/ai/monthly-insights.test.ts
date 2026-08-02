import { beforeEach, describe, expect, it, vi } from "vitest";

const { chatMock } = vi.hoisted(() => ({ chatMock: vi.fn() }));

vi.mock("@/lib/ai/gateway", async () => {
  const actual = await vi.importActual<typeof import("./gateway")>("./gateway");
  return { ...actual, chat: chatMock };
});

import { generateMonthlySummary, regenerateMonthlySummary } from "./monthly-insights";

beforeEach(() => {
  chatMock.mockReset();
});

const VALID_INSIGHTS = [
  { text: "Explora generó intereses por primera vez: $2,556.77.", tone: "bad" },
  { text: "El pago de $15,035 ya se resolvió.", tone: "good" },
  { text: "Un MSI de Joy termina el próximo mes.", tone: "warning" },
];

const VALID_RECOMMENDATIONS = [
  { text: "Llevas 4 meses pagando Explora antes de la fecha límite.", type: "strength" },
  { text: "Joy ha generado intereses 3 de los últimos 4 meses — revisa tu fecha de pago.", type: "action" },
];

const VALID_SUMMARY = {
  insights: VALID_INSIGHTS,
  recommendations: VALID_RECOMMENDATIONS,
};

describe("generateMonthlySummary", () => {
  it("parsea insights (3) y recommendations (2-4) de un objeto JSON válido", async () => {
    chatMock.mockResolvedValue({
      text: JSON.stringify(VALID_SUMMARY),
      provider: "anthropic",
      model: "claude-sonnet-5",
      finishReason: "stop",
      raw: {},
    });

    const summary = await generateMonthlySummary({
      provider: "anthropic",
      apiKey: "fake-key",
      monthLabel: "2026-07",
      currentMonthDigest: [{ account: { issuer: "Banamex" } }],
    });

    expect(summary.insights).toHaveLength(3);
    expect(summary.insights[0].tone).toBe("bad");
    expect(summary.recommendations).toHaveLength(2);
    expect(summary.recommendations[1].type).toBe("action");
  });

  it("extrae el JSON aunque venga envuelto en fences de markdown", async () => {
    chatMock.mockResolvedValue({
      text: "```json\n" + JSON.stringify(VALID_SUMMARY) + "\n```",
      provider: "anthropic",
      model: "claude-sonnet-5",
      finishReason: "stop",
      raw: {},
    });

    const summary = await generateMonthlySummary({
      provider: "anthropic",
      apiKey: "fake-key",
      monthLabel: "2026-07",
      currentMonthDigest: [],
    });

    expect(summary.insights).toHaveLength(3);
    expect(summary.recommendations).toHaveLength(2);
  });

  it("ignora insights con tone inválido o sin texto y se queda con los válidos", async () => {
    chatMock.mockResolvedValue({
      text: JSON.stringify({
        insights: [
          { text: "válido", tone: "good" },
          { text: "sin tono" },
          { tone: "bad" },
        ],
        recommendations: [],
      }),
      provider: "anthropic",
      model: "claude-sonnet-5",
      finishReason: "stop",
      raw: {},
    });

    const summary = await generateMonthlySummary({
      provider: "anthropic",
      apiKey: "fake-key",
      monthLabel: "2026-07",
      currentMonthDigest: [],
    });

    expect(summary.insights).toEqual([{ text: "válido", tone: "good" }]);
  });

  it("ignora recommendations con type inválido o sin texto", async () => {
    chatMock.mockResolvedValue({
      text: JSON.stringify({
        insights: VALID_INSIGHTS,
        recommendations: [
          { text: "válida", type: "strength" },
          { text: "sin tipo" },
          { type: "action" },
        ],
      }),
      provider: "anthropic",
      model: "claude-sonnet-5",
      finishReason: "stop",
      raw: {},
    });

    const summary = await generateMonthlySummary({
      provider: "anthropic",
      apiKey: "fake-key",
      monthLabel: "2026-07",
      currentMonthDigest: [],
    });

    expect(summary.recommendations).toEqual([{ text: "válida", type: "strength" }]);
  });

  it("no lanza si recommendations viene vacío — solo insights es obligatorio", async () => {
    chatMock.mockResolvedValue({
      text: JSON.stringify({ insights: VALID_INSIGHTS, recommendations: [] }),
      provider: "anthropic",
      model: "claude-sonnet-5",
      finishReason: "stop",
      raw: {},
    });

    const summary = await generateMonthlySummary({
      provider: "anthropic",
      apiKey: "fake-key",
      monthLabel: "2026-07",
      currentMonthDigest: [],
    });

    expect(summary.recommendations).toEqual([]);
  });

  it("lanza un error si el modelo no devuelve ningún insight válido", async () => {
    chatMock.mockResolvedValue({
      text: JSON.stringify({ insights: [], recommendations: [] }),
      provider: "anthropic",
      model: "claude-sonnet-5",
      finishReason: "stop",
      raw: {},
    });

    await expect(
      generateMonthlySummary({
        provider: "anthropic",
        apiKey: "fake-key",
        monthLabel: "2026-07",
        currentMonthDigest: [],
      }),
    ).rejects.toThrow(/ningún insight/);
  });
});

function makeSupabaseMock(
  statementsByMonth: Record<string, unknown[]>,
  historyRows: { month: string; insights: unknown }[] = [],
) {
  const upsertMock = vi.fn().mockResolvedValue({ data: null, error: null });
  let callIndex = 0;
  const monthOrder = Object.keys(statementsByMonth);

  const from = vi.fn((table: string) => {
    if (table === "statements") {
      const month = monthOrder[callIndex] ?? monthOrder[monthOrder.length - 1];
      callIndex++;
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
      const builder = {
        select: () => builder,
        eq: () => builder,
        not: () => builder,
        order: () => builder,
        limit: () => builder,
        upsert: upsertMock,
        then: (resolve: (v: unknown) => unknown) => resolve({ data: historyRows }),
      };
      return builder;
    }
    throw new Error(`tabla inesperada en el mock: ${table}`);
  });

  return { from: from as unknown, upsertMock };
}

describe("regenerateMonthlySummary", () => {
  it("junta el digest del mes actual, anterior e historial, y guarda insights + recommendations", async () => {
    const supabase = makeSupabaseMock(
      {
        "2026-07": [{ account: { issuer: "Banamex" } }],
        "2026-06": [{ account: { issuer: "Banamex" }, warnings: ["algo"] }],
      },
      [{ month: "2026-05-01", insights: [{ text: "viejo", tone: "warning" }] }],
    );
    chatMock.mockResolvedValue({
      text: JSON.stringify(VALID_SUMMARY),
      provider: "anthropic",
      model: "claude-sonnet-5",
      finishReason: "stop",
      raw: {},
    });

    const summary = await regenerateMonthlySummary({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: supabase as any,
      userId: "user-1",
      provider: "anthropic",
      apiKey: "fake-key",
      month: "2026-07-01",
    });

    expect(summary.insights).toHaveLength(3);
    expect(summary.recommendations).toHaveLength(2);
    expect(supabase.upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        month: "2026-07-01",
        insights: VALID_INSIGHTS,
        recommendations: VALID_RECOMMENDATIONS,
      }),
      { onConflict: "user_id,month" },
    );

    const chatCallArgs = chatMock.mock.calls[0][0];
    expect(chatCallArgs.messages[0].content).toContain("Mes anterior");
    expect(chatCallArgs.messages[0].content).toContain("\"algo\"");
    expect(chatCallArgs.messages[0].content).toContain("Historial resumido");
    expect(chatCallArgs.messages[0].content).toContain("viejo");
  });

  it("lanza un error si no hay statements parseados ese mes", async () => {
    const supabase = makeSupabaseMock({ "2026-07": [], "2026-06": [] });

    await expect(
      regenerateMonthlySummary({
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
