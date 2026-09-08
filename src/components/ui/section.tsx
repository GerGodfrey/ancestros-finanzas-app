import type { ReactNode } from "react";

/**
 * Sección de una página de ajustes: título, explicación y contenido, con una
 * regla arriba que la separa de la anterior.
 *
 * La regla no es adorno. En una página que es casi puro texto no hay cards que
 * agrupen —como sí las hay en el dashboard—, así que sin una línea el ojo no
 * sabe dónde termina una sección y empieza la siguiente.
 */
export function PageSection({
  id,
  title,
  description,
  children,
  first = false,
}: {
  /** Ancla para enlazar a esta sección desde otra página (/settings#tarjetas). */
  id?: string;
  title: string;
  description?: string;
  children: ReactNode;
  first?: boolean;
}) {
  return (
    <section
      id={id}
      // Para que el título no quede pegado al borde superior al llegar por ancla.
      className={
        first
          ? "mt-block scroll-mt-8"
          : "mt-section scroll-mt-8 border-t border-border pt-section"
      }
    >
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {description && (
        <p className="mt-tight max-w-[62ch] text-sm leading-relaxed text-text-muted">
          {description}
        </p>
      )}
      <div className="mt-block">{children}</div>
    </section>
  );
}

/**
 * Subtítulo dentro de una sección. En versalitas, para que se lea como
 * etiqueta de bloque y no compita con el <h2> de la sección.
 */
export function FieldGroup({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <h3 className="text-2xs font-semibold uppercase tracking-[0.11em] text-text-faint">
        {label}
      </h3>
      <div className="mt-tight">{children}</div>
    </div>
  );
}
