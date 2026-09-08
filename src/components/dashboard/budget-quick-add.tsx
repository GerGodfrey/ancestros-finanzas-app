"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";

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
  const [isRecurring, setIsRecurring] = useState(false);
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
        : { concept, amount: Number(amount), month, isRecurring };

    await fetch(ENDPOINT_BY_KIND[kind], {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setSaving(false);
    setConcept("");
    setAmount("");
    setIsRecurring(false);
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-surface-raised p-4"
    >
      <div className="flex flex-col gap-1">
        <label className="text-xs text-text-muted">Tipo</label>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as "income" | "fixed" | "debt")}
          className="rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-text"
        >
          <option value="income">Ingreso/Ganancia</option>
          <option value="fixed">Egreso/Gasto</option>
          <option value="debt">Deuda familiar/largo plazo</option>
        </select>
      </div>
      <div className="flex flex-1 flex-col gap-1">
        <label className="text-xs text-text-muted">Concepto</label>
        <input
          value={concept}
          onChange={(e) => setConcept(e.target.value)}
          placeholder={
            kind === "income" ? "Nómina" : kind === "fixed" ? "Renta" : "Cripto (prestado)"
          }
          className="rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-text"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-text-muted">Monto</label>
        <input
          type="number"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-32 rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-text"
        />
      </div>
      {kind !== "debt" && (
        <div className="flex flex-col gap-1">
          <label className="text-xs text-text-muted">Recurrencia</label>
          <select
            value={isRecurring ? "recurring" : "temporary"}
            onChange={(e) => setIsRecurring(e.target.value === "recurring")}
            className="rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-text"
          >
            <option value="temporary">Temporal (solo este mes)</option>
            <option value="recurring">Fijo (este mes en adelante)</option>
          </select>
        </div>
      )}
      <Button size="sm"
        type="submit"
        disabled={saving}
        
      >
        {saving ? "Guardando…" : "Agregar"}
      </Button>
    </form>
  );
}
