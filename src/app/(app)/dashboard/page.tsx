import { getMonthlyDashboardData } from "@/lib/dashboard/get-monthly-data";
import { getSetupState } from "@/lib/dashboard/get-setup-state";
import { DashboardTabs } from "@/components/dashboard/dashboard-tabs";
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist";
import { MonthNav } from "@/components/dashboard/month-nav";
import { Badge } from "@/components/ui";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month } = await searchParams;
  const targetMonth =
    month && /^\d{4}-\d{2}$/.test(month) ? `${month}-01` : undefined;

  // Las dos consultas son independientes; en paralelo para no sumar latencia.
  const [data, setup] = await Promise.all([
    getMonthlyDashboardData(targetMonth),
    getSetupState(),
  ]);

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-section">
      <div className="mb-block flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <h1 className="font-display text-2xl font-light tracking-tight">
            {data.monthLabel
              ? `Dashboard — ${data.monthLabel.slice(0, 7)}`
              : "Dashboard"}
          </h1>
          {data.monthLabel && (
            <MonthNav
              availableMonths={data.availableMonths}
              currentMonth={data.monthLabel.slice(0, 7)}
            />
          )}
        </div>
        {data.statusBadge && (
          <Badge tone={data.statusBadge.tone === "bad" ? "bad" : "good"}>
            {data.statusBadge.text}
          </Badge>
        )}
      </div>
      {/*
        Mientras falte alguno de los tres pasos, el checklist reemplaza a las
        pestañas: un dashboard vacío no orienta, y un usuario nuevo llega aquí
        sin saber por dónde empezar. Cuando los tres están hechos, desaparece.
      */}
      {setup.complete ? (
        <DashboardTabs data={data} />
      ) : (
        <OnboardingChecklist state={setup} />
      )}
    </main>
  );
}
