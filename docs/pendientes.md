# Pendientes

Lo que quedó anotado y todavía no se hace. Cuando algo se complete, se borra de
aquí (el historial vive en git, no hace falta arrastrar una lista de "hechos").

---

## Respaldos de producción

**Hoy no existe ningún respaldo de los datos financieros.** Supabase en plan
gratis no hace backups automáticos, ni point-in-time, ni tiene botón de
restaurar: la única copia del historial es la base de producción misma.

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

**Pendiente aparte:** decidir cada cuándo hacerlo. Lo natural es después de
cada carga mensual de PDFs, que es cuando entra información nueva.

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

- **PRs de Dependabot abiertos** que son saltos de major y necesitan revisión:
  eslint 9→10 (#9), TypeScript 5→7 (#8), @types/node 20→26 (#7), y un grupo de
  10 actualizaciones minor/patch (#6). El grupo de minor/patch debería entrar
  sin drama; los otros tres requieren probar que nada se rompa.
- **`gitleaks-action@v2` corre sobre Node 20**, que GitHub ya marcó como
  deprecado. No hay v3 todavía; es aviso, no error. Revisar de vez en cuando.

---

## Documentación

- **`docs/environments.md`** tiene el checklist de setup manual con casillas sin
  marcar. Cuando producción quede publicada, marcarlas para reflejar lo que de
  verdad se hizo.
