import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/get-user";
import { getMonthlyDashboardData } from "@/lib/dashboard/get-monthly-data";
import { NavBar } from "@/components/nav-bar";
import { DashboardTabs } from "@/components/dashboard/dashboard-tabs";

export default async function DashboardPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/login");
  }

  const data = await getMonthlyDashboardData();

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <NavBar userEmail={user.email} />
      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-6 flex items-baseline justify-between">
          <h1 className="text-xl font-bold">
            {data.monthLabel
              ? `Dashboard — ${data.monthLabel.slice(0, 7)}`
              : "Dashboard"}
          </h1>
        </div>
        <DashboardTabs data={data} />
      </main>
    </div>
  );
}
