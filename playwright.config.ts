import { defineConfig, devices } from "@playwright/test";

// Con PLAYWRIGHT_BASE_URL apuntamos los mismos specs a un deploy real
// (los jobs de smoke en CI lo hacen tras cada deploy). Sin ella, todo se
// comporta igual que siempre: Playwright levanta su propio `next dev`.
const remoteBaseURL = process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: remoteBaseURL ?? "http://localhost:3100",
  },
  // Contra un deploy ya publicado no hay nada que levantar localmente.
  webServer: remoteBaseURL
    ? undefined
    : {
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
