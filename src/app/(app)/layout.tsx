import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/get-user";
import { NavBar } from "@/components/nav-bar";

/**
 * Todo lo autenticado cuelga de aquí. Antes, las cuatro páginas repetían a
 * mano el wrapper, el <NavBar/> y el `redirect` si no había sesión.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen flex-col bg-surface text-text">
      <NavBar userEmail={user.email} />
      {children}
    </div>
  );
}
