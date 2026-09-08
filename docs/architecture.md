# Arquitectura

Vista de conjunto de todo el proyecto. Los dos documentos hermanos entran en
profundidad donde este solo resume: [`ai-models.md`](./ai-models.md) para la
capa de IA y [`database-design.md`](./database-design.md) para el esquema y
las reglas de datos. Para ambientes y despliegue:
[`environments.md`](./environments.md) y [`deploy.md`](./deploy.md). Para cómo se
ve y por qué: [`design-system.md`](./design-system.md), y
[`design-prompts.md`](./design-prompts.md) para pedir trabajo visual nuevo.

## Qué es

Webapp de finanzas personales de un solo usuario por cuenta. Subes el PDF del
estado de cuenta de tu tarjeta, una IA lo lee y lo convierte en datos
estructurados, y obtienes un dashboard mensual más un chatbot que puede
consultar tu historial real.

El flujo central, de punta a punta:

```
PDF (navegador)
  → Supabase Storage           bucket privado `statements`, ruta {user_id}/{account_id}/...
  → POST /api/statements       crea la fila (status: pending)
  → POST /api/statements/[id]/parse
        ├─ descarga el PDF
        ├─ descifra la API key del usuario
        ├─ Skill + gateway de IA → JSON validado contra schema.json (ajv)
        ├─ valida emisor/last4 contra la tarjeta elegida  ← regla dura
        ├─ escribe accounts / statements / transactions / msi_plans
        ├─ detecta domiciliaciones (determinístico, sin IA)
        └─ regenera los insights del mes (IA)
  → Dashboard mensual + Chatbot leen esas tablas
```

## Stack

| Capa | Elección | Por qué |
|---|---|---|
| Framework | Next.js 16 (App Router) | Server Components para el dashboard (los datos no viajan al cliente) y route handlers para la API, en un solo despliegue |
| Lenguaje | TypeScript estricto | El dominio es dinero: los errores de tipo aquí son errores de cuentas |
| Estilos | Tailwind 4 | Sin capa de diseño propia que mantener |
| Backend | Supabase (Postgres + Auth + Storage) | RLS mueve la autorización a la base, no a la app |
| IA | Gateway propio multi-proveedor | El usuario trae su propia key; el proveedor es intercambiable |
| Gráficas | Recharts | Dashboard |
| Fondo del login | Three.js | Billetes MXN estilizados generados por canvas |

## Mapa del repo

```
src/
  app/
    (páginas)          login · dashboard (+ chat, upload) · settings
    api/               rutas REST; todas verifican sesión y filtran por user_id
    auth/              callback de OAuth y signout
  components/          UI; los que llevan estado son "use client"
  lib/
    ai/                gateway multi-proveedor, parseo, insights, categorización
    dashboard/         agregación mensual (get-monthly-data, get-upload-coverage)
    supabase/          clientes de browser y servidor
    crypto.ts          AES-256-GCM para las API keys de los usuarios
  proxy.ts             middleware de Next 16 (antes middleware.ts)
skills/
  pdf-statement-parser/   SKILL.md + schema.json — se leen con fs en runtime
supabase/migrations/      esquema versionado, incluido el bucket y sus policies
.claude/skills/           skills de Claude Code (operación), no de la app
```

**Dos directorios `skills/` distintos**, no confundir: `skills/` en la raíz es
*dato de runtime de la app* (el prompt y el schema que el modelo usa para leer
PDFs; `next.config.ts` los empaqueta con `outputFileTracingIncludes` porque se
leen con `fs`, no con `import`). `.claude/skills/` son procedimientos para
agentes de Claude Code y no llegan al bundle.

## Piezas de runtime

**`src/proxy.ts`** — el middleware. Refresca la sesión de Supabase en cada
request y redirige a `/login` lo que cuelgue de `/dashboard` y `/settings`.
Falla cerrado: cualquier error se trata como "sin sesión". No protege
`/api/*` — cada ruta se verifica a sí misma.

**Rutas API** — todas siguen el mismo patrón: `auth.getUser()` y 401 si no hay
sesión, luego cada consulta filtrada por `user_id`. Ninguna usa service-role
key: el cliente de servidor se arma con la anon key y las cookies del propio
usuario, así que RLS sigue aplicando por debajo como segunda barrera.

**`src/lib/ai/gateway.ts`** — normaliza Anthropic, OpenAI, Gemini y DeepSeek
tras una sola interfaz (`chat` y `runAgent` con tool-calling). Incluye
reintentos con backoff para errores transitorios: sobrecarga del proveedor
(429/503/529, `UNAVAILABLE`, `RESOURCE_EXHAUSTED`) y cortes de red
(`fetch failed`, `ECONNRESET` y familia). Los errores permanentes, como una
API key inválida, fallan de inmediato sin gastar reintentos.

**Dashboard** — Server Component que llama a `getMonthlyDashboardData(mes)`.
Toda la agregación ocurre en el servidor; al cliente solo bajan los números ya
calculados.

## Seguridad

- **RLS en todas las tablas de usuario**, con política de dueño
  (`auth.uid() = user_id`). El bucket `statements` es privado y sus policies
  exigen que el primer segmento de la ruta sea el `uid` de quien pide.
- **Nunca hay service-role key** en el código ni en el despliegue. Todo pasa
  por la anon key + la sesión del usuario.
- **Las API keys de IA se cifran a nivel de app** (AES-256-GCM, `crypto.ts`)
  antes de tocar la base. La base solo ve texto cifrado.
- **`ENCRYPTION_KEY` es write-once por ambiente.** Rotarla vuelve
  indescifrable todo lo ya guardado. Ver [`environments.md`](./environments.md).
- **Auth que falla cerrado** en middleware y helpers de sesión.

## Reglas duras del dominio

Cada una nació de un bug real en producción. Romperlas corrompe datos, no solo
la UI.

**1. Un mes es la fecha de corte, no la de pago ni la de subida.** El mes de un
statement sale de `period_end`. Un corte del 22 de agosto cuenta para agosto
aunque su pago venza en septiembre y aunque lo hayas subido en octubre.

**2. El dashboard de un mes solo usa datos de ese mes.** `msi_plans` y
`recurring_charges` son estado vivo (se sobreescriben en cada parseo), así que
las cifras mensuales se calculan desde el `raw_extraction` del statement de ese
mes y desde las `transactions` de ese mes. Sin PDF de ese mes: `hasData: false`,
no se muestra nada "en vivo".

**3. El PDF debe corresponder a la tarjeta elegida.** Antes de guardar nada se
comparan emisor y últimos 4 dígitos (`statement-account-match.ts`). Si no
coinciden, el statement se marca `error` y no se toca ninguna otra tabla.
Nació de un PDF de Amex que quedó mezclado con la cuenta de Palacio de Hierro.

**4. Un statement por tarjeta por mes.** Si aparecen dos `parsed` del mismo mes
y tarjeta (típicamente el mismo PDF subido dos veces tras un reintento), se usa
el más reciente y se avisa en Validación. Si se dejaran ambos, sus
transacciones se contarían dos veces en todo el dashboard.

**5. Una tarjeta empieza a contar** en la más temprana entre su fecha de alta y
el corte más antiguo que le hayas subido — para que dar de alta tarde una
tarjeta que ya existía no esconda sus PDFs.

## Ambientes

Dos stacks completos y aislados, cada uno con su proyecto de Supabase y su
proyecto de Vercel: **sandbox** (sigue `main` automáticamente) y **producción**
(promoción manual aprobada). El mismo código lee las mismas variables y obtiene
un ambiente u otro según dónde corre. Detalle en
[`environments.md`](./environments.md) y [`deploy.md`](./deploy.md).
