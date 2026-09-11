import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Un hueco: un espacio del producto que todavía no se ocupa.
 *
 * **No es una caja.** El dashboard ya es una pila de rectángulos —insignia,
 * pestañas, KPIs, insights, gráficas— y añadir otro contenedor no crea una
 * categoría nueva, solo alarga la pila. Por eso el hueco vive *dentro* del
 * elemento al que le falta el dato, separado por un punteado.
 *
 * **Se ve siempre.** La primera versión escondía el escarlata detrás del hover
 * y pasaba desapercibida: quien no paseaba el cursor por ahí nunca se enteraba
 * de que su balance estaba mintiendo. Y en celular no hay cursor. El estado
 * pasa a ser uno solo y permanente: la etiqueta «Sin uso» y la acción, las dos
 * a la vista sin que haya que descubrir nada.
 *
 * El escarlata (`--action`, no el `--negative` del dinero) se concentra en la
 * etiqueta «Sin uso» y en nada más. La acción va en blanco y negritas: dos
 * cosas en escarlata dentro de la misma caja se reparten la atención en vez de
 * sumarla, y la que tiene que ganar es la etiqueta. Ver docs/design-system.md.
 */
export function EmptySlot({
  href,
  action,
  children,
}: {
  href: string;
  /** Qué se puede hacer. Redactado como instrucción, no como etiqueta. */
  action: string;
  /** La consecuencia de que falte. */
  children?: ReactNode;
}) {
  return (
    <div className="mt-2">
      <Link
        href={href}
        className="text-xs font-semibold text-text underline-offset-4 outline-none hover:underline focus-visible:underline"
      >
        {action}
      </Link>
      {children && (
        <p className="mt-1 text-2xs leading-relaxed text-text-faint">
          {children}
        </p>
      )}
    </div>
  );
}

/** La etiqueta «Sin uso» que acompaña al riel escarlata en la cabecera del KPI. */
export function EmptySlotTag() {
  return (
    <span className="text-2xs font-semibold uppercase tracking-[0.11em] text-action">
      Sin uso
    </span>
  );
}
