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
