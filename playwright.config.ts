import { defineConfig, devices } from "@playwright/test";

// Smoke tests E2E que corren SIN credenciales reales de Supabase — usan una
// URL/anon key dummy. Nuestros helpers de sesión (get-user.ts, proxy.ts)
// están hechos para fallar cerrado (tratar cualquier error como "no
// autenticado"), así que estos tests validan el comportamiento de
// redirects/UI sin depender de servicios externos.
//
// Pruebas con sesión real (login con Google, subida y parseo de un PDF real)
// requieren un proyecto Supabase de prueba + credenciales reales y se
// documentan aparte (ver README) hasta que estén conectadas.

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3100",
  },
  webServer: {
    command: "npm run dev -- -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "https://example-test.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
      ENCRYPTION_KEY: "H0/tHg/89mQyZIZqNSpBpHpu3sDn/7MsC/cBmbaS880=",
      NEXT_E2E: "1",
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
