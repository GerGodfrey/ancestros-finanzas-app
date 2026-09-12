/**
 * Reduce la descripción de un movimiento a una clave de comercio estable entre
 * meses.
 *
 * Por qué existe: las descripciones se limpian con IA al parsear el PDF
 * (`description_cleaned` en parse/route.ts), y un modelo de lenguaje no produce
 * la misma salida byte a byte cada mes. «Anthropic* Claude Sub» puede quedar
 * como «Anthropic Claude Sub» en octubre y «Anthropic Claude Subscription» en
 * noviembre. La detección anterior comparaba con igualdad de cadenas, así que
 * veía dos comercios distintos y nunca juntaba las tres apariciones que
 * necesitaba. Los falsos negativos que reportó el usuario salen todos de ahí.
 *
 * El usuario también puede editar una descripción a mano
 * (transactions/[id]/route.ts), y eso rompía la cadena hacia atrás igual.
 *
 * Es determinístico a propósito — sin IA. Una clave que cambia cuando el modelo
 * cambia de humor reintroduce el bug que esto arregla.
 */

/** Ruido de procesador y de formato que no identifica al comercio. */
const NOISE_TOKENS = new Set([
  // Sufijos corporativos y de dominio
  "com", "mx", "www", "http", "https", "net", "org", "inc", "llc", "ltd",
  "sa", "cv", "sab", "srl", "co", "corp", "company",
  // Conectores
  "de", "del", "la", "el", "los", "las", "y", "the", "of",
  // Verbos de operación que el banco antepone
  "compra", "cargo", "pago", "pagos", "abono", "mensualidad", "suscripcion",
  "suscripciones", "subscription", "sub", "recurrente", "domiciliado",
  "domiciliacion", "tarjeta", "tdc", "tdd", "internet", "online", "en",
  // Prefijos de procesador
  "va", "pa", "dlo", "ebanx", "paypal", "mercadopago", "openpay", "conekta",
  "stripe", "sq", "sp", "msi",
]);

/** Cuántos tokens significativos forman la clave. */
const KEY_TOKENS = 2;

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Normalización básica: sin acentos, minúsculas, sin signos. */
export function normalizeDescription(description: string): string {
  return (
    stripAccents(description)
      .toLowerCase()
      // El & y el apóstrofo unen, no separan: "AT&T" es una palabra, y
      // volverla "at t" dejaba dos tokens de una y dos letras que el filtro de
      // abajo descarta. La clave quedaba en "mexico" — y habría agrupado AT&T
      // con cualquier otro comercio cuyo primer token significativo fuera ese.
      // El punto sí separa, porque "netflix.com" son dos cosas.
      .replace(/[&']/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
  );
}

/**
 * 'Anthropic* Claude Sub 4923' → 'anthropic claude'
 * 'ANTHROPIC CLAUDE SUBSCRIPTION' → 'anthropic claude'
 *
 * Devuelve la descripción normalizada completa si no queda ningún token
 * significativo — es preferible una clave rara a una vacía, que agruparía
 * comercios sin relación.
 */
export function canonicalMerchantKey(description: string): string {
  const normalized = normalizeDescription(description);

  const significant = normalized
    .split(" ")
    .filter((t) => t.length > 0)
    // Fuera números, folios y códigos de sucursal: cambian cada mes y son
    // justo lo que hacía que dos cargos del mismo servicio no coincidieran.
    .filter((t) => !/\d/.test(t))
    .filter((t) => t.length > 2)
    .filter((t) => !NOISE_TOKENS.has(t));

  if (significant.length === 0) return normalized;
  return significant.slice(0, KEY_TOKENS).join(" ");
}
