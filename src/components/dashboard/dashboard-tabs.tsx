"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  MonthlyDashboardData,
  RelevantTransaction,
} from "@/lib/dashboard/get-monthly-data";
import { BudgetQuickAdd } from "./budget-quick-add";
import {
  FlujoDelMesChart,
  GastoPorCategoriaChart,
  GastoPorTarjetaChart,
  IngresosVsEgresosManualesChart,
} from "./charts";
import { CATEGORY_COLOR, CATEGORY_LABEL } from "@/lib/transaction-categories";

const TABS = [
  { id: "resumen", label: "📊 Resumen del Mes" },
  { id: "desglose", label: "🧩 Desglose" },
  { id: "movimientos", label: "🧾 Movimientos Relevantes" },
  { id: "proximo", label: "📅 Próximo Mes" },
  { id: "validacion", label: "🧮 Validación" },
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
      className="text-xs text-zinc-600 hover:text-red-400 disabled:opacity-50"
      aria-label="Eliminar"
    >
      ✕
    </button>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-zinc-100">
        <span className="h-4 w-0.5 rounded bg-violet-500" />
        {title}
      </h2>
      {children}
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "good" | "bad" | "warn";
}) {
  const toneColor = {
    default: "text-zinc-100",
    good: "text-emerald-400",
    bad: "text-red-400",
    warn: "text-amber-400",
  }[tone];
  const borderColor = {
    default: "border-l-violet-500",
    good: "border-l-emerald-500",
    bad: "border-l-red-500",
    warn: "border-l-amber-500",
  }[tone];

  return (
    <div
      className={`rounded-lg border border-zinc-800 border-l-4 ${borderColor} bg-zinc-900 p-4`}
    >
      <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className={`mt-1.5 text-xl font-bold ${toneColor}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-zinc-500">{sub}</div>}
    </div>
  );
}

export function DashboardTabs({ data }: { data: MonthlyDashboardData }) {
  const [tab, setTab] = useState<TabId>("resumen");

  if (!data.hasData) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-8 text-center">
        <p className="text-sm text-zinc-400">
          Todavía no hay estados de cuenta procesados. Sube un PDF para
          empezar a ver tu dashboard.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-lg border px-4 py-2 text-xs font-semibold transition ${
              tab === t.id
                ? "border-violet-500 bg-gradient-to-br from-indigo-600 to-violet-600 text-white"
                : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-100"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "resumen" && <ResumenTab data={data} />}
      {tab === "desglose" && <DesgloseTab data={data} />}
      {tab === "movimientos" && <MovimientosTab data={data} />}
      {tab === "proximo" && <ProximoMesTab data={data} />}
      {tab === "validacion" && <ValidacionTab data={data} />}
    </div>
  );
}

const INSIGHT_TONE_STYLE = {
  good: { icon: "✅", text: "text-emerald-400" },
  bad: { icon: "🔴", text: "text-red-400" },
  warning: { icon: "⚠️", text: "text-amber-400" },
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
    <div className="rounded-lg border border-amber-700/40 bg-amber-950/10 p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-200">
          <span className="h-4 w-0.5 rounded bg-amber-500" />
          🔎 3 cosas que pasaron este mes que vale la pena que veas
        </h2>
        <button
          onClick={regenerate}
          disabled={loading}
          className="shrink-0 rounded-md border border-zinc-700 px-2.5 py-1 text-[11px] font-medium text-zinc-400 hover:text-zinc-100 disabled:opacity-50"
        >
          {loading ? "Generando…" : "Regenerar análisis"}
        </button>
      </div>

      {error && <p className="mb-3 text-xs text-red-400">{error}</p>}

      {data.insights && data.insights.length > 0 ? (
        <ul className="flex flex-col gap-3 text-sm text-zinc-300">
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
        <p className="text-sm text-zinc-500">
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
        <p className="text-sm text-zinc-500">No hay pagos pendientes.</p>
      ) : (
        <ul className="flex flex-col gap-2 text-sm">
          {pagos.map((c) => (
            <li
              key={c.accountId}
              className="flex items-center justify-between gap-3 rounded-md border border-zinc-800 border-l-4 border-l-violet-500 bg-zinc-950/40 px-3 py-2"
            >
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-violet-300">
                  {formatShortDate(c.fechaPago)}
                </span>
                <span className="text-zinc-200">
                  {c.issuer} {c.productName}
                </span>
              </div>
              <span className="font-medium text-zinc-100">{money(c.gasto)}</span>
            </li>
          ))}
        </ul>
      )}

      {pagos.length > 0 && (
        <div className="mt-4 rounded-md border border-zinc-800 bg-zinc-950/60 p-3">
          <div className="text-[11px] uppercase tracking-wide text-zinc-500">
            Total a pagar (para no generar intereses)
          </div>
          <div className="mt-1 text-xl font-bold text-red-400">
            {money(total)}
          </div>
          {diff !== null && (
            <p className="mt-1 text-xs text-zinc-500">
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
            className="rounded-md border border-zinc-800 bg-zinc-950/40 p-3"
          >
            <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              {d.accountLabel} (MSI)
            </div>
            <div
              className={`mt-1 text-base font-bold ${d.remainingDebt > 0 ? "text-red-400" : "text-emerald-400"}`}
            >
              {money(d.remainingDebt)}
              {d.remainingDebt === 0 && " ✅"}
            </div>
            <p className="mt-1 text-[11px] text-zinc-500">
              {d.concepts.length > 0
                ? d.concepts.join(", ")
                : "Sin MSI, al corriente"}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
        Deudas Familiares / Largo Plazo
      </div>
      {data.standingDebts.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-500">
          No has capturado deudas de largo plazo. Agrégalas desde la pestaña
          Desglose.
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {data.standingDebts.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between gap-2 rounded-md border border-zinc-800 bg-zinc-950/40 p-3"
            >
              <div>
                <div className="text-sm font-medium text-zinc-100">
                  {d.concept}
                </div>
                <div className="text-[11px] text-zinc-500">
                  {d.note ?? "No se paga este mes"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-red-400">{money(d.amount)}</span>
                <button
                  onClick={() => deleteDebt(d.id)}
                  disabled={deletingId === d.id}
                  className="text-xs text-zinc-600 hover:text-red-400 disabled:opacity-50"
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
        <div className="mt-5 rounded-md border-l-4 border-l-red-500 border-y border-r border-zinc-800 bg-zinc-950/60 p-3">
          <div className="text-[11px] uppercase tracking-wide text-zinc-500">
            Deuda Futura Total (MSI tarjetas + familiar)
          </div>
          <div className="mt-1 text-lg font-bold text-red-400">
            {money(totalMsiDebt)} tarjetas + {money(totalStandingDebt)} familiar
          </div>
        </div>
      )}
    </Panel>
  );
}

const RECOMMENDATION_TYPE_STYLE = {
  strength: { icon: "✅", text: "text-emerald-400", label: "Lo haces bien" },
  action: { icon: "🎯", text: "text-sky-400", label: "Próximo paso" },
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
    <div className="rounded-lg border border-sky-700/40 bg-sky-950/10 p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-sky-200">
          <span className="h-4 w-0.5 rounded bg-sky-500" />
          🎯 Recomendaciones y Próximos Pasos
        </h2>
        <button
          onClick={regenerate}
          disabled={loading}
          className="shrink-0 rounded-md border border-zinc-700 px-2.5 py-1 text-[11px] font-medium text-zinc-400 hover:text-zinc-100 disabled:opacity-50"
        >
          {loading ? "Generando…" : "Regenerar análisis"}
        </button>
      </div>

      {error && <p className="mb-3 text-xs text-red-400">{error}</p>}

      {data.recommendations && data.recommendations.length > 0 ? (
        <ul className="flex flex-col gap-3 text-sm text-zinc-300">
          {data.recommendations.map((rec, idx) => {
            const style = RECOMMENDATION_TYPE_STYLE[rec.type] ?? RECOMMENDATION_TYPE_STYLE.action;
            return (
              <li key={idx} className="flex items-start gap-2">
                <span
                  className={`shrink-0 rounded-full border border-current px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${style.text}`}
                >
                  {style.icon} {style.label}
                </span>
                <span>{rec.text}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-zinc-500">
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
        <Kpi
          label="Ingreso Total"
          value={money(data.ingresoTotal)}
          sub={
            data.incomes.length > 0
              ? data.incomes.map((i) => i.concept).join(", ")
              : "Sin ingresos capturados este mes"
          }
          tone="good"
        />
        <Kpi
          label="Egreso Total"
          value={money(data.egresoTotal)}
          sub={`Tarjetas (${money(data.gastoTarjetas)}) + costos fijos (${money(data.egresoDebito)})`}
          tone="bad"
        />
        <Kpi
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
              <tr className="border-b border-zinc-800 text-left text-[11px] uppercase tracking-wide text-zinc-500">
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
                <tr key={c.accountId} className="border-b border-zinc-800/60">
                  <td className="py-2 pr-4 font-medium text-zinc-100">
                    {c.issuer} {c.productName}
                  </td>
                  <td className="py-2 pr-4">{money(c.gasto)}</td>
                  <td className="py-2 pr-4">{money(c.limite)}</td>
                  <td className="py-2 pr-4">{money(c.disponible)}</td>
                  <td className="py-2 pr-4">
                    <span
                      className={
                        (c.utilizacion ?? 0) > 0.6
                          ? "text-red-400"
                          : (c.utilizacion ?? 0) > 0.4
                            ? "text-amber-400"
                            : "text-emerald-400"
                      }
                    >
                      {pct(c.utilizacion)}
                    </span>
                  </td>
                  <td className="py-2 pr-4">{money(c.deudaMsi)}</td>
                  <td className="py-2 pr-4 text-zinc-400">
                    {c.fechaPago ?? "—"}
                  </td>
                  <td className="py-2 pr-4">
                    <div className="flex flex-wrap gap-1">
                      {c.estadoTags.length === 0 ? (
                        <span className="text-zinc-600">—</span>
                      ) : (
                        c.estadoTags.map((tag, idx) => (
                          <span
                            key={idx}
                            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              tag.startsWith("✅")
                                ? "bg-emerald-500/10 text-emerald-400"
                                : tag.startsWith("🚨")
                                  ? "bg-red-500/10 text-red-400"
                                  : "bg-amber-500/10 text-amber-400"
                            }`}
                          >
                            {tag}
                          </span>
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
      <p className="text-sm text-zinc-400">
        Tienes {count} movimiento{count === 1 ? "" : "s"} sin categoría
        (comida, transporte, ropa...) — probablemente de statements que se
        parsearon antes de tener esta función. No hace falta resubir el PDF.
      </p>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      {warning && <p className="mt-2 text-xs text-amber-400">{warning}</p>}
      <button
        onClick={categorize}
        disabled={loading}
        className="mt-3 rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-zinc-900 hover:bg-zinc-200 disabled:opacity-50"
      >
        {loading ? "Categorizando…" : "Categorizar movimientos"}
      </button>
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
          <p className="text-sm text-zinc-500">
            Todavía no capturas ingresos para este mes.
          </p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {data.incomes.map((i) => (
              <li
                key={i.id}
                className="flex items-center justify-between gap-2 border-b border-zinc-800/60 pb-2"
              >
                <span className="text-zinc-300">
                  {i.concept}
                  {i.isRecurring && (
                    <span className="ml-2 rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-medium text-violet-400">
                      fijo
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-zinc-100">{money(i.amount)}</span>
                  <DeleteRowButton endpoint="/api/incomes" id={i.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Desglose de Egresos Fijos (débito)">
        {data.fixedCosts.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Todavía no capturas costos fijos para este mes.
          </p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {data.fixedCosts.map((f) => (
              <li
                key={f.id}
                className="flex items-center justify-between gap-2 border-b border-zinc-800/60 pb-2"
              >
                <span className="text-zinc-300">
                  {f.concept}
                  {f.isRecurring && (
                    <span className="ml-2 rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-medium text-violet-400">
                      fijo
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-zinc-100">{money(f.amount)}</span>
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
              className="flex justify-between border-b border-zinc-800/60 pb-2"
            >
              <span className="text-zinc-300">
                {c.issuer} {c.productName}
              </span>
              <span className="font-medium text-zinc-100">{money(c.gasto)}</span>
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

function MovimientosPorTarjetaTable({
  transactions,
}: {
  transactions: RelevantTransaction[];
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-zinc-800 text-left text-[11px] uppercase tracking-wide text-zinc-500">
          <th className="pb-2 pr-4">Descripción</th>
          <th className="pb-2 pr-4">Monto</th>
          <th className="pb-2 pr-4">Tipo</th>
          <th className="pb-2 pr-4">Categoría</th>
        </tr>
      </thead>
      <tbody>
        {transactions.map((t) => (
          <tr key={t.id} className="border-b border-zinc-800/60">
            <td className="py-2 pr-4 text-zinc-200">
              {t.description}
              <div className="text-[11px] text-zinc-500">{t.date}</div>
            </td>
            <td className="py-2 pr-4 font-medium text-zinc-100">
              {money(t.amount)}
            </td>
            <td className="py-2 pr-4">
              <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">
                {t.type}
              </span>
            </td>
            <td className="py-2 pr-4">
              {t.category ? (
                <span
                  className="rounded-full px-2 py-0.5 text-xs font-medium"
                  style={{
                    color: CATEGORY_COLOR[t.category],
                    backgroundColor: `${CATEGORY_COLOR[t.category]}26`,
                  }}
                >
                  {CATEGORY_LABEL[t.category]}
                </span>
              ) : (
                <span className="text-xs text-zinc-600">—</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MovimientosTab({ data }: { data: MonthlyDashboardData }) {
  return (
    <div className="flex flex-col gap-4">
      <Panel title="Gasto por Categoría (estimado)">
        <GastoPorCategoriaChart data={data} />
      </Panel>

      {data.relevantTransactionsByAccount.length === 0 ? (
        <Panel title="Movimientos Relevantes">
          <p className="text-sm text-zinc-500">
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
            </Panel>
          ))}
        </div>
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
          borderColor: "#7C3AED",
          background: "linear-gradient(180deg,#1C1530,#161B26)",
        }}
      >
        <h2 className="mb-3 text-sm font-semibold text-zinc-100">
          📅 Lo que ya está comprometido el próximo mes
        </h2>
        <div className="text-3xl font-extrabold text-violet-300">
          {money(data.msiMensualTotal + data.egresoDebito)}
        </div>
        <p className="mt-1 text-xs text-zinc-400">
          = {money(data.msiMensualTotal)} en mensualidades MSI +{" "}
          {money(data.egresoDebito)} en costos fijos
        </p>
      </div>

      <Panel title="Mensualidades MSI activas">
        {data.msiPlans.length === 0 ? (
          <p className="text-sm text-zinc-500">No tienes planes MSI activos.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left text-[11px] uppercase tracking-wide text-zinc-500">
                <th className="pb-2 pr-4">Concepto</th>
                <th className="pb-2 pr-4">Tarjeta</th>
                <th className="pb-2 pr-4">Mensualidad</th>
                <th className="pb-2 pr-4">Avance</th>
              </tr>
            </thead>
            <tbody>
              {data.msiPlans.map((p, idx) => (
                <tr key={idx} className="border-b border-zinc-800/60">
                  <td className="py-2 pr-4 text-zinc-200">{p.concept}</td>
                  <td className="py-2 pr-4 text-zinc-400">{p.accountLabel}</td>
                  <td className="py-2 pr-4 font-medium text-zinc-100">
                    {money(p.monthlyPayment)}
                  </td>
                  <td className="py-2 pr-4 text-zinc-400">
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
          <p className="text-sm text-zinc-500">
            Todavía no se detectan domiciliaciones — hacen falta al menos 2
            statements de una misma tarjeta con el mismo cargo repetido.
          </p>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-[11px] uppercase tracking-wide text-zinc-500">
                  <th className="pb-2 pr-4">Servicio</th>
                  <th className="pb-2 pr-4">Tarjeta</th>
                  <th className="pb-2 pr-4">Monto Típico</th>
                  <th className="pb-2 pr-4">Última vez</th>
                </tr>
              </thead>
              <tbody>
                {data.recurringCharges.map((r) => (
                  <tr key={r.id} className="border-b border-zinc-800/60">
                    <td className="py-2 pr-4 text-zinc-200">{r.description}</td>
                    <td className="py-2 pr-4 text-zinc-400">{r.accountLabel}</td>
                    <td className="py-2 pr-4 font-medium text-zinc-100">
                      {money(r.typicalAmount)}
                    </td>
                    <td className="py-2 pr-4 text-zinc-400">{r.lastSeen ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 rounded-md border-l-4 border-l-blue-500 border-y border-r border-zinc-800 bg-zinc-950/60 p-3">
              <div className="text-[11px] uppercase tracking-wide text-zinc-500">
                Total — {data.recurringCharges.length} domiciliaciones
              </div>
              <div className="mt-1 text-lg font-bold text-blue-400">
                {money(data.recurringCharges.reduce((sum, r) => sum + r.typicalAmount, 0))}
              </div>
              <p className="mt-1 text-[11px] text-zinc-500">
                Ya está incluido dentro del gasto de cada tarjeta — esto es
                solo para que veas qué parte es recurrente.
              </p>
            </div>
          </>
        )}
      </Panel>

      <Panel title="Cuánto puedes gastar el próximo mes (máximo, según ingreso)">
        <div className="text-2xl font-bold text-emerald-400">
          {money(data.saldoDisponibleGastoLibre)}
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          Ingreso ({money(data.ingresoTotal)}) − costos fijos (
          {money(data.egresoDebito)}) − mensualidades MSI (
          {money(data.msiMensualTotal)})
        </p>
      </Panel>
    </div>
  );
}

function ValidacionTab({ data }: { data: MonthlyDashboardData }) {
  return (
    <Panel title="Avisos de validación del parseo">
      {data.validationIssues.length === 0 ? (
        <p className="text-sm text-emerald-400">
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
                  ? "border-red-500/30 bg-red-500/10 text-red-300"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-300"
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
