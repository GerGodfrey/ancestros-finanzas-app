# Ambientes

Bitácora de qué existe y dónde. Se llena al crear cada ambiente y se actualiza
cuando algo cambia.

> **Nunca escribas valores de secretos en este archivo.** Solo nombres,
> ubicaciones y referencias públicas (project refs y URLs sí van; keys,
> passwords y tokens no). Este repo es público.

## Los dos ambientes

| | **sandbox** | **producción** |
|---|---|---|
| Para qué | Probar todo: PDFs de prueba, migraciones nuevas, cambios de UI | Tus datos financieros reales |
| Se actualiza | Automático en cada push a `main` | Promoción manual aprobada |
| Proyecto Supabase | `finanzas-sandbox` · ref `_____` | `finanzas-prod` · ref `_____` |
| URL Supabase | `https://_____.supabase.co` | `https://_____.supabase.co` |
| Proyecto Vercel | `finanzas-app-sandbox` · id `_____` | `finanzas-app-prod` · id `_____` |
| URL pública | `https://finanzas-app-sandbox.vercel.app` | `https://finanzas-app-prod.vercel.app` |
| GitHub Environment | `sandbox` (sin protección) | `production` (required reviewer) |
| Quién aprueba | — | LGGC |

## Dónde vive cada variable

Tres lugares distintos, a propósito:

**1. Dashboard de Vercel** — variables de runtime de la app, scope Production
de *cada* proyecto. GitHub nunca las conoce; el CI las obtiene con
`vercel pull`. Una sola fuente de verdad y menor radio de daño si el repo
público se ve comprometido.

| Variable | sandbox | producción |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto sandbox | URL del proyecto prod |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key sandbox | anon key prod |
| `ENCRYPTION_KEY` | clave propia del sandbox | clave propia de prod (distinta) |

**2. Secrets y variables de repo en GitHub** — credenciales de cuenta que
sirven para ambos ambientes.

| Nombre | Tipo |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | secret |
| `VERCEL_TOKEN` | secret |
| `VERCEL_ORG_ID` | variable |

**3. Secrets y variables por GitHub Environment** — lo específico de cada
ambiente. Los nombres difieren por ambiente para que un job no pueda tomar por
error los del otro.

| Environment `sandbox` | Environment `production` | Tipo |
|---|---|---|
| `SANDBOX_SUPABASE_PROJECT_REF` | `PROD_SUPABASE_PROJECT_REF` | secret |
| `SANDBOX_SUPABASE_DB_PASSWORD` | `PROD_SUPABASE_DB_PASSWORD` | secret |
| `VERCEL_PROJECT_ID_SANDBOX` | `VERCEL_PROJECT_ID_PROD` | variable |
| `SANDBOX_URL` | `PROD_URL` | variable |

**Límite honesto:** `SUPABASE_ACCESS_TOKEN` y `VERCEL_TOKEN` son de cuenta
completa — pueden tocar cualquier proyecto sin importar en qué environment
estén guardados. Los GitHub Environments controlan *cuándo* corre un job
(aprobación) y *qué secretos ve*, no son una frontera técnica dura entre
sandbox y prod. Aislarlos de verdad requeriría cuentas separadas, que no vale
la pena para un proyecto de una persona.

## Reglas de rotación

| Secreto | ¿Se puede rotar? | Notas |
|---|---|---|
| `ENCRYPTION_KEY` | **NUNCA** | Cifra las API keys de IA de cada usuario (`provider_credentials.api_key_encrypted`). Si cambia, todas quedan indescifrables y cada usuario tiene que volver a capturar la suya. Write-once por ambiente. |
| `VERCEL_TOKEN` | Sí, cuando quieras | Solo actualiza el secret en GitHub |
| `SUPABASE_ACCESS_TOKEN` | Sí, cuando quieras | Solo actualiza el secret en GitHub |
| `SUPABASE_DB_PASSWORD` | Sí, con cuidado | Cámbiala en el dashboard de Supabase y actualiza el secret del environment correspondiente, o el pipeline de migraciones falla |
| anon key de Supabase | Solo si se compromete el proyecto | Es pública por diseño (va al cliente); su seguridad depende de RLS, no de mantenerla secreta |

## Setup manual por ambiente

Lo que el pipeline **no** puede automatizar. Marcar al completarse:

**sandbox**
- [ ] Proyecto de Supabase creado, `project ref` y DB password anotados
- [ ] `supabase db push` aplicó las migraciones (crea tablas, RLS y el bucket)
- [ ] Proveedor Google habilitado en Supabase Auth (client ID y secret de Google Cloud Console)
- [ ] En Google Cloud Console: `https://<ref>.supabase.co/auth/v1/callback` agregado a "Authorized redirect URIs"
- [ ] En Supabase Auth → URL Configuration: la URL de Vercel del sandbox agregada a "Redirect URLs"
- [ ] Proyecto de Vercel creado **sin conectar Git**
- [ ] Las 3 variables cargadas en Vercel (scope Production)
- [ ] Node.js Version fijado en Vercel al mismo valor que `.nvmrc`
- [ ] GitHub Environment `sandbox` con sus secrets y variables

**producción** — lo mismo, más:
- [ ] Required reviewer configurado en el GitHub Environment `production`

## Agregar un tercer ambiente

Si algún día hace falta (por ejemplo `staging`): crear proyecto de Supabase y
de Vercel nuevos, un GitHub Environment con el mismo juego de secrets bajo su
propio prefijo, y agregar los tres jobs (`migrate-` / `deploy-` / `smoke-`)
copiando los del sandbox y cambiando el `environment:`. La app no requiere
ningún cambio: lee las mismas variables, sean del ambiente que sean.
