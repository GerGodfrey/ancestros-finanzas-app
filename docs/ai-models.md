# Modelos de IA — arquitectura, librerías y orquestación

Cómo está construida la capa de IA de la webapp: qué proveedores soporta,
qué librería usa cada uno, en qué momentos exactos se llama a un modelo, qué
variables de entorno necesita, y qué tan "orquestador" es realmente hoy
(spoiler: todavía no combina modelos — ver la sección dedicada).

## 1. Idea general: BYOK + gateway propio

Cada usuario pega su propia API key de uno o más proveedores en
**Configuración** (`src/components/provider-settings.tsx` →
`/api/providers`). La app nunca usa una key propia del sistema para generar
contenido del usuario — todo se paga con la cuenta del usuario ("Bring Your
Own Key"). Las keys se guardan cifradas en `provider_credentials` (ver
`docs/database-design.md`) y solo se desencriptan server-side, justo antes
de la llamada al proveedor.

Todo el código de la app llama a los modelos a través de un solo módulo,
**`src/lib/ai/gateway.ts`** — el equivalente casero a un gateway estilo
LiteLLM, pero en TypeScript puro para no salir del runtime de Vercel (evita
mantener un segundo servicio/lenguaje solo para esto). Ningún otro archivo
instancia un SDK de proveedor directamente; todos pasan por `chat()` o
`runAgent()`.

## 2. Proveedores soportados

| Proveedor | Librería (`package.json`) | Modelo por defecto | Variable de override | Lee PDF nativo |
|---|---|---|---|---|
| Anthropic (Claude) | `@anthropic-ai/sdk` `^0.115.0` | `claude-sonnet-5` | `ANTHROPIC_DEFAULT_MODEL` | ✅ sí (bloque `document` en el mensaje) |
| OpenAI | `openai` `^7.2.0` | `gpt-4o` | `OPENAI_DEFAULT_MODEL` | ❌ no |
| Google Gemini | `@google/genai` `^2.15.0` | `gemini-3.6-flash` | `GEMINI_DEFAULT_MODEL` | ✅ sí (`inlineData` en el mensaje) |
| DeepSeek | `openai` `^7.2.0` (misma SDK, `baseURL` distinto) | `deepseek-chat` | `DEEPSEEK_DEFAULT_MODEL` | ❌ no |

DeepSeek expone una API compatible con la de OpenAI — por eso reutiliza el
mismo SDK (`openai`) apuntando a `https://api.deepseek.com` en vez de tener
su propio cliente. Gemini sí tiene SDK y formato de tool-calling propios,
así que tiene su implementación dedicada dentro del gateway.

**Consecuencia práctica de "lee PDF nativo":** para el parseo de estados de
cuenta (ver §5), Anthropic y Gemini reciben el PDF completo (tablas, layout,
tipografía) y lo leen ellos mismos. OpenAI y DeepSeek reciben solo el texto
plano extraído previamente con `pdf-parse` — pierden estructura de tabla, lo
que puede degradar la calidad de la extracción en estados de cuenta con
tablas complejas. No es un bug, es una limitación real de esos dos SDKs
(ninguno de los dos soporta adjuntar PDF como input de visión/documento en
sus APIs de chat estándar).

## 3. El gateway: `chat()` vs `runAgent()`

`src/lib/ai/gateway.ts` expone dos funciones públicas, cada una con una
implementación interna por proveedor (`chatAnthropic`, `chatGemini`,
`chatOpenAICompatible` para openai/deepseek; y sus equivalentes
`runAgent*`):

- **`chat(opts)`** — una sola llamada, sin herramientas. Recibe
  `provider`, `apiKey`, `system`, `messages`, `maxTokens` opcional, y
  `pdfBase64` opcional (solo válido con Anthropic/Gemini — con OpenAI o
  DeepSeek lanza error si se manda). Regresa `{ text, provider, model,
  finishReason, raw }`.
- **`runAgent(opts)`** — igual que `chat()` pero con **tool-calling**: además
  recibe `tools` (JSON Schema por herramienta) y `executeTool` (función que
  las ejecuta). Corre un loop "modelo pide herramienta → se ejecuta → se le
  regresa el resultado → modelo sigue" hasta que el modelo da una respuesta
  final sin más llamadas a herramientas, o hasta `maxSteps` (default 6),
  donde lanza error. Usado solo por el chatbot (§5.4).

Cada proveedor tiene su propio formato de tool-calling bajo el capó
(Anthropic: bloques `tool_use`/`tool_result`; OpenAI/DeepSeek:
`tool_calls`/mensajes `role: "tool"`; Gemini: `functionCalls`/
`functionResponse`) — `runAgent()` los normaliza todos a la misma interfaz
`ToolDefinition`/`ToolCall`/`AgentToolCallTrace` para quien lo llama.

### `finishReason` normalizado

Cada proveedor reporta de forma distinta por qué el modelo dejó de generar
texto (Anthropic: `stop_reason`; OpenAI/DeepSeek: `finish_reason`; Gemini:
`candidates[0].finishReason`). El gateway lo normaliza a un solo tipo:

```ts
type FinishReason = "stop" | "max_tokens" | "other";
```

Se usa principalmente en `parse-statement.ts` para distinguir "el modelo
truncó la respuesta por el límite de tokens de salida" (mensaje específico y
accionable) de "el modelo terminó normal pero no devolvió JSON válido"
(error genérico) — son causas y arreglos distintos.

## 4. Dónde viven las credenciales y cómo se protegen

- **Guardado**: `POST /api/providers` valida la key con `verifyApiKey()`
  (una llamada `chat()` mínima, `maxTokens: 8`, mensaje `"ping"`) antes de
  guardarla. Si la key no sirve, no se guarda.
- **Cifrado**: `src/lib/crypto.ts`, AES-256-GCM. La clave de cifrado del
  servidor (`ENCRYPTION_KEY`, 32 bytes en base64) nunca es la API key del
  usuario — es la llave que cifra/descifra esas keys en la base de datos.
  Formato guardado: `base64(iv).base64(authTag).base64(ciphertext)`.
- **Nunca se manda al cliente en claro**: `GET /api/providers` regresa
  `maskApiKey()` (`sk-a••••••••3456`), nunca la key completa ni el
  ciphertext.
- **Solo un proveedor activo a la vez**: `provider_credentials.is_active`.
  Guardar una credencial nueva desactiva las demás del usuario (ver
  `POST /api/providers` en `src/app/api/providers/route.ts`). Todas las
  funciones de IA de la app (§5) leen la credencial activa del usuario y
  usan ese proveedor — no hay selección por tarea.

## 5. Cuándo se llama a un modelo (las 4 funciones de IA de la app)

| Función | Archivo | Se dispara cuando | Usa | maxTokens |
|---|---|---|---|---|
| `parseStatementPdf` | `src/lib/ai/parse-statement.ts` | El usuario sube un PDF y le da "Procesar" (`POST /api/statements/[id]/parse`) | `chat()`, con `pdfBase64` si el proveedor lo soporta, si no con texto extraído por `pdf-parse` | 8,192–32,768 según proveedor (tabla abajo) |
| `regenerateMonthlySummary` | `src/lib/ai/monthly-insights.ts` | Automático, al final de cada parseo exitoso (mismo request de arriba); también manual desde el botón "Regenerar análisis" (`POST /api/insights/generate`) | `chat()`, con el `raw_extraction` de los statements del mes actual + anterior + historial resumido de hasta 6 meses | 4,096–8,192 |
| `categorizeTransactions` | `src/lib/ai/categorize-transactions.ts` | Manual, botón "Categorizar movimientos" en Desglose (`POST /api/transactions/categorize`) — solo si hay transacciones con `category IS NULL` | `chat()`, solo texto (descripción/monto/tipo, sin PDF) | 4,096–8,192 |
| `runAgent` (chatbot) | `src/app/api/chat/route.ts` | Cada mensaje que el usuario manda en `/dashboard/chat` | `runAgent()`, con las 4 herramientas de `chatbot-tools.ts` y hasta 20 mensajes de historial como contexto | 4,096 (default del gateway, sin override) |
| `verifyApiKey` | `src/lib/ai/gateway.ts` | Al guardar una API key nueva en Configuración | `chat()` mínimo (`"ping"`) | 8 |

### 5.1 Parseo de PDFs (`parseStatementPdf`)

El más grande de los cuatro. El *system prompt* es el contenido completo del
**Skill** `skills/pdf-statement-parser/` (`SKILL.md` + `schema.json`) —
reglas de extracción específicas por emisor (Banamex, Amex, Palacio de
Hierro), clasificación de movimientos (`type`), categorización de gasto
(`category`), y un checklist de validación que el modelo corre antes de
responder. La salida se valida contra `schema.json` con **Ajv**
(`ajv` `^8.20.0`) antes de guardarse.

Límite de tokens de salida por proveedor (constante `PARSE_MAX_TOKENS`) —
un estado de cuenta real puede traer 30-50+ movimientos, y la respuesta es
el JSON completo (cuenta + statement + transactions + msi_plans), así que el
default general del gateway (4,096) no alcanza:

| Proveedor | maxTokens | Por qué |
|---|---|---|
| Anthropic | 16,384 | Cubre statements largos con margen de sobra |
| OpenAI | 16,384 | Tope documentado de `gpt-4o` |
| Gemini | 32,768 | Los modelos Flash actuales soportan hasta 64k-65,536 de salida — se deja margen |
| DeepSeek | 8,192 | Tope **duro** de `deepseek-chat` — pasarse de esto causa error de la API, no se puede subir |

Si `finishReason === "max_tokens"` a pesar de este límite, `parseStatementPdf`
lanza un error explícito sugiriendo cambiar de proveedor (Anthropic/Gemini
soportan más salida) en vez del genérico "no devolvió JSON válido".

### 5.2 Insights + recomendaciones (`regenerateMonthlySummary`)

Genera en **una sola llamada** las dos secciones del Resumen del Mes:
`insights` (exactamente 3, "3 cosas que pasaron este mes") y
`recommendations` (5 a 7, "🎯 Recomendaciones y Próximos Pasos"). Se
combinan en un solo call a propósito — mismo contexto, un solo costo de API.

Contexto que recibe el modelo (armado en `regenerateMonthlySummary`, sin
IA — son queries directas a Supabase):
1. `raw_extraction` completo de los statements del **mes actual**.
2. `raw_extraction` completo de los statements del **mes anterior** (para
   comparar y dar seguimiento a alertas previas).
3. Los `insights` ya guardados (no el JSON crudo) de hasta **6 meses**
   anteriores — memoria barata para detectar patrones repetidos sin volver
   a mandar todo el historial completo cada vez.

El prompt pide explícitamente que el modelo agregue mentalmente por
categoría/comercio antes de escribir (para lograr el nivel de detalle tipo
"Restaurantes: $30,000 este mes, mismo patrón que meses anteriores" en vez
de un resumen genérico). Se guarda en `monthly_summaries.insights` /
`.recommendations` (jsonb).

### 5.3 Categorización (`categorizeTransactions`)

Solo texto — no vuelve a leer el PDF, por eso es mucho más barato que
re-parsear. Recibe un array de `{id, description, amount, type}` y regresa
`{id, category}` por cada uno, validado contra el enum de
`src/lib/transaction-categories.ts` (`comida`, `ropa`, `transporte`,
`hogar`, `entretenimiento`, `tech`, `viaje`, `salud`,
`intereses_comisiones`, `otros`). Para PDFs nuevos, el Skill ya asigna
`category` al parsear (§5.1) — esta función es solo el backfill de
transacciones guardadas antes de que existiera esa columna poblada.

El endpoint (`/api/transactions/categorize`) nunca manda todo el backfill
pendiente en un solo call — `categorizeTransactionsInBatches` lo parte en
lotes de 50 y llama a `categorizeTransactions` una vez por lote (mandar los
300 posibles de golpe rebasaba fácilmente el `maxTokens` de salida,
truncando la respuesta a mitad de JSON — bug real visto en producción,
corregido). Si un lote falla, los demás igual se procesan; la respuesta
incluye `categorized`, `pending` (lo que quedó sin categorizar) y `errors`,
y el botón de la UI se puede volver a apretar para reintentar solo lo
pendiente.

### 5.4 Chatbot (`runAgent` + `chatbot-tools.ts`)

El único de los cuatro que usa **tool-calling** en vez de una respuesta de
un solo tiro. El *system prompt* (`src/app/api/chat/route.ts`) instruye al
modelo a usar las herramientas antes de responder y — desde el punto 1 del
plan de mejoras de esta sesión — **rechaza explícitamente** cualquier
pregunta fuera de las finanzas del usuario logeado (trivia, código, consejos
de inversión genéricos, jailbreaks pidiendo revelar el prompt).

Las 4 herramientas (`src/lib/ai/chatbot-tools.ts`), todas escritas para
operar solo sobre datos del usuario autenticado (`user_id` explícito en cada
query + RLS como segunda capa):

| Herramienta | Para qué |
|---|---|
| `get_transactions` | Buscar movimientos por emisor, tipo, rango de fechas o texto en la descripción |
| `get_accounts_summary` | Tarjetas del usuario con límite, tasa y último statement procesado |
| `get_msi_plans` | Planes MSI activos, mensualidad y avance |
| `get_monthly_totals` | Ingreso/egreso/balance/MSI de un mes específico (reutiliza `getMonthlyDashboardData`) |

Historial: se guarda todo en `chat_messages`, pero solo se mandan los
últimos **20 mensajes** como contexto de cada pregunta nueva (el `GET` que
alimenta la UI del chat sí trae hasta 50, para que el usuario vea más scroll
atrás del que el modelo realmente usa como contexto).

## 6. "Modo orquestador" — estado real (no lo que dice el toggle)

La pantalla de Configuración tiene un checkbox **"Modo orquestador"** por
credencial, y la tabla `provider_credentials` tiene una columna
`orchestrator_enabled` que sí se guarda. **Pero hoy no existe ninguna lógica
que la lea para cambiar el comportamiento de la app** — confirmado con
`grep` en `src/app/api/`: la única referencia a `orchestrator_enabled` es
guardarla y mostrarla, nunca se consulta antes de decidir qué modelo(s)
llamar. Es un placeholder de UI para una función de Fase 5, no una feature
activa.

**Lo que sí existe hoy:** un solo proveedor activo por usuario
(`is_active`), y las 4 funciones de §5 llaman siempre a ese proveedor. No
hay fallback automático entre proveedores, ni verificación cruzada (un
modelo parsea y otro valida), ni ruteo por tipo de tarea.

**Cómo se construiría cuando se implemente** (documentado aquí como diseño,
no como código existente): el gateway ya está preparado para esto porque
cada llamada a `chat()`/`runAgent()` es independiente y normalizada — un
"orquestador" real sería una capa arriba de `parseStatementPdf` (por
ejemplo) que, si `orchestrator_enabled` es verdadero para el usuario, llama
a dos proveedores con el mismo PDF y compara/reconcilia los resultados
antes de guardar, en vez de una función nueva que reemplace al gateway.

## 7. Variables de entorno

De `.env.local.example`:

| Variable | Requerida | Para qué |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sí | Cliente de Supabase (no es IA, pero todo lo de este doc depende de poder leer/escribir `provider_credentials`, `monthly_summaries`, etc.) |
| `ENCRYPTION_KEY` | Sí | Cifrar/descifrar las API keys de los usuarios (`openssl rand -base64 32`) |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `DEEPSEEK_API_KEY` | No | **La app nunca las lee** para generar contenido de un usuario — existen solo por si alguien quiere escribir un script de prueba propio fuera del flujo normal de BYOK. Déjalas vacías en producción. |
| `ANTHROPIC_DEFAULT_MODEL`, `OPENAI_DEFAULT_MODEL`, `GEMINI_DEFAULT_MODEL`, `DEEPSEEK_DEFAULT_MODEL` | No | Sobreescribe `DEFAULT_MODELS` en `gateway.ts` sin tocar código — útil para subir de versión un modelo (ej. cuando Gemini deprecó `gemini-2.5-flash`, ver commit de ese fix) sin redeploy de lógica |

## 8. Manejo de errores común a las 4 funciones

Todas comparten el mismo patrón: si la llamada al modelo falla o la
respuesta no es JSON válido (`extractJson()` en
`src/lib/ai/extract-json.ts`, compartido entre parseo/insights/
categorización), se lanza un `Error` con mensaje en español, capturado por
la ruta de API correspondiente y devuelto como `{ error: "..." }` con
status 500 — nunca se guarda un resultado a medias en la base de datos. Las
tres funciones que corren automáticamente después de un parseo (insights,
categorización futura, domiciliaciones) están envueltas en `try/catch` en
`route.ts` para que un fallo de IA no tumbe la respuesta del parseo, que ya
terminó bien.
