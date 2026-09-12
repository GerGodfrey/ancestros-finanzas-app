import { describe, expect, it } from "vitest";
import { canonicalMerchantKey, normalizeDescription } from "./merchant-key";

describe("canonicalMerchantKey", () => {
  // El caso que reportó el usuario: la suscripción existía todos los meses y
  // la detección nunca la veía porque la IA escribía el nombre distinto.
  it("junta las variantes que produce la IA para el mismo comercio", () => {
    const key = canonicalMerchantKey("Anthropic* Claude Sub");
    expect(canonicalMerchantKey("Anthropic Claude Sub")).toBe(key);
    expect(canonicalMerchantKey("ANTHROPIC CLAUDE SUBSCRIPTION")).toBe(key);
    expect(canonicalMerchantKey("Anthropic*Claude Sub 4923")).toBe(key);
    expect(key).toBe("anthropic claude");
  });

  it("ignora folios y códigos de sucursal", () => {
    expect(canonicalMerchantKey("NETFLIX.COM 866-579-7172")).toBe(
      canonicalMerchantKey("Netflix.com"),
    );
    expect(canonicalMerchantKey("Netflix.com")).toBe("netflix");
  });

  it("quita acentos, para que el mismo comercio no se parta en dos", () => {
    expect(canonicalMerchantKey("Telefónica México")).toBe(
      canonicalMerchantKey("Telefonica Mexico"),
    );
  });

  it("no colapsa productos distintos del mismo proveedor", () => {
    expect(canonicalMerchantKey("Google One")).not.toBe(
      canonicalMerchantKey("Google Cloud"),
    );
  });

  it("distingue sucursales de la misma tienda, que no son domiciliaciones", () => {
    expect(canonicalMerchantKey("Oxxo General Leon")).toBe("oxxo general");
    expect(canonicalMerchantKey("Soriana Tacubaya")).toBe("soriana tacubaya");
  });

  it("nunca devuelve vacío, ni con una descripción de puros dígitos", () => {
    expect(canonicalMerchantKey("4923 1111")).toBe("4923 1111");
    expect(canonicalMerchantKey("***")).toBe("");
  });

  it("tolera el prefijo de procesador que antepone el banco", () => {
    expect(canonicalMerchantKey("VA Spotify")).toBe(
      canonicalMerchantKey("Spotify"),
    );
  });
});

describe("el & une en vez de separar", () => {
  // "AT&T MEXICO" daba la clave "mexico": & se volvía espacio, y "at" y "t"
  // caían por cortos. Cualquier otro comercio que empezara por México habría
  // acabado en el mismo grupo.
  it("AT&T no se parte en dos tokens inútiles", () => {
    expect(canonicalMerchantKey("AT&T MEXICO")).toBe("att mexico");
  });

  it("y no colisiona con otro comercio que mencione México", () => {
    expect(canonicalMerchantKey("AT&T MEXICO")).not.toBe(
      canonicalMerchantKey("Telefonica Mexico"),
    );
  });

  it("pero el punto sí separa: netflix.com no es una palabra", () => {
    expect(canonicalMerchantKey("Netflix.com")).toBe("netflix");
  });
});

describe("normalizeDescription", () => {
  it("colapsa signos y espacios", () => {
    expect(normalizeDescription("  Anthropic*  Claude—Sub ")).toBe(
      "anthropic claude sub",
    );
  });
});
