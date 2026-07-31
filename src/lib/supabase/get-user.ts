import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Envuelve auth.getUser() en try/catch: si Supabase no responde (red caída,
// URL mal configurada, etc.) tratamos al usuario como no autenticado en vez
// de tronar la página con un error 500. Fail closed, no fail loud.
export async function getSessionUser(): Promise<User | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error) return null;
    return data.user;
  } catch {
    return null;
  }
}
