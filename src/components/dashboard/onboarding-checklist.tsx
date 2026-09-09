import Link from "next/link";
import { Badge, Button, Card } from "@/components/ui";
import type { SetupState } from "@/lib/dashboard/get-setup-state";

// El dashboard vacío es exactamente donde un usuario nuevo se pierde, así que
// el checklist vive ahí y no en un popup: un modal se cierra y se olvida; esto
// se queda hasta que los tres pasos están hechos, y entonces desaparece solo.
//
// Tres pasos y no seis. El tercero depende del segundo (sin tarjeta no hay a
// qué asociar el PDF), así que se muestra apagado hasta que exista una.

interface Step {
  n: number;
  title: string;
  why: string;
  done: boolean;
  /** Se muestra pero no se puede empezar todavía. */
  blockedBy?: string;
  href: string;
  cta: string;
}

function buildSteps(state: SetupState): Step[] {
  return [
    {
      n: 1,
      title: "Conecta tu IA",
      why: "Es la que lee los estados de cuenta de tus tarjetas de crédito. Pegas tu propia API key; se cifra antes de guardarse.",
      done: state.hasProvider,
      href: "/settings#proveedores",
      cta: "Conectar un proveedor",
    },
    {
      n: 2,
      title: "Registra una tarjeta de crédito",
      why: "Solo el banco y el nombre del producto. Los últimos 4 dígitos y el límite los toma del primer PDF.",
      done: state.hasAccount,
      href: "/settings#tarjetas",
      cta: "Agregar una tarjeta",
    },
    {
      n: 3,
      title: "Sube tu primer estado de cuenta de tarjeta de crédito",
      why: "El PDF que el banco te manda cada mes por tu tarjeta de crédito. De ahí salen los movimientos, las categorías y el dashboard.",
      done: state.hasStatement,
      blockedBy: state.hasAccount ? undefined : "Primero registra una tarjeta de crédito.",
      href: "/dashboard/upload",
      cta: "Subir un PDF",
    },
  ];
}

export function OnboardingChecklist({ state }: { state: SetupState }) {
  const steps = buildSteps(state);
  const doneCount = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done && !s.blockedBy);

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-light tracking-tight">
            Tres pasos para ver tu primer mes
          </h2>
          <p className="mt-tight max-w-[62ch] text-sm leading-relaxed text-text-muted">
            Tu dashboard se llena solo a partir del primer estado de cuenta de
            tarjeta de crédito. Esto es lo que falta para llegar ahí.
          </p>
        </div>
        <span className="font-mono text-2xs tabular-nums text-text-faint">
          {doneCount} de {steps.length}
        </span>
      </div>

      <ol className="mt-block flex flex-col divide-y divide-border/60">
        {steps.map((step) => {
          const isNext = next?.n === step.n;
          const muted = step.done || Boolean(step.blockedBy);
          return (
            <li
              key={step.n}
              className={`flex flex-wrap items-start justify-between gap-x-6 gap-y-3 py-block first:pt-0 last:pb-0 ${
                muted ? "text-text-faint" : "text-text"
              }`}
            >
              <div className="flex min-w-0 flex-1 items-start gap-4">
                <span
                  aria-hidden="true"
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded border font-mono text-2xs tabular-nums ${
                    step.done
                      ? "border-positive bg-positive text-surface"
                      : isNext
                        ? "border-accent text-accent"
                        : "border-border text-text-faint"
                  }`}
                >
                  {step.done ? "✓" : step.n}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3
                      className={`text-sm font-semibold ${step.done ? "line-through decoration-text-faint" : ""}`}
                    >
                      {step.title}
                    </h3>
                    {step.done && <Badge tone="good">Listo</Badge>}
                  </div>
                  <p className="mt-1 max-w-[58ch] text-xs leading-relaxed">
                    {step.blockedBy ?? step.why}
                  </p>
                </div>
              </div>

              {!step.done && (
                <div className="shrink-0 pl-10 sm:pl-0">
                  {step.blockedBy ? (
                    <Button size="sm" variant="ghost" disabled>
                      {step.cta}
                    </Button>
                  ) : (
                    <Link href={step.href}>
                      <Button size="sm" variant={isNext ? "primary" : "ghost"}>
                        {step.cta}
                      </Button>
                    </Link>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
