"use client";

import { useState } from "react";
import type { MonthCoverage } from "@/lib/dashboard/get-upload-coverage";

const MONTH_LABELS_SHORT = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];
const MONTH_LABELS_LONG = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

function shortLabel(month: string): string {
  const m = Number(month.split("-")[1]);
  return MONTH_LABELS_SHORT[m - 1];
}

function longLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTH_LABELS_LONG[m - 1]} ${y}`;
}

// 'YYYY-MM-DD' -> '22 ago' — para mostrar corte/pago sin ambigüedad de mes.
function shortDate(dateStr: string): string {
  const [, m, d] = dateStr.split("-").map(Number);
  return `${d} ${MONTH_LABELS_SHORT[m - 1].toLowerCase()}`;
}

// Escala secuencial de un solo tono (verde) por magnitud, del mismo lenguaje
// visual que un heatmap de contribuciones: entre más oscuro/vacío, menos
// estados de cuenta subidos ese mes contra las tarjetas que existían.
function levelClasses(percentage: number | null): { bg: string; text: string } {
  if (percentage === null) return { bg: "bg-zinc-900 border border-zinc-800", text: "text-zinc-600" };
  if (percentage === 0) return { bg: "bg-zinc-800", text: "text-zinc-500" };
  if (percentage < 0.5) return { bg: "bg-emerald-900", text: "text-emerald-200" };
  if (percentage < 1) return { bg: "bg-emerald-700", text: "text-emerald-50" };
  return { bg: "bg-emerald-400", text: "text-zinc-900" };
}

export function UploadHistoryHeatmap({
  months,
  defaultSelectedMonth,
}: {
  months: MonthCoverage[];
  // Mes con el que abre el detalle — normalmente el mismo que la caja de
  // pendientes de arriba (coverage.highlightMonth), para que ambas piezas
  // de la página cuenten la misma historia en vez de mostrar meses distintos.
  defaultSelectedMonth?: string | null;
}) {
  const [selected, setSelected] = useState<string | null>(
    defaultSelectedMonth ?? (months.length > 0 ? months[months.length - 1].month : null),
  );

  if (months.length === 0) return null;

  const selectedData = months.find((m) => m.month === selected) ?? null;

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-zinc-200">
            Historial de estados de cuenta subidos
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Cada mes cuenta según la fecha de corte del PDF, no la fecha
            límite de pago ni la fecha en que lo subiste — un corte del 22 de
            agosto cuenta para agosto, aunque su pago límite sea en
            septiembre.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 text-xs text-zinc-500">
          Menos
          <span className="h-3 w-3 rounded-sm bg-zinc-800" />
          <span className="h-3 w-3 rounded-sm bg-emerald-900" />
          <span className="h-3 w-3 rounded-sm bg-emerald-700" />
          <span className="h-3 w-3 rounded-sm bg-emerald-400" />
          Más
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {months.map((m) => {
          const { bg, text } = levelClasses(m.percentage);
          return (
            <button
              key={m.month}
              type="button"
              onClick={() => setSelected(m.month)}
              title={`${longLabel(m.month)}: ${m.uploadedCount}/${m.expectedCount}`}
              className={`flex h-8 w-10 items-center justify-center rounded-sm text-[11px] font-medium transition ${bg} ${text} ${
                selected === m.month
                  ? "ring-2 ring-white/80"
                  : "hover:ring-1 hover:ring-white/40"
              }`}
            >
              {shortLabel(m.month)}
            </button>
          );
        })}
      </div>

      {selectedData && (
        <div className="mt-5 border-t border-zinc-800 pt-4">
          <p className="text-sm font-medium text-zinc-200">
            {longLabel(selectedData.month)} — {selectedData.uploadedCount}/
            {selectedData.expectedCount}
            {selectedData.percentage !== null &&
              ` (${Math.round(selectedData.percentage * 100)}%)`}
          </p>
          <ul className="mt-2 flex flex-col gap-1.5 text-sm">
            {selectedData.accounts.map((a) => (
              <li key={a.accountId} className="flex items-center gap-2">
                <span
                  className={a.uploaded ? "text-emerald-400" : "text-zinc-600"}
                >
                  {a.uploaded ? "✓" : "○"}
                </span>
                <span
                  className={a.uploaded ? "text-zinc-200" : "text-zinc-500"}
                >
                  {a.issuer} — {a.productName}
                </span>
                {a.uploaded && a.periodEnd && (
                  <span className="text-xs text-zinc-500">
                    (corte {shortDate(a.periodEnd)}
                    {a.dueDate && `, pago límite ${shortDate(a.dueDate)}`})
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
