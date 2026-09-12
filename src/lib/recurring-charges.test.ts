import { describe, expect, it, vi } from "vitest";
import { detectRecurringCharges } from "./recurring-charges";

function chainableList(rows: unknown[]) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    not: () => builder,
    order: () => builder,
    limit: () => builder,
    then: (resolve: (v: unknown) => unknown) => resolve({ data: rows }),
  };
  return builder;
}

interface ExistingCharge {
  id: string;
  merchant_key: string | null;
  status: string;
}

function makeSupabaseMock(opts: {
  statements: { id: string; period_end: string }[];
  transactions: {
    statement_id: string;
    description: string;
    amount: number;
    tx_date: string;
    type: string;
  }[];
  existing?: ExistingCharge[];
}) {
  const insertMock = vi.fn().mockResolvedValue({ data: null, error: null });
  const updateMock = vi.fn();
  const updateTargets: string[] = [];

  const recurringChargesTable = {
    select: () => {
      const builder = {
        eq: () => builder,
        then: (resolve: (v: unknown) => unknown) =>
          resolve({ data: opts.existing ?? [] }),
      };
      return builder;
    },
    insert: insertMock,
    update: (payload: unknown) => {
      updateMock(payload);
      const chain = {
        eq: (_col: string, val: string) => {
          updateTargets.push(val);
          return { ...chain, then: (r: (v: unknown) => unknown) => r({ data: null }) };
        },
        is: () => Promise.resolve({ data: null }),
        then: (r: (v: unknown) => unknown) => r({ data: null }),
      };
      return chain;
    },
  };

  const from = vi.fn((table: string) => {
    if (table === "statements") return chainableList(opts.statements);
    if (table === "transactions") return chainableList(opts.transactions);
    if (table === "recurring_charges") return recurringChargesTable;
    throw new Error(`tabla inesperada en el mock: ${table}`);
  });

  return { from, insertMock, updateMock, updateTargets };
}

const run = (supabase: { from: unknown }, statementId = "st-3") =>
  detectRecurringCharges({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: supabase as any,
    userId: "user-1",
    accountId: "acc-1",
    statementId,
  });

const TRES_MESES = [
  { id: "st-3", period_end: "2026-09-17" },
  { id: "st-2", period_end: "2026-08-17" },
  { id: "st-1", period_end: "2026-07-17" },
];

/** Mismo comercio, mismo monto, mismo día — una domiciliación de manual. */
function serieMensual(description: string, amount: number, day: string) {
  return TRES_MESES.map((s, i) => ({
    statement_id: s.id,
    description,
    amount,
    tx_date: `2026-0${9 - i}-${day}`,
    type: "regular",
  }));
}

describe("detectRecurringCharges", () => {
  it("inserta una domiciliación nueva como sugerencia, no como confirmada", async () => {
    const supabase = makeSupabaseMock({
      statements: TRES_MESES,
      transactions: serieMensual("AT&T MEXICO", 1872.93, "05"),
    });

    await run(supabase);

    expect(supabase.insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        account_id: "acc-1",
        merchant_key: "att mexico",
        typical_amount: 1872.93,
        day_of_month: 5,
        status: "suggested",
      }),
    );
  });

  // El falso negativo que reportó el usuario: la IA escribe el nombre distinto
  // cada mes y el detector viejo veía tres comercios diferentes.
  it("junta las variantes de la IA bajo una sola clave de comercio", async () => {
    const supabase = makeSupabaseMock({
      statements: TRES_MESES,
      transactions: [
        { statement_id: "st-3", description: "Anthropic Claude Subscription", amount: 420.5, tx_date: "2026-09-04", type: "regular" },
        { statement_id: "st-2", description: "Anthropic* Claude Sub", amount: 420.5, tx_date: "2026-08-04", type: "regular" },
        { statement_id: "st-1", description: "ANTHROPIC*CLAUDE SUB 4923", amount: 420.5, tx_date: "2026-07-05", type: "regular" },
      ],
    });

    await run(supabase);

    expect(supabase.insertMock).toHaveBeenCalledTimes(1);
    expect(supabase.insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ merchant_key: "anthropic claude" }),
    );
  });

  it("no mete los cargos del banco, que antes entraban por el tipo 'fee'", async () => {
    const supabase = makeSupabaseMock({
      statements: TRES_MESES,
      transactions: serieMensual("VA Gastos de Cobranza", 150, "15"),
    });

    await run(supabase);

    expect(supabase.insertMock).not.toHaveBeenCalled();
  });

  it("no mete una tienda de conveniencia aunque el patrón sea perfecto", async () => {
    const supabase = makeSupabaseMock({
      statements: TRES_MESES,
      transactions: serieMensual("Oxxo General Leon", 120, "10"),
    });

    await run(supabase);

    expect(supabase.insertMock).not.toHaveBeenCalled();
  });

  it("no mete un cargo que solo aparece en un mes", async () => {
    const supabase = makeSupabaseMock({
      statements: TRES_MESES,
      transactions: [
        { statement_id: "st-3", description: "MARIA XOCONOSTLE", amount: 4450.5, tx_date: "2026-09-05", type: "regular" },
      ],
    });

    await run(supabase);

    expect(supabase.insertMock).not.toHaveBeenCalled();
  });

  // El aprendizaje que se pidió: lo que el usuario respondió gana al score.
  it("respeta un 'dismissed': no lo vuelve a sugerir nunca", async () => {
    const supabase = makeSupabaseMock({
      statements: TRES_MESES,
      transactions: serieMensual("AT&T MEXICO", 1872.93, "05"),
      existing: [{ id: "rc-1", merchant_key: "att mexico", status: "dismissed" }],
    });

    await run(supabase);

    expect(supabase.insertMock).not.toHaveBeenCalled();
    expect(supabase.updateMock).not.toHaveBeenCalled();
  });

  it("actualiza una sugerencia existente en vez de duplicarla", async () => {
    const supabase = makeSupabaseMock({
      statements: TRES_MESES,
      transactions: serieMensual("AT&T MEXICO", 1872.93, "05"),
      existing: [{ id: "rc-1", merchant_key: "att mexico", status: "suggested" }],
    });

    await run(supabase);

    expect(supabase.insertMock).not.toHaveBeenCalled();
    expect(supabase.updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ merchant_key: "att mexico", active: true }),
    );
  });

  // Antes se ponía active:false y desaparecía sin decir nada.
  it("una confirmada que deja de aparecer se marca ausente, no se apaga", async () => {
    const supabase = makeSupabaseMock({
      statements: TRES_MESES,
      transactions: [
        { statement_id: "st-2", description: "NETFLIX.COM", amount: 219, tx_date: "2026-08-04", type: "regular" },
        { statement_id: "st-1", description: "NETFLIX.COM", amount: 219, tx_date: "2026-07-04", type: "regular" },
      ],
      existing: [{ id: "rc-1", merchant_key: "netflix", status: "confirmed" }],
    });

    await run(supabase, "st-3");

    expect(supabase.updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ missing_since: "2026-09-01" }),
    );
    expect(supabase.updateMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ active: false }),
    );
  });

  it("una confirmada sobrevive aunque el score deje de dar", async () => {
    const supabase = makeSupabaseMock({
      statements: TRES_MESES,
      transactions: [
        { statement_id: "st-3", description: "Spotify", amount: 115, tx_date: "2026-09-02", type: "regular" },
        { statement_id: "st-2", description: "Spotify", amount: 700, tx_date: "2026-08-19", type: "regular" },
        { statement_id: "st-1", description: "Spotify", amount: 240, tx_date: "2026-07-27", type: "regular" },
      ],
      existing: [{ id: "rc-1", merchant_key: "spotify", status: "confirmed" }],
    });

    await run(supabase);

    expect(supabase.updateMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: "dismissed" }),
    );
  });
});
