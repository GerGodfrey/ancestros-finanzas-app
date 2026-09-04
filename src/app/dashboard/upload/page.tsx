import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/get-user";
import { getUploadCoverage } from "@/lib/dashboard/get-upload-coverage";
import { NavBar } from "@/components/nav-bar";
import { StatementUpload } from "@/components/statement-upload";
import { PendingThisMonth } from "@/components/upload/pending-this-month";
import { UploadHistoryHeatmap } from "@/components/upload/upload-history-heatmap";

export default async function UploadPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/login");
  }

  const coverage = await getUploadCoverage();

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <NavBar userEmail={user.email} />
      <main className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="text-xl font-bold">Subir estado de cuenta</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Sube el PDF de tu tarjeta; se lee automáticamente con el proveedor
          de IA que tengas configurado en Configuración.
        </p>

        <div className="mt-6">
          <PendingThisMonth data={coverage.highlightMonth} />
        </div>

        <div className="mt-8">
          <StatementUpload />
        </div>

        <div className="mt-10">
          <UploadHistoryHeatmap
            months={coverage.months}
            defaultSelectedMonth={coverage.highlightMonth?.month}
          />
        </div>
      </main>
    </div>
  );
}
