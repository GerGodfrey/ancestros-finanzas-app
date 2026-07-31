// Variables de entorno dummy para que los tests unitarios corran sin
// depender de credenciales reales de Supabase/Anthropic/OpenAI.
process.env.ENCRYPTION_KEY ??= "H0/tHg/89mQyZIZqNSpBpHpu3sDn/7MsC/cBmbaS880=";
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://example-test.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
