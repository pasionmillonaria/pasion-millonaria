import { test, expect } from "@playwright/test";
import { getStockTienda, loginAsAdmin, restGet, restPatch, restRpc } from "./helpers";

async function catalogo(request: Parameters<typeof restGet>[0]) {
  const productos = await restGet(request, "productos?codigo=in.(DEMO-001,DEMO-002,DEMO-005,LIBRE)&select=id,codigo");
  const tallas = await restGet(request, "tallas?select=id,nombre,sistema");
  const idProducto = (codigo: string) => productos.find((p: any) => p.codigo === codigo).id;
  const idTalla = (nombre: string, sistema: string) => tallas.find((t: any) => t.nombre === nombre && t.sistema === sistema).id;
  return { idProducto, idTalla };
}

function payload(ref: string, entrada: any[], salida: any[], metodo = "efectivo") {
  return { p_entradas: entrada, p_salidas: salida, p_metodo_pago: metodo, p_referencia: ref };
}

test("la pantalla permite agregar varias prendas y no muestra Pedir al devolver", async ({ page }) => {
  await loginAsAdmin(page);
  await page.getByRole("link", { name: /Cambio de producto/ }).click();
  await page.waitForURL("**/cambio");
  await page.getByPlaceholder("Buscar producto devuelto...").fill("DEMO-001");
  await page.getByRole("button", { name: /Buso Millonarios Azul/ }).click();
  await expect(page.getByText("pedir", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "M", exact: true }).click();
  await page.getByRole("button", { name: "Agregar prenda" }).click();
  await page.getByRole("button", { name: "Agregar" }).first().click();
  await expect(page.getByPlaceholder("Buscar producto devuelto...")).toBeVisible();
});

test("RPC registra varias lineas, venta y resumen en Inicio", async ({ request, page }) => {
  const { idProducto, idTalla } = await catalogo(request);
  const ref = `E2E-CAMBIO-POS-${Date.now()}`;
  const stockAntes = await getStockTienda(request, "DEMO-001", "M", "ropa_adulto");
  const resultado = await restRpc(request, "registrar_cambio", payload(ref,
    [
      { producto_id: idProducto("DEMO-002"), talla_id: idTalla("S", "ropa_adulto"), cantidad: 2, precio_unitario: 30000 },
      { producto_id: idProducto("DEMO-005"), talla_id: idTalla("Única", "unica"), cantidad: 1, precio_unitario: 20000 },
    ],
    [
      { producto_id: idProducto("DEMO-001"), talla_id: idTalla("M", "ropa_adulto"), ubicacion_id: 1, cantidad: 2, precio_unitario: 50000 },
      { producto_id: idProducto("LIBRE"), talla_id: idTalla("M", "ropa_adulto"), ubicacion_id: 1, cantidad: 1, precio_unitario: 10000, descripcion: "Accesorio especial" },
    ], "transferencia"));
  expect(Number(resultado.data.diferencia)).toBe(30000);
  expect(await getStockTienda(request, "DEMO-001", "M", "ropa_adulto")).toBe(stockAntes - 2);
  const movimientos = await restGet(request, `movimientos?movimiento_ref=eq.${ref}&select=tipo,cantidad,nota`);
  expect(movimientos).toHaveLength(4);
  expect(movimientos.find((m: any) => m.nota === "Accesorio especial")).toBeTruthy();
  const caja = await restGet(request, `registros_caja?descripcion=like.*${ref}*&select=tipo,valor,metodo_pago,monto_transferencia`);
  expect(caja).toMatchObject([{ tipo: "venta", valor: 30000, metodo_pago: "transferencia", monto_transferencia: 30000 }]);
  await loginAsAdmin(page);
  await expect(page.getByRole("heading", { name: "Cambios de hoy" })).toBeVisible();
  await expect(page.getByText(ref)).toBeVisible();
  await expect(page.getByText("Accesorio especial", { exact: false })).toBeVisible();
  await page.getByRole("link", { name: "Caja", exact: true }).first().click();
  await page.waitForURL("**/caja");
  await expect(page.getByText(`Diferencia por cambio ${ref}`)).toBeVisible();
  await expect(page.getByText("Transferencias", { exact: true })).toBeVisible();
});

test("registra reembolso, omite caja en diferencia cero y bloquea sin caja", async ({ request }) => {
  const { idProducto, idTalla } = await catalogo(request);
  const baseEntrada = [{ producto_id: idProducto("DEMO-001"), talla_id: idTalla("M", "ropa_adulto"), cantidad: 1, precio_unitario: 90000 }];
  const baseSalida = [{ producto_id: idProducto("DEMO-002"), talla_id: idTalla("S", "ropa_adulto"), ubicacion_id: 1, cantidad: 1, precio_unitario: 60000 }];
  const refNeg = `E2E-CAMBIO-NEG-${Date.now()}`;
  await restRpc(request, "registrar_cambio", payload(refNeg, baseEntrada, baseSalida));
  expect(await restGet(request, `registros_caja?descripcion=like.*${refNeg}*&select=tipo,valor,monto_efectivo`)).toMatchObject([{ tipo: "gasto", valor: 30000, monto_efectivo: 30000 }]);

  const refCero = `E2E-CAMBIO-CERO-${Date.now()}`;
  await restRpc(request, "registrar_cambio", payload(refCero, [{ ...baseEntrada[0], precio_unitario: 60000 }], baseSalida));
  expect(await restGet(request, `registros_caja?descripcion=like.*${refCero}*&select=id`)).toHaveLength(0);

  const fechaActual = (await restRpc(request, "fecha_operativa", {})).data;
  const cajas = await restGet(request, `caja_diaria?fecha=eq.${fechaActual}&estado=eq.abierta&select=id`);
  await restPatch(request, `caja_diaria?id=eq.${cajas[0].id}`, { estado: "cerrada" });
  const movimientosAntes = await restGet(request, "movimientos?select=id");
  const fallido = await restRpc(request, "registrar_cambio", payload(`E2E-CAMBIO-SIN-CAJA-${Date.now()}`, baseEntrada, baseSalida), false);
  expect(fallido.ok).toBeFalsy();
  expect((await restGet(request, "movimientos?select=id")).length).toBe(movimientosAntes.length);
  await restPatch(request, `caja_diaria?id=eq.${cajas[0].id}`, { estado: "abierta" });
});

test("stock insuficiente revierte toda la operación", async ({ request }) => {
  const { idProducto, idTalla } = await catalogo(request);
  const ref = `E2E-CAMBIO-STOCK-${Date.now()}`;
  const fallido = await restRpc(request, "registrar_cambio", payload(ref,
    [{ producto_id: idProducto("DEMO-005"), talla_id: idTalla("Única", "unica"), cantidad: 1, precio_unitario: 35000 }],
    [{ producto_id: idProducto("DEMO-001"), talla_id: idTalla("M", "ropa_adulto"), ubicacion_id: 1, cantidad: 999, precio_unitario: 1 }]), false);
  expect(fallido.ok).toBeFalsy();
  expect(await restGet(request, `movimientos?movimiento_ref=eq.${ref}&select=id`)).toHaveLength(0);
});
