import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NavBar } from "@/components/nav-bar";
import { StatementUpload } from "@/components/statement-upload";

export default async function UploadPage() {
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
      <main className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="text-xl font-bold">Subir estado de cuenta</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Sube el PDF de tu tarjeta; se lee automáticamente con el proveedor
          de IA que tengas configurado en Configuración.
        </p>
        <div className="mt-8">
          <StatementUpload />
        </div>
      </main>
    </div>
  );
}
