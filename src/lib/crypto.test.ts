import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, maskApiKey } from "./crypto";

describe("crypto: encryptSecret / decryptSecret", () => {
  it("recupera el texto original después de cifrar", () => {
    const secret = "sk-ant-super-secreta-123";
    const encrypted = encryptSecret(secret);
    expect(encrypted).not.toBe(secret);
    expect(decryptSecret(encrypted)).toBe(secret);
  });

  it("genera un IV distinto cada vez (dos cifrados del mismo texto no son iguales)", () => {
    const secret = "misma-api-key";
    const a = encryptSecret(secret);
    const b = encryptSecret(secret);
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe(secret);
    expect(decryptSecret(b)).toBe(secret);
  });

  it("lanza un error si el payload cifrado fue alterado (falla la verificación de auth tag)", () => {
    const encrypted = encryptSecret("api-key-original");
    const [iv, authTag, ciphertext] = encrypted.split(".");
    const tampered = [iv, authTag, ciphertext.slice(0, -4) + "AAAA"].join(
      ".",
    );
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("lanza un error si el formato del payload es inválido", () => {
    expect(() => decryptSecret("no-tiene-el-formato-correcto")).toThrow(
      /formato/i,
    );
  });
});

describe("crypto: maskApiKey", () => {
  it("muestra solo los primeros y últimos 4 caracteres", () => {
    expect(maskApiKey("sk-ant-api03-abcdef123456")).toBe(
      "sk-a••••••••3456",
    );
  });

  it("enmascara por completo las keys muy cortas", () => {
    expect(maskApiKey("short")).toBe("••••••••");
  });
});
