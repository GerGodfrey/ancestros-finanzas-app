import { describe, expect, it } from "vitest";
import {
  decryptSecret,
  encryptSecret,
  maskApiKey,
  tryDecryptSecret,
} from "./crypto";

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

describe("crypto: tryDecryptSecret", () => {
  it("devuelve el texto cuando la credencial es legible", () => {
    const secret = "sk-ant-legible";
    expect(tryDecryptSecret(encryptSecret(secret))).toBe(secret);
  });

  it("devuelve null en vez de lanzar cuando la llave de cifrado cambió", () => {
    // Payload bien formado pero cifrado con otra llave: es exactamente lo que
    // queda en la base después de rotar ENCRYPTION_KEY.
    const original = process.env.ENCRYPTION_KEY;
    const encrypted = encryptSecret("sk-de-la-llave-vieja");
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    try {
      expect(() => decryptSecret(encrypted)).toThrow();
      expect(tryDecryptSecret(encrypted)).toBeNull();
    } finally {
      process.env.ENCRYPTION_KEY = original;
    }
  });

  it("devuelve null cuando el payload está corrupto o truncado", () => {
    expect(tryDecryptSecret("no-tiene-puntos")).toBeNull();
    expect(tryDecryptSecret("aaa.bbb.ccc")).toBeNull();
    expect(tryDecryptSecret("")).toBeNull();
  });

  it("SÍ lanza si ENCRYPTION_KEY falta: eso es el entorno mal puesto, no un dato corrupto", () => {
    const original = process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEY;
    try {
      expect(() => tryDecryptSecret("aaa.bbb.ccc")).toThrow(/ENCRYPTION_KEY/);
    } finally {
      process.env.ENCRYPTION_KEY = original;
    }
  });
});
