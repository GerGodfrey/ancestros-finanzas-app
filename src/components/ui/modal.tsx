"use client";

import { useEffect, type ReactNode } from "react";

/**
 * Diálogo modal. Vivía dentro de `dashboard-tabs.tsx`; se promovió aquí al
 * necesitarlo también la guía de API keys en Configuración.
 */
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded border border-border bg-surface-raised p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-sm font-semibold text-text">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-text-faint hover:text-text"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
