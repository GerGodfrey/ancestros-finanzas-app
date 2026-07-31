import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El Skill de parseo (skills/pdf-statement-parser/*.md,*.json) se lee con
  // fs en tiempo de ejecución, no con import — hay que declararlo para que
  // Vercel lo incluya en el bundle de la función serverless.
  outputFileTracingIncludes: {
    "/api/statements/[id]/parse": ["./skills/**"],
  },
};

export default nextConfig;
