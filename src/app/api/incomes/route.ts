import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month"); // 'YYYY-MM-01'

  let query = supabase
    .from("incomes")
    .select("id, concept, amount, month, is_recurring")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (month) query = query.eq("month", month);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ incomes: data });
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
  const concept = (body.concept as string | undefined)?.trim();
  const amount = Number(body.amount);
  const month = body.month as string | undefined;
  const isRecurring = Boolean(body.isRecurring);

  if (!concept || !amount || !month) {
    return NextResponse.json(
      { error: "concept, amount y month son requeridos" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("incomes")
    .insert({ user_id: user.id, concept, amount, month, is_recurring: isRecurring })
    .select("id, concept, amount, month, is_recurring")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ income: data });
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
    .from("incomes")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
