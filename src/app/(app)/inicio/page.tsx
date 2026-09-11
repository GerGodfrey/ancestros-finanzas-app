import Link from "next/link";
import { BillsBackground } from "@/components/bills-background";
import { Roadmap } from "@/components/inicio/roadmap";
import { Button } from "@/components/ui";

// La hoja a la que lleva «Finanzas» en el nav. Vive dentro de (app), así que
// solo la ve quien ya inició sesión — el guard y el NavBar vienen del layout.
//
// No sustituye a /login ni a /: es el lugar donde alguien que ya usa la app
// puede leer rápido qué hace y hacia dónde va.
export default function InicioPage() {
  return (
    <main className="flex-1">
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="relative flex min-h-[62vh] items-center overflow-hidden px-6 sm:px-12 lg:px-24">
        {/* Menos denso que en /login: esta hoja lleva mucho más texto. */}
        <BillsBackground density={0.55} />
        {/* Misma máscara direccional que el login: opaca donde vive el texto,
            transparente donde los billetes tienen que verse. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(72%_128%_at_10%_50%,var(--surface)_0%,var(--surface)_34%,color-mix(in_oklab,var(--surface)_66%,transparent)_58%,transparent_80%)]"
        />

        <div className="relative z-10 mx-auto w-full max-w-xl py-section">
          <h1 className="font-display text-display font-extralight leading-[0.9] tracking-[-0.025em] text-text [font-stretch:112%]">
            Finanzas
          </h1>

          <p className="mt-8 max-w-[40ch] text-base leading-relaxed text-text-muted">
            Subes el estado de cuenta de tu tarjeta de crédito y entiendes a
            dónde se fue tu dinero: categorías automáticas, meses sin intereses
            al día y un asistente que conoce tu historial real.
          </p>

          <div className="mt-10 h-px w-full max-w-[420px] bg-accent" />

          <div className="mt-6 flex max-w-[420px] justify-end">
            <Link href="/dashboard">
              <Button size="md">Ir a mi dashboard →</Button>
            </Link>
          </div>
        </div>
      </section>


      {/*
        La franja que rompe, entre el hero y el roadmap. Invierte los tokens
        en vez de hardcodear negro, así el gesto funciona igual en Papel y en
        Plano — y al quedar en medio corta la hoja en dos, que es lo que se
        buscaba: separar quiénes somos de hacia dónde vamos.
      */}
      <section className="bg-text px-6 py-section text-surface sm:px-12 lg:px-24">
        <div className="mx-auto w-full max-w-6xl">
          <p className="font-mono text-2xs uppercase tracking-[0.14em] text-surface/60">
            Un proyecto
          </p>
          {/* El contraste de peso hace el trabajo que haría una negrita o un
              subrayado, sin salirse del sistema: «POR» se queda en el peso
              del display y «ANCESTROS» sube, así que el nombre es lo que se
              lee primero. */}
          <p className="mt-block font-display text-display leading-[0.9] tracking-[-0.025em] [font-stretch:112%]">
            <span className="font-extralight">POR </span>
            <span className="font-semibold">ANCESTROS</span>
          </p>

          {/*
            La declaración vive aquí y no junto al roadmap: al lado de los
            pasos quedaba flotando en una columna medio vacía, y aquí hace
            falta — sin ella la franja era un letrero con un nombre y nada
            más. El nombre dice quiénes somos; esta línea, qué queremos ser.
          */}
          <p className="mt-section max-w-[46ch] text-lg font-light leading-relaxed text-surface/80">
            Queremos ser el lugar donde entiendes tu dinero — y donde lo que
            aprendes le sirve a alguien más.
          </p>
        </div>
      </section>

      {/* ── Roadmap ──────────────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-6xl px-6 py-section sm:px-12 lg:px-24">
        <h2 className="max-w-[24ch] font-display text-2xl font-light leading-tight tracking-tight text-text">
          Hacia dónde vamos
        </h2>
        <div className="mt-section">
          <Roadmap />
        </div>
      </section>
    </main>
  );
}
