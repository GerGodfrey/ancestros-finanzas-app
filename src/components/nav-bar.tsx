"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/upload", label: "Actualiza tu mes" },
  { href: "/dashboard/chat", label: "Chat" },
  { href: "/settings", label: "Configuración" },
] as const;

export function NavBar({ userEmail }: { userEmail?: string | null }) {
  const pathname = usePathname();

  return (
    <header className="border-b border-border bg-surface px-6">
      <div className="flex flex-wrap items-center justify-between gap-x-6">
        <div className="flex flex-wrap items-center gap-x-6">
          {/* A la hoja de Inicio, no al dashboard. El enlace «Dashboard» de
              al lado conserva el atajo para quien solo quiere sus datos. */}
          <Link
            href="/inicio"
            className="py-4 text-2xs font-semibold uppercase tracking-[0.11em] text-text transition-colors hover:text-text-muted"
          >
            Finanzas
          </Link>

          <nav className="flex flex-wrap items-center gap-x-1">
            {LINKS.map(({ href, label }) => {
              // Coincidencia exacta: /dashboard no debe marcarse activo
              // mientras estás en /dashboard/upload o /dashboard/chat.
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  // El -mb-px hace que el subrayado se monte sobre el borde
                  // del header en vez de flotar encima de él.
                  className={`-mb-px border-b-2 px-3 py-4 text-sm transition-colors ${
                    active
                      ? "border-accent font-medium text-text"
                      : "border-transparent text-text-muted hover:text-text"
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-4 py-3">
          {userEmail && (
            <span className="font-mono text-2xs text-text-faint">
              {userEmail}
            </span>
          )}
          <form action="/auth/signout" method="post">
            <Button type="submit" variant="ghost" size="sm">
              Cerrar sesión
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
