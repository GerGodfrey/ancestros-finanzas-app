"use client";

import { useEffect, useState } from "react";

type Provider = "anthropic" | "openai";

type ProviderRow = {
  id: string;
  provider: Provider;
  isActive: boolean;
  orchestratorEnabled: boolean;
  maskedKey: string;
  createdAt: string;
};

const PROVIDER_LABEL: Record<Provider, string> = {
  anthropic: "Anthropic (Claude)",
  openai: "OpenAI",
};

export function ProviderSettings() {
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [provider, setProvider] = useState<Provider>("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [orchestratorEnabled, setOrchestratorEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadProviders() {
    setLoading(true);
    const res = await fetch("/api/providers");
    const data = await res.json();
    setProviders(data.providers ?? []);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch inicial al montar, patrón intencional
    loadProviders();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const res = await fetch("/api/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, apiKey, orchestratorEnabled }),
    });
    const data = await res.json();

    setSaving(false);

    if (!res.ok) {
      setError(data.error ?? "Ocurrió un error al guardar la credencial.");
      return;
    }

    setApiKey("");
    await loadProviders();
  }

  async function handleDelete(id: string) {
    await fetch(`/api/providers?id=${id}`, { method: "DELETE" });
    await loadProviders();
  }

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="mb-3 text-sm font-semibold text-zinc-200">
          Tus proveedores de IA
        </h2>
        {loading ? (
          <p className="text-sm text-zinc-500">Cargando…</p>
        ) : providers.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Todavía no has configurado ningún proveedor.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {providers.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm"
              >
                <div className="flex items-center gap-3">
                  <span className="font-medium text-zinc-100">
                    {PROVIDER_LABEL[p.provider]}
                  </span>
                  <span className="font-mono text-xs text-zinc-500">
                    {p.maskedKey}
                  </span>
                  {p.isActive && (
                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-400">
                      Activo
                    </span>
                  )}
                  {p.orchestratorEnabled && (
                    <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-xs font-medium text-violet-400">
                      Orquestador
                    </span>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(p.id)}
                  className="text-xs text-zinc-500 transition hover:text-red-400"
                >
                  Eliminar
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-zinc-200">
          Agregar / actualizar proveedor
        </h2>
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 rounded-lg border border-zinc-800 bg-zinc-900 p-5"
        >
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-400">
              Proveedor
            </label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as Provider)}
              className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
            >
              <option value="anthropic">Anthropic (Claude)</option>
              <option value="openai">OpenAI</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-400">
              API key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              required
              className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
            />
            <p className="text-xs text-zinc-500">
              Se cifra antes de guardarse. Nunca se muestra completa de
              nuevo.
            </p>
          </div>

          <label className="flex items-center gap-2 text-xs text-zinc-400">
            <input
              type="checkbox"
              checked={orchestratorEnabled}
              onChange={(e) => setOrchestratorEnabled(e.target.checked)}
              className="rounded border-zinc-700 bg-zinc-950"
            />
            Modo orquestador (combinar este proveedor con otros para
            verificación cruzada)
          </label>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="self-start rounded-md bg-white px-4 py-2 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-200 disabled:opacity-50"
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </form>
      </section>
    </div>
  );
}
