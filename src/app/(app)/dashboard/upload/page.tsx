import Link from "next/link";
import { getUploadCoverage } from "@/lib/dashboard/get-upload-coverage";
import { currentMonthFirstDay, monthLongLabel } from "@/lib/month";
import { StatementUpload } from "@/components/statement-upload";
import { BudgetQuickAdd } from "@/components/dashboard/budget-quick-add";
import { PendingThisMonth } from "@/components/upload/pending-this-month";
import { UploadHistoryHeatmap } from "@/components/upload/upload-history-heatmap";
import { Panel } from "@/components/ui";

// Esta hoja dejó de ser «Subir PDF» para ser «Actualiza tu mes»: además del
// estado de cuenta, aquí se capturan ingresos, costos fijos y deudas. Ese
// formulario vivía enterrado en la pestaña Desglose del dashboard, donde los
// usuarios no lo encontraban — y sin ingresos el balance solo muestra gastos.
export default async function ActualizaTuMesPage() {
  const coverage = await getUploadCoverage();
  const month = currentMonthFirstDay();

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-section">
      <h1 className="font-display text-2xl font-light tracking-tight">
        Actualiza tu mes
      </h1>
      <p className="mt-tight max-w-[62ch] text-sm leading-relaxed text-text-muted">
        Dos cosas cada mes: el PDF de tus tarjetas, y el dinero que no pasa por
        ellas — tu sueldo, la renta, lo que debes.
      </p>

      <section className="mt-section">
        <h2 className="text-2xs font-semibold uppercase tracking-[0.11em] text-text-faint">
          1 · Estado de cuenta
        </h2>

        <div className="mt-block">
          <PendingThisMonth data={coverage.highlightMonth} />
        </div>

        <div className="mt-block">
          <StatementUpload />
        </div>
      </section>

      {/* `id` + `scroll-mt`: los avisos del dashboard enlazan aquí directo, y
          sin el margen el título quedaría pegado al borde superior. */}
      <section
        id="ingresos"
        className="mt-section scroll-mt-8 border-t border-border pt-section"
      >
        <h2 className="text-2xs font-semibold uppercase tracking-[0.11em] text-text-faint">
          2 · Ingresos, costos fijos y deudas
        </h2>
        <p className="mt-tight max-w-[62ch] text-sm leading-relaxed text-text-muted">
          Tu sueldo y tus gastos recurrentes no vienen en el estado de cuenta,
          así que van a mano. Sin ellos, el balance de tu dashboard solo muestra
          lo que gastaste — nunca lo que te quedó.
        </p>
        <div className="mt-block">
          <Panel title={`Agregar a ${monthLongLabel(month)}`}>
            <BudgetQuickAdd month={month} />
          </Panel>
        </div>
      </section>

      <section className="mt-section border-t border-border pt-section">
        <h2 className="text-2xs font-semibold uppercase tracking-[0.11em] text-text-faint">
          Historial
        </h2>
        <div className="mt-block">
          <UploadHistoryHeatmap
            months={coverage.months}
            defaultSelectedMonth={coverage.highlightMonth?.month}
          />
        </div>
      </section>

      <p className="mt-section text-xs text-text-faint">
        ¿Buscas el detalle de lo que ya registraste?{" "}
        <Link
          href="/dashboard"
          className="text-accent underline underline-offset-2"
        >
          Está en tu dashboard, en Desglose
        </Link>
        .
      </p>
    </main>
  );
}
