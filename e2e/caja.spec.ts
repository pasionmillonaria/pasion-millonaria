import { test, expect } from "@playwright/test";
import { loginAsAdmin, restGet } from "./helpers";

/**
 * Flujo crítico: cerrar la caja del día.
 *
 * El seed deja una caja_diaria ABIERTA para hoy, pero sin registros. El botón
 * "Cerrar Caja" solo aparece cuando hay al menos un registro, así que el test
 * primero registra un gasto y luego cierra la caja.
 *
 * Verifica que el cierre marca la caja_diaria como 'cerrada' en la base.
 */
test("registrar un gasto y cerrar la caja del dia", async ({ page, request }) => {
  const hoy = new Date().toISOString().slice(0, 10);

  // La caja del dia arranca abierta (seed).
  const cajaAntes = await restGet(request, `caja_diaria?fecha=eq.${hoy}&select=estado`);
  expect(cajaAntes[0]?.estado, "El seed debe dejar la caja de hoy abierta").toBe("abierta");

  await loginAsAdmin(page);

  // Ir a Caja desde el menu lateral (navegacion in-app: conserva el perfil).
  // Hay un link en el sidebar y otro en el bottom-nav; el primero es el visible en desktop.
  await page.getByRole("link", { name: "Caja", exact: true }).first().click();
  await page.waitForURL("**/caja");

  // Registrar un gasto (asi habra un registro y aparece el boton de cerrar).
  await page.getByRole("button", { name: "Gasto", exact: true }).click();
  await page
    .getByPlaceholder("Ej: Almuerzo, pago luz, bolsas...")
    .fill("Gasto de prueba E2E");
  await page.getByPlaceholder("0").fill("10000");
  await page.getByRole("button", { name: "Guardar Gasto" }).click();

  // El gasto aparece en la lista de registros.
  await expect(page.getByText("Gasto de prueba E2E")).toBeVisible();

  // Cerrar la caja.
  await page.getByRole("button", { name: "Cerrar Caja" }).click();
  await page.getByRole("button", { name: "Confirmar Cierre" }).click();

  // Tras cerrar, la UI ofrece reabrir (estado cerrado).
  await expect(page.getByRole("button", { name: "Reabrir Caja" })).toBeVisible();

  // En la base, la caja de hoy quedo cerrada.
  const cajaDespues = await restGet(request, `caja_diaria?fecha=eq.${hoy}&select=estado`);
  expect(cajaDespues[0]?.estado).toBe("cerrada");
});
