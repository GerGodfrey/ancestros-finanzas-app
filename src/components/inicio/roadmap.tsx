// Los cuatro pasos del producto. Numerarlos está justificado: es una
// secuencia real —cada uno se apoya en el anterior—, no adorno.
//
// `available` distingue lo que ya funciona de lo que se anuncia. Decirlo es
// más honesto que insinuar que todo existe, y da forma a la línea: el punto
// del último paso disponible es el que lleva el acento.
const STEPS = [
  {
    title: "Analiza tus tarjetas contra tus ingresos",
    body: "Subes el PDF del banco y ves a dónde se fue tu dinero, con categorías automáticas y tus meses sin intereses al día.",
    available: true,
  },
  {
    title: "Recibe recomendaciones personales",
    body: "Un asistente que conoce tu historial real: en qué gastas de más, qué te está cobrando intereses, qué se repite cada mes.",
    available: true,
  },
  {
    title: "Conecta tus gastos del día a día",
    body: "Más allá de la tarjeta: efectivo, débito y suscripciones, para que el panorama sea completo y no a medias.",
    available: false,
  },
  {
    title: "Comparte y aprende de otros",
    body: "Lo que descubres sobre tu dinero le sirve a alguien más. Y al revés.",
    available: false,
  },
] as const;

export function Roadmap() {
  const lastAvailable = STEPS.reduce((acc, s, i) => (s.available ? i : acc), 0);

  return (
    <section aria-label="Hacia dónde va el producto">
      <ol className="grid gap-block sm:grid-cols-2 lg:grid-cols-4 lg:gap-x-8">
        {STEPS.map((step, i) => (
          <li key={step.title} className="flex flex-col">
            {/*
              La línea vive en el propio paso, no en un contenedor aparte: así
              se rompe sola al apilarse en móvil, sin media queries que
              mantener. El último no la lleva, iría hacia el vacío.
            */}
            <div className="flex items-center gap-3" aria-hidden="true">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  i === lastAvailable
                    ? "bg-accent"
                    : step.available
                      ? "bg-text-muted"
                      : "border border-border-strong bg-surface"
                }`}
              />
              {i < STEPS.length - 1 && (
                <span className="hidden h-px flex-1 bg-border lg:block" />
              )}
            </div>

            <div className="mt-block flex items-baseline gap-3">
              <span className="font-mono text-2xs tabular-nums text-text-faint">
                {String(i + 1).padStart(2, "0")}
              </span>
              {!step.available && (
                <span className="rounded border border-border px-1.5 py-0.5 text-2xs uppercase tracking-[0.08em] text-text-faint">
                  Pronto
                </span>
              )}
            </div>

            <h3
              className={`mt-tight text-base font-semibold leading-snug ${
                step.available ? "text-text" : "text-text-muted"
              }`}
            >
              {step.title}
            </h3>
            <p className="mt-tight max-w-[34ch] text-sm leading-relaxed text-text-muted">
              {step.body}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
