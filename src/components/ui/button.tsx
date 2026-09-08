import type { ButtonHTMLAttributes } from "react";

// El botón primario estaba copiado a mano en 10 archivos como
// `bg-text text-surface`. Eso funcionaba mientras la app era solo oscura;
// en Papel quedaba blanco sobre blanco. Ahora invierte la tinta, que es el
// gesto de la dirección suiza y se resuelve solo en los dos temas.

type Variant = "primary" | "ghost" | "danger";
type Size = "sm" | "md";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded font-semibold " +
  "transition-colors disabled:cursor-not-allowed disabled:opacity-50";

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-text text-surface hover:bg-text-muted",
  ghost:
    "border border-border text-text-muted hover:border-border-strong hover:text-text",
  danger:
    "border border-negative/40 bg-negative/10 text-negative hover:bg-negative/20",
};

const SIZE: Record<Size, string> = {
  sm: "px-2.5 py-1 text-2xs uppercase tracking-[0.06em]",
  md: "px-4 py-2 text-xs uppercase tracking-[0.06em]",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`${BASE} ${VARIANT[variant]} ${SIZE[size]} ${className}`}
      {...props}
    />
  );
}
