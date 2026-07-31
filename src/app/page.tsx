import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/get-user";

export default async function RootPage() {
  const user = await getSessionUser();
  redirect(user ? "/dashboard" : "/login");
}
