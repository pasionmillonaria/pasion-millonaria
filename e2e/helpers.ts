import { type Page, type APIRequestContext, expect } from "@playwright/test";

/**
 * Helpers reutilizables para los tests E2E.
 * Corren contra el LABORATORIO LOCAL (Docker). Las credenciales salen de
 * .env.local (cargado en playwright.config.ts); si faltan, usa los valores
 * estandar del stack local de Supabase.
 */

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:55321";
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

/**
 * Inicia sesion como Admin: elige el perfil Admin y teclea el PIN.
 * El PIN del seed local es 1234 (override por env si cambia).
 * Deja la app en /inicio.
 */
export async function loginAsAdmin(page: Page, pin = process.env.ADMIN_PIN ?? "1234") {
  await page.goto("/");
  await page.getByRole("button", { name: /Admin/ }).click();
  for (const digito of pin.split("")) {
    await page.getByRole("button", { name: digito, exact: true }).click();
  }
  await page.waitForURL("**/inicio");
}

/** GET contra PostgREST del laboratorio local con la anon key. */
async function restGet(request: APIRequestContext, path: string) {
  const res = await request.get(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  expect(res.ok(), `REST GET ${path} -> ${res.status()}`).toBeTruthy();
  return res.json();
}

/**
 * Lee el stock en TIENDA de un producto+talla desde la vista v_stock_total.
 * Sirve para verificar que una venta descuenta inventario.
 */
export async function getStockTienda(
  request: APIRequestContext,
  codigo: string,
  tallaNombre: string,
  sistema: string,
): Promise<number> {
  const productos = await restGet(request, `productos?codigo=eq.${codigo}&select=id`);
  expect(productos.length, `producto ${codigo} no encontrado en el seed`).toBeGreaterThan(0);
  const productoId = productos[0].id;

  const tallas = await restGet(
    request,
    `tallas?nombre=eq.${encodeURIComponent(tallaNombre)}&sistema=eq.${sistema}&select=id`,
  );
  expect(tallas.length, `talla ${tallaNombre} (${sistema}) no encontrada`).toBeGreaterThan(0);
  const tallaId = tallas[0].id;

  const stock = await restGet(
    request,
    `v_stock_total?producto_id=eq.${productoId}&talla_id=eq.${tallaId}&select=stock_tienda`,
  );
  return Number(stock[0]?.stock_tienda ?? 0);
}
