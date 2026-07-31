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
