"use client";

import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MonthlyDashboardData } from "@/lib/dashboard/get-monthly-data";
import {
  CATEGORY_COLOR,
  categoryLabelWithEmoji,
} from "@/lib/transaction-categories";

const money = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });

// Las tarjetas se pintan con los mismos tokens que las categorías, en vez de
// con una tercera paleta paralela. Recharts los acepta porque terminan como
// atributos SVG, así que cambian con el tema igual que todo lo demás.
const CARD_COLORS = [
  "var(--cat-transporte)",
  "var(--cat-viaje)",
  "var(--cat-hogar)",
  "var(--cat-comida)",
  "var(--cat-ropa)",
  "var(--cat-salud)",
  "var(--cat-tech)",
];

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { name: string; value: number }[];
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border-strong bg-surface-raised px-3 py-2 text-xs shadow-lg">
      {payload.map((p, idx) => (
        <div key={idx} className="text-text">
          {p.name}: <span className="font-mono font-semibold tabular-nums">{money(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function FlujoDelMesChart({ data }: { data: MonthlyDashboardData }) {
  const rows = [
    { name: "Ingreso Total", value: data.ingresoTotal, color: "var(--positive)" },
    { name: "Egreso Total", value: data.egresoTotal, color: "var(--negative)" },
    { name: "Gasto Tarjetas", value: data.gastoTarjetas, color: "var(--accent)" },
    {
      name: "Balance del Mes",
      value: data.balance,
      color: data.balance >= 0 ? "var(--positive)" : "var(--negative)",
    },
  ];

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={rows} layout="vertical" margin={{ left: 24 }}>
        <XAxis
          type="number"
          stroke="var(--text-faint)"
          tick={{ fill: "var(--text-faint)", fontSize: 11 }}
          tickFormatter={(v) => `$${(Number(v) / 1000).toFixed(0)}k`}
        />
        <YAxis
          type="category"
          dataKey="name"
          stroke="var(--text-faint)"
          tick={{ fill: "var(--text-muted)", fontSize: 12 }}
          width={110}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--surface-raised-2)" }} />
        <Bar dataKey="value" radius={[0, 6, 6, 0]}>
          {rows.map((r, idx) => (
            <Cell key={idx} fill={r.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function IngresosVsEgresosManualesChart({
  data,
}: {
  data: MonthlyDashboardData;
}) {
  const rows = [
    { name: "Ingresos", value: data.ingresoTotal, color: "var(--positive)" },
    { name: "Egresos Manuales", value: data.egresoDebito, color: "var(--warning)" },
    { name: "Gasto Tarjetas", value: data.gastoTarjetas, color: "var(--accent)" },
  ];

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={rows} layout="vertical" margin={{ left: 24 }}>
        <XAxis
          type="number"
          stroke="var(--text-faint)"
          tick={{ fill: "var(--text-faint)", fontSize: 11 }}
          tickFormatter={(v) => `$${(Number(v) / 1000).toFixed(0)}k`}
        />
        <YAxis
          type="category"
          dataKey="name"
          stroke="var(--text-faint)"
          tick={{ fill: "var(--text-muted)", fontSize: 12 }}
          width={120}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--surface-raised-2)" }} />
        <Bar dataKey="value" radius={[0, 6, 6, 0]}>
          {rows.map((r, idx) => (
            <Cell key={idx} fill={r.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function GastoPorTarjetaChart({ data }: { data: MonthlyDashboardData }) {
  const rows = data.cards
    .filter((c) => (c.gasto ?? 0) > 0)
    .map((c) => ({ name: `${c.issuer} ${c.productName}`, value: c.gasto ?? 0 }));

  if (rows.length === 0) {
    return <p className="text-sm text-text-faint">Sin gasto de tarjetas este mes.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={rows}
          dataKey="value"
          nameKey="name"
          innerRadius={60}
          outerRadius={95}
          paddingAngle={2}
          stroke="var(--surface-raised)"
          strokeWidth={2}
        >
          {rows.map((_, idx) => (
            <Cell key={idx} fill={CARD_COLORS[idx % CARD_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip content={<ChartTooltip />} />
        <Legend
          wrapperStyle={{ fontSize: 12, color: "var(--text-muted)" }}
          formatter={(value) => <span style={{ color: "var(--text-muted)" }}>{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function GastoPorCategoriaChart({ data }: { data: MonthlyDashboardData }) {
  if (data.categoryBreakdown.length === 0) {
    return (
      <p className="text-sm text-text-faint">
        Sin movimientos categorizados este mes todavía.
      </p>
    );
  }

  const rows = data.categoryBreakdown.map((c) => ({
    name: categoryLabelWithEmoji(c.category),
    value: c.amount,
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={rows}
          dataKey="value"
          nameKey="name"
          innerRadius={55}
          outerRadius={90}
          paddingAngle={2}
          stroke="var(--surface-raised)"
          strokeWidth={2}
        >
          {data.categoryBreakdown.map((c, idx) => (
            <Cell key={idx} fill={CATEGORY_COLOR[c.category]} />
          ))}
        </Pie>
        <Tooltip content={<ChartTooltip />} />
        <Legend
          layout="vertical"
          align="right"
          verticalAlign="middle"
          wrapperStyle={{ fontSize: 11, color: "var(--text-muted)" }}
          formatter={(value: string, entry: { payload?: { value?: number } }) => {
            const amount = entry.payload?.value ?? 0;
            return (
              <span style={{ color: "var(--text-muted)" }}>
                {value} — <span style={{ color: "var(--text)", fontWeight: 600 }}>{money(amount)}</span>
              </span>
            );
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
