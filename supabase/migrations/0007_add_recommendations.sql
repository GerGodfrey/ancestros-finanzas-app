-- Agrega la columna para "🎯 Recomendaciones y Próximos Pasos": cosas que
-- el usuario ha hecho bien en su historia (strength) + cosas que debería
-- empezar a cambiar (action). Se genera junto con monthly_summaries.insights
-- en la misma llamada al modelo, pero mirando más historial hacia atrás.

alter table public.monthly_summaries
  add column recommendations jsonb;
