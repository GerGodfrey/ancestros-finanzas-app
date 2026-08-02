-- El linter de seguridad de Supabase marcó que handle_new_user() (el
-- trigger que crea el profile al primer login) queda expuesto como RPC
-- pública en PostgREST (/rest/v1/rpc/handle_new_user) por ser
-- SECURITY DEFINER dentro del schema "public". Solo debe ejecutarla el
-- trigger sobre auth.users, nunca una llamada directa de un usuario.

-- Postgres otorga EXECUTE a PUBLIC por default al crear una función; revocar
-- solo de anon/authenticated no alcanza porque ambos heredan de PUBLIC.
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon, authenticated;
