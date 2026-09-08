"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui";

type Provider = "anthropic" | "openai" | "gemini" | "deepseek";

type ProviderRow = {
  id: string;
  provider: Provider;
  isActive: boolean;
  orchestratorEnabled: boolean;
  maskedKey: string | null;
  /** La key está guardada pero ya no se puede descifrar: hay que volver a capturarla. */
  unreadable?: boolean;
  createdAt: string;
};

/** Lee la respuesta aunque el servidor haya devuelto un 500 sin cuerpo JSON. */
async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

const PROVIDER_LABEL: Record<Provider, string> = {
  anthropic: "Anthropic (Claude)",
  openai: "OpenAI",
  gemini: "Google Gemini",
  deepseek: "DeepSeek",
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
    try {
      const res = await fetch("/api/providers");
      const data = await readJson(res);
      if (!res.ok) {
        setError(
          (data.error as string) ??
            "No se pudo cargar la lista de proveedores. Intenta recargar la página.",
        );
        setProviders([]);
        return;
      }
      setError(null);
      setProviders((data.providers as ProviderRow[]) ?? []);
    } catch {
      // Sin red, o el servidor no respondió.
      setError("No se pudo contactar al servidor. Revisa tu conexión.");
      setProviders([]);
    } finally {
      // En un finally a propósito: antes un fallo dejaba el "Cargando…" pegado
      // para siempre, sin decir nunca qué había pasado.
      setLoading(false);
    }
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
    const data = await readJson(res);

    setSaving(false);

    if (!res.ok) {
      setError(
        (data.error as string) ?? "Ocurrió un error al guardar la credencial.",
      );
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
    <div className="flex flex-col gap-section">
      <section>
        <h2 className="mb-tight text-2xs font-semibold uppercase tracking-[0.11em] text-text-faint">
          Tus proveedores de IA
        </h2>
        {loading ? (
          <p className="text-sm text-text-faint">Cargando…</p>
        ) : error && providers.length === 0 ? (
          <p className="rounded border border-negative/40 bg-negative/10 px-4 py-3 text-sm text-negative">
            {error}
          </p>
        ) : providers.length === 0 ? (
          <p className="text-sm text-text-faint">
            Todavía no has configurado ningún proveedor.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {providers.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between rounded-lg border border-border bg-surface-raised px-4 py-3 text-sm"
              >
                <div className="flex items-center gap-3">
                  <span className="font-medium text-text">
                    {PROVIDER_LABEL[p.provider]}
                  </span>
                  {p.unreadable ? (
                    <span className="text-xs text-warning">
                      No se puede leer — vuelve a guardarla abajo
                    </span>
                  ) : (
                    <span className="font-mono text-xs text-text-faint">
                      {p.maskedKey}
                    </span>
                  )}
                  {p.isActive && (
                    <span className="rounded-full bg-positive/15 px-2 py-0.5 text-xs font-medium text-positive">
                      Activo
                    </span>
                  )}
                  {p.orchestratorEnabled && (
                    <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent">
                      Orquestador
                    </span>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(p.id)}
                  className="text-xs text-text-faint transition hover:text-negative"
                >
                  Eliminar
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-tight text-2xs font-semibold uppercase tracking-[0.11em] text-text-faint">
          Agregar / actualizar proveedor
        </h2>
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 rounded-lg border border-border bg-surface-raised p-5"
        >
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-text-muted">
              Proveedor
            </label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as Provider)}
              className="rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-text"
            >
              <option value="anthropic">Anthropic (Claude)</option>
              <option value="openai">OpenAI</option>
              <option value="gemini">Google Gemini</option>
              <option value="deepseek">DeepSeek</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-text-muted">
              API key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              required
              className="rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-text"
            />
            <p className="text-xs text-text-faint">
              Se cifra antes de guardarse. Nunca se muestra completa de
              nuevo.
            </p>
          </div>

          <label className="flex items-center gap-2 text-xs text-text-muted">
            <input
              type="checkbox"
              checked={orchestratorEnabled}
              onChange={(e) => setOrchestratorEnabled(e.target.checked)}
              className="rounded border-border-strong bg-surface"
            />
            Modo orquestador (combinar este proveedor con otros para
            verificación cruzada)
          </label>

          {error && <p className="text-xs text-negative">{error}</p>}

          <Button size="md" className="self-start"
            type="submit"
            disabled={saving}
            
          >
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </form>
      </section>
    </div>
  );
}
