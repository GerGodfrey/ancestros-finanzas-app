"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  MonthlyDashboardData,
  RelevantTransaction,
} from "@/lib/dashboard/get-monthly-data";
import { BudgetQuickAdd } from "./budget-quick-add";
import { Badge, Button, Panel, Stat } from "@/components/ui";
import {
  FlujoDelMesChart,
  GastoPorCategoriaChart,
  GastoPorTarjetaChart,
  IngresosVsEgresosManualesChart,
} from "./charts";
import {
  CATEGORY_COLOR,
  CATEGORY_EMOJI,
  CATEGORY_LABEL,
  TRANSACTION_CATEGORIES,
  categoryLabelWithEmoji,
  type TransactionCategory,
} from "@/lib/transaction-categories";

// `soon: true` deja la pestaña visible pero sin abrir. Se queda a la vista
// —y no se borra— porque anunciar lo que viene es parte de la información;
// esconderla haría que la sección simplemente no existiera para el usuario.
const TABS = [
  { id: "resumen", label: "📊 Resumen del Mes" },
  { id: "desglose", label: "🧩 Desglose" },
  { id: "movimientos", label: "🧾 Movimientos Relevantes" },
  { id: "proximo", label: "📅 Próximo Mes" },
  { id: "validacion", label: "🧮 Validación", soon: true },
] as const;

type TabId = (typeof TABS)[number]["id"];

const money = (n: number | null | undefined) =>
  (n ?? 0).toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
  });

const pct = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : `${(n * 100).toFixed(1)}%`;

const MESES_CORTOS = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

const formatShortDate = (dateStr: string | null) => {
  if (!dateStr) return "—";
  const d = new Date(`${dateStr}T00:00:00`);
  return `${String(d.getDate()).padStart(2, "0")} ${MESES_CORTOS[d.getMonth()]}`;
};

function DeleteRowButton({ endpoint, id }: { endpoint: string; id: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    await fetch(`${endpoint}?id=${id}`, { method: "DELETE" });
    router.refresh();
  };

  return (
    <button
      onClick={handleDelete}
      disabled={deleting}
      className="text-xs text-text-faint hover:text-negative disabled:opacity-50"
      aria-label="Eliminar"
    >
      ✕
    </button>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-border bg-surface-raised p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-sm font-semibold text-text">{title}</h2>
          <button
            onClick={onClose}
            className="shrink-0 text-text-faint hover:text-text"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function DashboardTabs({ data }: { data: MonthlyDashboardData }) {
  const [tab, setTab] = useState<TabId>("resumen");

  if (!data.hasData) {
    return (
      <div className="rounded-lg border border-border bg-surface-raised p-8 text-center">
        <p className="text-sm text-text-muted">
          {data.monthLabel
            ? `No hay estados de cuenta subidos para ${data.monthLabel.slice(0, 7)} — sube el PDF de ese mes, o navega a otro mes arriba.`
            : "Todavía no hay estados de cuenta procesados. Sube un PDF para empezar a ver tu dashboard."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => {
          const soon = "soon" in t && t.soon;
          return (
            <button
              key={t.id}
              type="button"
              disabled={soon}
              aria-disabled={soon || undefined}
              onClick={() => !soon && setTab(t.id)}
              title={soon ? "Todavía no está lista" : undefined}
              className={`flex items-center gap-2 rounded border px-4 py-2 text-xs font-semibold transition-colors ${
                soon
                  ? "cursor-not-allowed border-border/60 bg-surface text-text-faint"
                  : tab === t.id
                    ? "border-text bg-text text-surface"
                    : "border-border bg-surface-raised text-text-muted hover:text-text"
              }`}
            >
              {/* El emoji va dentro del string del label, así que se atenúa
                  junto con el texto: si no, queda a todo color y el botón no
                  lee como deshabilitado. */}
              <span className={soon ? "opacity-55" : undefined}>{t.label}</span>
              {soon && (
                <span className="rounded border border-border px-1.5 py-0.5 text-2xs font-medium uppercase tracking-[0.08em] text-text-faint">
                  Próximamente
                </span>
              )}
            </button>
          );
        })}
      </div>

      {tab === "resumen" && <ResumenTab data={data} />}
      {tab === "desglose" && <DesgloseTab data={data} />}
      {tab === "movimientos" && <MovimientosTab data={data} />}
      {tab === "proximo" && <ProximoMesTab data={data} />}

    </div>
  );
}

const INSIGHT_TONE_STYLE = {
  good: { icon: "✅", text: "text-positive" },
  bad: { icon: "🔴", text: "text-negative" },
  warning: { icon: "⚠️", text: "text-warning" },
} as const;

function MonthlyInsightsPanel({ data }: { data: MonthlyDashboardData }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const regenerate = async () => {
    if (!data.monthLabel) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/insights/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month: data.monthLabel }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Error desconocido");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-warning/40 bg-warning/10 p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-warning">
          <span className="h-4 w-0.5 rounded bg-warning" />
          🔎 3 cosas que pasaron este mes que vale la pena que veas
        </h2>
        <button
          onClick={regenerate}
          disabled={loading}
          className="shrink-0 rounded-md border border-border-strong px-2.5 py-1 text-2xs font-medium text-text-muted hover:text-text disabled:opacity-50"
        >
          {loading ? "Generando…" : "Regenerar análisis"}
        </button>
      </div>

      {error && <p className="mb-3 text-xs text-negative">{error}</p>}

      {data.insights && data.insights.length > 0 ? (
        <ul className="flex flex-col gap-3 text-sm text-text-muted">
          {data.insights.map((insight, idx) => {
            const style = INSIGHT_TONE_STYLE[insight.tone] ?? INSIGHT_TONE_STYLE.warning;
            return (
              <li key={idx}>
                <span className={`font-semibold ${style.text}`}>
                  {style.icon} {insight.text}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-text-faint">
          Todavía no hay análisis generado para este mes — dale a
          &quot;Regenerar análisis&quot;.
        </p>
      )}
    </div>
  );
}

function ProximosPagosPanel({ data }: { data: MonthlyDashboardData }) {
  const pagos = data.cards
    .filter((c) => c.fechaPago && c.gasto)
    .slice()
    .sort((a, b) => (a.fechaPago ?? "").localeCompare(b.fechaPago ?? ""));

  const total = pagos.reduce((sum, c) => sum + (c.gasto ?? 0), 0);
  const diff =
    data.previousMonthCardsTotal !== null
      ? total - data.previousMonthCardsTotal
      : null;

  return (
    <Panel title="Próximos Pagos">
      {pagos.length === 0 ? (
        <p className="text-sm text-text-faint">No hay pagos pendientes.</p>
      ) : (
        <ul className="flex flex-col gap-2 text-sm">
          {pagos.map((c) => (
            <li
              key={c.accountId}
              className="flex items-center justify-between gap-3 rounded-md border border-border border-l-4 border-l-accent bg-surface/40 px-3 py-2"
            >
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-accent">
                  {formatShortDate(c.fechaPago)}
                </span>
                <span className="text-text">
                  {c.issuer} {c.productName}
                </span>
              </div>
              <span className="font-medium text-text">{money(c.gasto)}</span>
            </li>
          ))}
        </ul>
      )}

      {pagos.length > 0 && (
        <div className="mt-4 rounded-md border border-border bg-surface/60 p-3">
          <div className="text-2xs uppercase tracking-wide text-text-faint">
            Total a pagar (para no generar intereses)
          </div>
          <div className="mt-1 text-xl font-bold text-negative">
            {money(total)}
          </div>
          {diff !== null && (
            <p className="mt-1 text-xs text-text-faint">
              {diff >= 0
                ? `Es ${money(diff)} más que el mes pasado (${money(data.previousMonthCardsTotal)}) — revisa liquidez con cuidado.`
                : `Es ${money(Math.abs(diff))} menos que el mes pasado (${money(data.previousMonthCardsTotal)}).`}
            </p>
          )}
        </div>
      )}
    </Panel>
  );
}

function PanoramaDeDeudasPanel({ data }: { data: MonthlyDashboardData }) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const totalMsiDebt = data.msiDebts.reduce((sum, d) => sum + d.remainingDebt, 0);
  const totalStandingDebt = data.standingDebts.reduce((sum, d) => sum + d.amount, 0);

  const deleteDebt = async (id: string) => {
    setDeletingId(id);
    await fetch(`/api/debts?id=${id}`, { method: "DELETE" });
    setDeletingId(null);
    router.refresh();
  };

  return (
    <Panel title="Panorama de Deudas">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {data.msiDebts.map((d) => (
          <div
            key={d.accountId}
            className="rounded-md border border-border bg-surface/40 p-3"
          >
            <div className="text-2xs font-semibold uppercase tracking-wide text-text-faint">
              {d.accountLabel} (MSI)
            </div>
            <div
              className={`mt-1 text-base font-bold ${d.remainingDebt > 0 ? "text-negative" : "text-positive"}`}
            >
              {money(d.remainingDebt)}
              {d.remainingDebt === 0 && " ✅"}
            </div>
            <p className="mt-1 text-2xs text-text-faint">
              {d.concepts.length > 0
                ? d.concepts.join(", ")
                : "Sin MSI, al corriente"}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-5 text-2xs font-semibold uppercase tracking-wide text-text-faint">
        Deudas Familiares / Largo Plazo
      </div>
      {data.standingDebts.length === 0 ? (
        <p className="mt-2 text-sm text-text-faint">
          No has capturado deudas de largo plazo. Agrégalas desde la pestaña
          Desglose.
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {data.standingDebts.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border bg-surface/40 p-3"
            >
              <div>
                <div className="text-sm font-medium text-text">
                  {d.concept}
                </div>
                <div className="text-2xs text-text-faint">
                  {d.note ?? "No se paga este mes"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-negative">{money(d.amount)}</span>
                <button
                  onClick={() => deleteDebt(d.id)}
                  disabled={deletingId === d.id}
                  className="text-xs text-text-faint hover:text-negative disabled:opacity-50"
                  aria-label={`Eliminar ${d.concept}`}
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {(totalMsiDebt > 0 || totalStandingDebt > 0) && (
        <div className="mt-5 rounded-md border-l-4 border-l-negative border-y border-r border-border bg-surface/60 p-3">
          <div className="text-2xs uppercase tracking-wide text-text-faint">
            Deuda Futura Total (MSI tarjetas + familiar)
          </div>
          <div className="mt-1 text-lg font-bold text-negative">
            {money(totalMsiDebt)} tarjetas + {money(totalStandingDebt)} familiar
          </div>
        </div>
      )}
    </Panel>
  );
}

const RECOMMENDATION_TYPE_STYLE = {
  strength: { icon: "✅", text: "text-positive", label: "Lo haces bien" },
  action: { icon: "🎯", text: "text-accent", label: "Próximo paso" },
} as const;

function RecommendationsPanel({ data }: { data: MonthlyDashboardData }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const regenerate = async () => {
    if (!data.monthLabel) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/insights/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month: data.monthLabel }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Error desconocido");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-accent/40 bg-accent/10 p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-accent">
          <span className="h-4 w-0.5 rounded bg-accent" />
          🎯 Recomendaciones y Próximos Pasos
        </h2>
        <button
          onClick={regenerate}
          disabled={loading}
          className="shrink-0 rounded-md border border-border-strong px-2.5 py-1 text-2xs font-medium text-text-muted hover:text-text disabled:opacity-50"
        >
          {loading ? "Generando…" : "Regenerar análisis"}
        </button>
      </div>

      {error && <p className="mb-3 text-xs text-negative">{error}</p>}

      {data.recommendations && data.recommendations.length > 0 ? (
        <ul className="flex flex-col gap-3 text-sm text-text-muted">
          {data.recommendations.map((rec, idx) => {
            const style = RECOMMENDATION_TYPE_STYLE[rec.type] ?? RECOMMENDATION_TYPE_STYLE.action;
            return (
              <li key={idx} className="flex items-start gap-2">
                <span
                  className={`shrink-0 rounded-full border border-current px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide ${style.text}`}
                >
                  {style.icon} {style.label}
                </span>
                <span>{rec.text}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-text-faint">
          Todavía no hay recomendaciones generadas para este mes — dale a
          &quot;Regenerar análisis&quot; (se genera junto con &quot;3 cosas
          que pasaron este mes&quot;).
        </p>
      )}
    </div>
  );
}

function ResumenTab({ data }: { data: MonthlyDashboardData }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Stat
          label="Ingreso Total"
          value={money(data.ingresoTotal)}
          sub={
            data.incomes.length > 0
              ? data.incomes.map((i) => i.concept).join(", ")
              : "Sin ingresos capturados este mes"
          }
          tone="good"
        />
        <Stat
          label="Egreso Total"
          value={money(data.egresoTotal)}
          sub={`Tarjetas (${money(data.gastoTarjetas)}) + costos fijos (${money(data.egresoDebito)})`}
          tone="bad"
        />
        <Stat
          label="Balance del Mes"
          value={money(data.balance)}
          sub={
            data.balance >= 0
              ? "Tus ingresos cubrieron tus egresos este mes"
              : "Tus egresos superaron tus ingresos — revisa liquidez"
          }
          tone={data.balance >= 0 ? "good" : "bad"}
        />
      </div>

      <MonthlyInsightsPanel data={data} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Flujo del Mes">
          <FlujoDelMesChart data={data} />
        </Panel>
        <Panel title="Gasto por Tarjeta">
          <GastoPorTarjetaChart data={data} />
        </Panel>
      </div>

      <Panel title="Estado de Tarjetas">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-2xs uppercase tracking-wide text-text-faint">
                <th className="pb-2 pr-4">Tarjeta</th>
                <th className="pb-2 pr-4">Gasto del Mes</th>
                <th className="pb-2 pr-4">Límite</th>
                <th className="pb-2 pr-4">Disponible</th>
                <th className="pb-2 pr-4">Utilización</th>
                <th className="pb-2 pr-4">Deuda MSI</th>
                <th className="pb-2 pr-4">Fecha Pago</th>
                <th className="pb-2 pr-4">Estado</th>
              </tr>
            </thead>
            <tbody>
              {data.cards.map((c) => (
                <tr key={c.accountId} className="border-b border-border/60">
                  <td className="py-2 pr-4 font-medium text-text">
                    {c.issuer} {c.productName}
                  </td>
                  <td className="py-2 pr-4">{money(c.gasto)}</td>
                  <td className="py-2 pr-4">{money(c.limite)}</td>
                  <td className="py-2 pr-4">{money(c.disponible)}</td>
                  <td className="py-2 pr-4">
                    <span
                      className={
                        (c.utilizacion ?? 0) > 0.6
                          ? "text-negative"
                          : (c.utilizacion ?? 0) > 0.4
                            ? "text-warning"
                            : "text-positive"
                      }
                    >
                      {pct(c.utilizacion)}
                    </span>
                  </td>
                  <td className="py-2 pr-4">{money(c.deudaMsi)}</td>
                  <td className="py-2 pr-4 text-text-muted">
                    {c.fechaPago ?? "—"}
                  </td>
                  <td className="py-2 pr-4">
                    <div className="flex flex-wrap gap-1">
                      {c.estadoTags.length === 0 ? (
                        <span className="text-text-faint">—</span>
                      ) : (
                        c.estadoTags.map((tag, idx) => (
                          <Badge key={idx} tone={tag.tone} withEmoji>
                            {tag.text}
                          </Badge>
                        ))
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ProximosPagosPanel data={data} />
        <PanoramaDeDeudasPanel data={data} />
      </div>

      <RecommendationsPanel data={data} />
    </div>
  );
}

function CategorizeTransactionsPanel({ count }: { count: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const categorize = async () => {
    setLoading(true);
    setError(null);
    setWarning(null);
    try {
      const res = await fetch("/api/transactions/categorize", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Error desconocido");
      if (body.pending > 0) {
        setWarning(
          `Se categorizaron ${body.categorized} de ${body.categorized + body.pending} — quedaron ${body.pending} pendientes (dale de nuevo a "Categorizar movimientos" para reintentar solo esas).`,
        );
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Panel title="Categorización de gastos">
      <p className="text-sm text-text-muted">
        Tienes {count} movimiento{count === 1 ? "" : "s"} sin categoría
        (comida, transporte, ropa...) — probablemente de statements que se
        parsearon antes de tener esta función. No hace falta resubir el PDF.
      </p>
      {error && <p className="mt-2 text-xs text-negative">{error}</p>}
      {warning && <p className="mt-2 text-xs text-warning">{warning}</p>}
      <Button size="sm" className="mt-3"
        onClick={categorize}
        disabled={loading}
        
      >
        {loading ? "Categorizando…" : "Categorizar movimientos"}
      </Button>
    </Panel>
  );
}

function CleanDescriptionsPanel({ count }: { count: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const clean = async () => {
    setLoading(true);
    setError(null);
    setWarning(null);
    try {
      const res = await fetch("/api/transactions/clean-descriptions", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Error desconocido");
      if (body.pending > 0) {
        setWarning(
          `Se limpiaron ${body.cleaned} de ${body.cleaned + body.pending} — quedaron ${body.pending} pendientes (dale de nuevo a "Limpiar descripciones" para reintentar solo esas).`,
        );
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Panel title="Limpieza de descripciones">
      <p className="text-sm text-text-muted">
        Tienes {count} movimiento{count === 1 ? "" : "s"} con la descripción
        cruda del banco (mayúsculas, prefijos de procesador de pagos, folios
        sin valor) — probablemente de statements que se parsearon antes de
        que el Skill empezara a limpiarla. No hace falta resubir el PDF.
      </p>
      {error && <p className="mt-2 text-xs text-negative">{error}</p>}
      {warning && <p className="mt-2 text-xs text-warning">{warning}</p>}
      <Button size="sm" className="mt-3"
        onClick={clean}
        disabled={loading}
        
      >
        {loading ? "Limpiando…" : "Limpiar descripciones"}
      </Button>
    </Panel>
  );
}

function DesgloseTab({ data }: { data: MonthlyDashboardData }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {data.uncategorizedCount > 0 && (
        <CategorizeTransactionsPanel count={data.uncategorizedCount} />
      )}

      <Panel title="Desglose de Ingresos">
        {data.incomes.length === 0 ? (
          <p className="text-sm text-text-faint">
            Todavía no capturas ingresos para este mes.
          </p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {data.incomes.map((i) => (
              <li
                key={i.id}
                className="flex items-center justify-between gap-2 border-b border-border/60 pb-2"
              >
                <span className="text-text-muted">
                  {i.concept}
                  {i.isRecurring && (
                    <span className="ml-2 rounded-full bg-accent/15 px-2 py-0.5 text-2xs font-medium text-accent">
                      fijo
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-text">{money(i.amount)}</span>
                  <DeleteRowButton endpoint="/api/incomes" id={i.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Desglose de Egresos Fijos (débito)">
        {data.fixedCosts.length === 0 ? (
          <p className="text-sm text-text-faint">
            Todavía no capturas costos fijos para este mes.
          </p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {data.fixedCosts.map((f) => (
              <li
                key={f.id}
                className="flex items-center justify-between gap-2 border-b border-border/60 pb-2"
              >
                <span className="text-text-muted">
                  {f.concept}
                  {f.isRecurring && (
                    <span className="ml-2 rounded-full bg-accent/15 px-2 py-0.5 text-2xs font-medium text-accent">
                      fijo
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-text">{money(f.amount)}</span>
                  <DeleteRowButton endpoint="/api/fixed-costs" id={f.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Gasto por Tarjeta">
        <ul className="flex flex-col gap-2 text-sm">
          {data.cards.map((c) => (
            <li
              key={c.accountId}
              className="flex justify-between border-b border-border/60 pb-2"
            >
              <span className="text-text-muted">
                {c.issuer} {c.productName}
              </span>
              <span className="font-medium text-text">{money(c.gasto)}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Ingresos vs Egresos Manuales vs Gasto por Tarjeta">
        <IngresosVsEgresosManualesChart data={data} />
      </Panel>

      <Panel title="Agregar ingreso, costo fijo o deuda familiar/largo plazo">
        {data.monthLabel && <BudgetQuickAdd month={data.monthLabel} />}
      </Panel>
    </div>
  );
}

function CategoryBadge({ category }: { category: TransactionCategory | null }) {
  if (!category) return <span className="text-xs text-text-faint">—</span>;
  return (
    <span
      className="rounded-full px-2 py-0.5 text-xs font-medium"
      style={{
        color: CATEGORY_COLOR[category],
        // color-mix en vez del viejo `${hex}26`: los colores de categoría ya
        // no son hex, son tokens que cambian con el tema.
        backgroundColor: `color-mix(in oklab, ${CATEGORY_COLOR[category]} 15%, transparent)`,
      }}
    >
      <span aria-hidden="true">{CATEGORY_EMOJI[category]}</span>{" "}
      {CATEGORY_LABEL[category]}
    </span>
  );
}

function EditableTransactionRow({ t }: { t: RelevantTransaction }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState(t.description);
  const [category, setCategory] = useState<TransactionCategory | "">(t.category ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/transactions/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, category: category || undefined }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Error desconocido");
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <tr className="border-b border-border/60 bg-surface/40">
        <td className="py-2 pr-4" colSpan={3}>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-w-[180px] flex-1 rounded-md border border-border-strong bg-surface px-2 py-1 text-sm text-text"
            />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as TransactionCategory | "")}
              className="rounded-md border border-border-strong bg-surface px-2 py-1 text-sm text-text"
            >
              <option value="">Sin categoría</option>
              {TRANSACTION_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {categoryLabelWithEmoji(c)}
                </option>
              ))}
            </select>
            <span className="text-xs text-text-faint">{money(t.amount)}</span>
            <Button size="sm"
              onClick={save}
              disabled={saving}
              
            >
              {saving ? "Guardando…" : "Guardar"}
            </Button>
            <button
              onClick={() => {
                setEditing(false);
                setDescription(t.description);
                setCategory(t.category ?? "");
                setError(null);
              }}
              className="text-xs text-text-faint hover:text-text-muted"
            >
              Cancelar
            </button>
          </div>
          {error && <p className="mt-1 text-xs text-negative">{error}</p>}
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-border/60">
      <td className="py-2 pr-4 text-text">
        {t.description}
        <div className="text-2xs text-text-faint">{t.date}</div>
      </td>
      <td className="py-2 pr-4 font-medium text-text">{money(t.amount)}</td>
      <td className="py-2 pr-4">
        <div className="flex items-center gap-2">
          <CategoryBadge category={t.category} />
          {t.isEditable && (
            <button
              onClick={() => setEditing(true)}
              className="text-xs text-text-faint hover:text-accent"
              aria-label="Editar"
            >
              ✎
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

function MovimientosPorTarjetaTable({
  transactions,
}: {
  transactions: RelevantTransaction[];
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-left text-2xs uppercase tracking-wide text-text-faint">
          <th className="pb-2 pr-4">Descripción</th>
          <th className="pb-2 pr-4">Monto</th>
          <th className="pb-2 pr-4">Categoría</th>
        </tr>
      </thead>
      <tbody>
        {transactions.map((t) => (
          <EditableTransactionRow key={t.id} t={t} />
        ))}
      </tbody>
    </table>
  );
}

function MovimientosTab({ data }: { data: MonthlyDashboardData }) {
  const [openAccountId, setOpenAccountId] = useState<string | null>(null);
  const openGroup = data.relevantTransactionsByAccount.find(
    (g) => g.accountId === openAccountId,
  );

  return (
    <div className="flex flex-col gap-4">
      {data.uncleanedDescriptionsCount > 0 && (
        <CleanDescriptionsPanel count={data.uncleanedDescriptionsCount} />
      )}

      <Panel title="Gasto por Categoría (estimado)">
        <GastoPorCategoriaChart data={data} />
      </Panel>

      {data.relevantTransactionsByAccount.length === 0 ? (
        <Panel title="Movimientos Relevantes">
          <p className="text-sm text-text-faint">
            No hay movimientos para este periodo.
          </p>
        </Panel>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {data.relevantTransactionsByAccount.map((group) => (
            <Panel
              key={group.accountId}
              title={`Movimientos Relevantes — ${group.accountLabel}`}
            >
              <MovimientosPorTarjetaTable transactions={group.transactions} />
              {group.allTransactions.length > group.transactions.length && (
                <button
                  onClick={() => setOpenAccountId(group.accountId)}
                  className="mt-3 text-xs font-medium text-accent hover:text-accent"
                >
                  Ver más ({group.allTransactions.length} operaciones en total) →
                </button>
              )}
            </Panel>
          ))}
        </div>
      )}

      {openGroup && (
        <Modal
          title={`Todas las operaciones — ${openGroup.accountLabel}`}
          onClose={() => setOpenAccountId(null)}
        >
          <MovimientosPorTarjetaTable transactions={openGroup.allTransactions} />
        </Modal>
      )}
    </div>
  );
}

function ProximoMesTab({ data }: { data: MonthlyDashboardData }) {
  return (
    <div className="flex flex-col gap-4">
      <div
        className="rounded-lg border p-5"
        style={{
          borderColor: "var(--accent)",
          background: "var(--surface-raised-2)",
        }}
      >
        <h2 className="mb-3 text-sm font-semibold text-text">
          📅 Cuánto puedes gastar el próximo mes, como máximo
        </h2>
        <div className="flex flex-wrap items-baseline gap-3">
          <div className="text-3xl font-extrabold text-positive">
            {money(data.saldoDisponibleGastoLibre)}
          </div>
          <p className="text-xs text-text-muted">
            Contando solo tus ingresos y costos marcados &quot;Fijo&quot;
          </p>
        </div>

        <div className="mt-4 flex flex-col divide-y divide-border/60 text-sm">
          <div className="flex items-center justify-between py-2">
            <span className="text-text-muted">💼 Ingreso Garantizado (fijo)</span>
            <span className="font-medium text-positive">
              {money(data.ingresoRecurrente)}
            </span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-text-muted">🏠 − Costos Fijos</span>
            <span className="font-medium text-negative">
              −{money(data.egresoDebitoRecurrente)}
            </span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-text-muted">🔁 − Domiciliaciones Activas</span>
            <span className="font-medium text-negative">
              −{money(data.domiciliacionesTotal)}
            </span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-text-muted">📦 − Mensualidades MSI</span>
            <span className="font-medium text-negative">
              −{money(data.msiMensualTotal)}
            </span>
          </div>
          <div className="flex items-center justify-between pt-3">
            <span className="font-semibold text-text">
              = Disponible para Gasto Libre
            </span>
            <span className="text-lg font-bold text-positive">
              {money(data.saldoDisponibleGastoLibre)}
            </span>
          </div>
        </div>

        <p className="mt-4 text-2xs leading-relaxed text-text-faint">
          Esto es un piso conservador: un ingreso o costo marcado
          &quot;Temporal&quot; este mes no cuenta arriba porque por
          definición no vas a volver a tenerlo el próximo mes. Si de verdad
          se repite, márcalo &quot;Fijo&quot; en Desglose y va a entrar en
          esta cuenta.
        </p>
      </div>

      <Panel title="Mensualidades MSI activas">
        {data.msiPlans.length === 0 ? (
          <p className="text-sm text-text-faint">No tienes planes MSI activos.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-2xs uppercase tracking-wide text-text-faint">
                <th className="pb-2 pr-4">Concepto</th>
                <th className="pb-2 pr-4">Tarjeta</th>
                <th className="pb-2 pr-4">Mensualidad</th>
                <th className="pb-2 pr-4">Avance</th>
              </tr>
            </thead>
            <tbody>
              {data.msiPlans.map((p, idx) => (
                <tr key={idx} className="border-b border-border/60">
                  <td className="py-2 pr-4 text-text">{p.concept}</td>
                  <td className="py-2 pr-4 text-text-muted">{p.accountLabel}</td>
                  <td className="py-2 pr-4 font-medium text-text">
                    {money(p.monthlyPayment)}
                  </td>
                  <td className="py-2 pr-4 text-text-muted">
                    {p.installmentsPaid}/{p.totalInstallments ?? "?"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel title="Domiciliaciones Activas">
        {data.recurringCharges.length === 0 ? (
          <p className="text-sm text-text-faint">
            Todavía no se detectan domiciliaciones — hacen falta al menos 2
            statements de una misma tarjeta con el mismo cargo repetido.
          </p>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-2xs uppercase tracking-wide text-text-faint">
                  <th className="pb-2 pr-4">Servicio</th>
                  <th className="pb-2 pr-4">Tarjeta</th>
                  <th className="pb-2 pr-4">Monto Típico</th>
                  <th className="pb-2 pr-4">Última vez</th>
                </tr>
              </thead>
              <tbody>
                {data.recurringCharges.map((r) => (
                  <tr key={r.id} className="border-b border-border/60">
                    <td className="py-2 pr-4 text-text">{r.description}</td>
                    <td className="py-2 pr-4 text-text-muted">{r.accountLabel}</td>
                    <td className="py-2 pr-4 font-medium text-text">
                      {money(r.typicalAmount)}
                    </td>
                    <td className="py-2 pr-4 text-text-muted">{r.lastSeen ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 rounded-md border-l-4 border-l-accent border-y border-r border-border bg-surface/60 p-3">
              <div className="text-2xs uppercase tracking-wide text-text-faint">
                Total — {data.recurringCharges.length} domiciliaciones
              </div>
              <div className="mt-1 text-lg font-bold text-accent">
                {money(data.recurringCharges.reduce((sum, r) => sum + r.typicalAmount, 0))}
              </div>
              <p className="mt-1 text-2xs text-text-faint">
                Ya está incluido dentro del gasto de cada tarjeta — esto es
                solo para que veas qué parte es recurrente.
              </p>
            </div>
          </>
        )}
      </Panel>

    </div>
  );
}

// Aparcado, no muerto: la pestaña que lo renderiza está marcada `soon` y
// deshabilitada. Se queda aquí para que reactivarla sea quitar esa bandera y
// volver a montar la línea en el switch de arriba, no reescribir el panel.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- ver TABS.soon
function ValidacionTab({ data }: { data: MonthlyDashboardData }) {
  return (
    <Panel title="Avisos de validación del parseo">
      {data.validationIssues.length === 0 ? (
        <p className="text-sm text-positive">
          ✅ No se detectaron inconsistencias en los estados de cuenta de este
          mes.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.validationIssues.map((issue, idx) => (
            <li
              key={idx}
              className={`rounded-md border p-3 text-xs ${
                issue.severity === "error"
                  ? "border-negative/30 bg-negative/10 text-negative"
                  : "border-warning/30 bg-warning/10 text-warning"
              }`}
            >
              <span className="font-semibold">{issue.accountLabel}:</span>{" "}
              {issue.message}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
