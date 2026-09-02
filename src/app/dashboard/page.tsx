import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/get-user";
import { getMonthlyDashboardData } from "@/lib/dashboard/get-monthly-data";
import { NavBar } from "@/components/nav-bar";
import { DashboardTabs } from "@/components/dashboard/dashboard-tabs";
import { MonthNav } from "@/components/dashboard/month-nav";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const user = await getSessionUser();

  if (!user) {
    redirect("/login");
  }

  const { month } = await searchParams;
  const targetMonth =
    month && /^\d{4}-\d{2}$/.test(month) ? `${month}-01` : undefined;

  const data = await getMonthlyDashboardData(targetMonth);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <NavBar userEmail={user.email} />
      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4">
            <h1 className="text-xl font-bold">
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
            <span
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                data.statusBadge.tone === "bad"
                  ? "border-red-700/40 bg-red-950/30 text-red-300"
                  : "border-emerald-700/40 bg-emerald-950/30 text-emerald-300"
              }`}
            >
              {data.statusBadge.text}
            </span>
          )}
        </div>
        <DashboardTabs data={data} />
      </main>
    </div>
  );
}
