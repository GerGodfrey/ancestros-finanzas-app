import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { CREDENTIAL_UNREADABLE, tryDecryptSecret } from "@/lib/crypto";
import { regenerateMonthlySummary } from "@/lib/ai/monthly-insights";
import type { Provider } from "@/lib/ai/gateway";

// Regenera a mano los insights narrativos de un mes (botón "Regenerar
// análisis" del dashboard) — normalmente se disparan solos al parsear un
// statement, pero esto sirve para el primer backfill o para forzar un
// refresh sin tener que resubir un PDF.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const month = body.month as string | undefined;
  if (!month) {
    return NextResponse.json({ error: "month es requerido" }, { status: 400 });
  }

  const { data: credential, error: credentialError } = await supabase
    .from("provider_credentials")
    .select("provider, api_key_encrypted")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .single();

  if (credentialError || !credential) {
    return NextResponse.json(
      {
        error:
          "No tienes ningún proveedor de IA activo. Ve a Configuración y agrega una API key.",
      },
      { status: 400 },
    );
  }
  const apiKey = tryDecryptSecret(credential.api_key_encrypted);
  if (!apiKey) {
    return NextResponse.json({ error: CREDENTIAL_UNREADABLE }, { status: 409 });
  }


  try {
    const summary = await regenerateMonthlySummary({
      supabase,
      userId: user.id,
      provider: credential.provider as Provider,
      apiKey,
      month,
    });
    return NextResponse.json({
      ok: true,
      insights: summary.insights,
      recommendations: summary.recommendations,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: `No se pudo generar el análisis: ${err instanceof Error ? err.message : "error desconocido"}`,
      },
      { status: 500 },
    );
  }
}
