// Valida que un PDF recién parseado de verdad corresponda a la tarjeta que
// el usuario seleccionó antes de subirlo — evita que un statement (y sus
// transacciones/MSI) quede guardado bajo la cuenta equivocada, algo que ya
// pasó en producción: un PDF de Amex se subió seleccionando "Palacio de
// Hierro" y su saldo/MSI se mezcló con esa tarjeta silenciosamente.
//
// El emisor y los últimos 4 dígitos son datos objetivos del banco — si no
// coinciden con la cuenta seleccionada, es casi seguro un error del usuario
// al elegir la tarjeta, así que el parseo se rechaza. El nombre del
// producto NO se valida aquí porque lo asigna el usuario a mano (puede
// llamarle distinto a como el banco nombra el producto en el PDF).

// Alias conocidos: el mismo banco puede aparecer con nombres distintos en
// el PDF vs. como el usuario lo capturó al crear la tarjeta (ej. la cuenta
// dice "Amex" pero el PDF dice "American Express"). No es exhaustivo — para
// emisores fuera de esta lista, el match cae en comparación por texto
// normalizado (igual o uno contiene al otro).
//
// Cada emisor de src/lib/issuers.ts tiene que aparecer aquí con las formas en
// que su PDF lo nombra; si no, el guard rechaza un estado legítimo.
const ISSUER_ALIAS_GROUPS: string[][] = [
  ["nu", "nu mexico", "nu bank", "nubank", "nu financiera"],
  ["bbva", "bbva bancomer", "bancomer", "bbva mexico"],
  ["banamex", "citibanamex", "citi banamex", "banco nacional de mexico"],
  ["banorte", "banco mercantil del norte"],
  ["santander", "banco santander", "santander mexico"],
  ["amex", "american express"],
  ["stori", "storicard", "stori card"],
  ["hsbc", "hsbc mexico"],
  ["scotiabank", "scotia", "scotiabank inverlat"],
  ["klar"],
  ["banco azteca", "azteca"],
  ["bancoppel", "coppel"],
  ["inbursa", "banco inbursa"],
  ["liverpool", "liverpool premium card", "dilisa"],
  ["palacio de hierro", "palacio", "el palacio de hierro"],
  ["hey banco", "hey", "banregio", "banco regional"],
  ["mercado pago", "mercadopago"],
  ["rappicard", "rappi", "rappi card"],
  ["afirme", "banca afirme"],
  ["banbajio", "banco del bajio"],
  ["uala", "uala mexico"],
  ["plata", "plata card"],
  ["suburbia"],
  ["sears"],
  ["sanborns"],
];

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function issuersMatch(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return true; // sin dato suficiente, no se bloquea
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;
  return ISSUER_ALIAS_GROUPS.some((group) => {
    const normalized = group.map(normalize);
    return normalized.includes(na) && normalized.includes(nb);
  });
}

export interface StatementAccountMatchResult {
  ok: boolean;
  errors: string[];
}

export function checkStatementMatchesAccount(opts: {
  extractedIssuer: string | null | undefined;
  extractedLast4: string | null | undefined;
  accountIssuer: string;
  accountLast4: string | null | undefined;
}): StatementAccountMatchResult {
  const errors: string[] = [];

  if (
    opts.extractedIssuer &&
    !issuersMatch(opts.extractedIssuer, opts.accountIssuer)
  ) {
    errors.push(
      `El emisor del PDF ("${opts.extractedIssuer}") no coincide con la tarjeta seleccionada ("${opts.accountIssuer}").`,
    );
  }

  if (
    opts.extractedLast4 &&
    opts.accountLast4 &&
    opts.extractedLast4.trim() !== opts.accountLast4.trim()
  ) {
    errors.push(
      `El PDF termina en ${opts.extractedLast4}, pero la tarjeta seleccionada tiene guardado ${opts.accountLast4}.`,
    );
  }

  return { ok: errors.length === 0, errors };
}
