"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Account = {
  id: string;
  issuer: string;
  product_name: string;
};

type Step = "idle" | "uploading" | "parsing" | "done" | "error";

export function StatementUpload() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<string>("");
  const [newIssuer, setNewIssuer] = useState("");
  const [newProduct, setNewProduct] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<Step>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  async function loadAccounts() {
    const res = await fetch("/api/accounts");
    const data = await res.json();
    setAccounts(data.accounts ?? []);
    if (data.accounts?.[0] && !accountId) {
      setAccountId(data.accounts[0].id);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch inicial al montar, patrón intencional
    loadAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreateAccount() {
    if (!newIssuer.trim() || !newProduct.trim()) return;
    const res = await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ issuer: newIssuer, productName: newProduct }),
    });
    const data = await res.json();
    if (res.ok) {
      setNewIssuer("");
      setNewProduct("");
      await loadAccounts();
      setAccountId(data.account.id);
    }
  }

  async function handleUpload() {
    if (!file || !accountId) return;
    setStep("uploading");
    setMessage(null);
    setWarnings([]);

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("No autenticado");

      const filePath = `${user.id}/${accountId}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("statements")
        .upload(filePath, file, { contentType: "application/pdf" });
      if (uploadError) throw uploadError;

      const createRes = await fetch("/api/statements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, filePath }),
      });
      const createData = await createRes.json();
      if (!createRes.ok) throw new Error(createData.error);

      setStep("parsing");
      const parseRes = await fetch(
        `/api/statements/${createData.statement.id}/parse`,
        { method: "POST" },
      );
      const parseData = await parseRes.json();
      if (!parseRes.ok) throw new Error(parseData.error);

      setStep("done");
      setMessage(
        `Listo: ${parseData.transactionsInserted} movimientos y ${parseData.msiPlans} planes MSI guardados.`,
      );
      setWarnings(parseData.warnings ?? []);
      setFile(null);
    } catch (err) {
      setStep("error");
      setMessage(err instanceof Error ? err.message : "Error desconocido");
    }
  }

  return (
    <div className="flex flex-col gap-6 rounded-lg border border-zinc-800 bg-zinc-900 p-5">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-zinc-400">Tarjeta</label>
        {accounts.length > 0 ? (
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.issuer} — {a.product_name}
              </option>
            ))}
          </select>
        ) : (
          <p className="text-xs text-zinc-500">
            Todavía no tienes tarjetas registradas — crea una abajo.
          </p>
        )}
      </div>

      <div className="flex items-end gap-2 border-t border-zinc-800 pt-4">
        <div className="flex flex-1 flex-col gap-1.5">
          <label className="text-xs font-medium text-zinc-400">
            Emisor (ej. Banamex)
          </label>
          <input
            value={newIssuer}
            onChange={(e) => setNewIssuer(e.target.value)}
            className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
          />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <label className="text-xs font-medium text-zinc-400">
            Producto (ej. Explora)
          </label>
          <input
            value={newProduct}
            onChange={(e) => setNewProduct(e.target.value)}
            className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
          />
        </div>
        <button
          onClick={handleCreateAccount}
          className="rounded-md border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800"
        >
          Agregar tarjeta
        </button>
      </div>

      <div className="flex flex-col gap-1.5 border-t border-zinc-800 pt-4">
        <label className="text-xs font-medium text-zinc-400">
          PDF del estado de cuenta
        </label>
        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-sm text-zinc-300"
        />
      </div>

      <button
        onClick={handleUpload}
        disabled={!file || !accountId || step === "uploading" || step === "parsing"}
        className="self-start rounded-md bg-white px-4 py-2 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-200 disabled:opacity-50"
      >
        {step === "uploading"
          ? "Subiendo…"
          : step === "parsing"
            ? "Leyendo el PDF con IA…"
            : "Subir y procesar"}
      </button>

      {message && (
        <p
          className={`text-sm ${step === "error" ? "text-red-400" : "text-emerald-400"}`}
        >
          {message}
        </p>
      )}
      {warnings.length > 0 && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
          <p className="mb-1 font-semibold">Avisos del parseo:</p>
          <ul className="list-inside list-disc">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
