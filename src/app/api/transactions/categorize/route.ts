import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decryptSecret } from "@/lib/crypto";
import { categorizeTransactionsInBatches } from "@/lib/ai/categorize-transactions";
import type { Provider } from "@/lib/ai/gateway";

// Backfill manual: categoriza las transacciones que ya existen en la BD y
// todavía no tienen `category` (statements parseados antes de que el Skill
// empezara a asignarla, o algún caso donde el modelo no la pudo asignar).
// No re-lee el PDF, solo usa descripción/monto/tipo ya guardados.
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
    .select("id, description, amount, type")
    .eq("user_id", user.id)
    .is("category", null)
    .limit(BATCH_LIMIT);

  if (pendingError) {
    return NextResponse.json({ error: pendingError.message }, { status: 500 });
  }
  if (!pending || pending.length === 0) {
    return NextResponse.json({ ok: true, categorized: 0 });
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

  const { categoryById, errors } = await categorizeTransactionsInBatches({
    provider: credential.provider as Provider,
    apiKey: decryptSecret(credential.api_key_encrypted),
    transactions: pending.map((t) => ({
      id: t.id,
      description: t.description,
      amount: Number(t.amount),
      type: t.type,
    })),
  });

  const updates = Array.from(categoryById.entries()).map(([id, category]) =>
    supabase.from("transactions").update({ category }).eq("id", id).eq("user_id", user.id),
  );
  await Promise.all(updates);

  if (categoryById.size === 0 && errors.length > 0) {
    return NextResponse.json(
      { error: `No se pudo categorizar: ${errors[0]}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    categorized: categoryById.size,
    pending: pending.length - categoryById.size,
    errors,
  });
}
