import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NavBar } from "@/components/nav-bar";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <NavBar userEmail={user.email} />
      <main className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-xl font-bold">Resumen del mes</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Todavía no has subido ningún estado de cuenta. Sube tus PDFs para
          ver aquí tu dashboard (Resumen, Desglose, Movimientos Relevantes,
          Próximo Mes, Conciliación).
        </p>
      </main>
    </div>
  );
}
