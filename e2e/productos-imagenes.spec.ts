import { test, expect } from "@playwright/test";
import sharp from "sharp";
import { loginAsAdmin, restGet } from "./helpers";

async function imagenWebp(color: string, ancho = 1400, alto = 1000) {
  return sharp({
    create: { width: ancho, height: alto, channels: 3, background: color },
  }).webp({ quality: 92 }).toBuffer();
}

test.describe.serial("imagenes optimizadas de productos", () => {
  test("protege las escrituras y rechaza archivos invalidos", async ({ page, request }) => {
    const productos = await restGet(request, "productos?codigo=eq.DEMO-001&select=id");
    const productoId = productos[0].id;

    const sinSesion = await page.request.post(`/api/productos/${productoId}/imagen`, {
      multipart: { imagen: { name: "foto.webp", mimeType: "image/webp", buffer: await imagenWebp("#1c3a8c") } },
    });
    expect(sinSesion.status()).toBe(401);

    await loginAsAdmin(page);
    const formato = await page.request.post(`/api/productos/${productoId}/imagen`, {
      multipart: { imagen: { name: "foto.png", mimeType: "image/png", buffer: Buffer.from("no es una imagen") } },
    });
    expect(formato.status()).toBe(400);

    const contenidoInvalido = await page.request.post(`/api/productos/${productoId}/imagen`, {
      multipart: { imagen: { name: "foto.webp", mimeType: "image/webp", buffer: Buffer.from("webp invalido") } },
    });
    expect(contenidoInvalido.status()).toBe(400);

    const demasiadoGrande = await page.request.post(`/api/productos/${productoId}/imagen`, {
      multipart: { imagen: { name: "foto.webp", mimeType: "image/webp", buffer: Buffer.alloc(1024 * 1024 + 1) } },
    });
    expect(demasiadoGrande.status()).toBe(413);
  });

  test("crea dos WebP, reemplaza la version y elimina la anterior", async ({ page, request }) => {
    const productos = await restGet(request, "productos?codigo=eq.DEMO-001&select=id");
    const productoId = productos[0].id;
    await loginAsAdmin(page);

    const primera = await page.request.post(`/api/productos/${productoId}/imagen`, {
      multipart: { imagen: { name: "azul.webp", mimeType: "image/webp", buffer: await imagenWebp("#1c3a8c") } },
    });
    expect(primera.ok(), await primera.text()).toBeTruthy();
    const primeraData = await primera.json();
    expect(primeraData.bytes.thumb).toBeLessThanOrEqual(60 * 1024);
    expect(primeraData.bytes.detail).toBeLessThanOrEqual(220 * 1024);
    expect(primeraData.bytes.thumb + primeraData.bytes.detail).toBeLessThanOrEqual(280 * 1024);

    const thumbResponse = await request.get(primeraData.thumbUrl);
    const detailResponse = await request.get(primeraData.detailUrl);
    expect(thumbResponse.ok()).toBeTruthy();
    expect(detailResponse.ok()).toBeTruthy();
    const thumbMeta = await sharp(await thumbResponse.body()).metadata();
    const detailMeta = await sharp(await detailResponse.body()).metadata();
    expect({ width: thumbMeta.width, height: thumbMeta.height, format: thumbMeta.format }).toEqual({ width: 256, height: 256, format: "webp" });
    expect({ width: detailMeta.width, height: detailMeta.height, format: detailMeta.format }).toEqual({ width: 800, height: 800, format: "webp" });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("link", { name: "Productos", exact: true }).click();
    await expect(page.getByRole("img", { name: "Buso Millonarios Azul" })).toBeVisible();
    await page.getByRole("link", { name: "Inventario", exact: true }).click();
    await expect(page.getByRole("img", { name: "Buso Millonarios Azul" })).toBeVisible();

    const segunda = await page.request.post(`/api/productos/${productoId}/imagen`, {
      multipart: { imagen: { name: "verde.webp", mimeType: "image/webp", buffer: await imagenWebp("#15a34a", 1000, 1400) } },
    });
    expect(segunda.ok(), await segunda.text()).toBeTruthy();
    const segundaData = await segunda.json();
    expect(segundaData.imagenPath).not.toBe(primeraData.imagenPath);
    expect((await request.get(primeraData.thumbUrl)).ok()).toBeFalsy();
    expect((await request.get(primeraData.detailUrl)).ok()).toBeFalsy();

    const eliminar = await page.request.delete(`/api/productos/${productoId}/imagen`);
    expect(eliminar.ok(), await eliminar.text()).toBeTruthy();
    const guardado = await restGet(request, `productos?id=eq.${productoId}&select=imagen_path`);
    expect(guardado[0].imagen_path).toBeNull();
    expect((await request.get(segundaData.thumbUrl)).ok()).toBeFalsy();
    expect((await request.get(segundaData.detailUrl)).ok()).toBeFalsy();
  });

  test("prepara una foto JPG desde el formulario sin subir el original", async ({ page }) => {
    await loginAsAdmin(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("link", { name: "Productos", exact: true }).click();
    await page.getByRole("link", { name: "Nuevo", exact: true }).click();
    const jpg = await sharp({
      create: { width: 2400, height: 1600, channels: 3, background: "#d4af37" },
    }).jpeg({ quality: 96 }).toBuffer();
    await page.getByTestId("input-galeria-producto").setInputFiles({
      name: "producto-grande.jpg",
      mimeType: "image/jpeg",
      buffer: jpg,
    });
    await expect(page.getByTestId("selector-imagen-producto").getByText(/KB$/)).toBeVisible();
    await expect(page.getByAltText("Vista previa de producto", { exact: false })).toBeVisible();
  });
});
