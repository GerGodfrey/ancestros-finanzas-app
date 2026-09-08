"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui";

type Account = {
  id: string;
  issuer: string;
  product_name: string;
  last4: string | null;
};

type Step = "idle" | "uploading" | "parsing" | "done" | "error";

/** "Palacio de Hierro — Platinum ···· 6280". Sin los últimos 4, dos tarjetas
 *  del mismo emisor son indistinguibles en el selector. */
function accountLabel(a: Account): string {
  const base = `${a.issuer} — ${a.product_name}`;
  return a.last4 ? `${base} ···· ${a.last4}` : base;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isPdf(f: File): boolean {
  return f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
}

export function StatementUpload() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [loadError, setLoadError] = useState(false);
  // Arranca vacío a propósito: preseleccionar la primera tarjeta hacía que un
  // PDF se subiera contra una cuenta que nadie eligió.
  const [accountId, setAccountId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [step, setStep] = useState<Step>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  async function loadAccounts() {
    try {
      const res = await fetch("/api/accounts");
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setLoadError(false);
      setAccounts(data.accounts ?? []);
    } catch {
      // Distinguir "no tienes tarjetas" de "no pudimos preguntar" importa: lo
      // primero manda al usuario a crear una, lo segundo sería mentirle.
      setLoadError(true);
      setAccounts([]);
    } finally {
      setLoadingAccounts(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch inicial al montar, patrón intencional (igual que provider-settings)
    loadAccounts();
  }, []);

  function acceptFile(f: File | null) {
    if (!f) return;
    // `accept` solo filtra el diálogo del sistema; un archivo arrastrado se
    // cuela igual, así que la validación tiene que estar aquí.
    if (!isPdf(f)) {
      setFileError(`«${f.name}» no es un PDF. Solo se aceptan estados de cuenta en PDF.`);
      return;
    }
    setFileError(null);
    setFile(f);
  }

  const busy = step === "uploading" || step === "parsing";

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
      // Refresca los paneles server-rendered de la página (pendientes del
      // mes, historial) para que reflejen el statement recién parseado.
      router.refresh();
    } catch (err) {
      setStep("error");
      setMessage(err instanceof Error ? err.message : "Error desconocido");
    }
  }

  if (!loadingAccounts && loadError) {
    return (
      <div className="rounded border border-negative/40 bg-negative/10 p-5 text-sm text-negative">
        No se pudo cargar tu lista de tarjetas. Recarga la página para volver a
        intentarlo.
      </div>
    );
  }

  // Sin tarjetas no hay nada que subir: el formulario no sirve, así que en su
  // lugar va la salida hacia donde sí se puede resolver.
  if (!loadingAccounts && accounts.length === 0) {
    return (
      <div className="flex flex-col items-start gap-block rounded border border-border bg-surface-raised p-5">
        <div>
          <p className="text-sm font-medium text-text">
            Todavía no tienes ninguna tarjeta registrada.
          </p>
          <p className="mt-1 max-w-[62ch] text-sm text-text-muted">
            Necesitas al menos una para saber a qué cuenta pertenece el estado
            que vas a subir.
          </p>
        </div>
        <Link href="/settings#tarjetas">
          <Button size="md">Agregar una tarjeta</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-block rounded border border-border bg-surface-raised p-5">
      <div className="flex flex-col gap-tight">
        <label
          htmlFor="statement-account"
          className="text-2xs font-semibold uppercase tracking-[0.11em] text-text-faint"
        >
          Tarjeta
        </label>
        <select
          id="statement-account"
          value={accountId}
          disabled={loadingAccounts || busy}
          onChange={(e) => setAccountId(e.target.value)}
          className="rounded border border-border-strong bg-surface px-3 py-2 text-sm text-text disabled:opacity-50"
        >
          <option value="" disabled={accountId !== ""}>
            {loadingAccounts ? "Cargando tarjetas…" : "Seleccionar tarjeta…"}
          </option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {accountLabel(a)}
            </option>
          ))}
        </select>

        <p className="flex items-start gap-2 text-xs text-text-faint">
          <span aria-hidden="true" className="leading-[1.45]">
            ⓘ
          </span>
          <span>
            ¿No ves tu tarjeta? Agrégala en{" "}
            <Link
              href="/settings#tarjetas"
              className="text-accent underline underline-offset-2"
            >
              Configuración → Tarjetas
            </Link>
            .
          </span>
        </p>
      </div>

      <div className="flex flex-col gap-tight border-t border-border pt-block">
        <span className="text-2xs font-semibold uppercase tracking-[0.11em] text-text-faint">
          PDF del estado de cuenta
        </span>

        {/*
          El <input> va con `sr-only`, no con `display:none`: escondiéndolo del
          todo se pierde el foco de teclado, y entonces la zona solo funciona
          con ratón. Envuelto en <label>, el área completa queda clicable y
          `Tab` + `Enter` abren el diálogo sin JavaScript de por medio.
        */}
        <label
          onDragOver={(e) => {
            // Sin esto el navegador abre el PDF en una pestaña nueva en vez
            // de entregárnoslo.
            e.preventDefault();
            if (!busy) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (!busy) acceptFile(e.dataTransfer.files?.[0] ?? null);
          }}
          className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded border border-dashed px-6 py-10 text-center transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent ${
            dragging
              ? "border-accent bg-accent/5"
              : "border-border-strong hover:border-accent hover:bg-surface-raised-2"
          } ${busy ? "pointer-events-none opacity-50" : ""}`}
        >
          <input
            type="file"
            accept="application/pdf"
            disabled={busy}
            onChange={(e) => acceptFile(e.target.files?.[0] ?? null)}
            className="sr-only"
          />
          <span className="text-sm font-medium text-text">
            Arrastra aquí el PDF, o haz clic para elegirlo
          </span>
          <span className="text-xs text-text-faint">
            Un archivo PDF por estado de cuenta
          </span>
        </label>

        {file && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-border bg-surface-sunk px-3 py-2">
            <span className="min-w-0 text-sm text-text">
              <span className="break-all font-medium">{file.name}</span>{" "}
              <span className="font-mono text-xs text-text-faint tabular-nums">
                {formatSize(file.size)}
              </span>
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => setFile(null)}
            >
              Quitar
            </Button>
          </div>
        )}

        {fileError && <p className="text-sm text-negative">{fileError}</p>}
      </div>

      <Button
        size="md"
        className="self-start"
        onClick={handleUpload}
        disabled={!file || !accountId || busy}
      >
        {step === "uploading"
          ? "Subiendo…"
          : step === "parsing"
            ? "Leyendo el PDF con IA…"
            : "Subir y procesar"}
      </Button>

      {message && (
        <p
          className={`text-sm ${step === "error" ? "text-negative" : "text-positive"}`}
        >
          {message}
        </p>
      )}
      {warnings.length > 0 && (
        <div className="rounded border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
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
