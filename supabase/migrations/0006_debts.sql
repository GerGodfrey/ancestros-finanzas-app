-- debts: deudas familiares / de largo plazo capturadas a mano (préstamos de
-- cripto, dinero prestado a/por familiares, etc.). A diferencia de
-- fixed_costs, esto NO es un gasto recurrente del mes — es un saldo
-- pendiente que normalmente no se paga ese mes, así que NO se resta del
-- balance mensual. Solo se muestra como referencia en el panel "Panorama de
-- Deudas" del dashboard, junto con la deuda de MSI de las tarjetas.

create table public.debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  concept text not null,
  amount numeric not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.debts enable row level security;

create policy "debts: owner full access"
  on public.debts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index debts_user_idx on public.debts (user_id);
