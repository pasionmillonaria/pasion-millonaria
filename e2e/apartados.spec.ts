import { test, expect } from "@playwright/test";
import {
  loginAsAdmin,
  getStockTienda,
  restGet,
  restPatch,
  restPost,
} from "./helpers";

async function crearCliente(request: Parameters<typeof restPost>[0], nombre: string) {
  const [cliente] = await restPost(request, "clientes", {
    nombre,
    telefono: "3000000000",
    notas: "Cliente de prueba E2E",
  });
  return cliente;
}

async function datosProducto(
  request: Parameters<typeof restGet>[0],
  codigo: string,
  talla: string,
  sistema = "ropa_adulto",
) {
  const [producto] = await restGet(request, `productos?codigo=eq.${codigo}&select=id`);
  const [tallaRow] = await restGet(
    request,
    `tallas?nombre=eq.${encodeURIComponent(talla)}&sistema=eq.${sistema}&select=id`,
  );
  expect(producto).toBeTruthy();
  expect(tallaRow).toBeTruthy();
  return { productoId: producto.id, tallaId: tallaRow.id };
}

async function crearGrupoBase(
  request: Parameters<typeof restPost>[0],
  clienteId: number,
  productoId: number,
  tallaId: number,
  precio: number,
) {
  const [apartado] = await restPost(request, "apartados", {
    cliente_id: clienteId,
    producto_id: productoId,
    talla_id: tallaId,
    precio,
    estado: "pendiente",
    en_tienda: false,
    canal: "venta_tienda",
  });
  await restPatch(request, `apartados?id=eq.${apartado.id}`, { grupo_id: apartado.id });
  return apartado.id as number;
}

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

test("agrupa prendas equivalentes y conserva la gestion por unidad", async ({ page, request }) => {
  const clienteNombre = `Agrupacion Test ${Date.now()}`;
  const cliente = await crearCliente(request, clienteNombre);
  const buso = await datosProducto(request, "DEMO-001", "M");
  const grupoId = await crearGrupoBase(
    request,
    cliente.id,
    buso.productoId,
    buso.tallaId,
    90000,
  );
  await restPatch(request, `apartados?id=eq.${grupoId}`, { observacion: "Pedido especial" });

  await restPost(request, "apartados", [
    {
      grupo_id: grupoId,
      cliente_id: cliente.id,
      producto_id: buso.productoId,
      talla_id: buso.tallaId,
      precio: 90000,
      estado: "pendiente",
      en_tienda: false,
      canal: "venta_tienda",
    },
    {
      grupo_id: grupoId,
      cliente_id: cliente.id,
      producto_id: buso.productoId,
      talla_id: buso.tallaId,
      precio: 90000,
      estado: "pendiente",
      en_tienda: false,
      canal: "venta_tienda",
    },
  ]);

  await loginAsAdmin(page);
  const enlaceApartado = page.getByRole("link", { name: new RegExp(clienteNombre) }).first();
  await expect(enlaceApartado).toContainText("3× Buso Millonarios Azul · T:M");
  await enlaceApartado.click();
  await page.waitForURL(`**/apartados/${grupoId}`);

  const referenciaAgrupada = page.getByText("Buso Millonarios Azul", { exact: true });
  await expect(referenciaAgrupada).toHaveCount(1);
  const tarjetaAgrupada = referenciaAgrupada.locator("xpath=ancestor::div[contains(@class,'border')][1]");
  await expect(tarjetaAgrupada.getByText("3 unidades × $ 90.000", { exact: true })).toBeVisible();
  await expect(tarjetaAgrupada.getByText("$ 270.000", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Gestionar 3 unidades" }).click();
  await expect(page.getByText(/^Unidad \d$/)).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Editar" })).toHaveCount(3);
});

test("cancelar una prenda descuenta su precio del saldo y permite cerrar el grupo pagado", async ({ page, request }) => {
  const clienteNombre = `Cancelacion Test ${Date.now()}`;
  const cliente = await crearCliente(request, clienteNombre);
  const buso = await datosProducto(request, "DEMO-001", "M");
  const camiseta = await datosProducto(request, "DEMO-002", "S");
  const grupoId = await crearGrupoBase(
    request,
    cliente.id,
    buso.productoId,
    buso.tallaId,
    90000,
  );

  const [prendaCancelable] = await restPost(request, "apartados", {
    grupo_id: grupoId,
    cliente_id: cliente.id,
    producto_id: camiseta.productoId,
    talla_id: camiseta.tallaId,
    precio: 60000,
    estado: "pendiente",
    en_tienda: true,
    canal: "venta_tienda",
  });

  const stockAntesReserva = await getStockTienda(request, "DEMO-002", "S", "ropa_adulto");
  await restPost(request, "movimientos", {
    producto_id: camiseta.productoId,
    talla_id: camiseta.tallaId,
    ubicacion_id: 1,
    cantidad: 1,
    tipo: "salida",
    canal: "ajuste",
    nota: "Reserva para prueba de cancelacion parcial",
  });
  expect(await getStockTienda(request, "DEMO-002", "S", "ropa_adulto")).toBe(stockAntesReserva - 1);

  await restPost(request, "abonos", {
    apartado_id: grupoId,
    grupo_id: grupoId,
    monto: 100000,
    metodo_pago: "efectivo",
  });

  await loginAsAdmin(page);
  await page.getByRole("link", { name: new RegExp(clienteNombre) }).first().click();
  await page.waitForURL(`**/apartados/${grupoId}`);

  page.once("dialog", dialog => dialog.accept());
  const tarjetaCancelable = page
    .getByText("Camiseta Retro Verde", { exact: true })
    .locator("xpath=ancestor::div[contains(@class,'border')][1]");
  await tarjetaCancelable.getByRole("button", { name: "Quitar" }).click();
  await expect(page.getByText(/quitada del pedido/)).toBeVisible();

  const cancelada = await restGet(
    request,
    `apartados?id=eq.${prendaCancelable.id}&select=estado`,
  );
  expect(cancelada[0].estado).toBe("cancelado");
  expect(await getStockTienda(request, "DEMO-002", "S", "ropa_adulto")).toBe(stockAntesReserva);

  await expect(page.getByText("Saldo pendiente", { exact: true }).locator("..")).toContainText("0");
  await expect(page.getByText("Precio total", { exact: true }).locator("..")).toContainText("90.000");
  await expect(page.getByText("Saldo a favor del cliente", { exact: true }).locator("..")).toContainText("10.000");

  await page.getByRole("button", { name: "Marcar como Entregado" }).click();
  await expect(page.getByText("Entregado", { exact: true }).first()).toBeVisible();

  const estados = await restGet(
    request,
    `apartados?grupo_id=eq.${grupoId}&select=estado&order=id.asc`,
  );
  expect(estados.map((item: { estado: string }) => item.estado)).toEqual([
    "entregado",
    "cancelado",
  ]);
});

test("editar el precio de una prenda actualiza el total y el saldo del apartado", async ({ page, request }) => {
  const clienteNombre = `Precio Test ${Date.now()}`;
  const cliente = await crearCliente(request, clienteNombre);
  const buso = await datosProducto(request, "DEMO-001", "M");
  const grupoId = await crearGrupoBase(
    request,
    cliente.id,
    buso.productoId,
    buso.tallaId,
    90000,
  );

  await loginAsAdmin(page);
  await page.getByRole("link", { name: new RegExp(clienteNombre) }).first().click();
  await page.waitForURL(`**/apartados/${grupoId}`);

  await page.getByRole("button", { name: "Editar" }).click();
  const precio = page.getByLabel("Precio unitario");
  await precio.fill("75000");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByText("Prenda actualizada")).toBeVisible();

  const [apartado] = await restGet(
    request,
    `apartados?id=eq.${grupoId}&select=precio`,
  );
  expect(Number(apartado.precio)).toBe(75000);
  await expect(page.getByText("Precio total", { exact: true }).locator("..")).toContainText("75.000");
  await expect(page.getByText("Saldo pendiente", { exact: true }).locator("..")).toContainText("75.000");
});
