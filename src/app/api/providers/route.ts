import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encryptSecret, decryptSecret, maskApiKey } from "@/lib/crypto";
import { verifyApiKey, type Provider } from "@/lib/ai/gateway";

const VALID_PROVIDERS: Provider[] = [
  "anthropic",
  "openai",
  "gemini",
  "deepseek",
];

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("provider_credentials")
    .select(
      "id, provider, api_key_encrypted, is_active, orchestrator_enabled, created_at",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const providers = (data ?? []).map((row) => ({
    id: row.id,
    provider: row.provider,
    isActive: row.is_active,
    orchestratorEnabled: row.orchestrator_enabled,
    createdAt: row.created_at,
    maskedKey: maskApiKey(decryptSecret(row.api_key_encrypted)),
  }));

  return NextResponse.json({ providers });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = await request.json();
  const provider = body.provider as Provider;
  const apiKey = (body.apiKey as string | undefined)?.trim();
  const orchestratorEnabled = Boolean(body.orchestratorEnabled);

  if (!VALID_PROVIDERS.includes(provider) || !apiKey) {
    return NextResponse.json(
      { error: "provider y apiKey son requeridos" },
      { status: 400 },
    );
  }

  const verification = await verifyApiKey(provider, apiKey);
  if (!verification.ok) {
    return NextResponse.json(
      { error: `No se pudo validar la API key: ${verification.error}` },
      { status: 400 },
    );
  }

  // Por ahora solo un proveedor activo a la vez (el modo orquestador que
  // combina varios se construye en una fase posterior sobre esta misma tabla).
  await supabase
    .from("provider_credentials")
    .update({ is_active: false })
    .eq("user_id", user.id);

  const { error } = await supabase.from("provider_credentials").upsert(
    {
      user_id: user.id,
      provider,
      api_key_encrypted: encryptSecret(apiKey),
      is_active: true,
      orchestrator_enabled: orchestratorEnabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,provider" },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id requerido" }, { status: 400 });
  }

  const { error } = await supabase
    .from("provider_credentials")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
