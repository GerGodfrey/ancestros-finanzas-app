-- Amplía el CHECK constraint de provider_credentials.provider para permitir
-- los dos proveedores nuevos que se agregaron al gateway (Gemini, DeepSeek).

alter table public.provider_credentials
  drop constraint provider_credentials_provider_check;

alter table public.provider_credentials
  add constraint provider_credentials_provider_check
  check (provider in ('anthropic', 'openai', 'gemini', 'deepseek'));
