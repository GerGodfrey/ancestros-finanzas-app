import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("accounts")
    .select("id, issuer, product_name, last4, credit_limit, active")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ accounts: data });
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
  const issuer = (body.issuer as string | undefined)?.trim();
  const productName = (body.productName as string | undefined)?.trim();

  if (!issuer || !productName) {
    return NextResponse.json(
      { error: "issuer y productName son requeridos" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("accounts")
    .insert({
      user_id: user.id,
      issuer,
      product_name: productName,
      last4: body.last4 ?? null,
      credit_limit: body.creditLimit ?? null,
    })
    .select("id, issuer, product_name, last4, credit_limit, active")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ account: data });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = await request.json();
  const id = body.id as string | undefined;
  if (!id) {
    return NextResponse.json({ error: "id es requerido" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (typeof body.issuer === "string") update.issuer = body.issuer.trim();
  if (typeof body.productName === "string")
    update.product_name = body.productName.trim();
  if ("last4" in body) update.last4 = body.last4 || null;
  if ("creditLimit" in body) update.credit_limit = body.creditLimit ?? null;
  if (typeof body.active === "boolean") update.active = body.active;

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { error: "No hay campos para actualizar" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("accounts")
    .update(update)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, issuer, product_name, last4, credit_limit, active")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ account: data });
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
    .from("accounts")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
