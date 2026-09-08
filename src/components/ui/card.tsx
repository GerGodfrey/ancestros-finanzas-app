import type { HTMLAttributes, ReactNode } from "react";

/** La superficie elevada. Estaba copiada en 11 archivos. */
export function Card({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded border border-border bg-surface-raised ${className}`}
      {...props}
    />
  );
}

/**
 * Card con encabezado. El título va en versalitas y a --text-2xs: se lee como
 * etiqueta y no compite con los datos que enmarca, que es lo que pide el modo
 * Operate. El riel toma el acento — nunca el color de un tono, para que un
 * riel de color siempre signifique algo.
 */
export function Panel({
  title,
  emoji,
  children,
  className = "",
}: {
  title: string;
  emoji?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={`p-5 ${className}`}>
      <h2 className="mb-4 flex items-center gap-2 text-2xs font-semibold uppercase tracking-[0.11em] text-text-muted">
        <span aria-hidden="true" className="h-3 w-0.5 bg-accent" />
        {emoji && <span aria-hidden="true">{emoji}</span>}
        {title}
      </h2>
      {children}
    </Card>
  );
}
