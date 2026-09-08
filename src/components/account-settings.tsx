"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui";

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
  // Errores de editar/eliminar. Van aparte del `error` del formulario de
  // alta, que se pinta hasta abajo: un fallo al borrar tiene que verse junto
  // a la lista donde el usuario acaba de hacer clic.
  const [listError, setListError] = useState<string | null>(null);

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
    setListError(null);

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
      setListError(data.error ?? "Ocurrió un error al guardar los cambios.");
      return;
    }

    setEditingId(null);
    await loadAccounts();
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    setListError(null);

    // Borrar una tarjeta arrastra en cascada sus statements, transacciones y
    // planes MSI. Si el DELETE falla, el usuario tiene que enterarse: quedarse
    // callado hace ver la tarjeta en la lista y deja la duda de si el
    // historial se fue o no.
    const res = await fetch(`/api/accounts?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });

    setDeletingId(null);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setListError(data.error ?? "No se pudo eliminar la tarjeta.");
      return;
    }

    setConfirmDeleteId(null);
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
    <div className="flex flex-col gap-section">
      <section>
        <h2 className="mb-tight text-2xs font-semibold uppercase tracking-[0.11em] text-text-faint">
          Tus tarjetas
        </h2>
        {listError && (
          <p className="mb-3 rounded-md border border-negative/40 bg-negative/10 px-3 py-2 text-xs text-negative">
            {listError}
          </p>
        )}
        {loading ? (
          <p className="text-sm text-text-faint">Cargando…</p>
        ) : accounts.length === 0 ? (
          <p className="text-sm text-text-faint">
            Todavía no has agregado ninguna tarjeta.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {accounts.map((a) => (
              <li
                key={a.id}
                className="rounded-lg border border-border bg-surface-raised px-4 py-3 text-sm"
              >
                {editingId === a.id ? (
                  <div className="flex flex-col gap-3">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-text-muted">
                          Emisor
                        </label>
                        <input
                          value={editIssuer}
                          onChange={(e) => setEditIssuer(e.target.value)}
                          className="rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-text"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-text-muted">
                          Nombre del producto
                        </label>
                        <input
                          value={editProductName}
                          onChange={(e) => setEditProductName(e.target.value)}
                          className="rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-text"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-text-muted">
                          Últimos 4 dígitos
                        </label>
                        <input
                          value={editLast4}
                          onChange={(e) => setEditLast4(e.target.value)}
                          maxLength={4}
                          className="rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-text"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="primary" size="sm"
                        onClick={() => saveEdit(a.id)}
                        disabled={savingEdit}>
                        {savingEdit ? "Guardando…" : "Guardar"}
                      </Button>
                      <Button variant="ghost" size="sm"
                        onClick={cancelEdit}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-text">
                        {a.issuer} · {a.product_name}
                      </span>
                      {a.last4 && (
                        <span className="font-mono text-xs text-text-faint">
                          •••• {a.last4}
                        </span>
                      )}
                      {!a.active && (
                        <span className="rounded-full bg-surface-raised-2/70 px-2 py-0.5 text-xs font-medium text-text-muted">
                          Inactiva
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => startEdit(a)}
                        className="text-xs text-text-faint transition hover:text-text"
                      >
                        Editar
                      </button>
                      {confirmDeleteId === a.id ? (
                        <span className="flex items-center gap-2 text-xs">
                          <span className="text-text-muted">¿Borrar?</span>
                          <button
                            onClick={() => handleDelete(a.id)}
                            disabled={deletingId === a.id}
                            className="text-negative hover:text-negative disabled:opacity-50"
                          >
                            Sí
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="text-text-faint hover:text-text-muted"
                          >
                            No
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(a.id)}
                          className="text-xs text-text-faint transition hover:text-negative"
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
        <h2 className="mb-tight text-2xs font-semibold uppercase tracking-[0.11em] text-text-faint">
          Agregar tarjeta
        </h2>
        <form
          onSubmit={handleCreate}
          className="flex flex-col gap-4 rounded-lg border border-border bg-surface-raised p-5"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-text-muted">
                Emisor
              </label>
              <input
                value={newIssuer}
                onChange={(e) => setNewIssuer(e.target.value)}
                placeholder="Banamex, Amex…"
                required
                className="rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-text"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-text-muted">
                Nombre del producto
              </label>
              <input
                value={newProductName}
                onChange={(e) => setNewProductName(e.target.value)}
                placeholder="Explora, Platinum…"
                required
                className="rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-text"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-text-muted">
                Últimos 4 dígitos (opcional)
              </label>
              <input
                value={newLast4}
                onChange={(e) => setNewLast4(e.target.value)}
                maxLength={4}
                placeholder="1234"
                className="rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-text"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-text-muted">
                Límite de crédito (opcional)
              </label>
              <input
                type="number"
                value={newCreditLimit}
                onChange={(e) => setNewCreditLimit(e.target.value)}
                placeholder="50000"
                className="rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-text"
              />
            </div>
          </div>

          {error && <p className="text-xs text-negative">{error}</p>}

          <Button size="md" className="self-start"
            type="submit"
            disabled={creating}
            
          >
            {creating ? "Agregando…" : "Agregar tarjeta"}
          </Button>
        </form>
      </section>
    </div>
  );
}
