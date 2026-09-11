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
      {/*
        Una sola columna: la línea corre en vertical y encadena los pasos de
        arriba abajo, que es como se lee. En cuatro columnas cada paso competía
        por la atención; así se recorren en orden, que es de lo que trata una
        secuencia.
      */}
      <ol className="flex flex-col">
        {STEPS.map((step, i) => {
          const isLast = i === STEPS.length - 1;
          return (
            <li key={step.title} className="flex gap-5">
              {/* Carril del punto y la línea. El último no lleva línea. */}
              <div
                aria-hidden="true"
                className="flex w-2 shrink-0 flex-col items-center"
              >
                <span
                  className={`mt-2 h-2 w-2 shrink-0 rounded-full ${
                    i === lastAvailable
                      ? "bg-accent"
                      : step.available
                        ? "bg-text-muted"
                        : "border border-border-strong bg-surface"
                  }`}
                />
                {!isLast && <span className="w-px flex-1 bg-border" />}
              </div>

              <div className={isLast ? "pb-0" : "pb-section"}>
                <div className="flex items-baseline gap-3">
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
                  className={`mt-tight text-lg font-semibold leading-snug ${
                    step.available ? "text-text" : "text-text-muted"
                  }`}
                >
                  {step.title}
                </h3>
                <p className="mt-tight max-w-[54ch] text-sm leading-relaxed text-text-muted">
                  {step.body}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
