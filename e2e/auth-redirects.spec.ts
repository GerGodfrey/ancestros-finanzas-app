import { expect, test } from "@playwright/test";

test.describe("Redirects de autenticación (sin sesión)", () => {
  test("la raíz redirige a /login", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("/dashboard redirige a /login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("/settings redirige a /login", async ({ page }) => {
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("/dashboard/upload redirige a /login", async ({ page }) => {
    await page.goto("/dashboard/upload");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("/login muestra el botón de continuar con Google", async ({
    page,
  }) => {
    await page.goto("/login");
    await expect(
      page.getByRole("button", { name: /continuar con google/i }),
    ).toBeVisible();
  });

  test("las rutas de API protegidas devuelven 401 sin sesión", async ({
    request,
  }) => {
    const res = await request.get("/api/accounts");
    expect(res.status()).toBe(401);
  });
});

test.describe("Cerrar sesión", () => {
  // El header envía un <form method="post"> a /auth/signout. Con el 307 que
  // `NextResponse.redirect` usa por defecto, el navegador preservaba el método
  // y repetía el POST contra /login —que es una página, no un route handler—:
  // Vercel respondía 405 y salía "This page isn't working" justo después de
  // cerrar sesión. Llegó a producción porque estos e2e solo cubrían los
  // redirects de entrada, nunca el de salida.
  //
  // Se afirma sobre el status y no sobre la pantalla final a propósito. El
  // síntoma visible no se puede reproducir aquí: estos tests corren contra
  // `next dev`, que ante un POST a una página la renderiza igual en vez de
  // devolver 405. Un test sobre la pantalla pasaría con y sin el bug, que es
  // peor que no tenerlo. El status sí distingue, y es la causa exacta.
  test("responde 303 para que el navegador vaya a /login con GET", async ({
    request,
  }) => {
    const res = await request.post("/auth/signout", { maxRedirects: 0 });

    expect(res.status()).toBe(303);
    expect(res.headers()["location"]).toMatch(/\/login$/);
  });
});

test.describe("/api/version", () => {
  // Es la etiqueta que dice qué commit corre en cada ambiente. Pública a
  // propósito y sin caché: la gracia es que diga lo que corre AHORA.
  //
  // OJO: este archivo corre dos veces con la misma spec — contra `next dev`
  // en el job de e2e, y contra el sandbox/prod desplegado como smoke test
  // (PLAYWRIGHT_BASE_URL). Un test que afirme valores solo ciertos en local
  // rompe el pipeline en el smoke; ya pasó. Aquí se afirma el contrato que
  // vale en los dos, y lo que cambia entre ellos se afirma por separado.
  const deployed = Boolean(process.env.PLAYWRIGHT_BASE_URL);

  test("responde sin sesión, sin caché, y con un SHA coherente", async ({
    request,
  }) => {
    const res = await request.get("/api/version");
    expect(res.status()).toBe(200);
    expect(res.headers()["cache-control"]).toContain("no-store");

    const body = await res.json();
    expect(["local", "sandbox", "prod"]).toContain(body.env);

    if (body.sha === null) {
      expect(body.short).toBeNull();
    } else {
      expect(body.sha).toMatch(/^[0-9a-f]{40}$/);
      expect(body.short).toBe(body.sha.slice(0, 7));
    }
  });

  test(
    deployed
      ? "en un ambiente desplegado trae el SHA: si falta, el CI no inyectó las variables"
      : "en local reporta env=local sin SHA",
    async ({ request }) => {
      const body = await (await request.get("/api/version")).json();
      if (deployed) {
        expect(body.env).not.toBe("local");
        expect(body.sha).not.toBeNull();
      } else {
        expect(body).toMatchObject({ env: "local", sha: null, short: null });
      }
    },
  );
});
