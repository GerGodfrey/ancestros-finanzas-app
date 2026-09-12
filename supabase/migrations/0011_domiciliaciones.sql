-- ---------------------------------------------------------------------------
-- Domiciliaciones: pasar de "la misma descripción 2 de 3 veces" a una decisión
-- con señales y con memoria de lo que el usuario ya respondió.
--
-- Aditiva a propósito. `active` se conserva porque hay código leyéndolo, pero
-- deja de ser la fuente de verdad: manda `status`.
-- ---------------------------------------------------------------------------

alter table public.recurring_charges
  -- Clave canónica del comercio. Estable entre meses aunque la IA escriba la
  -- descripción distinta cada vez — que es la causa de los falsos negativos.
  -- Nula en las filas viejas hasta que el script de reevaluación las recorra.
  add column if not exists merchant_key text,

  -- 'suggested' | 'confirmed' | 'dismissed'
  -- Solo 'confirmed' suma en los totales. Las filas que ya existían quedan en
  -- 'suggested' aunque estuvieran activas: nadie se las confirmó nunca, y
  -- contarlas era justo lo que inflaba la proyección del próximo mes.
  add column if not exists status text not null default 'suggested',

  -- 0..1, por qué se sugirió. Ordena las sugerencias y permite explicarlas.
  add column if not exists confidence numeric,

  -- Día típico del mes y variación del monto: las dos señales nuevas.
  add column if not exists day_of_month int,
  add column if not exists amount_cv numeric,

  -- Primer mes en que una domiciliación confirmada dejó de aparecer. Antes se
  -- ponía `active = false` y desaparecía en silencio; ahora se pregunta.
  add column if not exists missing_since date;

alter table public.recurring_charges
  drop constraint if exists recurring_charges_status_check;

alter table public.recurring_charges
  add constraint recurring_charges_status_check
  check (status in ('suggested', 'confirmed', 'dismissed'));

-- Una fila por comercio y cuenta. Es lo que permite que la regla del usuario
-- ("no me sugieras esto") sobreviva a que cambie la descripción el mes que
-- viene. Parcial: las filas viejas todavía no tienen clave.
create unique index if not exists recurring_charges_merchant_unique
  on public.recurring_charges (user_id, account_id, merchant_key)
  where merchant_key is not null;

create index if not exists recurring_charges_status_idx
  on public.recurring_charges (user_id, status);

-- La tabla ya tiene RLS y política de dueño desde 0001_init.sql; las columnas
-- nuevas quedan cubiertas por la misma política.
