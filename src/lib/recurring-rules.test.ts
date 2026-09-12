import { describe, expect, it } from "vitest";
import {
  amountVariation,
  classifyRecurring,
  dayOfMonthSpread,
  isAllowed,
  isBlocked,
} from "./recurring-rules";

/** Una serie mensual: mismo día, mismo monto salvo el ruido que se le pase. */
function serie(
  months: string[],
  amount: number,
  day: number,
  jitter = { amount: 0, day: 0 },
) {
  return months.map((month, i) => ({
    month,
    amount: amount + (i % 2 === 0 ? jitter.amount : -jitter.amount),
    dayOfMonth: day + (i % 2 === 0 ? jitter.day : -jitter.day),
  }));
}

const MESES = ["2026-07", "2026-08", "2026-09"];

describe("lo que el usuario reportó como falso positivo", () => {
  it("«VA Gastos de Cobranza» no entra, aunque se repita cada mes", () => {
    const r = classifyRecurring({
      description: "VA Gastos de Cobranza",
      occurrences: serie(MESES, 150, 15),
    });
    expect(r.isRecurring).toBe(false);
    expect(r.reason).toMatch(/cargo del banco/i);
  });

  it("«Gastos de Cobranza» a secas tampoco", () => {
    expect(
      classifyRecurring({
        description: "Gastos de Cobranza",
        occurrences: serie(MESES, 150, 15),
      }).isRecurring,
    ).toBe(false);
  });

  it("«Oxxo General León» no entra ni con monto y día estables", () => {
    expect(
      classifyRecurring({
        description: "Oxxo General Leon",
        occurrences: serie(MESES, 120, 10),
      }).isRecurring,
    ).toBe(false);
  });

  it("«Soriana Tacubaya» no entra", () => {
    expect(
      classifyRecurring({
        description: "Soriana Tacubaya",
        occurrences: serie(MESES, 890, 3),
      }).isRecurring,
    ).toBe(false);
  });

  it("«Fast Food Restaurant» no entra", () => {
    expect(
      classifyRecurring({
        description: "Fast Food Restaurant",
        occurrences: serie(MESES, 250, 20),
      }).isRecurring,
    ).toBe(false);
  });

  it("Didi no entra: el monto cambia en cada viaje", () => {
    expect(
      classifyRecurring({
        description: "Didi Mexico",
        occurrences: [
          { month: "2026-07", amount: 85, dayOfMonth: 3 },
          { month: "2026-08", amount: 240, dayOfMonth: 19 },
          { month: "2026-09", amount: 132, dayOfMonth: 8 },
        ],
      }).isRecurring,
    ).toBe(false);
  });
});

describe("lo que el usuario reportó como falso negativo", () => {
  it("«Anthropic* Claude Sub» sí entra", () => {
    const r = classifyRecurring({
      description: "Anthropic* Claude Sub",
      occurrences: serie(MESES, 420.5, 4),
    });
    expect(r.isRecurring).toBe(true);
    expect(r.confidence).toBeGreaterThan(0.8);
  });
});

describe("las tres señales", () => {
  it("un comercio cualquiera necesita monto Y día estables", () => {
    // Estable en monto pero errático en fecha: es compra habitual.
    expect(
      classifyRecurring({
        description: "Tienda Del Barrio",
        occurrences: [
          { month: "2026-07", amount: 300, dayOfMonth: 2 },
          { month: "2026-08", amount: 300, dayOfMonth: 17 },
          { month: "2026-09", amount: 300, dayOfMonth: 28 },
        ],
      }).isRecurring,
    ).toBe(false);
  });

  it("un servicio conocido pasa con una sola de las dos señales", () => {
    // Netflix subió de precio a mitad de año: el monto varía, la fecha no.
    expect(
      classifyRecurring({
        description: "Netflix.com",
        occurrences: [
          { month: "2026-07", amount: 219, dayOfMonth: 4 },
          { month: "2026-08", amount: 299, dayOfMonth: 4 },
          { month: "2026-09", amount: 299, dayOfMonth: 5 },
        ],
      }).isRecurring,
    ).toBe(true);
  });

  it("un solo mes nunca basta, ni para un servicio de la allowlist", () => {
    expect(
      classifyRecurring({
        description: "Netflix.com",
        occurrences: [{ month: "2026-09", amount: 219, dayOfMonth: 4 }],
      }).isRecurring,
    ).toBe(false);
  });

  it("dos cargos del mismo mes son dos compras, no una suscripción", () => {
    expect(
      classifyRecurring({
        description: "Libreria Gandhi",
        occurrences: [
          { month: "2026-09", amount: 500, dayOfMonth: 3 },
          { month: "2026-09", amount: 500, dayOfMonth: 4 },
        ],
      }).isRecurring,
    ).toBe(false);
  });
});

describe("dayOfMonthSpread", () => {
  it("trata el mes como un círculo: el 1 y el 30 están cerca", () => {
    expect(dayOfMonthSpread([30, 1])).toBeLessThanOrEqual(2);
  });

  it("mide la dispersión real cuando las fechas sí están lejos", () => {
    expect(dayOfMonthSpread([2, 17])).toBeGreaterThan(3);
  });

  it("una sola fecha no tiene dispersión", () => {
    expect(dayOfMonthSpread([12])).toBe(0);
  });
});

describe("amountVariation", () => {
  it("montos idénticos no varían", () => {
    expect(amountVariation([219, 219, 219])).toBe(0);
  });

  it("montos muy distintos superan el umbral", () => {
    expect(amountVariation([85, 240, 132])).toBeGreaterThan(0.15);
  });
});

describe("las listas", () => {
  it("la blocklist atrapa las variantes del cargo del banco", () => {
    expect(isBlocked("VA Gastos de Cobranza")).toBe(true);
    expect(isBlocked("COMISION POR MANEJO DE CUENTA")).toBe(true);
    expect(isBlocked("Anualidad Tarjeta")).toBe(true);
  });

  it("la blocklist no atrapa un servicio legítimo", () => {
    expect(isBlocked("Anthropic Claude")).toBe(false);
    expect(isBlocked("Spotify")).toBe(false);
  });

  it("la allowlist reconoce servicios con acentos y ruido", () => {
    expect(isAllowed("NETFLIX.COM 866-579-7172")).toBe(true);
    expect(isAllowed("Tienda Del Barrio")).toBe(false);
  });
});
