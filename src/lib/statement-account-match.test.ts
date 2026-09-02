import { describe, expect, it } from "vitest";
import { checkStatementMatchesAccount } from "./statement-account-match";

describe("checkStatementMatchesAccount", () => {
  it("pasa cuando emisor y last4 coinciden exactamente", () => {
    const result = checkStatementMatchesAccount({
      extractedIssuer: "Banamex",
      extractedLast4: "8990",
      accountIssuer: "Banamex",
      accountLast4: "8990",
    });
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("pasa con alias conocidos del mismo emisor (Amex vs American Express)", () => {
    const result = checkStatementMatchesAccount({
      extractedIssuer: "American Express",
      extractedLast4: "3000",
      accountIssuer: "Amex",
      accountLast4: "3000",
    });
    expect(result.ok).toBe(true);
  });

  it("pasa cuando uno de los nombres contiene al otro (BBVA vs BBVA Bancomer)", () => {
    const result = checkStatementMatchesAccount({
      extractedIssuer: "BBVA Bancomer",
      extractedLast4: null,
      accountIssuer: "BBVA",
      accountLast4: null,
    });
    expect(result.ok).toBe(true);
  });

  it("rechaza cuando el emisor del PDF no corresponde a la tarjeta seleccionada", () => {
    const result = checkStatementMatchesAccount({
      extractedIssuer: "American Express",
      extractedLast4: "3000",
      accountIssuer: "Palacio de Hierro",
      accountLast4: "6280",
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/emisor/i);
  });

  it("rechaza cuando los últimos 4 dígitos no coinciden aunque el emisor sí", () => {
    const result = checkStatementMatchesAccount({
      extractedIssuer: "Banamex",
      extractedLast4: "1111",
      accountIssuer: "Banamex",
      accountLast4: "8990",
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/termina en/i);
  });

  it("no bloquea por last4 si la cuenta todavía no tiene uno guardado", () => {
    const result = checkStatementMatchesAccount({
      extractedIssuer: "Banamex",
      extractedLast4: "1234",
      accountIssuer: "Banamex",
      accountLast4: null,
    });
    expect(result.ok).toBe(true);
  });

  it("no bloquea por emisor si el PDF no trae uno extraído", () => {
    const result = checkStatementMatchesAccount({
      extractedIssuer: null,
      extractedLast4: null,
      accountIssuer: "Banamex",
      accountLast4: null,
    });
    expect(result.ok).toBe(true);
  });
});
