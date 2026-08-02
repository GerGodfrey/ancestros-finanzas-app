import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El Skill de parseo (skills/pdf-statement-parser/*.md,*.json) se lee con
  // fs en tiempo de ejecución, no con import — hay que declararlo para que
  // Vercel lo incluya en el bundle de la función serverless.
  outputFileTracingIncludes: {
    "/api/statements/[id]/parse": ["./skills/**"],
  },
  // Next solo permite un `next dev` por carpeta de build (comparten el lock
  // en `.next/`), aunque escuchen en puertos distintos. Los E2E de Playwright
  // levantan su propio `next dev -p 3100` (ver playwright.config.ts), así que
  // necesitan un distDir aparte para no chocar con el `npm run dev` normal
  // que uno pueda tener abierto en paralelo.
  distDir: process.env.NEXT_E2E === "1" ? ".next-e2e" : ".next",
};

export default nextConfig;
