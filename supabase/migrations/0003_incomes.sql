-- incomes: ingresos capturados por el usuario (nómina, recuperaciones de
-- familiares/terceros, etc.). Los PDFs de tarjetas no traen esta
-- información — es el equivalente a lo que antes se llevaba a mano en la
-- hoja "cuenta_personal".

create table public.incomes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  concept text not null,
  amount numeric not null,
  month date not null,           -- primer día del mes al que aplica
  created_at timestamptz not null default now()
);

alter table public.incomes enable row level security;

create policy "incomes: owner full access"
  on public.incomes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index incomes_user_month_idx on public.incomes (user_id, month);
create index fixed_costs_user_month_idx on public.fixed_costs (user_id, month);
