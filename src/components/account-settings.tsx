"use client";

import { useEffect, useState } from "react";

type AccountRow = {
  id: string;
  issuer: string;
  product_name: string;
  last4: string | null;
  credit_limit: number | null;
  active: boolean;
};

export function AccountSettings() {
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editIssuer, setEditIssuer] = useState("");
  const [editProductName, setEditProductName] = useState("");
  const [editLast4, setEditLast4] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [newIssuer, setNewIssuer] = useState("");
  const [newProductName, setNewProductName] = useState("");
  const [newLast4, setNewLast4] = useState("");
  const [newCreditLimit, setNewCreditLimit] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadAccounts() {
    setLoading(true);
    const res = await fetch("/api/accounts");
    const data = await res.json();
    setAccounts(data.accounts ?? []);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch inicial al montar, patrón intencional
    loadAccounts();
  }, []);

  function startEdit(account: AccountRow) {
    setEditingId(account.id);
    setEditIssuer(account.issuer);
    setEditProductName(account.product_name);
    setEditLast4(account.last4 ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(id: string) {
    setSavingEdit(true);
    setError(null);

    const res = await fetch("/api/accounts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        issuer: editIssuer,
        productName: editProductName,
        last4: editLast4.trim(),
      }),
    });
    const data = await res.json();

    setSavingEdit(false);

    if (!res.ok) {
      setError(data.error ?? "Ocurrió un error al guardar los cambios.");
      return;
    }

    setEditingId(null);
    await loadAccounts();
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    await fetch(`/api/accounts?id=${id}`, { method: "DELETE" });
    setConfirmDeleteId(null);
    setDeletingId(null);
    await loadAccounts();
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);

    const res = await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        issuer: newIssuer,
        productName: newProductName,
        last4: newLast4.trim() || null,
        creditLimit: newCreditLimit ? Number(newCreditLimit) : null,
      }),
    });
    const data = await res.json();

    setCreating(false);

    if (!res.ok) {
      setError(data.error ?? "Ocurrió un error al crear la tarjeta.");
      return;
    }

    setNewIssuer("");
    setNewProductName("");
    setNewLast4("");
    setNewCreditLimit("");
    await loadAccounts();
  }

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="mb-3 text-sm font-semibold text-zinc-200">
          Tus tarjetas
        </h2>
        {loading ? (
          <p className="text-sm text-zinc-500">Cargando…</p>
        ) : accounts.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Todavía no has agregado ninguna tarjeta.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {accounts.map((a) => (
              <li
                key={a.id}
                className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm"
              >
                {editingId === a.id ? (
                  <div className="flex flex-col gap-3">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-zinc-400">
                          Emisor
                        </label>
                        <input
                          value={editIssuer}
                          onChange={(e) => setEditIssuer(e.target.value)}
                          className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-zinc-400">
                          Nombre del producto
                        </label>
                        <input
                          value={editProductName}
                          onChange={(e) => setEditProductName(e.target.value)}
                          className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-zinc-400">
                          Últimos 4 dígitos
                        </label>
                        <input
                          value={editLast4}
                          onChange={(e) => setEditLast4(e.target.value)}
                          maxLength={4}
                          className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => saveEdit(a.id)}
                        disabled={savingEdit}
                        className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-zinc-900 transition hover:bg-zinc-200 disabled:opacity-50"
                      >
                        {savingEdit ? "Guardando…" : "Guardar"}
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition hover:bg-zinc-800"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-zinc-100">
                        {a.issuer} · {a.product_name}
                      </span>
                      {a.last4 && (
                        <span className="font-mono text-xs text-zinc-500">
                          •••• {a.last4}
                        </span>
                      )}
                      {!a.active && (
                        <span className="rounded-full bg-zinc-700/50 px-2 py-0.5 text-xs font-medium text-zinc-400">
                          Inactiva
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => startEdit(a)}
                        className="text-xs text-zinc-500 transition hover:text-zinc-200"
                      >
                        Editar
                      </button>
                      {confirmDeleteId === a.id ? (
                        <span className="flex items-center gap-2 text-xs">
                          <span className="text-zinc-400">¿Borrar?</span>
                          <button
                            onClick={() => handleDelete(a.id)}
                            disabled={deletingId === a.id}
                            className="text-red-400 hover:text-red-300 disabled:opacity-50"
                          >
                            Sí
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="text-zinc-500 hover:text-zinc-300"
                          >
                            No
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(a.id)}
                          className="text-xs text-zinc-500 transition hover:text-red-400"
                        >
                          Eliminar
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-zinc-200">
          Agregar tarjeta
        </h2>
        <form
          onSubmit={handleCreate}
          className="flex flex-col gap-4 rounded-lg border border-zinc-800 bg-zinc-900 p-5"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-zinc-400">
                Emisor
              </label>
              <input
                value={newIssuer}
                onChange={(e) => setNewIssuer(e.target.value)}
                placeholder="Banamex, Amex…"
                required
                className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-zinc-400">
                Nombre del producto
              </label>
              <input
                value={newProductName}
                onChange={(e) => setNewProductName(e.target.value)}
                placeholder="Explora, Platinum…"
                required
                className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-zinc-400">
                Últimos 4 dígitos (opcional)
              </label>
              <input
                value={newLast4}
                onChange={(e) => setNewLast4(e.target.value)}
                maxLength={4}
                placeholder="1234"
                className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-zinc-400">
                Límite de crédito (opcional)
              </label>
              <input
                type="number"
                value={newCreditLimit}
                onChange={(e) => setNewCreditLimit(e.target.value)}
                placeholder="50000"
                className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
              />
            </div>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={creating}
            className="self-start rounded-md bg-white px-4 py-2 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-200 disabled:opacity-50"
          >
            {creating ? "Agregando…" : "Agregar tarjeta"}
          </button>
        </form>
      </section>
    </div>
  );
}
