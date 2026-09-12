/**
 * Reevalúa las `recurring_charges` que ya existen con la regla nueva.
 *
 * Hace falta porque las filas anteriores a la migración 0011 no tienen
 * `merchant_key`, y el dashboard empareja por esa clave: sin recorrerlas, las
 * domiciliaciones de un usuario desaparecen del panel hasta que suba un PDF
 * nuevo. No es cosmético.
 *
 * Qué hace con cada fila:
 *   - le calcula la clave canónica a partir de su descripción;
 *   - la vuelve a clasificar contra las transacciones ya guardadas;
 *   - la que pasa queda 'suggested'; la que no, 'dismissed'.
 *
 * **No borra nada.** Una fila descartada sigue ahí y el usuario puede
 * reactivarla desde el dashboard — que es la diferencia entre corregir una
 * regla y decidir por él.
 *
 * Es idempotente: correrlo dos veces da el mismo resultado. Y respeta lo que el
 * usuario ya respondió: las filas en 'confirmed' o 'dismissed' no se tocan.
 *
 * Uso:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/reevaluar-domiciliaciones.ts [--dry-run]
 *
 * Corre una sola vez por ambiente, después del deploy. Contra producción,
 * primero con --dry-run.
 */
import { createClient } from "@supabase/supabase-js";
import { canonicalMerchantKey } from "../src/lib/merchant-key";
import { classifyRecurring, type Occurrence } from "../src/lib/recurring-rules";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dryRun = process.argv.includes("--dry-run");

if (!url || !serviceKey) {
  console.error(
    "Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el entorno.",
  );
  process.exit(1);
}

// Service role: esto corre fuera de una sesión de usuario y tiene que ver las
// filas de todos. Por eso el script vive fuera de la app y se corre a mano.
const supabase = createClient(url, serviceKey);

async function main() {
  const { data: charges, error } = await supabase
    .from("recurring_charges")
    .select("id, user_id, account_id, description, merchant_key, status");

  if (error) {
    // El caso más probable la primera vez: correrlo contra una base donde la
    // migración todavía no se aplicó. El error de Postgres por sí solo no dice
    // qué hacer, y es justo lo que pasó la primera vez que se usó.
    if (error.message.includes("merchant_key")) {
      console.error(
        "Esta base todavía no tiene la migración 0011.\n" +
          "El script se corre DESPUÉS del deploy: mergea el PR, espera a que\n" +
          "el job migrate-* termine en verde, y vuelve a intentar.",
      );
      process.exit(1);
    }
    console.error("No se pudieron leer las domiciliaciones:", error.message);
    process.exit(1);
  }

  const rows = charges ?? [];
  console.log(`${rows.length} domiciliaciones por revisar${dryRun ? " (dry-run)" : ""}.`);

  let confirmadasIntactas = 0;
  let quedanSugeridas = 0;
  let descartadas = 0;

  for (const row of rows) {
    // Lo que el usuario ya respondió no se toca: sería deshacerle una decisión
    // a sus espaldas, que es justo lo que este cambio viene a arreglar.
    if (row.status === "confirmed" || row.status === "dismissed") {
      confirmadasIntactas++;
      continue;
    }

    const merchantKey = canonicalMerchantKey(row.description as string);

    // Últimos 3 cortes de esa tarjeta, igual que el detector en vivo.
    const { data: statements } = await supabase
      .from("statements")
      .select("id, period_end")
      .eq("user_id", row.user_id)
      .eq("account_id", row.account_id)
      .eq("status", "parsed")
      .not("period_end", "is", null)
      .order("period_end", { ascending: false })
      .limit(3);

    const monthById = new Map(
      (statements ?? []).map((s) => [
        s.id as string,
        (s.period_end as string).slice(0, 7),
      ]),
    );

    const { data: txs } = await supabase
      .from("transactions")
      .select("statement_id, description, amount, tx_date")
      .eq("user_id", row.user_id)
      .eq("account_id", row.account_id)
      .in("statement_id", [...monthById.keys()])
      .eq("type", "regular");

    const occurrences: Occurrence[] = (txs ?? [])
      .filter((t) => canonicalMerchantKey(t.description as string) === merchantKey)
      .map((t) => ({
        month: monthById.get(t.statement_id as string)!,
        amount: Number(t.amount),
        dayOfMonth: Number((t.tx_date as string).slice(8, 10)),
      }))
      .filter((o) => Boolean(o.month));

    const verdict = classifyRecurring({
      description: row.description as string,
      occurrences,
    });

    const update = verdict.isRecurring
      ? {
          merchant_key: merchantKey,
          status: "suggested",
          confidence: verdict.confidence,
          day_of_month: verdict.dayOfMonth,
          amount_cv: verdict.amountCv,
        }
      : {
          merchant_key: merchantKey,
          status: "dismissed",
          confidence: 0,
        };

    if (verdict.isRecurring) quedanSugeridas++;
    else descartadas++;

    console.log(
      `${verdict.isRecurring ? "SUGERIDA " : "DESCARTADA"} ${String(row.description).slice(0, 40).padEnd(40)} → ${merchantKey} · ${verdict.reason}`,
    );

    if (!dryRun) {
      await supabase.from("recurring_charges").update(update).eq("id", row.id);
    }
  }

  console.log(
    `\nListo. ${quedanSugeridas} siguen sugeridas, ${descartadas} descartadas, ${confirmadasIntactas} intactas por tener respuesta del usuario.`,
  );
  if (dryRun) console.log("Dry-run: no se escribió nada.");
}

main();
