import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Recibe el redirect de Google OAuth con el ?code=..., lo intercambia por una
// sesión de Supabase y manda al usuario al dashboard.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
