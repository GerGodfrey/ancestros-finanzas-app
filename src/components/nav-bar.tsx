import Link from "next/link";

export function NavBar({ userEmail }: { userEmail?: string | null }) {
  return (
    <header className="flex items-center justify-between border-b border-zinc-800 bg-zinc-950 px-6 py-4 text-zinc-100">
      <div className="flex items-center gap-6">
        <span className="text-sm font-bold tracking-tight">Finanzas</span>
        <nav className="flex items-center gap-4 text-sm text-zinc-400">
          <Link href="/dashboard" className="transition hover:text-zinc-100">
            Dashboard
          </Link>
          <Link
            href="/dashboard/upload"
            className="transition hover:text-zinc-100"
          >
            Subir PDF
          </Link>
          <Link href="/settings" className="transition hover:text-zinc-100">
            Configuración
          </Link>
        </nav>
      </div>
      <div className="flex items-center gap-4">
        {userEmail && (
          <span className="text-xs text-zinc-500">{userEmail}</span>
        )}
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="rounded-md border border-zinc-800 px-3 py-1.5 text-xs text-zinc-300 transition hover:bg-zinc-900"
          >
            Cerrar sesión
          </button>
        </form>
      </div>
    </header>
  );
}
