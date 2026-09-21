import { test, expect } from "@playwright/test";
import { loginAsAdmin, getStockTienda } from "./helpers";

/**
 * Flujo critico: registrar una venta desde /venta y confirmar que el stock baja.
 *
 * Replica el comportamiento actual: el admin agrega un producto del inventario,
 * confirma el pedido, se inserta el movimiento de salida y el trigger de Postgres
 * descuenta el stock.
 *
 * OJO: este test MUTA datos del laboratorio (descuenta 1 unidad cada vez que corre).
 * Para volver el laboratorio a su estado inicial: `npx supabase db reset`.
 */
test("registrar una venta del inventario descuenta el stock", async ({ page, request }) => {
  // Producto del seed con stock en tienda: DEMO-001 "Buso Millonarios Azul", talla M.
  const stockAntes = await getStockTienda(request, "DEMO-001", "M", "ropa_adulto");
  expect(
    stockAntes,
    "El producto necesita stock en tienda para la prueba. Corre `npx supabase db reset`.",
  ).toBeGreaterThan(0);

  await loginAsAdmin(page);

  // Entrar a Venta desde las acciones rapidas (navegacion in-app: conserva el perfil).
  await page.getByRole("link", { name: /Venta/ }).click();
  await page.waitForURL("**/venta");

  // Buscar y seleccionar el producto.
  await page
    .getByPlaceholder("Buscar producto para el pedido...")
    .fill("azul buso");
  await page.getByRole("button", { name: /Buso Millonarios Azul/ }).click();

  // Seleccionar la talla M (la ubicacion Tienda viene por defecto).
  // El boton de talla es el unico que contiene un texto exactamente "M".
  await page
    .getByRole("button")
    .filter({ has: page.getByText("M", { exact: true }) })
    .click();

  // El precio viene precargado con el precio base; agregar al pedido y confirmar.
  await page.getByRole("button", { name: "Agregar al pedido" }).click();
  await page.getByRole("button", { name: "Confirmar pedido" }).click();

  // Pantalla de exito.
  await expect(
    page.getByRole("heading", { name: "Pedido registrado!" }),
  ).toBeVisible();
  await expect(page.getByText(/1 producto/)).toBeVisible();

  // El stock en tienda bajo exactamente 1 unidad (descontado por el trigger).
  const stockDespues = await getStockTienda(request, "DEMO-001", "M", "ropa_adulto");
  expect(stockDespues).toBe(stockAntes - 1);
});

test("la búsqueda móvil ignora tildes, orden y errores pequeños", async ({ page }) => {
  await loginAsAdmin(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("link", { name: /Venta/ }).click();

  const buscador = page.getByPlaceholder("Buscar producto para el pedido...");
  await buscador.fill("clasica");
  await expect(page.getByRole("button", { name: /Gorra Clásica/ })).toBeVisible();

  await buscador.fill("millonaros azul");
  await expect(page.getByRole("button", { name: /Buso Millonarios Azul/ })).toBeVisible();
  await expect(page.getByLabel("Sin foto para Buso Millonarios Azul")).toBeVisible();
});
