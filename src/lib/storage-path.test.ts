import { describe, expect, it } from "vitest";
import { isOwnedStatementPath } from "./storage-path";

const USER = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";
const ACCOUNT = "33333333-3333-3333-3333-333333333333";

describe("isOwnedStatementPath", () => {
  it("acepta la ruta que genera el uploader", () => {
    expect(
      isOwnedStatementPath(`${USER}/${ACCOUNT}/1700000000000-amex.pdf`, USER),
    ).toBe(true);
  });

  it("acepta nombres de archivo con caracteres raros", () => {
    expect(
      isOwnedStatementPath(
        `${USER}/${ACCOUNT}/1700000000000-Estado de cuenta (enero).pdf`,
        USER,
      ),
    ).toBe(true);
  });

  it("rechaza la carpeta de otro usuario", () => {
    expect(
      isOwnedStatementPath(`${OTHER}/${ACCOUNT}/1700000000000-amex.pdf`, USER),
    ).toBe(false);
  });

  it("rechaza un prefijo que solo empieza igual", () => {
    expect(isOwnedStatementPath(`${USER}-malicioso/x.pdf`, USER)).toBe(false);
  });

  it("rechaza salir de la carpeta con ..", () => {
    expect(
      isOwnedStatementPath(`${USER}/../${OTHER}/${ACCOUNT}/x.pdf`, USER),
    ).toBe(false);
  });

  it("rechaza segmentos . y vacíos", () => {
    expect(isOwnedStatementPath(`${USER}/./x.pdf`, USER)).toBe(false);
    expect(isOwnedStatementPath(`${USER}//x.pdf`, USER)).toBe(false);
  });

  it("rechaza traversal escapado en URL", () => {
    expect(isOwnedStatementPath(`${USER}/%2e%2e/${OTHER}/x.pdf`, USER)).toBe(
      false,
    );
  });

  it("rechaza rutas absolutas y separadores de Windows", () => {
    expect(isOwnedStatementPath(`/${USER}/${ACCOUNT}/x.pdf`, USER)).toBe(false);
    expect(isOwnedStatementPath(`${USER}\\${ACCOUNT}\\x.pdf`, USER)).toBe(false);
  });

  it("rechaza la carpeta del usuario sin archivo", () => {
    expect(isOwnedStatementPath(USER, USER)).toBe(false);
    expect(isOwnedStatementPath(`${USER}/`, USER)).toBe(false);
  });

  it("rechaza cadenas vacías", () => {
    expect(isOwnedStatementPath("", USER)).toBe(false);
    expect(isOwnedStatementPath(`${USER}/x.pdf`, "")).toBe(false);
  });
});
