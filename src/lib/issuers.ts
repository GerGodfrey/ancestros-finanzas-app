// Emisores de tarjeta de crédito en México, en el orden en que es más probable
// que sea el del cliente. Va en un selector porque «emisor» es jerga que la
// gente no reconoce —un cliente escribió «nana» ahí—, pero su banco en una
// lista sí lo encuentra.
//
// Orden por número de tarjetahabientes, con las fuentes de septiembre 2026:
// Nu reporta 15 M de clientes en México (La Jornada, abr. 2026); por saldo de
// cartera van BBVA, Banamex (13.8 %) y Banorte (13.2 %) según CNBV (jul. 2026);
// Stori supera 3.7 M. El resto por presencia conocida. Ajustar cuando haya
// datos de uso propios.
//
// El texto es el que se guarda en `accounts.issuer`, así que tiene que existir
// en ISSUER_ALIAS_GROUPS de statement-account-match.ts para que el guard del
// parse reconozca cómo lo nombra el PDF.
export const ISSUERS = [
  "Nu",
  "BBVA",
  "Banamex",
  "Banorte",
  "Santander",
  "American Express",
  "Stori",
  "HSBC",
  "Scotiabank",
  "Klar",
  "Banco Azteca",
  "BanCoppel",
  "Inbursa",
  "Liverpool",
  "Palacio de Hierro",
  "Hey Banco",
  "Mercado Pago",
  "RappiCard",
  "Banregio",
  "Afirme",
  "BanBajío",
  "Ualá",
  "Plata",
  "Suburbia",
  "Coppel",
  "Sears",
  "Sanborns",
] as const;

/** Valor centinela del selector: el usuario escribe el banco a mano. */
export const OTHER_ISSUER = "__otro__";

export function isKnownIssuer(value: string): boolean {
  const v = value.trim().toLowerCase();
  return ISSUERS.some((i) => i.toLowerCase() === v);
}
