# Prompts de diseño

Prompts reutilizables para pedir trabajo visual sobre esta app —animaciones,
superficies nuevas, auditorías— sin tener que reconstruir el contexto cada vez.

Cada prompt asume que quien lo lee **no vio la conversación donde se diseñó el
sistema**. Por eso todos empiezan pegando el mismo bloque de contexto.

Documento hermano de [`design-system.md`](./design-system.md), que es donde viven
los valores exactos.

---

## Bloque A — el producto

**Pega esto antes de cualquier prompt de abajo.** Sin él, lo que recibas va a ser
genérico: una app de finanzas cualquiera en vez de esta.

> ### El producto
>
> `finanzas-app` es una webapp de **finanzas personales de un solo usuario por
> cuenta**. No es un SaaS multiusuario ni un producto de equipo: cada persona ve
> exclusivamente su propio dinero, y la autorización vive en la base de datos
> (RLS de Postgres), no en la app.
>
> **El flujo central, que es lo que la hace distinta:** subes el PDF del estado
> de cuenta de tu tarjeta de crédito, una IA lo lee y lo convierte en datos
> estructurados —movimientos, montos, fechas, categorías—, y eso alimenta un
> dashboard mensual y un chatbot que puede consultar tu historial real. No hay
> captura manual de movimientos ni conexión bancaria: el PDF es la entrada.
>
> **Detalles que importan para el diseño:**
>
> - **Es mexicana.** Pesos mexicanos, formato `es-MX`, todo el texto de la
>   interfaz en español. Los montos se ven así: `$38,412.60`.
> - **Meses sin intereses (MSI).** Un concepto de tarjeta de crédito mexicano:
>   compras diferidas a plazos sin interés. La app rastrea los planes activos y
>   cuánto falta. No existe un equivalente directo en productos gringos.
> - **El usuario pone su propia API key de IA.** Se guarda cifrada. Elegir
>   proveedor y modelo es parte de la configuración, no algo oculto.
> - **Detección de domiciliaciones**, determinística, sin IA.
> - **Insights mensuales** generados por IA cada vez que se procesa un estado.
> - **El acceso es solo con Google**, con un fondo 3D de billetes mexicanos
>   flotando (three.js) en la pantalla de entrada. Es la firma visual del
>   producto.
> - **Un heatmap de historial de subidas**, estilo gráfica de contribuciones,
>   que muestra qué meses tienes cubiertos y cuáles te faltan.
> - Un usuario típico tiene **dos o tres tarjetas** y sube un PDF por tarjeta por
>   mes. A los dos años, el dashboard tiene que aguantar mucho dato en pantalla.
>
> ### El stack
>
> Next.js 16 (App Router, Server Components), TypeScript estricto, Tailwind 4
> (sin `tailwind.config`: los tokens viven en `@theme inline` dentro de
> `src/app/globals.css`), Supabase (Postgres + Auth + Storage), Recharts para
> gráficas, three.js para el fondo del login. Despliegue en Vercel.
>
> ### El sistema de diseño
>
> Está documentado completo en `docs/design-system.md`. **Léelo antes de
> escribir código.** El resumen operativo:
>
> - **Dos temas:** `Papel` (claro) de día y `Plano` (oscuro) de noche. Misma
>   dirección, dos rampas. Hay un interruptor en Configuración. Todo lo que
>   construyas tiene que verse bien en los dos, y en el estado *sin elección*
>   donde solo manda el sistema operativo.
> - **Tipografía:** Archivo (display e interfaz, con eje de ancho variable) y
>   Geist Mono (cifras). **Toda cifra de dinero lleva `font-mono` y
>   `tabular-nums`.**
> - **Radios de 2 px** en todo. Casi a escuadra.
> - **Etiquetas en versalitas** con `letter-spacing: .11em`, nunca por debajo de
>   11 px.
> - **El color es información.** Verde = saldo a favor, rojo = pérdida, ámbar =
>   revisa esto. Están ocupados por la semántica del dinero. El acento de marca
>   es azul (250°) justamente para no chocar con ellos, y **nunca toca una
>   cifra**: vive en la tab activa, el riel del panel y el foco del teclado.
> - **Cero hex.** Todo sale de `var(--color-*)`.
> - **Cuatro modos.** Cada superficie se diseña para una intención: *Persuade*
>   (`/login`), *Operate* (`/dashboard`, `/settings`, `/dashboard/upload`),
>   *Read* (`/dashboard/chat`). Nombra el modo antes de diseñar.
> - **Emojis como iconografía**, pero desacoplados: viven en mapas propios
>   (`CATEGORY_EMOJI`, mapa de tonos), nunca dentro de un string de texto y
>   **nunca como condición en código**.
>
> ### Lo que no queremos
>
> Evita los defaults de interfaz generada por IA: gradientes púrpura-a-azul,
> fondo crema con serif y acento terracota, puntos de estado pulsantes, tarjetas
> dentro de tarjetas, esquinas muy redondeadas, resplandores radiales
> decorativos, texto con gradiente, jerarquía tipográfica plana, y las fuentes
> Inter, Geist o Space Grotesk. La referencia es
> [impeccable.style/slop](https://impeccable.style/slop).

---

## 1 · Animaciones

> **[Bloque A]**
>
> Quiero movimiento en la app, pero poco y con criterio. Hoy no hay ninguno.
>
> Diseña e implementa:
>
> 1. **La transición entre las cinco pestañas del dashboard** (Resumen,
>    Desglose, Movimientos, Próximo Mes, Validación). Hoy el contenido se
>    reemplaza de golpe. El cambio de pestaña no es navegación: es cambiar de
>    ángulo sobre el mismo mes, y la transición debería decir eso.
> 2. **La entrada del dashboard al cargar un mes.** Los KPIs, los paneles y las
>    gráficas aparecen todos a la vez. Una secuencia corta que respete la
>    jerarquía —primero la cifra grande, luego el detalle— ayudaría a leer la
>    pantalla.
> 3. **El feedback al subir un PDF.** Procesar un estado de cuenta tarda: se
>    descarga, se manda a la IA, se valida contra el esquema, se escriben las
>    tablas y se regeneran los insights. Hoy el usuario espera sin saber en qué
>    paso va. Quiero que la espera comunique progreso real, no un spinner.
>
> Restricciones:
>
> - **Nada de rebote ni easing elástico.** Este producto administra dinero; el
>   movimiento tiene que leerse como preciso, no como juguetón.
> - **No animes propiedades de layout** (`width`, `height`, `padding`,
>   `margin`). Solo `transform` y `opacity`.
> - **Nada de puntos pulsantes ni cursores parpadeantes.**
> - Duraciones cortas: 120–240 ms para micro-interacciones, hasta 400 ms para
>   una secuencia de entrada.
> - **`prefers-reduced-motion` tiene que apagarlo todo**, dejando el estado final
>   visible. No es opcional.
> - Sin librerías nuevas de animación. CSS y la Web Animations API alcanzan.
>
> Antes de escribir código, dime en dos o tres frases qué idea de movimiento
> propones y por qué encaja con un producto de finanzas.

---

## 2 · Estados vacíos y de carga

> **[Bloque A]**
>
> Los estados vacíos de esta app están sin diseñar: son un párrafo gris dentro de
> una card. Y son, paradójicamente, **lo primero que ve todo usuario nuevo** —
> una cuenta recién creada no tiene ningún PDF procesado, así que el dashboard
> arranca vacío.
>
> Diseña los siguientes, en los dos temas:
>
> 1. **Dashboard sin ningún estado de cuenta.** El caso del usuario nuevo. No es
>    un error: es el punto de partida, y debería explicar el flujo (sube el PDF
>    de tu tarjeta) y llevar a la acción.
> 2. **Dashboard con datos, pero navegando a un mes sin estados subidos.** Es
>    distinto del anterior: aquí sí hay historial, solo falta ese mes. Hay que
>    ofrecer subirlo o volver a un mes que sí tenga datos.
> 3. **Chat sin conversación.** Un chatbot con la caja vacía no sugiere qué se le
>    puede preguntar. Puede consultar el historial real: cuánto gastaste en una
>    categoría, comparar meses, qué planes MSI tienes activos.
> 4. **Configuración sin tarjetas dadas de alta.** Bloquea todo lo demás: sin
>    tarjeta no se puede subir un estado.
> 5. **Estados de carga** para cada uno, que no sean un spinner centrado.
> 6. **Un error de parseo.** La IA leyó el PDF y no pudo validarlo contra el
>    esquema, o el emisor y los últimos 4 dígitos no coinciden con la tarjeta
>    elegida. El usuario necesita entender qué pasó y qué hacer.
>
> Para el texto: escribe desde el lado del usuario. Nombra las cosas como él las
> reconoce ("tu estado de cuenta", no "el statement"). Sin disculpas, sin
> vaguedad. Un error dice qué pasó y cómo arreglarlo. Los botones dicen
> exactamente qué va a ocurrir.
>
> Evita la ilustración armada con formas SVG genéricas: es uno de los defaults
> que estamos evitando. Si un estado vacío necesita apoyo visual, que salga del
> mundo del producto —el papel, los billetes, la tabla de movimientos.

---

## 3 · El fondo 3D en otra superficie

> **[Bloque A]**
>
> El fondo de billetes mexicanos flotando (`src/components/bills-background.tsx`,
> con texturas generadas en `src/lib/three/bill-textures.ts`) es lo más
> distintivo que tiene el producto, y hoy solo se usa en `/login`.
>
> Propón dónde más podría aparecer **sin volverse ruido**, y con qué tratamiento
> en cada caso. Piensa en densidad, escala, velocidad y profundidad de campo, no
> solo en ponerlo o no ponerlo.
>
> Candidatos a evaluar: el estado vacío del dashboard, la pantalla de espera
> mientras la IA procesa un PDF, el encabezado de Configuración, un estado de
> error.
>
> Restricciones duras:
>
> - **En modo Operate el fondo no puede competir con los datos.** Si aparece en
>   una superficie de trabajo, tiene que ser casi imperceptible.
> - **Los billetes son contenido, no cromo: no se tiñen para hacer juego con el
>   tema.** Pero sí se renderizan distinto — a color en Plano, y en grabado
>   monocromo y opaco en Papel, porque semitransparentes sobre blanco se
>   multiplican en parches marrones al encimarse. La niebla iguala `--surface` y
>   la exposición *baja* en el tema claro. El detalle está en
>   `docs/design-system.md`.
> - La escena tiene que **reaccionar al interruptor de tema en caliente**,
>   escuchando el evento `themechange`. Hoy el `useEffect` corre una sola vez al
>   montar.
> - `prefers-reduced-motion` congela la escena.
> - Cuida el costo: un canvas WebGL en una página de trabajo tiene que pausarse
>   cuando no está visible.
>
> Dame primero la recomendación —dónde sí, dónde no y por qué— antes de
> implementar nada.

---

## 4 · Una superficie nueva

> **[Bloque A]**
>
> Necesito una superficie nueva: **[describe aquí qué pantalla y para qué]**.
>
> Antes de escribir código:
>
> 1. **Nombra el modo** (Persuade, Operate o Read) y justifícalo en una frase.
>    Eso decide qué rango de la escala tipográfica usar y cuánta expresión se
>    permite.
> 2. **Di cuál es el único trabajo de la pantalla.** Si tiene dos, probablemente
>    son dos pantallas.
> 3. **Enumera qué primitivas existentes reusas** de `src/components/ui/` y qué
>    tienes que crear. Crear algo nuevo requiere justificación: la mayoría de las
>    pantallas se arman con `Button`, `Card`, `Panel`, `Stat` y `Badge`.
>
> Después impleméntala respetando:
>
> - Cero hex y cero clases de color crudas de Tailwind (`bg-zinc-900` y
>   compañía). Todo sale de los tokens.
> - Se ve bien en Papel, en Plano y en el estado sin elección.
> - Cifras en `font-mono tabular-nums`.
> - Nada por debajo de 11 px.
> - Foco de teclado visible en todo lo interactivo.
> - Los tres pasos de espaciado (`--space-section`, `--space-block`,
>   `--space-tight`) usados según lo que separan. No el mismo valor en todo.
> - Si es una ruta autenticada, cuelga del route group `(app)` — el NavBar y el
>   guard de sesión ya vienen del layout.
>
> Termina auditando tu propio trabajo con el prompt 6.

---

## 5 · Gráficas y visualización

> **[Bloque A]**
>
> Quiero rehacer **[la gráfica X]** en `src/components/dashboard/charts.tsx`.
>
> Contexto técnico: usamos Recharts, y ahí está la trampa — **Recharts recibe los
> colores como props, no como clases de Tailwind**. Un `stroke="#0B0F17"` es el
> fondo de la página quemado en el borde de cada rebanada del dónut, y en tema
> claro dibuja un contorno negro alrededor de todo. Todos esos props aceptan
> `var(--color-*)` porque terminan como atributos SVG o estilos DOM. Úsalos.
>
> Criterios:
>
> - **Los colores de categoría vienen del sistema**, no de una paleta nueva. Ya
>   hay diez, definidas por tema, en `docs/design-system.md`.
> - **La semántica manda sobre la estética.** En una gráfica de flujo, ingreso es
>   verde y egreso es rojo porque eso significan, no porque combinen.
> - **Ejes, leyendas y tooltips también son tokens.** Es donde más se cuelan los
>   grises hardcodeados.
> - Los montos en el tooltip y en la leyenda van en `font-mono tabular-nums`.
> - La gráfica tiene que ser legible en los dos temas. Verifica los dos.
> - Si la gráfica es ancha, que haga scroll en su propio contenedor
>   (`overflow-x: auto`). El `body` nunca hace scroll horizontal.
> - Sin resplandores, sin gradientes decorativos, sin sombras difusas.
>
> Antes de implementar, dime si la forma de gráfica actual es la correcta para lo
> que ese dato quiere decir. Un dónut de siete rebanadas casi nunca lo es.

---

## 6 · Auditoría antes de subir

> **[Bloque A]**
>
> Revisa los cambios de UI que están en el working tree —o en la rama, si te lo
> indico— contra el sistema de diseño. **Auditoría, no reescritura:** repórtame
> lo que encuentres, y espera a que te diga qué corregir.
>
> Busca, en este orden:
>
> **Fugas del sistema**
> - Cualquier hex, `rgb()` u `oklch()` literal en un `.tsx`.
> - Clases de color crudas de Tailwind (`bg-zinc-*`, `text-violet-*`,
>   `border-red-*`…) donde debería haber un token.
> - Tamaños de texto arbitrarios (`text-[10px]`, `text-[13px]`) fuera de los ocho
>   pasos de la escala.
> - Radios que no sean `--radius`.
> - Cifras de dinero sin `font-mono tabular-nums`.
>
> **Roturas de tema**
> - Colores definidos *únicamente* dentro de un `@media` o un `[data-theme]`. Es
>   el bug clásico: no aplican en el estado sin elección.
> - `bg-white`, `text-white`, `ring-white/*`, `bg-black/*` — todos asumen un tema.
> - Relaciones de superficie invertidas: un input que es más oscuro que su card
>   funciona en Plano y se rompe en Papel.
> - Contraste por debajo de 4.5:1 (texto) o 3:1 (interfaz) **en cualquiera de los
>   dos temas**.
>
> **Emoji como lógica**
> - Cualquier `startsWith`, `includes` o comparación sobre un string que contenga
>   un emoji.
> - Emojis dentro de strings de etiqueta en vez de en su mapa.
>
> **Slop**, contra la lista de [impeccable.style/slop](https://impeccable.style/slop),
> con atención a los diez que ya tuvimos: paleta violeta/índigo/cyan, resplandor
> radial decorativo, esquinas muy redondeadas, jerarquía tipográfica plana, texto
> por debajo de 11 px, espaciado monótono, tarjetas anidadas, riel de acento
> grueso, una sola fuente para todo, y fuentes sobreexpuestas.
>
> **Duplicación**
> - Botones, cards o paneles escritos a mano en vez de usar `src/components/ui/`.
>   Es lo que nos metió en este problema la primera vez.
>
> Repórtalo agrupado por archivo, con línea, y ordenado por gravedad. Si algo es
> una decisión deliberada y no un descuido, dilo en vez de marcarlo.

---

## 7 · Extender la paleta de categorías

> **[Bloque A]**
>
> Quiero agregar la categoría de gasto **[nombre]**.
>
> Ojo con el orden: la taxonomía la manda el enum `category` de
> `skills/pdf-statement-parser/schema.json`, porque es lo que la IA usa al
> parsear el PDF. Si la categoría no está ahí, nunca se va a asignar por más que
> exista en la interfaz.
>
> Los cuatro pasos están en la sección «Agregar una categoría de gasto» de
> `docs/design-system.md`. Síguelos.
>
> Para el color, que es la parte con criterio:
>
> - Busca un hueco de al menos 25° en la rueda contra las diez que ya existen.
> - Respeta la luminosidad de cada columna: ≈52 % en Papel, ≈70 % en Plano. Es lo
>   que hace que las categorías se vean como una familia y no como colores
>   sueltos.
> - No pises el verde de positivo (155°) ni el ámbar de aviso (70°). El rojo
>   (27°) es la única excepción tolerada, y solo si la categoría nueva significa
>   pérdida —como `intereses_comisiones`.
> - Elige el emoji del mapa, no del string de la etiqueta.
>
> Muéstrame las diez existentes más la nueva, en ambos temas, antes de escribir
> el cambio. Si el hueco no existe, dímelo: puede ser señal de que la categoría
> nueva debería ser una subcategoría.
