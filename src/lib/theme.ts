// Tema Papel (día) / Plano (noche). Los valores viven en globals.css; aquí
// solo está la elección del usuario y cómo se propaga.
//
// Hay TRES estados, no dos: "papel", "plano", y `null` — que significa
// "sigue al sistema" y es el default. Un switch binario a secas obligaría a
// elegir desde el primer día; con null, quien nunca toca el interruptor
// hereda su preferencia del sistema operativo.

export type Theme = "papel" | "plano";
export type ThemeChoice = Theme | null;

export const THEME_STORAGE_KEY = "finanzas:theme";
export const THEME_CHANGE_EVENT = "themechange";

/**
 * Lo que el usuario eligió, o `null` si nunca eligió.
 * Devuelve `null` también si localStorage no está disponible (modo privado,
 * cookies bloqueadas): seguir al sistema es la degradación correcta.
 */
export function getStoredTheme(): ThemeChoice {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return raw === "papel" || raw === "plano" ? raw : null;
  } catch {
    return null;
  }
}

/** El tema del sistema operativo. */
export function getSystemTheme(): Theme {
  if (typeof window === "undefined") return "papel";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "plano"
    : "papel";
}

/** El tema que se está viendo de verdad: la elección, o el del sistema. */
export function resolveTheme(): Theme {
  return getStoredTheme() ?? getSystemTheme();
}

/**
 * Aplica un tema. `null` borra la elección y vuelve a seguir al sistema.
 *
 * Emite `themechange` en `window` con el tema resuelto. Eso es lo que
 * necesita el fondo 3D de /login: su escena de three.js se construye una
 * sola vez en un `useEffect` y no se enteraría del cambio de otro modo.
 */
export function setTheme(choice: ThemeChoice): void {
  if (typeof window === "undefined") return;

  try {
    if (choice === null) {
      window.localStorage.removeItem(THEME_STORAGE_KEY);
    } else {
      window.localStorage.setItem(THEME_STORAGE_KEY, choice);
    }
  } catch {
    // Sin persistencia el tema dura la sesión. Preferible a romper el clic.
  }

  applyThemeAttribute(choice);

  window.dispatchEvent(
    new CustomEvent<Theme>(THEME_CHANGE_EVENT, { detail: resolveTheme() }),
  );
}

/**
 * Estampa (o quita) `data-theme` en <html>. Sin atributo, manda el
 * `prefers-color-scheme` de globals.css — que es el estado por defecto.
 */
export function applyThemeAttribute(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === null) {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", choice);
  }
}

/**
 * Script que corre ANTES del primer pintado, inyectado en el layout raíz.
 *
 * Sin esto, quien eligió Papel en una máquina con el sistema en oscuro ve un
 * destello negro en cada carga: el CSS aplica Plano hasta que React hidrata
 * y estampa el atributo. Es la única razón por la que existe un script
 * inline en esta app.
 *
 * Va en una sola línea, sin dependencias, y falla en silencio.
 */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='papel'||t==='plano')document.documentElement.setAttribute('data-theme',t)}catch(e){}`;
