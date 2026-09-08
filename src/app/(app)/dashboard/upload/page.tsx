import { getUploadCoverage } from "@/lib/dashboard/get-upload-coverage";
import { StatementUpload } from "@/components/statement-upload";
import { PendingThisMonth } from "@/components/upload/pending-this-month";
import { UploadHistoryHeatmap } from "@/components/upload/upload-history-heatmap";

export default async function UploadPage() {
  const coverage = await getUploadCoverage();

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-section">
      <h1 className="font-display text-2xl font-light tracking-tight">
        Subir estado de cuenta
      </h1>
      <p className="mt-tight max-w-[62ch] text-sm leading-relaxed text-text-muted">
        Sube el PDF de tu tarjeta; se lee automáticamente con el proveedor de IA
        que tengas configurado en Configuración.
      </p>

      <div className="mt-section">
        <PendingThisMonth data={coverage.highlightMonth} />
      </div>

      <div className="mt-block">
        <StatementUpload />
      </div>

      <div className="mt-section">
        <UploadHistoryHeatmap
          months={coverage.months}
          defaultSelectedMonth={coverage.highlightMonth?.month}
        />
      </div>
    </main>
  );
}
