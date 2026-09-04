-- Finanzas webapp — esquema inicial
-- Todas las tablas de datos de usuario llevan user_id y quedan protegidas con RLS
-- (auth.uid() = user_id). Ver docs/architecture.md y docs/database-design.md
-- para el contexto completo del diseño.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles: 1:1 con auth.users
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: user reads/writes own row"
  on public.profiles for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Crea automáticamente el profile al primer login (Google OAuth vía Supabase Auth)
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------------------
-- accounts: las tarjetas del usuario
-- ---------------------------------------------------------------------------
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  issuer text not null,          -- ej. 'Banamex', 'American Express', 'Palacio de Hierro'
  product_name text not null,    -- ej. 'Explora', 'Platinum', 'Palacio'
  last4 text,
  credit_limit numeric,
  rate_ordinaria numeric,        -- tasa anual, ej. 55.53
  rate_moratoria numeric,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.accounts enable row level security;

create policy "accounts: owner full access"
  on public.accounts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- statements: cada PDF subido
-- ---------------------------------------------------------------------------
create table public.statements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  file_path text not null,       -- ruta en Supabase Storage
  period_start date,
  period_end date,
  cut_date date,
  due_date date,
  previous_balance numeric,
  new_charges numeric,
  payment_no_interest numeric,
  payment_minimum numeric,
  interest_charged numeric not null default 0,
  iva_interest numeric not null default 0,
  status text not null default 'pending'
    check (status in ('pending', 'parsed', 'error')),
  raw_extraction jsonb,          -- salida cruda del Skill de parseo, para auditoría/debug
  uploaded_at timestamptz not null default now(),
  parsed_at timestamptz
);

alter table public.statements enable row level security;

create policy "statements: owner full access"
  on public.statements for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index statements_account_period_idx
  on public.statements (account_id, period_end desc);

-- ---------------------------------------------------------------------------
-- msi_plans: planes a meses sin intereses activos
-- ---------------------------------------------------------------------------
create table public.msi_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  concept text not null,
  original_amount numeric not null,
  monthly_payment numeric not null,
  total_installments int,
  installments_paid int not null default 0,
  first_statement_id uuid references public.statements (id),
  status text not null default 'active' check (status in ('active', 'finished')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.msi_plans enable row level security;

create policy "msi_plans: owner full access"
  on public.msi_plans for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- transactions: cada movimiento de cada statement
-- ---------------------------------------------------------------------------
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  statement_id uuid not null references public.statements (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  tx_date date not null,
  description text not null,
  amount numeric not null,
  type text not null
    check (type in ('regular', 'msi', 'interest', 'fee', 'payment')),
  msi_plan_id uuid references public.msi_plans (id),
  category text,
  created_at timestamptz not null default now()
);

alter table public.transactions enable row level security;

create policy "transactions: owner full access"
  on public.transactions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index transactions_user_date_idx
  on public.transactions (user_id, tx_date desc);

-- ---------------------------------------------------------------------------
-- recurring_charges: domiciliaciones detectadas
-- ---------------------------------------------------------------------------
create table public.recurring_charges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid references public.accounts (id) on delete set null,
  description text not null,
  typical_amount numeric,
  frequency text not null default 'monthly',
  first_seen date,
  last_seen date,
  active boolean not null default true
);

alter table public.recurring_charges enable row level security;

create policy "recurring_charges: owner full access"
  on public.recurring_charges for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- fixed_costs: costos fijos capturados por el usuario (renta, servicios...)
-- equivalente a la hoja "cuenta_personal"
-- ---------------------------------------------------------------------------
create table public.fixed_costs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  concept text not null,
  amount numeric not null,
  month date not null,           -- primer día del mes al que aplica
  created_at timestamptz not null default now()
);

alter table public.fixed_costs enable row level security;

create policy "fixed_costs: owner full access"
  on public.fixed_costs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- monthly_summaries: rollup cacheado por mes + resumen en texto
-- ---------------------------------------------------------------------------
create table public.monthly_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  month date not null,
  income_total numeric,
  expense_total numeric,
  balance numeric,
  insights jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, month)
);

alter table public.monthly_summaries enable row level security;

create policy "monthly_summaries: owner full access"
  on public.monthly_summaries for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- chat_messages: historial de conversación con el asistente
-- ---------------------------------------------------------------------------
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.chat_messages enable row level security;

create policy "chat_messages: owner full access"
  on public.chat_messages for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index chat_messages_user_created_idx
  on public.chat_messages (user_id, created_at);

-- ---------------------------------------------------------------------------
-- provider_credentials: API keys del usuario por proveedor de IA (cifradas)
-- ---------------------------------------------------------------------------
create table public.provider_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('anthropic', 'openai')),
  api_key_encrypted text not null,   -- cifrado a nivel de aplicación antes de llegar aquí
  is_active boolean not null default false,
  orchestrator_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

alter table public.provider_credentials enable row level security;

create policy "provider_credentials: owner full access"
  on public.provider_credentials for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
