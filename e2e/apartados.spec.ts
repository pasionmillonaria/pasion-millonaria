import { test, expect } from "@playwright/test";
import { loginAsAdmin, getStockTienda, restGet } from "./helpers";

/**
 * Flujo crítico: crear un apartado.
 *
 * Replica el comportamiento actual: el admin crea un apartado para un cliente
 * nuevo con una prenda marcada "en tienda". Eso inserta una fila en `apartados`
 * y, por estar en tienda, un movimiento salida/ajuste que descuenta el stock
 * (invariante: una fila por unidad; en_tienda=true descuenta inventario).
 */
test("crear un apartado en tienda registra la fila y descuenta el stock", async ({ page, request }) => {
  const clienteNombre = `Cliente Test ${Date.now()}`;

  const stockAntes = await getStockTienda(request, "DEMO-001", "M", "ropa_adulto");
  expect(
    stockAntes,
    "El producto necesita stock en tienda. Corre `npx supabase db reset`.",
  ).toBeGreaterThan(0);

  await loginAsAdmin(page);

  // Ir a Nuevo Apartado desde las acciones rapidas (navegacion in-app).
  await page.getByRole("link", { name: /Cliente aparta/ }).click();
  await page.waitForURL("**/apartados/nuevo");

  // Cliente nuevo (nombre unico => sin sugerencias, se crea al confirmar).
  await page.getByPlaceholder("Nombre del cliente...").fill(clienteNombre);

  // Agregar un producto al carrito.
  await page.getByRole("button", { name: "Agregar", exact: true }).click();
  await page.getByPlaceholder("Filtrar productos...").fill("Buso Millonarios Azul");
  await page.getByRole("button", { name: /Buso Millonarios Azul/ }).click();

  // Talla M (por defecto la prenda queda "en tienda/bodega").
  await page
    .getByRole("button")
    .filter({ has: page.getByText("M", { exact: true }) })
    .click();

  // Añadir al carrito (precio viene precargado).
  await page.getByRole("button", { name: "Añadir" }).click();

  // Crear el apartado sin abono inicial.
  await page.getByRole("button", { name: /Crear Apartado/ }).click();

  // Pantalla de exito.
  await expect(page.getByRole("heading", { name: "¡Apartado creado!" })).toBeVisible();

  // En la base: existe el apartado del cliente, marcado en_tienda.
  const clientes = await restGet(
    request,
    `clientes?nombre=eq.${encodeURIComponent(clienteNombre)}&select=id`,
  );
  expect(clientes.length, "el cliente nuevo debe haberse creado").toBeGreaterThan(0);

  const apartados = await restGet(
    request,
    `apartados?cliente_id=eq.${clientes[0].id}&select=id,en_tienda`,
  );
  expect(apartados.length).toBe(1);
  expect(apartados[0].en_tienda).toBe(true);

  // El stock en tienda bajo 1 (en_tienda=true inserta salida/ajuste).
  const stockDespues = await getStockTienda(request, "DEMO-001", "M", "ropa_adulto");
  expect(stockDespues).toBe(stockAntes - 1);
});
