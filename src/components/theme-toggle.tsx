"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  THEME_CHANGE_EVENT,
  getStoredTheme,
  resolveTheme,
  setTheme,
  type Theme,
  type ThemeChoice,
} from "@/lib/theme";

// El tema es estado externo: vive en localStorage, en el sistema operativo y
// en un atributo del <html>. useSyncExternalStore es la forma de leerlo sin
// setState dentro de un efecto, y de paso mantiene el interruptor al día si
// el tema cambia desde otra pestaña o desde el sistema.

function subscribe(onChange: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", onChange);
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    mq.removeEventListener("change", onChange);
    window.removeEventListener(THEME_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

// Snapshot como string: useSyncExternalStore compara por identidad, así que
// devolver un objeto nuevo en cada lectura provocaría un bucle de renders.
const getSnapshot = () => `${getStoredTheme() ?? ""}|${resolveTheme()}`;

// El servidor no puede saber el tema de quien pide la página. Se resuelve al
// hidratar; es un control de Configuración, no algo que se vea al entrar.
const getServerSnapshot = () => "|";

/**
 * Interruptor Día/Noche.
 *
 * Dos piezas a propósito: el switch refleja el tema que estás viendo, y el
 * enlace de al lado borra la elección. Un switch binario a secas obligaría a
 * elegir desde el primer día; así, quien nunca lo toca sigue a su sistema, y
 * en cuanto lo mueve la elección se vuelve explícita y persiste.
 */
export function ThemeToggle() {
  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const [storedRaw, activeRaw] = snapshot.split("|");
  const choice = (storedRaw || null) as ThemeChoice;
  const hydrated = activeRaw !== "";
  const active = (activeRaw || "plano") as Theme;
  const isNight = active === "plano";

  const choose = useCallback((next: ThemeChoice) => setTheme(next), []);

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className={`text-sm ${isNight ? "text-text-faint" : "text-text"}`}
        >
          ☀ Día
        </span>

        <button
          type="button"
          role="switch"
          aria-checked={isNight}
          aria-label="Tema oscuro"
          disabled={!hydrated}
          onClick={() => choose(isNight ? "papel" : "plano")}
          className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors disabled:opacity-50 ${
            isNight
              ? "border-accent bg-accent"
              : "border-border-strong bg-surface-raised-2"
          }`}
        >
          <span
            aria-hidden="true"
            className={`absolute top-0.5 h-4 w-4 rounded-full transition-[left] duration-150 ${
              isNight ? "left-[22px] bg-accent-ink" : "left-0.5 bg-text-muted"
            }`}
          />
        </button>

        <span
          aria-hidden="true"
          className={`text-sm ${isNight ? "text-text" : "text-text-faint"}`}
        >
          ☾ Noche
        </span>
      </div>

      {hydrated &&
        (choice === null ? (
          <span className="text-xs text-text-faint">Siguiendo a tu sistema</span>
        ) : (
          <button
            type="button"
            onClick={() => choose(null)}
            className="text-xs text-text-faint underline underline-offset-4 transition-colors hover:text-text-muted"
          >
            Seguir al sistema
          </button>
        ))}
    </div>
  );
}
