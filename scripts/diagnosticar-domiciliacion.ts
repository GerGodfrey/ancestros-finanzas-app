/**
 * Por qué un cargo concreto sí o no se considera domiciliación.
 *
 * Nace de un caso real: la reevaluación descubrió «Google One» pero no
 * «Anthropic», que era justo el falso negativo que el cambio venía a arreglar.
 * Sin ver qué datos tiene enfrente el motor, cualquier explicación es una
 * suposición — y este script imprime exactamente eso.
 *
 * Solo lee. No escribe nada nunca.
 *
 * Uso:
 *   set -a && source .env.prod-reevaluacion && set +a
 *   npx tsx scripts/diagnosticar-domiciliacion.ts anthropic
 */
import { createClient } from "@supabase/supabase-js";
import { canonicalMerchantKey } from "../src/lib/merchant-key";
import { classifyRecurring } from "../src/lib/recurring-rules";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const termino = process.argv[2];

if (!url || !serviceKey) {
  console.error("Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
if (!termino) {
  console.error("Falta el término a buscar. Ej: npx tsx scripts/diagnosticar-domiciliacion.ts anthropic");
  process.exit(1);
}

const supabase = createClient(url, serviceKey);

async function main() {
  const { data: txs, error } = await supabase
    .from("transactions")
    .select("id, account_id, statement_id, description, amount, tx_date, type")
    .ilike("description", `%${termino}%`)
    .order("tx_date", { ascending: true });

  if (error) {
    console.error("Error leyendo transacciones:", error.message);
    process.exit(1);
  }
  if (!txs || txs.length === 0) {
    console.log(`No hay ninguna transacción cuya descripción contenga "${termino}".`);
    console.log("Si esperabas encontrarla, el cargo no está en ningún estado de cuenta parseado.");
    return;
  }

  console.log(`${txs.length} movimientos que contienen "${termino}":\n`);

  // De qué corte viene cada uno, y si ese corte está entre los 3 últimos de su
  // cuenta — que es la ventana que mira el detector.
  const accountIds = [...new Set(txs.map((t) => t.account_id as string))];
  const ultimos3PorCuenta = new Map<string, Set<string>>();
  const mesPorStatement = new Map<string, string>();

  for (const accountId of accountIds) {
    const { data: sts } = await supabase
      .from("statements")
      .select("id, period_end")
      .eq("account_id", accountId)
      .eq("status", "parsed")
      .not("period_end", "is", null)
      .order("period_end", { ascending: false });

    (sts ?? []).forEach((s) =>
      mesPorStatement.set(s.id as string, (s.period_end as string).slice(0, 7)),
    );
    ultimos3PorCuenta.set(
      accountId,
      new Set((sts ?? []).slice(0, 3).map((s) => s.id as string)),
    );
    console.log(
      `Cuenta ${accountId.slice(0, 8)}: ${(sts ?? []).length} cortes parseados; el detector solo mira los 3 más recientes (${(sts ?? []).slice(0, 3).map((s) => (s.period_end as string).slice(0, 7)).join(", ") || "ninguno"}).`,
    );
  }
  console.log("");

  for (const t of txs) {
    const enVentana = ultimos3PorCuenta
      .get(t.account_id as string)
      ?.has(t.statement_id as string);
    console.log(
      [
        (t.tx_date as string).padEnd(12),
        String(t.description).slice(0, 34).padEnd(34),
        String(t.amount).padStart(10),
        `type=${t.type}`.padEnd(16),
        `mes=${mesPorStatement.get(t.statement_id as string) ?? "?"}`.padEnd(12),
        `clave=${canonicalMerchantKey(t.description as string)}`.padEnd(26),
        enVentana ? "en la ventana" : "FUERA de los 3 últimos cortes",
      ].join(" "),
    );
  }

  // El veredicto, contando solo lo que el detector vería de verdad.
  const porClaveYCuenta = new Map<string, typeof txs>();
  for (const t of txs) {
    if (!ultimos3PorCuenta.get(t.account_id as string)?.has(t.statement_id as string)) continue;
    if (t.type !== "regular") continue;
    const k = `${t.account_id}::${canonicalMerchantKey(t.description as string)}`;
    porClaveYCuenta.set(k, [...(porClaveYCuenta.get(k) ?? []), t]);
  }

  console.log("\n--- Veredicto sobre lo que el detector sí mira ---");
  if (porClaveYCuenta.size === 0) {
    console.log(
      "Nada entra al motor. Revisa arriba si es por estar fuera de los 3 últimos\n" +
        "cortes, o porque el `type` no es 'regular' (el detector ignora msi, fee y pagos).",
    );
    return;
  }

  for (const [k, rows] of porClaveYCuenta) {
    const verdict = classifyRecurring({
      description: rows[0].description as string,
      occurrences: rows.map((t) => ({
        month: mesPorStatement.get(t.statement_id as string)!,
        amount: Number(t.amount),
        dayOfMonth: Number((t.tx_date as string).slice(8, 10)),
      })),
    });
    console.log(
      `\n${k.split("::")[1]} — ${verdict.isRecurring ? "SÍ es domiciliación" : "NO"}\n` +
        `  ${verdict.reason}\n` +
        `  meses=${verdict.monthsSeen} variación de monto=${verdict.amountCv.toFixed(3)} día típico=${verdict.dayOfMonth} confianza=${verdict.confidence}`,
    );
  }
}

main();
