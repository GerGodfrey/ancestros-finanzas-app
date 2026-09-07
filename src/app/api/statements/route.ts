import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isOwnedStatementPath } from "@/lib/storage-path";

// Se llama después de que el archivo YA se subió a Supabase Storage desde el
// navegador (bucket "statements", ruta statements/{user_id}/...). Aquí solo
// se registra la fila en la tabla `statements` con estado "pending".
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = await request.json();
  const accountId = body.accountId as string | undefined;
  const filePath = body.filePath as string | undefined;

  if (!accountId || !filePath) {
    return NextResponse.json(
      { error: "accountId y filePath son requeridos" },
      { status: 400 },
    );
  }

  // El filePath lo elige el cliente: sin esto, cualquiera puede registrar una
  // fila propia apuntando al PDF de otro usuario (ver `storage-path.ts`).
  if (!isOwnedStatementPath(filePath, user.id)) {
    return NextResponse.json(
      { error: "Ruta de archivo inválida" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("statements")
    .insert({
      user_id: user.id,
      account_id: accountId,
      file_path: filePath,
      status: "pending",
    })
    .select("id, status, uploaded_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ statement: data });
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("statements")
    .select(
      "id, account_id, status, period_start, period_end, due_date, payment_no_interest, uploaded_at, parsed_at",
    )
    .eq("user_id", user.id)
    .order("uploaded_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ statements: data });
}
