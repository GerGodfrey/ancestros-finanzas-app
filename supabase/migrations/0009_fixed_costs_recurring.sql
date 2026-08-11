-- Mismo patrón que 0008_incomes_recurring.sql pero para fixed_costs: permite
-- marcar un costo fijo como recurrente ("fijo" — aplica desde el mes en que
-- se captura en adelante, indefinidamente) en vez de solo para el mes en el
-- que se capturó ("temporal").

alter table public.fixed_costs
  add column is_recurring boolean not null default false;
