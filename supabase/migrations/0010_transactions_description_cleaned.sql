-- Marca si transactions.description ya pasó por limpieza (capitalización
-- legible, sin prefijos de procesador de pagos ni folios/referencias sin
-- valor — ver "Limpieza de la description" en SKILL.md). Las transacciones
-- que se insertan a partir de ahora en /api/statements/[id]/parse ya vienen
-- limpias del Skill, así que se marcan true desde el insert; el default
-- false es para las que ya existían antes de esta columna, que se limpian
-- con el backfill de /api/transactions/clean-descriptions.

alter table public.transactions
  add column description_cleaned boolean not null default false;
