# Runbook de despliegue

Procedimientos operativos. Para el mapa de ambientes ver
[`environments.md`](./environments.md); para la arquitectura,
[`architecture.md`](./architecture.md).

## Cómo fluye un cambio

```
rama → PR → CI (lint+tipos, unit, build, e2e, seguridad)
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

## Promover a producción

1. Confirma que la pierna de sandbox quedó verde y que el sandbox desplegado se
   ve bien de verdad (no solo que el smoke pasó).
2. **Respalda los datos de producción.** Supabase free no tiene backups
   automáticos ni PITR: este dump es tu único rollback.
   ```bash
   supabase link --project-ref <ref-de-prod>
   supabase db dump --data-only -f backup-prod-$(date +%Y%m%d-%H%M).sql
   ```
   Guárdalo **fuera del repo** (no lo commitees, no lo subas como artifact).
3. Abre la corrida en la pestaña Actions → botón **Review deployments** →
   selecciona `production` → **Approve and deploy**.
4. Verifica que `migrate-production`, `deploy-production` y `smoke-production`
   terminen verdes.

Solo se aprueba una vez por corrida: los tres jobs de prod corren seguidos tras
ese click.

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
| `security` (audit) | Vulnerabilidad crítica | `npm audit` para ver cuál; `npm audit fix` si hay arreglo |
| `migrate-*` | La migración no aplicó | Revisa el SQL contra el estado real de esa base; el deploy no corrió, no hay daño |
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
- **`npm audit` hoy bloquea solo por críticas.** Cuando el repo esté limpio,
  sube el gate a `--audit-level=high` en `.github/workflows/ci.yml`.
- **Los smoke tests son los mismos specs** de `e2e/`, apuntados a la URL
  desplegada con `PLAYWRIGHT_BASE_URL`. Cubren redirects sin sesión, no flujos
  autenticados.
