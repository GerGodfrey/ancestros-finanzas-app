import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/get-user";
import { NavBar } from "@/components/nav-bar";
import { ProviderSettings } from "@/components/provider-settings";
import { AccountSettings } from "@/components/account-settings";

export default async function SettingsPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <NavBar userEmail={user.email} />
      <main className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="text-xl font-bold">Configuración de cuenta</h1>

        <section className="mt-10">
          <h2 className="text-lg font-semibold">Tarjetas</h2>
          <p className="mt-2 text-sm text-zinc-400">
            Edita el nombre de tus tarjetas, agrega nuevas o elimínalas.
            Eliminar una tarjeta borra también sus estados de cuenta y
            transacciones asociadas.
          </p>
          <div className="mt-6">
            <AccountSettings />
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-lg font-semibold">Proveedores de IA</h2>
          <p className="mt-2 text-sm text-zinc-400">
            Elige qué modelo de IA quieres usar para leer tus estados de
            cuenta y para el chatbot, y conecta tu propia API key.
          </p>
          <div className="mt-6">
            <ProviderSettings />
          </div>
        </section>
      </main>
    </div>
  );
}
