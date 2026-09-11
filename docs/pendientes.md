# Pendientes

Lo que quedó anotado y todavía no se hace. Cuando algo se complete, se borra de
aquí (el historial vive en git, no hace falta arrastrar una lista de "hechos").

---

## Partir `dashboard-tabs.tsx`

Son 1192 líneas con unos 15 componentes adentro (`Modal`, `DeleteRowButton`,
`ResumenTab`, `MonthlyInsightsPanel`, `PanoramaDeDeudasPanel`…). Al tokenizar
el diseño se le sacaron `Panel` y `Kpi` —que ahora viven en
`src/components/ui/`— pero el resto sigue en un solo archivo.

No se partió en el mismo cambio a propósito: mezclar un refactor estructural
de ese tamaño con el cambio visual habría vuelto el diff irrevisable. Ahora
que las primitivas existen, cada subcomponente se puede mover solo.

---

## Respaldos de producción

**Existe uno: CSV de las siete tablas, bajado el 8 de septiembre de 2026** antes
de promover la Iteración 1 del feedback de clientes. Fue el primero desde que
la app existe; antes de él se aprobaron dos deploys a producción sin ninguno.
Supabase en plan gratis no hace backups automáticos, ni point-in-time, ni
tiene botón de restaurar: ese archivo es la única copia del historial fuera
de la base.

El riesgo no es teórico. En `0001_init.sql`, `statements`, `transactions` y
`msi_plans` cuelgan de `accounts` con `on delete cascade` — borrar una tarjeta
desde Configuración → Tarjetas se lleva en cascada todo su historial, con un
clic y sin vuelta atrás.

Y lo que se pierde no son solo los PDFs (esos se pueden volver a subir):
volver a parsearlos cuesta llamadas de IA, y **todo lo curado a mano se pierde
para siempre** — categorías corregidas, descripciones limpiadas, ingresos,
costos fijos y deudas capturadas a mano. Nada de eso está en un PDF.

**Qué hacer:**

```bash
brew install libpq
echo 'export PATH="/opt/homebrew/opt/libpq/bin:$PATH"' >> ~/.zprofile
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"

# Cadena de conexión: Supabase → Settings → Database → Connection string (URI)
pg_dump "postgresql://postgres.<ref>:<password>@<host>:5432/postgres" \
  --data-only --schema=public -f ~/backup-prod-$(date +%Y%m%d).sql
```

Guardar el archivo **fuera del repo**. Para restaurar:
`psql "<cadena>" -f ~/backup-prod-<fecha>.sql`.

`supabase db dump` haría lo mismo pero necesita Docker, que no está instalado
en esta máquina — de ahí que se use `pg_dump` directo.

Alternativa rápida sin instalar nada: en el Table Editor cada tabla tiene
**Download CSV**. Bajando `accounts`, `statements`, `transactions`,
`msi_plans`, `incomes`, `fixed_costs` y `debts` queda un respaldo aceptable,
aunque restaurarlo sea más manual.

**Lo que sigue pendiente es la cadencia.** Lo natural es después de cada
carga mensual de PDFs, que es cuando entra información nueva, y siempre antes
de aprobar un gate de producción que toque datos. Hoy depende de acordarse.

---

## Verificar que el Skill de parseo viaje en el bundle

`src/lib/ai/parse-statement.ts` lee `skills/pdf-statement-parser/` con `fs` en
tiempo de ejecución, y solo llega a la función serverless porque
`next.config.ts` lo declara en `outputFileTracingIncludes`. **En localhost
siempre funciona** (el archivo está en disco), así que un error ahí solo se ve
en un ambiente desplegado.

No se pudo verificar desde el bundle local porque Vercel usa symlinks. La única
comprobación real: **subir un PDF en el sandbox** y ver si el parseo completa.

---

## Copiar datos de producción al sandbox

Se evaluó y se pospuso. Para hacerlo bien hay que:

- **Remapear `user_id`**: el UUID de Google es distinto en cada proyecto, y
  copiar las filas tal cual violaría las llaves foráneas (y RLS las escondería).
- **Excluir `provider_credentials`**: está cifrada con el `ENCRYPTION_KEY` de
  producción y el sandbox usa otro, así que sería ilegible. Se recaptura a mano.
- **Aceptar que los PDFs no viajan**: viven en Storage, no en la base. El
  dashboard se vería completo, pero esos statements no se podrían re-parsear.
- Respetar el orden de llaves foráneas: `accounts` → `statements` →
  `msi_plans` → `transactions` → el resto.

Requiere `psql` (ver la sección de respaldos). **Consideración:** al hacerlo, el
sandbox pasa a contener movimientos financieros reales y deja de ser una base
desechable.

---

## Seguridad

Hallazgos de la revisión que no eran parte del pipeline:

- **Inyección de prompt**: el texto del PDF entra al modelo sin sanitizar
  (`parse-statement.ts:90-96` lo interpola directo para OpenAI/DeepSeek), y las
  `description` de transacciones se reusan en tres prompts más (categorizar,
  limpiar, insights). El schema de `ajv` acota el daño pero no lo elimina.
- **`POST /api/statements` no valida que el `accountId` sea del usuario.** El
  `filePath` ya se valida (`storage-path.ts`), pero el `account_id` entra tal
  cual: se puede insertar un statement propio colgado de la cuenta de otro. El
  daño es acotado — RLS impide leer esa cuenta, así que el parseo falla al
  buscar el emisor — pero deja filas basura y merece el mismo trato.

---

## Mantenimiento

- **PRs de Dependabot abiertos.** El grupo minor/patch ya entró (9 paquetes,
  verificado con la suite completa), y `@types/node` se resolvió aparte
  alineándolo con el runtime en `^24` —no en el `^26` que proponía, que
  pondría los tipos por delante de Node—, así que **el #7 hay que cerrarlo**.
  Quedan: eslint 9→10 (#9) y TypeScript 5→7 (#8), **los dos con CI en rojo**;
  y `gitleaks-action` 2→3 (#13) y `codeql-action` 3→4 (#12), en verde y de
  bajo riesgo para la app. Los dos majors requieren trabajo propio.
- **`gitleaks-action@v2` corre sobre Node 20**, que GitHub ya marcó como
  deprecado. No hay v3 todavía; es aviso, no error. Revisar de vez en cuando.

---

## Salidos de la primera ronda de feedback (sept. 2026)

- **`/api/version`.** Un route handler que devuelva `{ sha, env }`, con el
  `GITHUB_SHA` pasado al `vercel build` desde `ci.yml`. Hoy saber qué commit
  corre en sandbox o en prod es inferirlo por marcadores indirectos; con esto
  es un `curl` por ambiente y comparar contra `git rev-parse origin/main`.
  Chico, sin datos, y quita la pregunta «¿ya está desplegado?» para siempre.
- **e2e con sesión inyectada.** Hoy los e2e solo prueban redirects: nada tras
  el login se cubre, y tres veces en esta ronda hubo que montar páginas
  temporales para ver un componente. La técnica ya está probada y funciona:
  una cookie `sb-<ref>-auth-token` con `base64-` + JSON de sesión falsa, y
  `page.route` interceptando `**/auth/v1/user`, `**/storage/v1/object/**` y
  los `/api/*`. Falta convertirla en fixture de Playwright.
- **Canonicalizar cada ambiente a un solo host.** Prod y sandbox responden en
  dos hosts cada uno y las cookies son por host (ver `environments.md`). Hoy
  se mitiga registrando ambos en Supabase; lo correcto es un redirect de la
  larga a la corta. Antes: comprobar que el smoke test del CI sigue el
  redirect, porque pega a la larga.
- **Crear la tarjeta desde el PDF.** La «idea D» del deep dive: en Subir PDF,
  una opción «es una tarjeta nueva, detectarla del archivo»; el parser saca
  banco, nombre, últimos 4 y límite, y propone registrarla. El usuario nunca
  teclea un banco. Se construye sobre la confirmación que ya existe
  (`first_statement_mismatch`), pero necesita parsear **sin** cuenta, y el PDF
  hoy se guarda en `{user_id}/{account_id}/…`: toca el esquema de rutas de
  Storage y sus policies, que `storage-path.ts` acaba de blindar. Rama y
  revisión propias.
- **Herramientas en la máquina de desarrollo:** `gh`, `vercel` y el CLI de
  Supabase. Sin ellos no se puede abrir un PR, leer un run, saber qué
  deployment está activo ni sacar un dump desde la terminal. Los tres faltaron
  en cada iteración de esta ronda.

---

## Documentación

- **`docs/environments.md`**: las casillas del checklist de setup ya están
  marcadas. Lo que le falta es que la tabla de «cómo saber qué está desplegado
  dónde» apunte a `/api/version` en cuanto exista.
