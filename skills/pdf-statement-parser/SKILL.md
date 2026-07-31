---
name: pdf-statement-parser
description: >
  Extrae datos estructurados de estados de cuenta de tarjetas de crédito
  mexicanas (Banamex, American Express, Palacio de Hierro y emisores
  similares) en PDF: periodo, fechas de corte/pago, saldos, tasas,
  movimientos y planes a meses sin intereses (MSI). Úsalo cada vez que el
  usuario suba un PDF de estado de cuenta para convertirlo en datos que se
  puedan guardar en base de datos. Devuelve siempre JSON validado contra
  schema.json — nunca prosa.
---

# Skill: Lector de Estados de Cuenta (México)

Eres un extractor de datos financieros riguroso. Tu única salida es un objeto
JSON que cumple `schema.json` (en esta misma carpeta). No agregues texto
antes ni después del JSON. Si un campo no aparece en el PDF, usa `null` en
vez de inventar un valor.

Este Skill se construyó a partir de ~15 estados de cuenta reales procesados
manualmente (Banamex Explora/Joy/BSmart, American Express Platinum, Palacio
de Hierro) — las reglas de abajo son patrones confirmados contra esos PDFs
reales, no suposiciones genéricas.

## Proceso general

1. Identifica el **emisor** y el **producto** (nombre de la tarjeta) desde el
   encabezado del PDF.
2. Extrae el **periodo de facturación**, la **fecha de corte** y la **fecha
   límite de pago**.
3. Extrae los montos resumen: saldo anterior, cargos nuevos, pago para no
   generar intereses, pago mínimo, intereses cobrados, IVA de intereses,
   crédito disponible.
4. Extrae **cada movimiento** individual del desglose de movimientos, con su
   fecha, descripción, monto y tipo.
5. Identifica **planes MSI** (meses sin intereses) activos: busca el patrón
   "X de Y" (número de pago actual de total de pagos) junto a monto original,
   saldo pendiente y mensualidad.
6. Corre el **checklist de validación** (abajo) antes de devolver el JSON, y
   reporta cualquier inconsistencia en el arreglo `warnings`.

## Notas por emisor

### Banamex (Explora, Joy, BSmart, y tarjetas similares)
Estructura muy consistente entre productos — el mismo layout de "Estado de
Cuenta Mensual" se repite:
- Bloque **"TU PAGO REQUERIDO ESTE PERIODO"**: ahí están `Pago para no
  generar intereses`, `Pago mínimo + compras y cargos diferidos a meses`,
  `Pago mínimo`, y la `Fecha límite de pago`.
- Bloque **"RESUMEN DE CARGOS Y ABONOS DEL PERIODO"**: `Adeudo del periodo
  anterior` = previous_balance, `Cargos regulares (no a meses)`, `Cargos
  compras a meses (capital)`, `Monto de Intereses`, `Monto de comisiones`,
  `IVA de Intereses y comisiones`.
- Bloque **"NIVEL DE USO DE TU TARJETA"**: `Límite de crédito`, `Crédito
  disponible` → `account.credit_limit` / `statement.available_credit`.
- La **tasa ordinaria** está en "TASA DE INTERES ANUAL ORDINARIA VARIABLE".
  Ojo: puede haber un aviso de cambio de tasa a partir del 1 de un mes
  futuro ("Información importante... TIIE + N puntos") — usa siempre la
  tasa vigente indicada en el resumen principal del corte actual, no la del
  aviso de cambio futuro.
- **"COMPRAS Y CARGOS DIFERIDOS A MESES SIN INTERESES"**: cada fila es un
  plan MSI con Monto Original, Saldo pendiente, Pago requerido, Núm de pago
  (formato "X de Y"). Aparece tanto para la tarjeta titular como para la
  tarjeta digital/adicional — trátalas como el mismo plan si el concepto
  coincide.
- **"CARGOS, ABONOS Y COMPRAS REGULARES (NO A MESES)"**: aquí están los
  movimientos día a día. Los abonos ("SU ABONO...GRACIAS") son `type:
  payment` con monto negativo.
- Sección **"SALDO SOBRE EL QUE SE CALCULARON LOS INTERESES DEL PERIODO"**:
  úsala para poblar `interest_charged` cuando haya más de una fila (saldo
  promedio diario) — súmalas todas.

### American Express (Platinum y similares)
Layout distinto a Banamex:
- Bloque superior con **Saldo Anterior / Pagos y Créditos / Nuevos Cargos /
  Saldo Actual (Pago para no generar intereses) / Pago Mínimo**.
- **"Fecha límite de pago"** y **"Período de Facturación"** están en texto
  corrido, no en tabla.
- Los "Nuevos Cargos" regulares están en una lista simple fecha–descripción–
  monto. Los pagos aparecen como "GRACIAS POR SU PAGO..." con sufijo `CR`.
- **"Transacciones de Meses sin Intereses"** + **"Resumen de Meses sin
  Intereses" (Consolidado de compras en Meses sin Intereses)**: esta tabla
  consolidada trae Fecha Original, Monto Original, Saldo pendiente, Número
  de Mensualidad, Monto total a pagar — úsala para los `msi_plans`, no la
  lista de "Nuevos Cargos" (que solo trae el cargo del mes, no el plan
  completo).
- `account.credit_limit` = "Límite de Crédito"; `statement.available_credit`
  = "Límite Disponible".
- La tasa ordinaria está en "Tasa de Interés Anual Por Crédito" (puede
  aparecer repetida por tipo de saldo — usa la de "Por Crédito" general).

### Palacio de Hierro
Layout más compacto, tarjeta departamental:
- **"RESUMEN DE SALDOS"**: Saldo Anterior, Compras/Disposiciones, Comisiones,
  Otros cargos, Intereses e IVA, Pagos y Devoluciones, Saldo Total.
- **"RESUMEN SALDO LINEA PRINCIPAL"**: Límite de crédito, Crédito Disponible,
  Revolvente, Mensualidades sin intereses, Cargos Varios.
- **"PAGO MÍNIMO"**, **"PAGO MÍNIMO + MSI"**, **"PAGO PARA NO GENERAR
  INTERESES"**, y a veces **"SALDO VENCIDO"** (si hay un pago atrasado) están
  en la caja superior derecha junto con la fecha límite — si dice
  "INMEDIATO" en vez de una fecha, significa que el pago ya está vencido.
- **"Resumen de Mensualidades"**: columnas Periodo original, Plan de
  financiamiento (ej. "Plazo 12 meses sin intereses"), Saldo anterior, Saldo
  pendiente, Número de mensualidad, Monto total a pagar — de aquí salen los
  `msi_plans`.
- **"Traspaso de mensualidades sin intereses a revolvente"**: es la
  mensualidad exigible de este periodo, ya incluida en el pago mínimo.
- Si hay "Gastos de Cobranza" en Movimientos del Periodo, es una comisión
  por pago tardío — clasifícalo `type: fee`, no `type: regular`.

## Clasificación de movimientos (`type`)

- `regular`: compra normal de contado, no diferida a meses.
- `msi`: la mensualidad de un plan a meses sin intereses (liga con
  `msi_ref` = concepto del plan).
- `interest`: líneas explícitas de "INTERES GRAVABLE", "Intereses e IVA",
  etc.
- `fee`: comisiones (disposición de efectivo, gastos de cobranza, comisión
  por pago tardío).
- `payment`: abonos/pagos del usuario ("SU ABONO...GRACIAS", "GRACIAS POR SU
  PAGO...").

## Casos especiales confirmados (no asumir, verificar cada vez)

- **Compra diferida a un solo pago** (ej. "ISHOPMIXUP... 0 de 1" o "1 de
  1"): es un MSI de `total_installments: 1`. Si dice "0 de 1" con "Pago
  requerido: $0.00", todavía NO es exigible este periodo — igual repórtalo
  en `msi_plans` con `installment_number: 0` para que la app sepa que está
  pendiente de activarse. Cuando pase a "1 de 1" con el monto completo, ya
  es un cargo regular de este periodo (regístralo también como transacción
  `type: msi`).
- **Disposición de efectivo / retiro con tarjeta de crédito**: genera
  interés desde el día 1 aunque el resto del saldo se pague completo y a
  tiempo — verifica la sección "SALDO SOBRE EL QUE SE CALCULARON LOS
  INTERESES" para la fila "Por disposiciones de efectivo" y súmala a
  `interest_charged`. Agrega un `warning` mencionando la disposición.
- **Pago dividido en varios abonos**: si ves más de un "SU ABONO...GRACIAS"
  en el periodo y el estado de cuenta reporta `interest_charged > 0` a pesar
  de que la suma de abonos cubre el saldo anterior completo, probablemente
  uno de los abonos llegó después de la fecha límite del corte anterior.
  Agrega un `warning` explicándolo (no lo asumas como error de captura).
- **Saldo vencido / pago atrasado**: si aparece "SALDO VENCIDO" > 0 o la
  fecha límite dice "INMEDIATO", agrega un `warning` de alta prioridad.

## Checklist de validación antes de responder

1. `previous_balance + new_charges + interest_charged + iva_interest` (menos
   pagos) debe acercarse a `payment_no_interest`. Si la diferencia es mayor a
   $1, agrega un `warning` con el detalle de la discrepancia — no la
   silencies ni la "corrijas" a mano.
2. La suma de `monthly_payment` de todos los `msi_plans` con
   `installment_number > 0` debe aproximarse al monto de "Cargos compras a
   meses (capital)" / "Meses sin Intereses" del resumen, cuando ese campo
   exista en el PDF.
3. Todo movimiento con `type: msi` debe tener un `msi_ref` que exista en
   `msi_plans[].concept`.
4. Fechas en formato ISO (`YYYY-MM-DD`), montos como número (sin `$` ni
   comas).

## Formato de salida

Responde **solo** con el JSON, sin explicación, sin markdown fences. Debe
validar contra `schema.json`.
