"use client";

import { createClient } from "@/lib/supabase/client";
import { BillsBackground } from "@/components/bills-background";

export default function LoginPage() {
  async function handleGoogleLogin() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  }

  return (
    <main className="relative flex min-h-screen items-center overflow-hidden bg-surface px-6 sm:px-12 lg:px-24">
      <BillsBackground />

      {/*
        Antes esto era un halo `rounded-[3rem] blur-3xl` detrás del texto —
        una mancha cuyo único trabajo era despegarlo del fondo. Ahora el
        contraste lo da una máscara direccional sobre el canvas: opaca donde
        vive el texto, transparente donde los billetes tienen que verse.
      */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(72%_128%_at_10%_50%,var(--surface)_0%,var(--surface)_34%,color-mix(in_oklab,var(--surface)_66%,transparent)_58%,transparent_80%)]"
      />

      <div className="relative z-10 mx-auto w-full max-w-xl">
        <h1 className="font-display text-display font-extralight leading-[0.9] tracking-[-0.025em] text-text [font-stretch:112%]">
          <span className="block">Tus finanzas</span>
          <span className="block">en calma.</span>
        </h1>

        <p className="mt-8 max-w-[38ch] text-base leading-relaxed text-text-muted">
          Tu dashboard financiero personal: historial de movimientos,
          categorías automáticas y un asistente que entiende tus finanzas.
        </p>

        <div className="mt-10 h-px w-full max-w-[420px] bg-accent" />

        <div className="mt-6 flex max-w-[420px] justify-end">
          <button
            type="button"
            onClick={handleGoogleLogin}
            className="inline-flex items-center gap-3 rounded bg-text px-5 py-3 text-xs font-semibold uppercase tracking-[0.06em] text-surface transition-colors hover:bg-text-muted"
          >
            {/* El logo de Google es contenido de marca ajena: no cambia con el tema. */}
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.56 2.7-3.87 2.7-6.62z"
              />
              <path
                fill="#34A853"
                d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.95v2.33A9 9 0 0 0 9 18z"
              />
              <path
                fill="#FBBC05"
                d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.95A9 9 0 0 0 0 9c0 1.45.35 2.83.95 4.03z"
              />
              <path
                fill="#EA4335"
                d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .95 4.97L3.95 7.3C4.66 5.17 6.65 3.58 9 3.58z"
              />
            </svg>
            Continuar con Google
          </button>
        </div>
      </div>
    </main>
  );
}
