# Finanzas

Webapp de finanzas personales: sube los PDFs de tus estados de cuenta, se
leen automáticamente con IA (Anthropic, OpenAI, Google Gemini o DeepSeek —
a tu elección), y tienes un dashboard mensual + un chatbot que puede
consultar todo tu historial real.

Ver la arquitectura completa en [`docs/architecture.md`](docs/architecture.md).

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind
- Supabase: Postgres (RLS por usuario), Auth (Google OAuth), Storage
- Gateway multi-proveedor propio (`src/lib/ai/gateway.ts`) — Anthropic,
  OpenAI, Google Gemini o DeepSeek, con la API key que cada usuario guarda
  cifrada en Configuración (DeepSeek reutiliza el SDK de OpenAI apuntando a
  `api.deepseek.com`, ya que su API es compatible)
- El Skill de parseo de PDFs vive en `skills/pdf-statement-parser/`

## 1. Configuración inicial

```bash
npm install
cp .env.local.example .env.local
```

Llena `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — de tu
  proyecto en supabase.com (Settings → API).
- `ENCRYPTION_KEY` — genera una con `openssl rand -base64 32`. Se usa para
  cifrar las API keys que los usuarios guardan en Configuración.
- `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` — opcionales, solo para tus propias
  pruebas locales (cada usuario final pone la suya en la app).

## 2. Base de datos

Las migraciones están en `supabase/migrations/` (versionadas, se aplican en
orden). Dos formas de aplicarlas:

**Opción A — Supabase CLI:**
```bash
npx supabase login
npx supabase link --project-ref <tu-project-ref>
npx supabase db push
```

**Opción B — SQL Editor del dashboard de Supabase:** copia y pega el
contenido de cada archivo en `supabase/migrations/`, en orden, y ejecútalo.

También hay que crear el proveedor **Google** en Supabase Auth (Authentication
→ Providers → Google), con un Client ID/Secret de Google Cloud Console
(Authorized redirect URI: `https://<tu-project-ref>.supabase.co/auth/v1/callback`).

## 3. Correr en local

```bash
npm run dev
```

Abre http://localhost:3000 — te manda a `/login`.

## 4. Tests

```bash
npm run test:all   # lint + tipos + unit (Vitest) + build + e2e (Playwright) — el gate completo
npm run test       # solo unit tests (rápido, sin credenciales)
npm run test:e2e   # solo smoke tests E2E (usan credenciales dummy, no pegan a Supabase real)
```

Los unit tests (`src/**/*.test.ts`) mockean los SDKs de los 4 proveedores
(Anthropic, OpenAI, Gemini, DeepSeek) — no gastan API real. Los E2E de Playwright corren contra `next dev` con
variables de entorno dummy y validan redirects de autenticación; **no**
cubren el flujo real de login con Google ni el parseo real de un PDF —
eso se prueba a mano (ver checklist abajo) — para eso está el ambiente
sandbox (ver [`docs/environments.md`](docs/environments.md)).

Estos mismos specs de E2E se reusan como smoke tests contra cada deploy: el
CI les pasa `PLAYWRIGHT_BASE_URL` y en vez de levantar un servidor local
pegan a la URL ya publicada.

**Antes de dar por terminado cualquier cambio, corre `npm run test:all` y
que quede en verde.** Un hook de pre-push corre lint + tipos + unitarios
automáticamente; el resto lo valida el CI.

## 5. Prueba manual end-to-end (con credenciales reales)

1. Login con Google.
2. Configuración → agrega una API key (Anthropic, OpenAI, Gemini o
   DeepSeek — Gemini tiene un tier gratis permanente sin tarjeta, vía
   [Google AI Studio](https://aistudio.google.com/apikey), si quieres
   probar sin gastar) y agrega/edita tus tarjetas.
3. Subir PDF → elige la tarjeta correcta y sube un estado de cuenta real →
   revisa que los movimientos y planes MSI queden bien en el Dashboard (si
   el PDF no corresponde a la tarjeta seleccionada, el parseo se rechaza
   con un error explícito en vez de guardarse en la cuenta equivocada).
4. Dashboard → revisa Resumen / Desglose / Movimientos / Próximo Mes /
   Validación, y navega entre meses con el selector junto al título (solo
   deben aparecer datos del mes que tenga un PDF procesado).
5. Chat → pregúntale algo sobre un movimiento real.

## 6. Ambientes y deploy

Dos stacks completos y aislados, cada uno con su propio proyecto de Supabase y
de Vercel:

| | sandbox | producción |
|---|---|---|
| Para qué | Probar todo sin riesgo | Tus datos reales |
| Se actualiza | Solo, en cada push a `main` | Promoción manual aprobada |

No se deploya a mano: todo pasa por GitHub Actions. Un push a `main` corre la
validación completa (lint, tipos, unitarios, build, e2e, seguridad), migra y
deploya el sandbox, y ahí **se detiene esperando tu aprobación** antes de tocar
producción.

- **Cómo promover, hacer rollback o diagnosticar el pipeline** →
  [`docs/deploy.md`](docs/deploy.md)
- **Qué existe y dónde vive cada variable** →
  [`docs/environments.md`](docs/environments.md)
- **Qué quedó anotado y falta hacer** →
  [`docs/pendientes.md`](docs/pendientes.md)

Antes de aprobar producción, el runbook exige respaldar los datos: Supabase en
tier gratis no tiene backups automáticos.
