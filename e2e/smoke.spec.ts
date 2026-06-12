import { test, expect } from "@playwright/test";

/**
 * Test de humo: confirma que la app carga y muestra el selector de perfil.
 * No depende de datos en la base, asi que sirve para validar que toda la
 * maquinaria de Playwright + la app local funcionan.
 */
test("la pantalla de inicio muestra el selector de perfil", async ({ page }) => {
  await page.goto("/");

  // Titulo principal de la marca.
  await expect(
    page.getByRole("heading", { name: "Pasión Millonaria" })
  ).toBeVisible();

  // Pregunta del selector de perfil.
  await expect(page.getByText("¿Quién está usando la app?")).toBeVisible();
});
