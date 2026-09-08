import Link from "next/link";

export function NavBar({ userEmail }: { userEmail?: string | null }) {
  return (
    <header className="flex items-center justify-between border-b border-border bg-surface px-6 py-4 text-text">
      <div className="flex items-center gap-6">
        <span className="text-sm font-bold tracking-tight">Finanzas</span>
        <nav className="flex items-center gap-4 text-sm text-text-muted">
          <Link href="/dashboard" className="transition hover:text-text">
            Dashboard
          </Link>
          <Link
            href="/dashboard/upload"
            className="transition hover:text-text"
          >
            Subir PDF
          </Link>
          <Link
            href="/dashboard/chat"
            className="transition hover:text-text"
          >
            Chat
          </Link>
          <Link href="/settings" className="transition hover:text-text">
            Configuración
          </Link>
        </nav>
      </div>
      <div className="flex items-center gap-4">
        {userEmail && (
          <span className="text-xs text-text-faint">{userEmail}</span>
        )}
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="rounded-md border border-border px-3 py-1.5 text-xs text-text-muted transition hover:bg-surface-raised"
          >
            Cerrar sesión
          </button>
        </form>
      </div>
    </header>
  );
}
