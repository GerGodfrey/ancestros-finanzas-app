import { beforeEach, describe, expect, it, vi } from "vitest";

const { chatMock } = vi.hoisted(() => ({ chatMock: vi.fn() }));

vi.mock("@/lib/ai/gateway", async () => {
  const actual =
    await vi.importActual<typeof import("./gateway")>("./gateway");
  return { ...actual, chat: chatMock };
});

import { parseStatementPdf } from "./parse-statement";

const VALID_EXTRACTION = {
  account: { issuer: "Banamex", product_name: "Explora" },
  statement: {
    period_start: "2026-06-19",
    period_end: "2026-07-17",
    cut_date: "2026-07-17",
    due_date: "2026-08-07",
    previous_balance: 35077.63,
    new_charges: 48661.22,
    payment_no_interest: 51242.77,
    payment_minimum: 3290.0,
    interest_charged: 2204.11,
    iva_interest: 352.66,
  },
  transactions: [
    {
      tx_date: "2026-07-05",
      description: "DOMINOS PIZZA CONDESA",
      amount: 755.0,
      type: "regular",
    },
  ],
  msi_plans: [],
  warnings: [],
};

beforeEach(() => {
  chatMock.mockReset();
});

describe("parseStatementPdf", () => {
  it("acepta una respuesta JSON válida que cumple el schema", async () => {
    chatMock.mockResolvedValue({
      text: JSON.stringify(VALID_EXTRACTION),
      provider: "anthropic",
      model: "claude-sonnet-5",
      raw: {},
    });

    const result = await parseStatementPdf({
      provider: "anthropic",
      apiKey: "fake-key",
      pdfBuffer: Buffer.from("fake-pdf-bytes"),
    });

    expect(result.schemaValid).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(result.data.account.issuer).toBe("Banamex");
  });

  it("extrae el JSON aunque venga envuelto en fences de markdown", async () => {
    chatMock.mockResolvedValue({
      text: "```json\n" + JSON.stringify(VALID_EXTRACTION) + "\n```",
      provider: "anthropic",
      model: "claude-sonnet-5",
      raw: {},
    });

    const result = await parseStatementPdf({
      provider: "anthropic",
      apiKey: "fake-key",
      pdfBuffer: Buffer.from("fake-pdf-bytes"),
    });

    expect(result.schemaValid).toBe(true);
    expect(result.data.transactions).toHaveLength(1);
  });

  it("marca schemaValid=false y agrega un warning si falta un campo requerido", async () => {
    const invalid = {
      // sin "account"
      statement: VALID_EXTRACTION.statement,
      transactions: VALID_EXTRACTION.transactions,
    };
    chatMock.mockResolvedValue({
      text: JSON.stringify(invalid),
      provider: "anthropic",
      model: "claude-sonnet-5",
      raw: {},
    });

    const result = await parseStatementPdf({
      provider: "anthropic",
      apiKey: "fake-key",
      pdfBuffer: Buffer.from("fake-pdf-bytes"),
    });

    expect(result.schemaValid).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("conserva los warnings que el propio modelo reporta en el JSON", async () => {
    chatMock.mockResolvedValue({
      text: JSON.stringify({
        ...VALID_EXTRACTION,
        warnings: ["Disposición de efectivo detectada: genera interés"],
      }),
      provider: "anthropic",
      model: "claude-sonnet-5",
      raw: {},
    });

    const result = await parseStatementPdf({
      provider: "anthropic",
      apiKey: "fake-key",
      pdfBuffer: Buffer.from("fake-pdf-bytes"),
    });

    expect(result.warnings).toContain(
      "Disposición de efectivo detectada: genera interés",
    );
  });

  it("adjunta el PDF nativo (pdfBase64) para Anthropic y Gemini", async () => {
    chatMock.mockResolvedValue({
      text: JSON.stringify(VALID_EXTRACTION),
      provider: "gemini",
      model: "gemini-2.5-flash",
      raw: {},
    });

    await parseStatementPdf({
      provider: "gemini",
      apiKey: "fake-key",
      pdfBuffer: Buffer.from("fake-pdf-bytes"),
    });

    const callArgs = chatMock.mock.calls[0][0];
    expect(callArgs.pdfBase64).toBe(
      Buffer.from("fake-pdf-bytes").toString("base64"),
    );
  });

  it("lanza un error legible si el modelo no devuelve JSON válido", async () => {
    chatMock.mockResolvedValue({
      text: "Lo siento, no puedo procesar este PDF.",
      provider: "anthropic",
      model: "claude-sonnet-5",
      finishReason: "stop",
      raw: {},
    });

    await expect(
      parseStatementPdf({
        provider: "anthropic",
        apiKey: "fake-key",
        pdfBuffer: Buffer.from("fake-pdf-bytes"),
      }),
    ).rejects.toThrow(/JSON válido/);
  });

  it("lanza un error específico y accionable si la respuesta se corta por límite de tokens", async () => {
    chatMock.mockResolvedValue({
      text: '{ "account": { "issuer": "Banamex"',
      provider: "gemini",
      model: "gemini-3.6-flash",
      finishReason: "max_tokens",
      raw: {},
    });

    await expect(
      parseStatementPdf({
        provider: "gemini",
        apiKey: "fake-key",
        pdfBuffer: Buffer.from("fake-pdf-bytes"),
      }),
    ).rejects.toThrow(/límite de tokens de salida/);
  });

  it("usa el tope de tokens específico del proveedor al parsear", async () => {
    chatMock.mockResolvedValue({
      text: JSON.stringify(VALID_EXTRACTION),
      provider: "gemini",
      model: "gemini-3.6-flash",
      finishReason: "stop",
      raw: {},
    });

    await parseStatementPdf({
      provider: "gemini",
      apiKey: "fake-key",
      pdfBuffer: Buffer.from("fake-pdf-bytes"),
    });

    const callArgs = chatMock.mock.calls[0][0];
    expect(callArgs.maxTokens).toBe(32768);
  });
});
