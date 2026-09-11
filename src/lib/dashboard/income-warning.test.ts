import { describe, expect, it } from "vitest";
import { shouldWarnAboutMissingIncome } from "./income-warning";

describe("shouldWarnAboutMissingIncome", () => {
  it("avisa cuando hay gastos del mes y ningún ingreso", () => {
    expect(
      shouldWarnAboutMissingIncome({
        hasData: true,
        ingresoTotal: 0,
        egresoTotal: 38412.6,
      }),
    ).toBe(true);
  });

  it("no avisa si ya hay ingresos capturados", () => {
    expect(
      shouldWarnAboutMissingIncome({
        hasData: true,
        ingresoTotal: 62000,
        egresoTotal: 38412.6,
      }),
    ).toBe(false);
  });

  it("no avisa en un mes sin datos: no hay nada que corregir todavía", () => {
    expect(
      shouldWarnAboutMissingIncome({
        hasData: false,
        ingresoTotal: 0,
        egresoTotal: 0,
      }),
    ).toBe(false);
  });

  it("no avisa si hay datos pero tampoco gastos que comparar", () => {
    expect(
      shouldWarnAboutMissingIncome({
        hasData: true,
        ingresoTotal: 0,
        egresoTotal: 0,
      }),
    ).toBe(false);
  });
});
