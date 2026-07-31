import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/get-user";
import { NavBar } from "@/components/nav-bar";
import { ProviderSettings } from "@/components/provider-settings";

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
        <p className="mt-2 text-sm text-zinc-400">
          Elige qué modelo de IA quieres usar para leer tus estados de cuenta
          y para el chatbot, y conecta tu propia API key.
        </p>
        <div className="mt-8">
          <ProviderSettings />
        </div>
      </main>
    </div>
  );
}
