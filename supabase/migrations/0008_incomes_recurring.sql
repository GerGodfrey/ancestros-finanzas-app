-- Permite marcar un ingreso como recurrente ("fijo" — aplica desde el mes
-- en que se captura en adelante, indefinidamente) en vez de solo para el
-- mes en el que se capturó ("temporal" — comportamiento que ya tenía la
-- tabla antes de esta columna).

alter table public.incomes
  add column is_recurring boolean not null default false;
