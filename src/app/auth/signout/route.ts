import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  // 303 y no el 307 que `NextResponse.redirect` usa por defecto: el 307
  // preserva el método, así que el navegador repetía el POST contra /login
  // —que es una página y no lo acepta— y salía un 405 en pantalla. El 303
  // existe justamente para esto: "tu POST se procesó, ahora ve allá con GET".
  return NextResponse.redirect(new URL("/login", request.url), 303);
}
