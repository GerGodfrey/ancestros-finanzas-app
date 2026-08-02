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

function makeSupabaseMock(opts: {
  statements: { id: string; period_end: string }[];
  transactions: {
    statement_id: string;
    description: string;
    amount: number;
    tx_date: string;
    type: string;
  }[];
  existingByDescription?: Record<string, { id: string }>;
  activeCharges?: { id: string; description: string }[];
}) {
  const insertMock = vi.fn().mockResolvedValue({ data: null, error: null });
  const updateMock = vi.fn();
  const updateEqMock = vi.fn().mockResolvedValue({ data: null, error: null });

  const recurringChargesTable = {
    select: () => {
      const filters: Record<string, unknown> = {};
      const builder = {
        eq: (col: string, val: unknown) => {
          filters[col] = val;
          return builder;
        },
        maybeSingle: () => {
          const existing = (opts.existingByDescription ?? {})[
            filters.description as string
          ];
          return Promise.resolve({ data: existing ?? null });
        },
        then: (resolve: (v: unknown) => unknown) => {
          if (filters.active === true) {
            return resolve({ data: opts.activeCharges ?? [] });
          }
          return resolve({ data: [] });
        },
      };
      return builder;
    },
    insert: insertMock,
    update: (payload: unknown) => {
      updateMock(payload);
      return { eq: (col: string, val: unknown) => updateEqMock(col, val) };
    },
  };

  const from = vi.fn((table: string) => {
    if (table === "statements") return chainableList(opts.statements);
    if (table === "transactions") return chainableList(opts.transactions);
    if (table === "recurring_charges") return recurringChargesTable;
    throw new Error(`tabla inesperada en el mock: ${table}`);
  });

  return { from, insertMock, updateMock, updateEqMock };
}

describe("detectRecurringCharges", () => {
  it("inserta una domiciliación nueva cuando el cargo aparece en 2+ statements", async () => {
    const supabase = makeSupabaseMock({
      statements: [
        { id: "st-2", period_end: "2026-07-17" },
        { id: "st-1", period_end: "2026-06-17" },
      ],
      transactions: [
        { statement_id: "st-2", description: "AT&T MEXICO", amount: 1872.93, tx_date: "2026-07-05", type: "regular" },
        { statement_id: "st-1", description: "AT&T MEXICO", amount: 1872.93, tx_date: "2026-06-05", type: "regular" },
      ],
      existingByDescription: {},
      activeCharges: [],
    });

    await detectRecurringCharges({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: supabase as any,
      userId: "user-1",
      accountId: "acc-1",
      statementId: "st-2",
    });

    expect(supabase.insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        account_id: "acc-1",
        description: "AT&T MEXICO",
        typical_amount: 1872.93,
        active: true,
      }),
    );
  });

  it("no marca como domiciliación un cargo que solo aparece una vez", async () => {
    const supabase = makeSupabaseMock({
      statements: [
        { id: "st-2", period_end: "2026-07-17" },
        { id: "st-1", period_end: "2026-06-17" },
      ],
      transactions: [
        { statement_id: "st-2", description: "MARIA XOCONOSTLE", amount: 4450.5, tx_date: "2026-07-05", type: "regular" },
        { statement_id: "st-1", description: "AT&T MEXICO", amount: 1872.93, tx_date: "2026-06-05", type: "regular" },
      ],
    });

    await detectRecurringCharges({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: supabase as any,
      userId: "user-1",
      accountId: "acc-1",
      statementId: "st-2",
    });

    expect(supabase.insertMock).not.toHaveBeenCalled();
  });

  it("actualiza una domiciliación existente en vez de duplicarla", async () => {
    const supabase = makeSupabaseMock({
      statements: [
        { id: "st-2", period_end: "2026-07-17" },
        { id: "st-1", period_end: "2026-06-17" },
      ],
      transactions: [
        { statement_id: "st-2", description: "GOOGLE ONE", amount: 60, tx_date: "2026-07-03", type: "regular" },
        { statement_id: "st-1", description: "GOOGLE ONE", amount: 59, tx_date: "2026-06-03", type: "regular" },
      ],
      existingByDescription: { "GOOGLE ONE": { id: "rc-existing" } },
      activeCharges: [{ id: "rc-existing", description: "GOOGLE ONE" }],
    });

    await detectRecurringCharges({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: supabase as any,
      userId: "user-1",
      accountId: "acc-1",
      statementId: "st-2",
    });

    expect(supabase.insertMock).not.toHaveBeenCalled();
    expect(supabase.updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ active: true }),
    );
  });

  it("desactiva una domiciliación que no aparece en el statement recién parseado", async () => {
    const supabase = makeSupabaseMock({
      statements: [
        { id: "st-2", period_end: "2026-07-17" },
        { id: "st-1", period_end: "2026-06-17" },
      ],
      transactions: [
        // TotalPass ya no aparece en st-2 (se canceló)
        { statement_id: "st-1", description: "TOTALPASS", amount: 479, tx_date: "2026-06-10", type: "regular" },
      ],
      existingByDescription: {},
      activeCharges: [{ id: "rc-totalpass", description: "TOTALPASS" }],
    });

    await detectRecurringCharges({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: supabase as any,
      userId: "user-1",
      accountId: "acc-1",
      statementId: "st-2",
    });

    expect(supabase.updateMock).toHaveBeenCalledWith({ active: false });
    expect(supabase.updateEqMock).toHaveBeenCalledWith("id", "rc-totalpass");
  });
});
