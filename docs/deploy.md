# Runbook de despliegue

Procedimientos operativos. Para el mapa de ambientes ver
[`environments.md`](./environments.md); para la arquitectura,
[`architecture.md`](./architecture.md).

## Cómo fluye un cambio

```
rama → LOCALHOST: lo prueba el humano  ← nada sale de aquí sin su visto bueno
     → push + PR → CI (lint+tipos, unit, build, e2e, seguridad)
                    │ merge a main
                    ▼
        migra sandbox → deploy sandbox → smoke
                    │
          ⏸ APROBACIÓN MANUAL en la corrida de Actions
                    ▼
        migra prod → deploy prod → smoke
```

Producción es siempre una **promoción del mismo commit** que ya se verificó en
sandbox, nunca un build distinto.

## El paso cero: localhost

**Antes de empujar la rama, lo prueba una persona en `npm run dev`.** No es
una regla del pipeline —el CI empieza en el push y no puede ver tu máquina—,
es un acuerdo, y por eso se escribe aquí en lugar de en `ci.yml`.

Existe porque las pruebas automáticas y las capturas contestan «¿funciona?»,
no «¿es esto lo que querías?». Una hoja puede pasar los 136 tests, verse bien
en las dos temáticas, y estar resolviendo el problema equivocado. Eso ya pasó:
una hoja de Inicio construida como landing pública en `/`, modificando
`/login`, cuando lo pedido era una pantalla nueva para usuarios con sesión.

Empujar la rama no despliega nada —solo `main` dispara el pipeline— pero
mandar el enlace del PR junto con el trabajo empuja a mergear sin mirar. La
secuencia es: implementar → verificar → **enseñarlo y esperar** → empujar y
abrir el PR.

## Promover a producción

1. Confirma que la pierna de sandbox quedó verde y que el sandbox desplegado se
   ve bien de verdad (no solo que el smoke pasó).
2. **Respalda los datos de producción.** Supabase free no tiene backups
   automáticos ni PITR: este dump es tu único rollback.
   ```bash
   supabase link --project-ref <ref-de-prod>
   supabase db dump --data-only -f backup-prod-$(date +%Y%m%d-%H%M).sql
   ```
   Si no tienes el CLI de Supabase (necesita Docker), la vía que se usó de
   verdad la primera vez: Supabase → Table Editor → **Download CSV** de
   `accounts`, `statements`, `transactions`, `msi_plans`, `incomes`,
   `fixed_costs` y `debts`. Guárdalo **fuera del repo** (no lo commitees, no lo
   subas como artifact).
3. Abre la corrida en la pestaña Actions → botón **Review deployments** →
   selecciona `production` → **Approve and deploy**.
4. Verifica que `migrate-production`, `deploy-production` y `smoke-production`
   terminen verdes.

Solo se aprueba una vez por corrida: los tres jobs de prod corren seguidos tras
ese click.

**Un run esperando aprobación se cancela solo si llega otro push a `main`.**
Es el `concurrency: cancel-in-progress` de `ci.yml`: solo puede haber un run
vivo por rama, para que dos migraciones no peleen por la misma base. Dos
consecuencias prácticas:

- No hace falta cancelar a mano los gates viejos que se acumulan: al hacer
  push, el anterior queda `Cancelled` y el nuevo —que incluye ese commit y
  los siguientes— es el único que se puede aprobar. Nunca se puede promover
  por error un commit viejo.
- Si quieres que un cambio llegue a producción **solo**, sin mezclarse con el
  siguiente, aprueba su gate antes de mergear el siguiente PR. Una iteración a
  la vez: rama → PR → merge → sandbox → respaldo → aprobar → verificar → la
  siguiente.

## Saber qué commit corre en cada ambiente

> **Los e2e son también el smoke.** `e2e/*.spec.ts` corre dos veces: contra
> `next dev` en el job de e2e, y contra el sandbox y prod desplegados como
> smoke (con `PLAYWRIGHT_BASE_URL`). Un test que afirme algo que solo es
> cierto en local —un `env: "local"`, un dato de prueba que no existe en la
> base real— rompe el smoke y bloquea el gate. Ya pasó con `/api/version`.
> Antes de subir un e2e nuevo, correrlo también así:
> `PLAYWRIGHT_BASE_URL=https://finanzas-app-sandbox.vercel.app npx playwright test`.

`curl <host>/api/version` devuelve `{ sha, short, env }` del despliegue. Para
comprobar que todo está alineado, comparar contra `git rev-parse --short
origin/main`; localhost se compara con `git status -sb` (`behind N` = falta
`git pull`). Detalle en `environments.md` → «Saber qué corre dónde».

> **Nunca** subas un dump de **datos** de producción como artifact de Actions.
> En repos públicos los artifacts los descarga cualquiera; eso publicaría todos
> los movimientos bancarios. El pipeline solo sube el dump de **esquema**, que
> no lleva datos personales.

## Agregar una migración

1. Crea el archivo con el siguiente número: `supabase/migrations/00NN_lo_que_sea.sql`.
2. Que sea **aditiva** (agregar tablas/columnas/índices). Si crea una función
   `SECURITY DEFINER`, incluye el `revoke execute ... from public, anon,
   authenticated` — ver `0004_security_hardening.sql`, ese bug ya pasó una vez.
3. Si la tabla es de usuario: `enable row level security` + política de dueño.
   Sin excepción.
4. Merge a `main` → se aplica sola al sandbox. Pruébala ahí antes de aprobar prod.

**Cambios destructivos** (borrar o renombrar una columna que el código usa) van
en tres pasos, nunca en uno: migración aditiva → deploy del código que deja de
usar la columna vieja → migración posterior que la borra. Si borras y deployas
a la vez, la app vieja pega contra un esquema que ya no existe.

## Scripts de una sola corrida

Algunas migraciones necesitan que alguien recorra los datos existentes después
del deploy. No van en el pipeline: se corren a mano, en orden, y contra
producción siempre primero en seco.

### `scripts/reevaluar-domiciliaciones.ts` (migración 0011)

Las `recurring_charges` anteriores a 0011 no tienen `merchant_key`, y el
dashboard empareja por esa clave. **Sin correr esto, las domiciliaciones de un
usuario desaparecen del panel** hasta que suba un estado de cuenta nuevo. No es
opcional ni cosmético.

```bash
# Primero en seco: imprime qué haría y no escribe nada.
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  npx tsx scripts/reevaluar-domiciliaciones.ts --dry-run

# Si la salida cuadra, sin la bandera.
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  npx tsx scripts/reevaluar-domiciliaciones.ts
```

Usa la service role key porque tiene que ver las filas de todos los usuarios;
por eso vive fuera de la app y se corre a mano. Es idempotente, no borra nada, y
no toca las filas que el usuario ya respondió.

## Rollback

**El código:** en el dashboard de Vercel del proyecto afectado, busca el
deployment anterior y usa "Promote to Production". Es instantáneo y no depende
del pipeline.

**La base:** no hay rollback automático. Restaura el dump que sacaste antes de
aprobar. Por eso ese paso no es opcional.

Si una migración falló a medias, el deploy **no** llegó a correr (la cadena se
detiene), así que producción sigue sirviendo el código viejo — que es
justamente lo que queremos: arregla la migración con calma y vuelve a promover.

## Cuando el CI falla

| Job rojo | Qué pasó | Qué hacer |
|---|---|---|
| `lint-typecheck` | Lint o tipos | `npm run lint && npm run typecheck` en local |
| `unit` | Test unitario | `npm test` en local |
| `build` | El build de Next truena | `npm run build` en local |
| `e2e` | Regresión en redirects/auth | `npm run test:e2e` en local |
| `security` (gitleaks) | **Posible secreto commiteado** | No lo ignores. Si es un falso positivo de un fixture, agrégalo a `.gitleaks.toml` por ruta. Si es real: rota ese secreto **antes** de tocar el historial |
| `security` (audit) | Vulnerabilidad alta o crítica | `npm audit` para ver cuál; `npm audit fix` si hay arreglo |
| `migrate-*` | La migración no aplicó | Revisa el SQL contra el estado real de esa base; el deploy no corrió, no hay daño |
| `migrate-*` con `Remote migration versions not found in local migrations directory` | La base tiene registradas migraciones que no existen en `supabase/migrations/` — pasa cuando alguien aplicó algo desde el dashboard, que las registra con versión de timestamp. `db push` se niega a avanzar así (no es cosmético) | Quítalas del registro con `supabase migration repair --status reverted <version> ...`. Solo borra filas de la tabla de control, no toca el esquema |
| `smoke-*` | El deploy quedó roto | Rollback en Vercel (arriba) y diagnostica con calma |

## Crear un ambiente desde cero

Ver el checklist de setup manual en [`environments.md`](./environments.md).
El resumen: proyecto de Supabase → migraciones → OAuth de Google → proyecto de
Vercel sin conectar Git → 3 variables → GitHub Environment con sus secrets.

## Detalles del pipeline que conviene saber

- **Migrar va antes de deployar**, siempre. Si la migración falla, nada
  user-facing cambió.
- **Vercel no deploya solo.** La integración de Git está desconectada y
  `vercel.json` la bloquea. Si algún día ves un deploy que Actions no disparó,
  alguien reconectó el repo — desconéctalo o el gate de aprobación deja de
  servir.
- **`npm audit` bloquea por altas y críticas** (`--audit-level=high`). Si un
  hallazgo alto no tiene arreglo disponible y bloquea un deploy urgente, no
  bajes el gate: usa `npm audit --omit=dev` para saber si te afecta en runtime
  y decide con eso.
- **Los smoke tests son los mismos specs** de `e2e/`, apuntados a la URL
  desplegada con `PLAYWRIGHT_BASE_URL`. Cubren redirects sin sesión, no flujos
  autenticados.
