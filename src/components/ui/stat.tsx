import { TONE_RAIL, TONE_TEXT, type Tone } from "./tone";

/**
 * La cifra de un KPI. Va en Geist Mono con tabular-nums porque una columna de
 * montos tiene que alinear sus decimales; con la familia de interfaz no lo
 * hacía. El riel bajó de 4 px a 2 px y toma el color del tono, no el de la
 * marca: un riel de color siempre significa algo.
 */
export function Stat({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: Tone;
}) {
  return (
    <div
      className={`rounded border border-l-2 border-border bg-surface-raised p-4 ${TONE_RAIL[tone]}`}
    >
      <div className="text-2xs font-semibold uppercase tracking-[0.11em] text-text-faint">
        {label}
      </div>
      <div
        className={`mt-2 font-mono text-xl font-medium tabular-nums ${TONE_TEXT[tone]}`}
      >
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-text-faint">{sub}</div>}
    </div>
  );
}
