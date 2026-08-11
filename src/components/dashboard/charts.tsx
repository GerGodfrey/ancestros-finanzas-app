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
import { CATEGORY_COLOR, CATEGORY_LABEL } from "@/lib/transaction-categories";

const money = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });

const CARD_COLORS = [
  "#7C3AED",
  "#14B8A6",
  "#3B82F6",
  "#10B981",
  "#F97316",
  "#EC4899",
  "#6366F1",
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
    <div className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs shadow-lg">
      {payload.map((p, idx) => (
        <div key={idx} className="text-zinc-200">
          {p.name}: <span className="font-semibold">{money(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function FlujoDelMesChart({ data }: { data: MonthlyDashboardData }) {
  const rows = [
    { name: "Ingreso Total", value: data.ingresoTotal, color: "#34D399" },
    { name: "Egreso Total", value: data.egresoTotal, color: "#F87171" },
    { name: "Gasto Tarjetas", value: data.gastoTarjetas, color: "#60A5FA" },
    {
      name: "Balance del Mes",
      value: data.balance,
      color: data.balance >= 0 ? "#34D399" : "#F87171",
    },
  ];

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={rows} layout="vertical" margin={{ left: 24 }}>
        <XAxis
          type="number"
          stroke="#6B7589"
          tick={{ fill: "#6B7589", fontSize: 11 }}
          tickFormatter={(v) => `$${(Number(v) / 1000).toFixed(0)}k`}
        />
        <YAxis
          type="category"
          dataKey="name"
          stroke="#6B7589"
          tick={{ fill: "#B0BAC9", fontSize: 12 }}
          width={110}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "#1C2231" }} />
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
    { name: "Ingresos", value: data.ingresoTotal, color: "#34D399" },
    { name: "Egresos Manuales", value: data.egresoDebito, color: "#F59E0B" },
    { name: "Gasto Tarjetas", value: data.gastoTarjetas, color: "#60A5FA" },
  ];

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={rows} layout="vertical" margin={{ left: 24 }}>
        <XAxis
          type="number"
          stroke="#6B7589"
          tick={{ fill: "#6B7589", fontSize: 11 }}
          tickFormatter={(v) => `$${(Number(v) / 1000).toFixed(0)}k`}
        />
        <YAxis
          type="category"
          dataKey="name"
          stroke="#6B7589"
          tick={{ fill: "#B0BAC9", fontSize: 12 }}
          width={120}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "#1C2231" }} />
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
    return <p className="text-sm text-zinc-500">Sin gasto de tarjetas este mes.</p>;
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
          stroke="#0B0F17"
          strokeWidth={2}
        >
          {rows.map((_, idx) => (
            <Cell key={idx} fill={CARD_COLORS[idx % CARD_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip content={<ChartTooltip />} />
        <Legend
          wrapperStyle={{ fontSize: 12, color: "#B0BAC9" }}
          formatter={(value) => <span style={{ color: "#B0BAC9" }}>{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function GastoPorCategoriaChart({ data }: { data: MonthlyDashboardData }) {
  if (data.categoryBreakdown.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        Sin movimientos categorizados este mes todavía.
      </p>
    );
  }

  const rows = data.categoryBreakdown.map((c) => ({
    name: CATEGORY_LABEL[c.category],
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
          stroke="#0B0F17"
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
          wrapperStyle={{ fontSize: 11, color: "#B0BAC9" }}
          formatter={(value) => <span style={{ color: "#B0BAC9" }}>{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
