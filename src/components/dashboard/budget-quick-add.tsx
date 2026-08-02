"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const ENDPOINT_BY_KIND = {
  income: "/api/incomes",
  fixed: "/api/fixed-costs",
  debt: "/api/debts",
};

export function BudgetQuickAdd({ month }: { month: string }) {
  const router = useRouter();
  const [kind, setKind] = useState<"income" | "fixed" | "debt">("income");
  const [concept, setConcept] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!concept.trim() || !amount) return;
    setSaving(true);

    // Las deudas familiares/largo plazo (kind="debt") no llevan mes — son un
    // saldo pendiente, no un movimiento recurrente de este mes en particular.
    const body =
      kind === "debt"
        ? { concept, amount: Number(amount) }
        : { concept, amount: Number(amount), month };

    await fetch(ENDPOINT_BY_KIND[kind], {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setSaving(false);
    setConcept("");
    setAmount("");
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-end gap-2 rounded-lg border border-zinc-800 bg-zinc-900 p-4"
    >
      <div className="flex flex-col gap-1">
        <label className="text-xs text-zinc-400">Tipo</label>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as "income" | "fixed" | "debt")}
          className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100"
        >
          <option value="income">Ingreso</option>
          <option value="fixed">Costo fijo</option>
          <option value="debt">Deuda familiar/largo plazo</option>
        </select>
      </div>
      <div className="flex flex-1 flex-col gap-1">
        <label className="text-xs text-zinc-400">Concepto</label>
        <input
          value={concept}
          onChange={(e) => setConcept(e.target.value)}
          placeholder={
            kind === "income" ? "Nómina" : kind === "fixed" ? "Renta" : "Cripto (prestado)"
          }
          className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-zinc-400">Monto</label>
        <input
          type="number"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-32 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100"
        />
      </div>
      <button
        type="submit"
        disabled={saving}
        className="rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-zinc-900 hover:bg-zinc-200 disabled:opacity-50"
      >
        {saving ? "Guardando…" : "Agregar"}
      </button>
    </form>
  );
}
