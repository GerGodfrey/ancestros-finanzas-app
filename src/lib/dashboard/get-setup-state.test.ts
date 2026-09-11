import { describe, expect, it } from "vitest";
import { resolveSetupState } from "./get-setup-state";

describe("resolveSetupState", () => {
  // Los ocho combos: `complete` solo es verdadero con los tres a la vez.
  const cases: Array<[boolean, boolean, boolean, boolean]> = [
    [false, false, false, false],
    [true, false, false, false],
    [false, true, false, false],
    [false, false, true, false],
    [true, true, false, false],
    [true, false, true, false],
    [false, true, true, false],
    [true, true, true, true],
  ];

  it.each(cases)(
    "provider=%s account=%s statement=%s → complete=%s",
    (hasProvider, hasAccount, hasStatement, complete) => {
      const state = resolveSetupState({
        hasProvider,
        hasAccount,
        hasStatement,
        hasIncome: false,
      });
      expect(state.complete).toBe(complete);
      expect(state).toMatchObject({ hasProvider, hasAccount, hasStatement });
    },
  );
});

describe("resolveSetupState · ingresos", () => {
  // El cuarto paso es recomendado, no requisito: sin ingresos la app sigue
  // sirviendo para ver tarjetas. Quien bloquea por eso es el aviso de $0 del
  // dashboard, no el checklist.
  it("no afecta a `complete` en ningún sentido", () => {
    const base = { hasProvider: true, hasAccount: true, hasStatement: true };
    expect(resolveSetupState({ ...base, hasIncome: false }).complete).toBe(true);
    expect(resolveSetupState({ ...base, hasIncome: true }).complete).toBe(true);
  });

  it("se refleja tal cual en el estado", () => {
    const s = resolveSetupState({
      hasProvider: false,
      hasAccount: false,
      hasStatement: false,
      hasIncome: true,
    });
    expect(s.hasIncome).toBe(true);
    expect(s.complete).toBe(false);
  });
});
