import { describe, expect, it } from "vitest";
import { resolveDashboardMonths } from "./resolve-months";

describe("resolveDashboardMonths", () => {
  it("sin ningún dato no hay mes que mostrar", () => {
    expect(
      resolveDashboardMonths({ statementMonths: [], manualMonths: [] }),
    ).toEqual({ month: null, availableMonths: [] });
  });

  it("con solo statements, se para en el más reciente", () => {
    expect(
      resolveDashboardMonths({
        statementMonths: ["2026-07", "2026-08"],
        manualMonths: [],
      }),
    ).toEqual({ month: "2026-08-01", availableMonths: ["2026-07", "2026-08"] });
  });

  // El bug reportado: ingreso capturado en septiembre, último PDF de agosto.
  // Antes el dashboard se quedaba en agosto y septiembre no existía para el
  // selector, así que el dinero era inalcanzable.
  it("un mes con dinero a mano y sin PDF existe y gana como más reciente", () => {
    expect(
      resolveDashboardMonths({
        statementMonths: ["2026-07", "2026-08"],
        manualMonths: ["2026-09"],
      }),
    ).toEqual({
      month: "2026-09-01",
      availableMonths: ["2026-07", "2026-08", "2026-09"],
    });
  });

  it("sin un solo PDF, el mes capturado a mano sigue valiendo", () => {
    expect(
      resolveDashboardMonths({
        statementMonths: [],
        manualMonths: ["2026-09"],
      }),
    ).toEqual({ month: "2026-09-01", availableMonths: ["2026-09"] });
  });

  it("no duplica un mes que tiene PDF y captura manual", () => {
    expect(
      resolveDashboardMonths({
        statementMonths: ["2026-09"],
        manualMonths: ["2026-09"],
      }).availableMonths,
    ).toEqual(["2026-09"]);
  });

  it("el mes pedido por la URL manda sobre el más reciente", () => {
    expect(
      resolveDashboardMonths({
        statementMonths: ["2026-07", "2026-08"],
        manualMonths: ["2026-09"],
        targetMonth: "2026-07-01",
      }).month,
    ).toBe("2026-07-01");
  });

  it("ordena ascendente aunque lleguen desordenados, para que MonthNav navegue bien", () => {
    expect(
      resolveDashboardMonths({
        statementMonths: ["2026-08", "2026-06"],
        manualMonths: ["2026-07"],
      }).availableMonths,
    ).toEqual(["2026-06", "2026-07", "2026-08"]);
  });
});
