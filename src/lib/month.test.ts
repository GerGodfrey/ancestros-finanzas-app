import { afterEach, describe, expect, it, vi } from "vitest";
import {
  currentMonthFirstDay,
  currentMonthKey,
  monthLongLabel,
  monthOptionsFromCoverage,
} from "./month";

afterEach(() => vi.useRealTimers());

describe("monthOptionsFromCoverage", () => {
  it("va del mes en curso hacia atrás, hasta el corte más antiguo subido", () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-09-11T12:00:00Z"));
    expect(
      monthOptionsFromCoverage(["2026-06", "2026-07", "2026-08", "2026-09"]),
    ).toEqual(["2026-09-01", "2026-08-01", "2026-07-01", "2026-06-01"]);
  });

  // Sin tarjetas dadas de alta la cobertura viene vacía, y aun así hay que
  // poder capturar un ingreso del mes en curso.
  it("sin cobertura deja al menos el mes en curso", () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-09-11T12:00:00Z"));
    expect(monthOptionsFromCoverage([])).toEqual(["2026-09-01"]);
  });

  it("no duplica el mes en curso cuando la cobertura ya lo trae", () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-09-11T12:00:00Z"));
    expect(monthOptionsFromCoverage(["2026-09"])).toEqual(["2026-09-01"]);
  });

  it("añade el mes en curso si la cobertura se quedó atrás", () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-09-11T12:00:00Z"));
    expect(monthOptionsFromCoverage(["2026-07"])).toEqual([
      "2026-09-01",
      "2026-07-01",
    ]);
  });
});

describe("monthLongLabel", () => {
  it("acepta las dos formas que usa la app", () => {
    expect(monthLongLabel("2026-09")).toBe("septiembre 2026");
    expect(monthLongLabel("2026-09-01")).toBe("septiembre 2026");
  });
});

describe("currentMonthKey", () => {
  it("es el prefijo del primer día", () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-09-11T12:00:00Z"));
    expect(currentMonthFirstDay()).toBe(`${currentMonthKey()}-01`);
  });
});
