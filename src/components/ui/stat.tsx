import type { ReactNode } from "react";
import { EmptySlotTag } from "./empty-slot";
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
  slot,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: Tone;
  /** Un `<EmptySlot/>` cuando a esta cifra le falta un dato para ser cierta. */
  slot?: ReactNode;
}) {
  return (
    <div
      // Sin el dato, el riel se apaga en vez de ponerse escarlata. Probado en
      // contexto: un riel escarlata cae junto a los rojos de Egreso y Balance,
      // y a un metro la fila entera se lee como "tres tarjetas en rojo" — la
      // señal se pierde justo donde debía distinguir. En gris la tarjeta se lee
      // apagada, que es lo que es, y el escarlata de adentro queda como el
      // único color caliente de la fila.
      className={`rounded border border-l-2 border-border bg-surface-raised p-4 ${slot ? "border-l-border-strong" : TONE_RAIL[tone]}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-2xs font-semibold uppercase tracking-[0.11em] text-text-faint">
          {label}
        </span>
        {slot && <EmptySlotTag />}
      </div>
      <div
        // Con un hueco debajo, la cifra todavía no es cierta: un "$0.00" en
        // verde afirma "no entró nada y está bien", cuando lo que pasa es que
        // falta el dato. Mientras haya hueco el número se queda en neutro; el
        // color del dinero vuelve cuando hay algo que colorear.
        className={`mt-2 font-mono text-xl font-medium tabular-nums ${slot ? TONE_TEXT.neutral : TONE_TEXT[tone]}`}
      >
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-text-faint">{sub}</div>}
      {slot}
    </div>
  );
}
