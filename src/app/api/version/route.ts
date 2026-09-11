import { NextResponse } from "next/server";

// Etiqueta de versión de este despliegue. Pública a propósito: el repo es
// público y un SHA no revela nada; a cambio, saber qué corre en sandbox o en
// prod deja de ser inferencia y pasa a ser un curl.
//
// Las dos variables las inyecta ci.yml en el build (NEXT_PUBLIC_ para que Next
// las incruste). En local no existen y se reporta como tal.
export function GET() {
  const sha = process.env.NEXT_PUBLIC_GIT_SHA ?? null;
  return NextResponse.json(
    {
      sha,
      short: sha ? sha.slice(0, 7) : null,
      env: process.env.NEXT_PUBLIC_DEPLOY_ENV ?? "local",
    },
    // Que ni el CDN ni el navegador guarden una respuesta vieja: la gracia
    // es que diga lo que corre AHORA.
    { headers: { "Cache-Control": "no-store" } },
  );
}
