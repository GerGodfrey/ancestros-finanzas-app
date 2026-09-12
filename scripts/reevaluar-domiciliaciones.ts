/**
 * Reevalúa las `recurring_charges` que ya existen con la regla nueva.
 *
 * Hace falta porque las filas anteriores a la migración 0011 no tienen
 * `merchant_key`, y el dashboard empareja por esa clave: sin recorrerlas, las
 * domiciliaciones de un usuario desaparecen del panel hasta que suba un PDF
 * nuevo. No es cosmético.
 *
 * Dos pasos:
 *
 *   1. **Reevaluar** lo que ya existe: calcularle la clave canónica y volver a
 *      clasificarlo con la regla nueva. Lo que pasa queda 'suggested'; lo que
 *      no, 'dismissed'.
 *   2. **Descubrir** lo que la regla vieja nunca vio. Los falsos negativos no
 *      tienen fila que reevaluar, así que hay que buscarlos en las
 *      transacciones ya guardadas. Sin este paso, una suscripción que la regla
 *      vieja se perdía no aparecería hasta el siguiente estado de cuenta.
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
import { loadAccountGroups } from "../src/lib/recurring-charges";
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
    const merchantKey = canonicalMerchantKey(row.description as string);

    // Lo que el usuario ya respondió no se reclasifica: sería deshacerle una
    // decisión a sus espaldas. Pero la clave de comercio sí se rellena — sin
    // ella la fila no empareja con nada en el dashboard, y el paso 2 la
    // insertaría otra vez creyendo que es un comercio nuevo.
    if (row.status === "confirmed" || row.status === "dismissed") {
      confirmadasIntactas++;
      if (!row.merchant_key && !dryRun) {
        await supabase
          .from("recurring_charges")
          .update({ merchant_key: merchantKey })
          .eq("id", row.id);
      }
      continue;
    }

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
    `\nPaso 1 — filas existentes: ${quedanSugeridas} siguen sugeridas, ${descartadas} descartadas, ${confirmadasIntactas} intactas por tener respuesta del usuario.`,
  );

  // --- Paso 2 · descubrimiento -------------------------------------------
  // Reevaluar no basta. Los falsos negativos que motivaron todo esto —una
  // suscripción que la regla vieja nunca vio porque la IA escribía el nombre
  // distinto cada mes— no tienen fila que reevaluar. Hay que buscarlos en las
  // transacciones ya guardadas, que es lo que haría el detector si el estado
  // de cuenta acabara de llegar.
  //
  // Va después del paso 1 a propósito: hasta que todas las filas viejas tengan
  // su clave, este paso no puede saber cuáles ya existen y las duplicaría.
  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, user_id");

  let descubiertas = 0;

  for (const account of accounts ?? []) {
    const { groups } = await loadAccountGroups({
      supabase,
      userId: account.user_id as string,
      accountId: account.id as string,
    });

    const { data: yaExisten } = await supabase
      .from("recurring_charges")
      .select("merchant_key")
      .eq("user_id", account.user_id)
      .eq("account_id", account.id);

    const conocidas = new Set(
      (yaExisten ?? []).map((r) => r.merchant_key).filter(Boolean),
    );

    for (const group of groups.values()) {
      if (conocidas.has(group.merchantKey)) continue;

      const verdict = classifyRecurring({
        description: group.description,
        occurrences: group.occurrences,
      });
      if (!verdict.isRecurring) continue;

      descubiertas++;
      const months = group.occurrences.map((o) => o.month);
      const typicalAmount =
        group.occurrences.reduce((sum, o) => sum + o.amount, 0) /
        group.occurrences.length;

      console.log(
        `NUEVA     ${group.description.slice(0, 40).padEnd(40)} → ${group.merchantKey} · ${verdict.reason}`,
      );

      if (!dryRun) {
        await supabase.from("recurring_charges").insert({
          user_id: account.user_id,
          account_id: account.id,
          description: group.description,
          merchant_key: group.merchantKey,
          typical_amount: typicalAmount,
          frequency: "monthly",
          first_seen: `${months.reduce((a, b) => (a < b ? a : b))}-01`,
          last_seen: `${months.reduce((a, b) => (a > b ? a : b))}-01`,
          // Sugerida, nunca confirmada: nadie se la ha preguntado al usuario.
          status: "suggested",
          confidence: verdict.confidence,
          day_of_month: verdict.dayOfMonth,
          amount_cv: verdict.amountCv,
          active: true,
        });
      }
    }
  }

  console.log(
    `Paso 2 — descubrimiento: ${descubiertas} domiciliaciones nuevas que la regla vieja no veía.`,
  );

  console.log(
    `\nListo. Al terminar tendrás ${quedanSugeridas + descubiertas} sugerencias por responder en el dashboard.`,
  );
  if (dryRun) console.log("Dry-run: no se escribió nada.");
}

main();
