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
// Rampa de cobertura. Se expresa como opacidad sobre --positive en vez de
// tonos fijos de emerald: así el orden perceptual (más lleno = más intenso)
// se mantiene sobre papel y sobre negro. Con emerald-900 fijo, en Papel el
// sentido se invertía — el paso "casi vacío" quedaba más oscuro que el lleno.
function levelClasses(percentage: number | null): { bg: string; text: string } {
  if (percentage === null)
    return { bg: "border border-border bg-surface-raised", text: "text-text-faint" };
  if (percentage === 0)
    return { bg: "bg-surface-raised-2", text: "text-text-faint" };
  if (percentage < 0.5)
    return { bg: "bg-positive/25", text: "text-positive" };
  if (percentage < 1)
    return { bg: "bg-positive/55", text: "text-text" };
  return { bg: "bg-positive", text: "text-surface" };
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
    <div className="rounded-lg border border-border bg-surface-raised p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-2xs font-semibold uppercase tracking-[0.11em] text-text-faint">
            Historial de estados de cuenta subidos
          </h2>
          <p className="mt-tight max-w-[62ch] text-xs leading-relaxed text-text-muted">
            Cada mes cuenta según la fecha de corte del PDF, no la fecha
            límite de pago ni la fecha en que lo subiste — un corte del 22 de
            agosto cuenta para agosto, aunque su pago límite sea en
            septiembre.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 text-xs text-text-faint">
          Menos
          <span className="h-3 w-3 rounded-sm bg-surface-raised-2" />
          <span className="h-3 w-3 rounded-sm bg-positive/25" />
          <span className="h-3 w-3 rounded-sm bg-positive/55" />
          <span className="h-3 w-3 rounded-sm bg-positive" />
          Más
        </div>
      </div>

      <div className="mt-block flex flex-wrap gap-1.5">
        {months.map((m) => {
          const { bg, text } = levelClasses(m.percentage);
          return (
            <button
              key={m.month}
              type="button"
              onClick={() => setSelected(m.month)}
              title={`${longLabel(m.month)}: ${m.uploadedCount}/${m.expectedCount}`}
              className={`flex h-8 w-10 items-center justify-center rounded-sm text-2xs font-medium transition ${bg} ${text} ${
                selected === m.month
                  ? "ring-2 ring-accent"
                  : "hover:ring-1 hover:ring-border-strong"
              }`}
            >
              {shortLabel(m.month)}
            </button>
          );
        })}
      </div>

      {selectedData && (
        <div className="mt-block border-t border-border pt-block">
          <p className="text-sm font-medium text-text">
            {longLabel(selectedData.month)} — {selectedData.uploadedCount}/
            {selectedData.expectedCount}
            {selectedData.percentage !== null &&
              ` (${Math.round(selectedData.percentage * 100)}%)`}
          </p>
          <ul className="mt-2 flex flex-col gap-1.5 text-sm">
            {selectedData.accounts.map((a) => (
              <li key={a.accountId} className="flex items-center gap-2">
                <span
                  className={a.uploaded ? "text-positive" : "text-text-faint"}
                >
                  {a.uploaded ? "✓" : "○"}
                </span>
                <span
                  className={a.uploaded ? "text-text" : "text-text-faint"}
                >
                  {a.issuer} — {a.productName}
                </span>
                {a.uploaded && a.periodEnd && (
                  <span className="text-xs text-text-faint">
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
