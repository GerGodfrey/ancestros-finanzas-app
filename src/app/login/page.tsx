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
    <main className="relative flex min-h-screen items-center overflow-hidden bg-[#12141e] px-6 sm:px-12 lg:px-24">
      <BillsBackground />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#12141e]/70 via-transparent to-[#12141e]/80" />

      <div className="relative z-10 mx-auto w-full max-w-xl">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-x-10 -inset-y-16 -z-10 rounded-[3rem] bg-[#12141e]/55 blur-3xl"
        />
        <h1 className="font-thin leading-[0.85] tracking-[0.02em] text-white">
          <span className="block text-5xl sm:text-6xl md:text-7xl">Tus finanzas</span>
          <span className="block text-5xl sm:text-6xl md:text-7xl">en calma.</span>
        </h1>

        <p className="mt-6 max-w-md text-base leading-[1.6em] tracking-[0.02em] text-zinc-300">
          Tu dashboard financiero personal: historial de movimientos,
          categorías automáticas y un asistente que entiende tus finanzas.
        </p>

        <div className="mt-8 h-[2px] w-full max-w-[420px] bg-white" />

        <div className="mt-6 flex justify-end">
          <button
            onClick={handleGoogleLogin}
            className="flex items-center gap-3 rounded-full bg-white px-5 py-3 text-sm font-semibold text-zinc-900 shadow-lg shadow-black/40 transition hover:bg-zinc-200"
          >
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
