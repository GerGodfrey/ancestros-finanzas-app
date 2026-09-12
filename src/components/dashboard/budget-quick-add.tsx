"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";
import { currentMonthFirstDay, monthLongLabel } from "@/lib/month";

const ENDPOINT_BY_KIND = {
  income: "/api/incomes",
  fixed: "/api/fixed-costs",
  debt: "/api/debts",
};

/**
 * Alta manual de dinero. Un solo formulario, en un solo sitio.
 *
 * Hubo una versión partida en dos —temporal en Desglose, fijo aquí— para que
 * se pudiera capturar en un mes pasado sin un selector de mes. Resolvía el
 * caso, pero a cambio el usuario tenía que aprender en qué pantalla vivía cada
 * cosa, y acabaron siendo dos formularios con etiquetas distintas y dos
 * párrafos mandándose el uno al otro. Era trasladarle al usuario una
 * restricción del esquema. Un desplegable de mes cuesta menos que esa regla.
 *
 * Las deudas no llevan mes ni recurrencia: la tabla `debts` no tiene columna
 * `month` — son un saldo vivo, no un movimiento de un mes. Al elegirlas, esos
 * dos campos desaparecen en vez de quedarse ahí sin hacer nada.
 */
export function BudgetQuickAdd({ months }: {
  /**
   * Meses elegibles en 'YYYY-MM-01', del más reciente al más viejo. Los arma
   * `monthOptionsFromCoverage` a partir de lo que el cliente ha subido, así que
   * el selector no ofrece meses anteriores a su primer estado de cuenta.
   */
  months: string[];
}) {
  const router = useRouter();
  const [kind, setKind] = useState<"income" | "fixed" | "debt">("income");
  const [concept, setConcept] = useState("");
  const [amount, setAmount] = useState("");
  const [month, setMonth] = useState(currentMonthFirstDay());
  const [isRecurring, setIsRecurring] = useState(false);
  const [saving, setSaving] = useState(false);
  // Esta página no lista lo que agregas, así que sin estas dos líneas no hay
  // forma de distinguir "se guardó" de "no pasó nada". Es literalmente lo que
  // se reportó: que el botón no hacía nada.
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const isDebt = kind === "debt";

  // Un fijo aplica desde su mes de captura en adelante (ver el `.or(...)` de
  // get-monthly-data.ts). Marcarlo sobre un mes pasado reescribiría todos los
  // meses posteriores de golpe, así que en un mes que no es el actual la
  // casilla se apaga y dice por qué — aquí mismo, no en otra pantalla.
  const canRepeat = month === currentMonthFirstDay();
  const repeats = canRepeat && isRecurring;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!concept.trim() || !amount) return;
    setSaving(true);
    setError(null);
    setSaved(null);

    const body = isDebt
      ? { concept, amount: Number(amount) }
      : { concept, amount: Number(amount), month, isRecurring: repeats };

    // La respuesta sí se revisa. Antes se ignoraba: con un 400 o un 500 el
    // formulario se limpiaba igual y fingía haber guardado.
    const res = await fetch(ENDPOINT_BY_KIND[kind], {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);

    setSaving(false);

    if (!res || !res.ok) {
      const data = await res?.json().catch(() => ({}));
      setError(data?.error ?? "No se pudo guardar. Intenta de nuevo.");
      return;
    }

    setSaved(
      isDebt
        ? `Se agregó "${concept.trim()}" a tus deudas.`
        : repeats
          ? `Se agregó "${concept.trim()}" de ${monthLongLabel(month)} en adelante.`
          : `Se agregó "${concept.trim()}" a ${monthLongLabel(month)}.`,
    );
    setConcept("");
    setAmount("");
    router.refresh();
  }

  return (
    <div className="rounded-lg border border-border bg-surface-raised p-4">
      {error && (
        <p className="mb-3 rounded-md border border-negative/40 bg-negative/10 px-3 py-2 text-xs text-negative">
          {error}
        </p>
      )}
      {saved && (
        <p className="mb-3 rounded-md border border-positive/40 bg-positive/10 px-3 py-2 text-xs text-positive">
          {saved}
        </p>
      )}
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-text-muted">Tipo</label>
            <select
              value={kind}
              onChange={(e) =>
                setKind(e.target.value as "income" | "fixed" | "debt")
              }
              className="rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-text"
            >
              <option value="income">Ingreso</option>
              <option value="fixed">Egreso</option>
              <option value="debt">Deuda familiar/largo plazo</option>
            </select>
          </div>

          <div className="flex min-w-40 flex-1 flex-col gap-1">
            <label className="text-xs text-text-muted">Concepto</label>
            <input
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              placeholder={
                kind === "income"
                  ? "Nómina"
                  : kind === "fixed"
                    ? "Renta"
                    : "Cripto (prestado)"
              }
              className="rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-text"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-text-muted">Monto</label>
            <input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-32 rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-text"
            />
          </div>

          {!isDebt && (
            <div className="flex flex-col gap-1">
              <label className="text-xs text-text-muted">Mes</label>
              <select
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-text"
              >
                {months.map((m) => (
                  <option key={m} value={m}>
                    {monthLongLabel(m)}
                  </option>
                ))}
              </select>
            </div>
          )}

          <Button size="sm" type="submit" disabled={saving}>
            {saving ? "Guardando…" : "Agregar"}
          </Button>
        </div>

        {!isDebt && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <label
              className={`flex items-center gap-2 ${
                canRepeat ? "text-text-muted" : "text-text-faint"
              }`}
            >
              <input
                type="checkbox"
                checked={repeats}
                disabled={!canRepeat}
                onChange={(e) => setIsRecurring(e.target.checked)}
                className="accent-accent"
              />
              <span className="whitespace-nowrap">Se repite cada mes</span>
            </label>
            {!canRepeat && (
              <span className="text-text-faint">
                Solo sobre {monthLongLabel(currentMonthFirstDay())}: un fijo
                aplica de su mes en adelante.
              </span>
            )}
          </div>
        )}

        {/*
          El riesgo real de esta pantalla no es que el usuario no entienda cómo
          se llama cada cosa: es que capture aquí un cargo que su tarjeta de
          crédito ya trae. Ese dinero acabaría contado dos veces en la
          proyección del próximo mes —una como costo fijo y otra como
          domiciliación detectada— y el error sería de cuentas, no de nombres.

          Va solo en Egreso: un ingreso no se cobra a una tarjeta, y ahí la
          advertencia sobraría.
        */}
        {kind === "fixed" && (
          <p className="max-w-[62ch] text-2xs leading-relaxed text-text-faint">
            Si se cobra a una tarjeta de crédito, no lo captures aquí — ya lo
            detectamos en Domiciliaciones y se contaría doble.
          </p>
        )}
      </form>
    </div>
  );
}
