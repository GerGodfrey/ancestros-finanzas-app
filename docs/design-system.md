# Sistema de diseño

> **Estado: implementado.** Los tokens viven en
> [`src/app/globals.css`](../src/app/globals.css), las primitivas en
> [`src/components/ui/`](../src/components/ui/) y el interruptor en
> [`src/components/theme-toggle.tsx`](../src/components/theme-toggle.tsx).
> Queda pendiente partir `dashboard-tabs.tsx`, anotado en
> [`pendientes.md`](./pendientes.md).
>
> Los prediseños que llevaron a estas decisiones:
> [direcciones](https://claude.ai/code/artifact/de569e11-e6ba-4f81-8ce4-652e6c4f94da) ·
> [tintas](https://claude.ai/code/artifact/b2d5b8d6-d59b-499d-a432-47e220027792).
> Los prompts para trabajo futuro: [`design-prompts.md`](./design-prompts.md).

Documento hermano de [`architecture.md`](./architecture.md). Aquel explica cómo
funciona la app; este, cómo se ve y por qué.

---

## El principio que ordena todo lo demás

**En una app de dinero, el color es información antes que decoración.**

Verde significa que te quedó saldo. Rojo, que perdiste. Ámbar, que revises algo.
Esos tres colores están ocupados por la semántica del dinero y no se pueden
prestar para nada más. Es la razón por la que el acento de marca es azul y no
rojo, aunque el rojo suizo se veía mejor en el prediseño: un riel rojo de 2 px
en un KPI sería ambiguo — nadie sabría si marca la marca o marca un problema.

De ahí se derivan las tres reglas duras del sistema:

1. **El acento nunca toca una cifra.** Vive en la tab activa, el riel del panel,
   la línea del home y el foco del teclado. Nunca en un número.
2. **Si algo tiene color, significa algo.** Un color decorativo compite con los
   que sí cargan sentido.
3. **El emoji es presentación, jamás dato ni condición.** Detalle abajo.

### El cuarto color: `--action`, el escarlata del hueco

Las tres reglas de arriba describen colores que hablan de lo que **pasó** con tu
dinero. Falta un caso que no es eso: un dato que **todavía no existe** y que sin
él una cifra miente. El "Ingreso Total" en $0.00 no es un cero: es una pregunta
sin responder, y el balance de al lado hereda esa mentira.

Eso se marca con `--action`, un escarlata propio —matiz 38 en Papel y 42 en
Plano, contra el 27 del `--negative` y el 70/75 del `--warning`—. Es un color
más en un sistema que presume de tener pocos, y se justifica porque el caso que
marca no es ninguno de los tres: "te falta un dato" no es ganancia, ni pérdida,
ni advertencia sobre el dinero. Habla del producto, no de tus finanzas.

Se usa a través de `<EmptySlot/>` (`src/components/ui/empty-slot.tsx`), dentro
de la caja a la que le falta el dato: una etiqueta **SIN USO** arriba, la cifra
en neutro, y debajo la acción en blanco y negritas —redactada como instrucción
("Da click para agregar ingreso"), no como etiqueta—, con la consecuencia en
gris chico.

Cinco restricciones que no se negocian:

- **Se ve siempre.** La primera versión lo escondía detrás del hover, con la
  caja en gris hasta que pasabas el cursor. Pasaba desapercibida — y en celular
  no hay cursor. Si la señal solo existe en hover, no existe.
- **No es una caja nueva.** Vive *dentro* del elemento al que le falta el dato.
  El dashboard ya es una pila de rectángulos; una categoría visual nueva no se
  crea agregando el siguiente.
- **El riel se apaga, no se enciende.** Probado en contexto: un riel escarlata
  cae junto a los rojos de Egreso y Balance y la fila entera se lee como "tres
  tarjetas en rojo". En gris, la tarjeta se lee apagada —que es lo que es— y el
  escarlata de adentro queda como el único color caliente de la fila.
- **El escarlata se concentra en un solo sitio: la etiqueta.** La acción va en
  blanco. Dos cosas en escarlata dentro de la misma caja se reparten la
  atención en vez de sumarla, y la que tiene que ganar es la etiqueta.
- **Mientras haya hueco, la cifra va en neutro.** `Stat` lo hace solo: un
  "$0.00" en verde afirma algo falso. El color del dinero vuelve cuando hay
  dinero que colorear.

---

## Los cuatro modos

Tomado de [impeccable.style](https://impeccable.style/). Cada superficie se
diseña para una intención, y las reglas cambian según cuál sea. Esto resuelve la
pregunta de "¿por qué el dashboard no se ve como el home?": porque no debe.
Comparten tokens, familia y escala; los usan distinto.

| Superficie | Modo | Qué manda |
|---|---|---|
| `/login` | **Persuade** | El visitante decide y actúa. Usa el rango alto de la escala, tipografía distintiva, el fondo 3D. |
| `/dashboard`, `/dashboard/upload`, `/settings` | **Operate** | El visitante completa una tarea. Escaneabilidad sobre expresión: rango medio, densidad, versalitas. |
| `/dashboard/chat` | **Read** | El visitante entiende algo. Estructura y medida de línea llevan la jerarquía; medida máxima ~65 caracteres. |

Antes de diseñar una superficie nueva, nómbrale el modo. Si no puedes, todavía
no sabes para qué es.

---

## Los dos temas

**Papel** de día, **Plano** de noche. No son dos diseños: son la misma
dirección con dos rampas. Comparten tipografía, radios, espaciado, semántica y
las diez categorías salvo por la luminosidad.

Se usa OKLCH y no hex porque la luminosidad del primer número es perceptual: dos
colores con la misma `L` pesan igual en el ojo aunque tengan tonos distintos.
Eso es lo que hace posible girar el tono de marca sin recalcular el contraste a
mano — y es la razón de que las diez categorías se vean como una familia en vez
de como diez colores sueltos.

### Los tres estados, y por qué el orden importa

El tema tiene **tres** estados, no dos: elección explícita clara, elección
explícita oscura, y *sin elección* — que es el default y donde solo manda el
sistema operativo. `src/app/globals.css` los cubre en este orden:

```css
:root                                    { /* PAPEL, completo */ }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="papel"])        { /* PLANO, solo redefine tokens */ }
}
:root[data-theme="plano"]                { /* PLANO otra vez */ }
```

El `:not([data-theme="papel"])` hace que una elección explícita de Papel gane
sobre un sistema en oscuro. El tercer bloque hace que gane en el otro sentido.

> **Regla dura:** ningún color se define *únicamente* dentro de un bloque
> `@media` o `[data-theme]`. Si lo haces, ese color no existe en el estado sin
> marcar —que es el de la mayoría de la gente— y la página sale con el texto de
> un tema sobre el fondo del otro. Todo token nace en `:root` y los otros
> bloques solo lo redefinen.

### Cómo se llaman los tokens

Cada color existe tres veces en `globals.css`, y eso es a propósito:

| Forma | Ejemplo | Para qué |
|---|---|---|
| Paleta | `--papel-accent`, `--plano-accent` | El valor real. **Se define una sola vez.** Es lo que editas. |
| Activo | `--accent` | Apunta a una de las dos según el tema. Úsalo en `style={{}}` y en props de Recharts. |
| Utilidad | `bg-accent`, `text-accent` | Lo que genera Tailwind desde `@theme inline`. Úsalo en `className`. |

Los tres bloques de tema solo reasignan la capa del medio. Cambiar un color es
editar la paleta; nunca hay que tocar las asignaciones.

### Superficie, borde y texto

Los nombres de la columna «Token» son los de la capa activa; la utilidad de
Tailwind es la misma sin el guion inicial (`--surface` → `bg-surface`).

| Token | Papel (día) | Plano (noche) | Para qué |
|---|---|---|---|
| `--color-surface` | `oklch(97.5% .003 250)` | `oklch(16.5% .008 255)` | El fondo de la página |
| `--color-surface-raised` | `oklch(100% 0 0)` | `oklch(20.5% .009 255)` | Cards y paneles |
| `--color-surface-raised-2` | `oklch(94.5% .004 250)` | `oklch(26% .010 255)` | Un escalón más: tab inactiva, hover |
| `--color-surface-sunk` | `oklch(93% .005 250)` | `oklch(13.5% .008 255)` | Inputs, campos de texto |
| `--color-border` | `oklch(89% .006 250)` | `oklch(28% .010 255)` | Bordes normales |
| `--color-border-strong` | `oklch(82% .008 250)` | `oklch(34% .010 255)` | Bordes que deben verse |
| `--color-text` | `oklch(22% .012 255)` | `oklch(94% .004 255)` | Texto principal |
| `--color-text-muted` | `oklch(46% .010 255)` | `oklch(70% .009 255)` | Texto secundario |
| `--color-text-faint` | `oklch(62% .008 255)` | `oklch(56% .009 255)` | Etiquetas, metadatos |
| `--color-scrim` | `oklch(22% .012 255 / .38)` | `oklch(0% 0 0 / .68)` | El velo detrás de los modales |

Fíjate en `--color-surface-sunk`: en Plano es **más oscuro** que la card que lo
contiene, y en Papel es **más claro**. Un input hundido se lee como hundido en
los dos temas, pero por caminos opuestos. Por eso es un token propio y no un
paso más de la rampa.

`--color-scrim` no es negro al 70 % en ambos: sobre papel, un velo negro tan
denso apaga la página entera. Es el único token cuya opacidad cambia con el tema.

### Semántica del dinero

| Token | Papel | Plano | Significa |
|---|---|---|---|
| `--color-positive` | `oklch(45% .12 155)` | `oklch(76% .13 155)` | Saldo a favor, mes que cuadró |
| `--color-negative` | `oklch(53% .19 27)` | `oklch(72% .16 27)` | Números rojos, intereses generados |
| `--color-warning` | `oklch(52% .13 70)` | `oklch(80% .13 75)` | Revisa esto |

### Marca

| Token | Papel | Plano | Dónde aparece |
|---|---|---|---|
| `--color-accent` | `oklch(46% .13 250)` | `oklch(74% .12 250)` | Tab activa, riel de panel, línea del home, foco |
| `--color-accent-ink` | `oklch(98% .003 250)` | `oklch(16% .02 250)` | Texto encima del acento |

Azul en 250°. Está a 95° del verde de positivo, a 137° del rojo de negativo y a
180° del ámbar: ninguna confusión posible en ninguno de los dos temas.

### Las diez categorías de gasto

Deben mantener el orden de la taxonomía de
[`src/lib/transaction-categories.ts`](../src/lib/transaction-categories.ts), que
a su vez espeja el enum `category` de `skills/pdf-statement-parser/schema.json`.

| Categoría | Papel | Plano |
|---|---|---|
| `comida` | `oklch(58% .17 50)` | `oklch(72% .18 55)` |
| `ropa` | `oklch(52% .19 10)` | `oklch(66% .19 12)` |
| `transporte` | `oklch(52% .14 235)` | `oklch(72% .13 220)` |
| `hogar` | `oklch(52% .15 148)` | `oklch(70% .17 145)` |
| `entretenimiento` | `oklch(52% .18 335)` | `oklch(70% .15 335)` |
| `tech` | `oklch(50% .13 265)` | `oklch(68% .11 255)` |
| `viaje` | `oklch(56% .15 105)` | `oklch(80% .17 100)` |
| `salud` | `oklch(54% .11 190)` | `oklch(74% .13 175)` |
| `intereses_comisiones` | `oklch(50% .20 27)` | `oklch(62% .21 27)` |
| `otros` | `oklch(56% .01 250)` | `oklch(60% .01 250)` |

Dos decisiones deliberadas:

`intereses_comisiones` **comparte tono con `--color-negative`**, y está bien: son
lo mismo conceptualmente. Es la única categoría a la que se le permite pisar la
semántica.

`otros` es el único gris. Una categoría que significa "no supimos clasificar
esto" no debería competir visualmente con las que sí dicen algo.

---

## Tipografía

**Archivo** para display e interfaz, **Geist Mono** para cifras. Dos familias, no
una: una app de dinero vive de columnas de números que alinean, y eso pide una
familia monoespaciada con `tabular-nums`. Ambas se cargan en
[`src/app/layout.tsx`](../src/app/layout.tsx) con `next/font/google`.

Archivo es una superfamilia con eje de ancho variable (`wdth` 62–125). El display
usa `112%` de ancho; la interfaz, `100%`. Es lo que da la jerarquía sin recurrir
a una segunda familia de titulares.

| Token | Tamaño | Uso |
|---|---|---|
| `--text-display` | `clamp(40px, 7vw, 84px)` | El hero de `/login`. Solo ahí. |
| `--text-2xl` | `30px` | `<h1>` de página en el área autenticada |
| `--text-xl` | `25px` | La cifra de un KPI |
| `--text-lg` | `20px` | `<h2>` de sección |
| `--text-base` | `16px` | Texto de lectura (chat, párrafos) |
| `--text-sm` | `14px` | Texto de interfaz por defecto |
| `--text-xs` | `12.5px` | Tablas densas, metadatos |
| `--text-2xs` | `11px` | Etiquetas en versalitas. **El piso: nada baja de aquí.** |

El paso `--text-2xs` existe para matar los 22 usos de `text-[10px]` y
`text-[11px]` que hoy andan sueltos en `dashboard-tabs.tsx`. Once píxeles es el
mínimo legible; diez ya no lo es.

Las etiquetas de `--text-2xs` van siempre en versalitas con `letter-spacing:
.11em`. Es lo que hace que un `<h3>` de panel se lea como etiqueta y no como
título, y lo que permite bajarlo de tamaño sin que desaparezca.

**Toda cifra de dinero lleva `font-mono` y `tabular-nums`.** Sin excepción. Es la
diferencia entre una tabla que se puede escanear y una que hay que leer.

### Ritmo de espaciado

| Utilidad | Valor | Separa |
|---|---|---|
| `mt-section`, `py-section`… | `3.5rem` | Secciones de una página |
| `mt-block`, `gap-block`… | `1.375rem` | Bloques dentro de una sección |
| `mt-tight`, `gap-tight`… | `.75rem` | Elementos dentro de un bloque |

Se declaran como `--spacing-section` / `--spacing-block` / `--spacing-tight`
dentro de `@theme inline`, que es lo que hace que Tailwind genere utilidades
reales para todas las propiedades de espaciado.

> **Trampa:** escribir `mt-[--space-section]` **no funciona en Tailwind 4**.
> Produce `margin-top: --space-section` —un nombre de propiedad donde va un
> valor— y el navegador descarta la declaración en silencio. La página se ve
> apretada y no hay ningún error. Si necesitas una variable suelta en un valor
> arbitrario, la forma correcta es `mt-(--mi-var)` o `mt-[var(--mi-var)]`.

Tres pasos, no uno. Con un solo valor repetido nada se agrupa: las secciones
respiran igual que los renglones.

En páginas que son casi puro texto —Configuración, Subir— los tres pasos no
alcanzan solos, porque no hay cards que agrupen como sí las hay en el
dashboard. Ahí `PageSection` añade una **regla horizontal** arriba de cada
sección. La línea no es adorno: sin ella el ojo no sabe dónde termina una
sección y empieza la siguiente.

### Radios

`--radius: 2px`, y ya. Casi a escuadra en todo: cards, botones, inputs, tabs,
chips. La única excepción es el interruptor de tema, que es una píldora porque
un switch tiene que verse como un switch.

---

## Emojis

Los emojis son la iconografía de este producto. No hay librería de iconos y no
hace falta: los emojis se leen rápido, no pesan y le dan carácter. Pero tienen
que estar **desacoplados del texto y de la lógica**.

### La regla

> **El emoji es presentación. Nunca dato, nunca condición.**

Hoy se viola en dos lugares, y los dos se corrigen:

`CATEGORY_LABEL` mete el emoji dentro del string (`"🍽️ Comida"`), así que no se
puede estilar aparte ni suprimir. Se parte en dos mapas:

```ts
export const CATEGORY_LABEL: Record<TransactionCategory, string>  // "Comida"
export const CATEGORY_EMOJI: Record<TransactionCategory, string>  // "🍽️"
```

Y peor: `dashboard-tabs.tsx:605` hace `tag.startsWith("✅")` para decidir el
color de un badge, con los strings generados en
[`get-monthly-data.ts`](../src/lib/dashboard/get-monthly-data.ts). Cambiar un
emoji ahí puede romper un color. La corrección es que el backend devuelva
`{ tone, text }` y la UI elija emoji y color desde el `tone` — la misma forma que
ya usa `statusBadge`.

### Los mapas

**Categorías** — `src/lib/transaction-categories.ts`:

| Clave | Emoji | Etiqueta |
|---|---|---|
| `comida` | 🍽️ | Comida |
| `ropa` | 👗 | Ropa |
| `transporte` | 🚗 | Transporte |
| `hogar` | 🏠 | Hogar |
| `entretenimiento` | 🎭 | Entretenimiento |
| `tech` | 💻 | Tech |
| `viaje` | ✈️ | Viaje |
| `salud` | 💪 | Salud |
| `intereses_comisiones` | 📉 | Intereses/Comisiones |
| `otros` | 🗂️ | Otros |

**Tonos** — el mapa que reemplaza los `startsWith`:

| Tono | Emoji | Color |
|---|---|---|
| `good` | ✅ | `--color-positive` |
| `bad` | 🔴 | `--color-negative` |
| `warn` | ⚠️ | `--color-warning` |

**Pestañas del dashboard**: 📊 Resumen · 🧩 Desglose · 🧾 Movimientos ·
📅 Próximo Mes · 🧮 Validación.

---

## El interruptor

Vive en Configuración → Apariencia. Tres piezas:

[`src/lib/theme.ts`](../src/lib/theme.ts) guarda la elección en `localStorage`
bajo `finanzas:theme`, estampa `data-theme` en `<html>`, y emite un
`CustomEvent("themechange")` en `window`. Ese evento existe por una razón muy
concreta: la escena de three.js del home se construye una sola vez en un
`useEffect` y no se enteraría del cambio de otro modo.

[`THEME_INIT_SCRIPT`](../src/lib/theme.ts), inyectado como script inline en
`layout.tsx`, corre **antes del primer pintado**. Sin él, quien eligió Papel en
una máquina con el sistema en oscuro ve un destello negro en cada carga. Es el
único script inline de la app.

[`ThemeToggle`](../src/components/theme-toggle.tsx) lee el estado con
`useSyncExternalStore` — el tema es estado externo (localStorage, el sistema
operativo, un atributo del DOM), así que leerlo con `useState` + `useEffect`
sería llamar a `setState` dentro de un efecto. De paso, el interruptor se
mantiene al día si el tema cambia desde otra pestaña.

El switch tiene dos posiciones pero el sistema tiene tres estados: junto a él
hay un enlace «Seguir al sistema» que borra la elección. Sin esa segunda pieza,
un switch binario obligaría a elegir desde el primer día.

---

## Los billetes: contenido, no cromo

Los billetes de [`bill-textures.ts`](../src/lib/three/bill-textures.ts) son
**contenido**, y el contenido no se tiñe para hacer juego con el tema. Esa es
la regla general del sistema: el cromo (fondos, bordes, texto de interfaz,
acentos) responde al tema; el contenido no. El logo de Google del botón de
acceso obedece a lo mismo — es marca ajena y se queda como es.

Pero «no teñir» no es «renderizar igual». En Papel los billetes a color no
funcionaban, y vale la pena registrar por qué, porque la causa no era el color:

- Iban semitransparentes (`opacity 0.88`) con `DoubleSide`, así que al
  encimarse se **multiplicaban en parches marrones**. Sobre negro esa
  transparencia lee como profundidad; sobre blanco lee como suciedad.
- Su papel es crema (`#efe6ce`), que contra un blanco frío se ve sucio.

Así que en Papel se dibujan con `BILL_DENOMINATIONS_MONO` y `PAPER_COOL`:
monocromos y **opacos**. Al ser opacos, el buffer de profundidad hace que el
billete de enfrente simplemente tape al de atrás, y los traslapes dejan de
ensuciar. Lo que se ve es una marca de agua — papel moneda visto al trasluz —
que es lo que un fondo claro pide.

Es el mismo dibujo con otra tinta: `createBillTexture` recibe la paleta y el
papel, así que no hay código duplicado. Se generan los dos juegos al montar y
se intercambian con `material.map` al cambiar de tema.

### La luz también cambia, y al revés de lo intuitivo

En [`bills-background.tsx`](../src/components/bills-background.tsx):

- La niebla (`scene.fog`) iguala `--surface`, o los billetes se desvanecen
  hacia un color que no está en la página. En Papel además se aleja (`near` 15
  en vez de 12) para que los del fondo no se borren.
- La exposición **baja** en Papel. Subirla fue mi primer intento y fue un
  error: con más luz los billetes se lavan hasta volverse manchas pastel. Contra
  un fondo claro lo que necesitan es contraste, no iluminación.
- **En Papel los billetes van sin iluminar.** Los planos son `DoubleSide`, así
  que el que da la espalda a la luz se renderiza casi carbón: de ahí salían
  billetes desparejos, unos grises de plomo junto a otros casi blancos. Pasar
  la textura a `emissiveMap` con `color` en negro apaga el modelado, y cada
  billete queda del mismo tono mire a donde mire — que es como se comporta una
  marca de agua. La niebla sigue actuando, así que la profundidad no se pierde.
- La composición está sesgada a la derecha a propósito (`baseX` arranca en 5.5)
  y ninguno se acerca a la cámara más de `z = -2.5`. El texto vive a la
  izquierda; los billetes forman una deriva diagonal en vez de esparcirse.
- Como los tokens son `oklch()` y `THREE.Color` no parsea oklch, el color se
  resuelve pintándolo en un canvas de 1×1 y leyendo el sRGB — el mismo camino
  que usa el navegador.

La escena escucha `themechange` y `prefers-color-scheme`, así que todo esto
ocurre en vivo: mover el interruptor en Configuración y volver al home no
requiere recargar.

---

## Las primitivas

Viven en [`src/components/ui/`](../src/components/ui/) y se importan desde
`@/components/ui`. Existen porque estaban demostradamente duplicadas —el botón
en 10 archivos, la card en 11—, no por especulación. Sin CVA ni
tailwind-merge: con estas variantes, un objeto de strings basta.

| Primitiva | Para qué | Nota |
|---|---|---|
| `Button` | Toda acción. Variantes `primary` (tinta invertida), `ghost`, `danger`; tamaños `sm`, `md` | `type="button"` por defecto: dentro de un `<form>` hay que pasar `type="submit"` explícito |
| `Card` | La superficie elevada | |
| `Panel` | Card con título en versalitas y riel de acento | El riel es siempre acento: un riel de color de tono significaría algo |
| `Stat` | La cifra de un KPI, en Geist Mono con `tabular-nums`; riel de 2 px que toma el **tono** | |
| `Badge` | Estado con tono; el emoji sale del tono, nunca al revés | `withEmoji` lo muestra |
| `Modal` | Diálogo; `Escape` y clic fuera lo cierran | Subió desde `dashboard-tabs.tsx` cuando lo necesitó la guía de API keys |
| `PageSection` | Sección de página de ajustes: título, descripción, regla arriba | Acepta `id` para anclar (`/settings#tarjetas`) |
| `FieldGroup` | Subtítulo de bloque dentro de una sección | |

Los mapas de tono (`TONE_EMOJI`, `TONE_TEXT`, `TONE_RAIL`, `TONE_CHIP`) están
en `tone.ts` y son el único lugar donde un tono se convierte en color o emoji.

Componentes de feature que siguen las mismas reglas pero no son primitivas:
`OnboardingChecklist` (dashboard vacío de un usuario nuevo), `IssuerField`
(selector de banco con salida a «Otro», dentro de `account-settings.tsx`) y
`ThemeToggle`.

## Cómo cambiar cada cosa

### Cambiar el color de marca

Un valor por tema en `src/app/globals.css`: `--color-accent` en el bloque
`:root` (Papel) y en los dos bloques de Plano. Cambia solo el tercer número —el
tono, en grados— y deja la luminosidad y el croma como están; eso preserva el
contraste.

**Antes de elegir el tono, revísalo contra la semántica.** Debe quedar a más de
40° del verde (155°), del rojo (27°) y del ámbar (70°). Fuera de ese cerco solo
quedan azules, magentas y el acromático.

### Cambiar una fuente

Dos lugares. El `import` de `next/font/google` en `src/app/layout.tsx`, y el
token `--font-sans` / `--font-mono` / `--font-display` en `globals.css`. Si la
familia nueva no tiene eje de ancho variable, quita también `font-stretch` de
las reglas de display.

Al elegir, evita Inter, Geist y Space Grotesk: son las tres que el detector de
Impeccable marca como *overused font*.

### Cambiar un emoji

Una línea en `CATEGORY_EMOJI` (categorías) o en el mapa de tonos
(estados). No toques `CATEGORY_LABEL`: ahí ya no hay emojis.

Para comprobar que el desacople sigue sano, vacía un valor de `CATEGORY_EMOJI`.
La etiqueta debe seguir leyéndose y el badge conservar su color. Si el color se
rompe, alguien volvió a meter un `startsWith`.

### Agregar una categoría de gasto

Cuatro archivos, en este orden — el primero es el que manda:

1. `skills/pdf-statement-parser/schema.json`, el enum `category`. Si no está
   aquí, la IA nunca la va a asignar.
2. `src/lib/transaction-categories.ts`: el array `TRANSACTION_CATEGORIES`, más
   una entrada en `CATEGORY_LABEL`, `CATEGORY_EMOJI` y `CATEGORY_COLOR`.
3. `src/app/globals.css`: `--color-cat-<nueva>` en los tres bloques de tema.
4. Las transacciones ya guardadas conservan su categoría anterior; no hay
   migración, pero conviene revisar si alguna debería reclasificarse.

Para el color, busca un hueco de al menos 25° en la rueda contra las diez que ya
existen, y respeta la luminosidad de la columna (≈52 % en Papel, ≈70 % en Plano).

### Agregar una superficie nueva

Nómbrale el modo primero (Persuade / Operate / Read). Eso decide qué rango de la
escala usar y cuánta expresión se permite. Después: tokens para todo, ningún hex,
`font-mono tabular-nums` en cada cifra, y revísala contra la lista de abajo.

Hay un prompt listo para esto en [`design-prompts.md`](./design-prompts.md).

---

## Lo que evitamos, y cómo se llama

Del [detector de Impeccable](https://impeccable.style/slop), 61 checks. Estos
diez estaban en el repo y son la lista contra la que se revisa cualquier cambio
de UI antes de subirlo:

| Check | Qué era |
|---|---|
| `overused font` | Geist, en la lista negra junto con Inter y Space Grotesk |
| `single font for everything` | Una sola familia para títulos, interfaz y cifras |
| `ai color palette` | Violeta `#7C3AED` + índigo `#6366F1` + azul `#3B82F6` en las categorías, y el gradiente índigo→violeta de las tabs |
| `radial spotlight glow` | El halo `bg-[#12141e]/55 blur-3xl` del login |
| `extreme border-radius` | Ese mismo halo, con `rounded-[3rem]` |
| `flat type hierarchy` | 92 % del texto entre 12 y 14 px |
| `undersized functional text` | 22 usos de `text-[10px]` y `text-[11px]` |
| `monotonous spacing` | `px-6 py-10` repetido en las cuatro páginas |
| `nested cards` | Paneles dentro de paneles en Desglose y Validación |
| `side-tab accent border` | El riel violeta de 4 px de cada KPI |

Y tres que no estaban pero acechan, porque son los defaults de cualquier interfaz
generada: **fondo crema con serif y acento terracota**, **gradientes
púrpura-a-azul**, y **punto de estado pulsante**.

---

## Accesibilidad

- Texto normal ≥ 4.5:1 contra su fondo; elementos de interfaz ≥ 3:1. **En los
  dos temas** — es fácil validar solo el que tienes puesto.
- El foco de teclado siempre visible: `outline: 2px solid var(--color-accent)`
  con `outline-offset: 2px`. Nunca `outline: none` sin reemplazo.
- El interruptor de tema es `role="switch"` con `aria-checked` y opera con
  teclado.
- `prefers-reduced-motion` apaga la deriva de los billetes en `/login`: la escena
  se dibuja una sola vez, quieta.
- El color nunca es el único portador de significado. Un movimiento negativo se
  distingue por el signo y por el color, no solo por el color.
