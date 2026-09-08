import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { CREDENTIAL_UNREADABLE, tryDecryptSecret } from "@/lib/crypto";
import { cleanDescriptionsInBatches } from "@/lib/ai/clean-descriptions";
import type { Provider } from "@/lib/ai/gateway";

// Backfill manual: limpia la descripción de transacciones que ya existen en
// la BD y todavía no pasaron por limpieza (statements parseados antes de
// que el Skill empezara a limpiarla). No re-lee el PDF, solo reescribe el
// texto ya guardado.
const BATCH_LIMIT = 300;

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { data: pending, error: pendingError } = await supabase
    .from("transactions")
    .select("id, description")
    .eq("user_id", user.id)
    .eq("description_cleaned", false)
    .limit(BATCH_LIMIT);

  if (pendingError) {
    return NextResponse.json({ error: pendingError.message }, { status: 500 });
  }
  if (!pending || pending.length === 0) {
    return NextResponse.json({ ok: true, cleaned: 0 });
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

  const { descriptionById, errors } = await cleanDescriptionsInBatches({
    provider: credential.provider as Provider,
    apiKey,
    transactions: pending.map((t) => ({ id: t.id, description: t.description })),
  });

  const updates = Array.from(descriptionById.entries()).map(([id, description]) =>
    supabase
      .from("transactions")
      .update({ description, description_cleaned: true })
      .eq("id", id)
      .eq("user_id", user.id),
  );
  await Promise.all(updates);

  if (descriptionById.size === 0 && errors.length > 0) {
    return NextResponse.json(
      { error: `No se pudo limpiar: ${errors[0]}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    cleaned: descriptionById.size,
    pending: pending.length - descriptionById.size,
    errors,
  });
}
