---
name: deploy
description: Operar el CI/CD de finanzas-app — promover a producción, diagnosticar un job rojo del pipeline, agregar migraciones de Supabase con seguridad, provisionar un ambiente nuevo, hacer rollback o rotar credenciales. Úsalo cuando pidan "deploy", "subir a producción", "promover", "el CI está fallando", "crear ambiente", "rollback" o "rotar llave".
---

# Operación del CI/CD de finanzas-app

App de finanzas personales con **datos financieros reales** en producción.
Antes de tocar nada, lee [`docs/architecture.md`](../../../docs/architecture.md),
[`docs/environments.md`](../../../docs/environments.md) y
[`docs/deploy.md`](../../../docs/deploy.md).

## Reglas que nunca se rompen

1. **Nunca subas un dump de datos de producción como artifact de Actions.** El
   repo es público y los artifacts se descargan sin autenticación: publicarías
   los movimientos bancarios del usuario. Solo dumps de **esquema** en CI; los
   datos se respaldan a mano, fuera del repo.
2. **Nunca rotes `ENCRYPTION_KEY`.** Cifra las API keys de IA de los usuarios;
   si cambia, todas quedan indescifrables. Es write-once por ambiente.
3. **Migrar siempre antes de deployar.** Si se invierte, el código nuevo pega
   contra un esquema viejo.
4. **Nunca conectes la integración de Git de Vercel.** Deploya por su cuenta y
   se salta el gate de aprobación de producción.
5. **Nunca apruebes producción sin respaldo de datos previo.** Supabase free no
   tiene backups automáticos; ese dump es el único rollback.
6. **Nunca escribas valores de secretos** en archivos del repo, en logs ni en
   mensajes de commit. Solo nombres.

## Promover a producción

No lo hagas por tu cuenta: la aprobación es del usuario. Tu trabajo es dejarlo
listo y verificar.

1. Confirma que la pierna de sandbox está verde:
   `gh run list --branch main --limit 1` y `gh run view <id>`.
2. Recuérdale al usuario el respaldo obligatorio **antes** de aprobar:
   ```bash
   supabase link --project-ref <ref-de-prod>
   supabase db dump --data-only -f backup-prod-$(date +%Y%m%d-%H%M).sql
   ```
   Fuera del repo. Verifica que el archivo exista y pese algo.
3. Dile que apruebe en Actions → **Review deployments** → `production`.
4. Cuando apruebe, verifica los tres jobs de prod y el smoke final.

## Agregar una migración

1. Siguiente número consecutivo en `supabase/migrations/`.
2. Aditiva. Nada de borrar/renombrar columnas en uso — eso va en tres pasos
   (aditiva → deploy que deja de usarla → migración que la borra).
3. Tabla de usuario ⇒ `enable row level security` + política de dueño
   (`auth.uid() = user_id`), sin excepción.
4. Función `SECURITY DEFINER` ⇒ incluye
   `revoke execute on function ... from public, anon, authenticated;`
   (ver `0004_security_hardening.sql`: ese bug ya ocurrió una vez).
5. Merge a `main` la aplica al sandbox sola. Que se pruebe ahí antes de prod.

## Diagnosticar el pipeline

```bash
gh run list --limit 5
gh run view <id> --log-failed
```

- `gitleaks` rojo ⇒ **no lo silencies sin mirar**. Si es un fixture conocido,
  va a `.gitleaks.toml` **por ruta**, nunca permitiendo el valor globalmente.
  Si el secreto es real: primero rotarlo, luego limpiar el historial.
- `migrate-*` rojo ⇒ el deploy no corrió, no hay daño user-facing. Arregla el
  SQL contra el estado real de esa base.
- `smoke-*` rojo ⇒ el deploy quedó publicado pero roto: rollback en Vercel
  ("Promote to Production" sobre el deployment anterior) y luego diagnostica.

## Provisionar un ambiente nuevo

Sigue el checklist de `docs/environments.md`. Lo que **no** puedes hacer tú
(requiere las cuentas del usuario): crear los proyectos de Supabase y Vercel,
configurar el OAuth de Google, y cargar secrets. Prepara los comandos, los
nombres exactos de cada variable y dónde va cada una, y deja que el usuario
ejecute esa parte.

Al terminar, **actualiza `docs/environments.md`** con los refs, IDs y URLs
reales del ambiente nuevo. Ese archivo es la bitácora: si no se actualiza,
deja de servir.

## Después de cambiar el pipeline

Actualiza los docs junto con el cambio, en el mismo commit — `deploy.md` si
cambió un procedimiento, `environments.md` si cambió dónde vive algo, y este
Skill si cambió una regla. Un runbook desactualizado es peor que ninguno.
