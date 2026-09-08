import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Cifrado simétrico (AES-256-GCM) para las API keys de proveedores de IA que
// el usuario guarda en `provider_credentials`. Nunca se guardan en texto plano.
// La clave se genera con: openssl rand -base64 32  →  ENCRYPTION_KEY en .env

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("ENCRYPTION_KEY no está configurada en el entorno.");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      "ENCRYPTION_KEY debe decodificar a 32 bytes (genera una con: openssl rand -base64 32).",
    );
  }
  return key;
}

// Formato de salida: base64(iv) + "." + base64(authTag) + "." + base64(ciphertext)
export function encryptSecret(plainText: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(".");
}

export function decryptSecret(payload: string): string {
  const key = getKey();
  const [ivB64, authTagB64, ciphertextB64] = payload.split(".");
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error("Formato de credencial cifrada inválido.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ]);

  return plaintext.toString("utf8");
}

/**
 * Igual que `decryptSecret`, pero devuelve `null` si la credencial no se puede
 * descifrar en vez de lanzar.
 *
 * Pasa de verdad: si `ENCRYPTION_KEY` se rota, todo lo cifrado con la llave
 * anterior queda ilegible. Antes eso tumbaba la ruta entera —una credencial
 * rota dejaba sin lista al usuario, incluidas las que sí servían— y el 500
 * llegaba al navegador sin cuerpo JSON.
 *
 * Un error de configuración (ENCRYPTION_KEY ausente o de largo inválido) SÍ se
 * propaga: eso no es un dato corrupto, es el entorno mal puesto, y silenciarlo
 * haría que todas las credenciales se vieran ilegibles sin decir por qué.
 */
export function tryDecryptSecret(payload: string): string | null {
  getKey(); // que un fallo de configuración siga siendo ruidoso
  try {
    return decryptSecret(payload);
  } catch {
    return null;
  }
}

/** Mensaje único para cuando una credencial guardada ya no se puede leer. */
export const CREDENTIAL_UNREADABLE =
  "Tu API key guardada ya no se puede descifrar (probablemente cambió la llave de cifrado del servidor). Ve a Configuración y vuelve a guardarla.";

// Para mostrar en la UI de Configuración sin exponer la key completa.
export function maskApiKey(key: string): string {
  if (key.length <= 8) return "••••••••";
  return `${key.slice(0, 4)}••••••••${key.slice(-4)}`;
}
