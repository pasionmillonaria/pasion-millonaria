import { createHmac } from "node:crypto";
import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { getStockTienda, loginAsAdmin, restGet, restPatch, restPost, restRpc } from "./helpers";

const URL_DB = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const HEADERS = { apikey: ANON, Authorization: `Bearer ${ANON}`, Prefer: "return=representation" };
const COOKIE = "pm_admin_session";
const RUTAS = ["eliminar-venta", "editar-movimiento", "eliminar-registro-caja", "corregir-abono", "anular-abono"];

async function catalogo(request: APIRequestContext) {
  const [producto] = await restGet(request, "productos?codigo=eq.DEMO-001&select=id");
  const [talla] = await restGet(request, "tallas?nombre=eq.M&sistema=eq.ropa_adulto&select=id");
  return { producto_id: producto.id, talla_id: talla.id };
}

async function venta(request: APIRequestContext) {
  const [mov] = await restPost(request, "movimientos", {
    ...(await catalogo(request)), ubicacion_id: 1, cantidad: 1, tipo: "salida",
    canal: "venta_tienda", precio_venta: 50000, metodo_pago: "efectivo",
    movimiento_ref: `E2E-SEG-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
  });
  return mov;
}

async function apartadoConAbono(request: APIRequestContext) {
  const [cliente] = await restPost(request, "clientes", { nombre: `Seguridad ${Date.now()}` });
  const [apartado] = await restPost(request, "apartados", {
    cliente_id: cliente.id, ...(await catalogo(request)), precio: 80000, en_tienda: false,
  });
  await restPatch(request, `apartados?id=eq.${apartado.id}`, { grupo_id: apartado.id });
  const [abono] = await restPost(request, "abonos", {
    apartado_id: apartado.id, grupo_id: apartado.id, monto: 10000, metodo_pago: "efectivo",
  });
  const caja = await restRpc(request, "registrar_operacion_caja", {
    p_cliente_operacion_id: `E2E-SEG-${abono.id}`, p_ocurrio_en: new Date().toISOString(),
    p_tipo: "ingreso", p_descripcion: "Abono seguridad", p_valor: 10000, p_metodo_pago: "efectivo",
    p_monto_efectivo: 10000, p_monto_transferencia: 0, p_abono_id: abono.id,
  });
  return { apartado, abono, registroId: caja.data.registro_id as number };
}

async function gastoCaja(request: APIRequestContext) {
  const r = await restRpc(request, "registrar_operacion_caja", {
    p_cliente_operacion_id: `E2E-SEG-R-${Date.now()}-${Math.random()}`,
    p_ocurrio_en: new Date().toISOString(), p_tipo: "gasto", p_descripcion: "Gasto seguridad",
    p_valor: 1000, p_metodo_pago: "efectivo", p_monto_efectivo: 1000, p_monto_transferencia: 0,
  });
  return r.data.registro_id as number;
}

/** POST desde la pagina: envia cookie y Origin reales, como la app. */
async function desdeApp(page: Page, ruta: string, body: unknown) {
  return page.evaluate(async ([r, b]) => {
    const res = await fetch(`/api/${r}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b),
    });
    return { status: res.status, data: await res.json() };
  }, [ruta, body] as const);
}

async function entrarEmpleado(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /Empleados/ }).click();
  await page.waitForURL("**/inicio");
}

/** Navegacion interna: page.goto perderia el perfil, que vive en memoria. */
async function navegar(page: Page, ruta: string) {
  await page.evaluate((r) => (window as any).next.router.push(r), ruta);
  await page.waitForURL(`**${ruta}`);
}

function token(expira: number, secreto = process.env.ADMIN_SESSION_SECRET!) {
  return `${expira}.${createHmac("sha256", secreto).update(String(expira)).digest("base64url")}`;
}

test("sin sesion valida las cinco rutas rechazan y no cambian datos", async ({ request, baseURL }) => {
  test.setTimeout(90_000);
  const mov = await venta(request);
  const { abono, registroId } = await apartadoConAbono(request);
  const gasto = await gastoCaja(request);
  const cuerpos: Record<string, unknown> = {
    "eliminar-venta": { movimientoIds: [mov.id] },
    "editar-movimiento": { canal: "domicilio", metodo_pago: "nequi", items: [{ id: mov.id, precio_venta: 1, descuento: null }] },
    "eliminar-registro-caja": { id: gasto },
    "corregir-abono": { abono_id: abono.id, metodo_pago: "nequi" },
    "anular-abono": { abono_id: abono.id },
  };
  const ahora = Math.floor(Date.now() / 1000);
  const valida = token(ahora + 3600);
  const cookies = [
    undefined, "basura", token(ahora - 1), token(ahora + 3600, "x".repeat(40)),
    `${ahora + 9999}.${valida.split(".")[1]}`,
  ];
  for (const ruta of RUTAS) {
    for (const c of cookies) {
      const res = await request.post(`/api/${ruta}`, {
        data: cuerpos[ruta], headers: c ? { Cookie: `${COOKIE}=${c}` } : {},
      });
      expect(res.status(), `${ruta}, cookie ${cookies.indexOf(c)}`).toBe(401);
    }
    const ajeno = await request.post(`/api/${ruta}`, {
      data: cuerpos[ruta], headers: { Cookie: `${COOKIE}=${valida}`, Origin: "https://ajeno.example" },
    });
    expect(ajeno.status(), ruta).toBe(403);
    // Control: la cookie anterior si era valida (cuerpo vacio => 400, no 401).
    const control = await request.post(`/api/${ruta}`, {
      data: {}, headers: { Cookie: `${COOKIE}=${valida}`, Origin: baseURL! },
    });
    expect(control.status(), ruta).toBe(400);
  }
  expect(await restGet(request, `movimientos?id=eq.${mov.id}&select=canal,precio_venta`))
    .toEqual([{ canal: "venta_tienda", precio_venta: 50000 }]);
  expect(await restGet(request, `abonos?id=eq.${abono.id}&select=metodo_pago`)).toEqual([{ metodo_pago: "efectivo" }]);
  expect(await restGet(request, `registros_caja?id=in.(${gasto},${registroId})&select=id`)).toHaveLength(2);
});

test("el admin edita y anula por las cinco rutas con efecto exacto", async ({ page, request }) => {
  test.setTimeout(90_000);
  await loginAsAdmin(page);
  const stock = await getStockTienda(request, "DEMO-001", "M", "ropa_adulto");
  const mov = await venta(request);
  expect(await getStockTienda(request, "DEMO-001", "M", "ropa_adulto")).toBe(stock - 1);

  expect((await desdeApp(page, "editar-movimiento", {
    canal: "domicilio", metodo_pago: "nequi", items: [{ id: mov.id, precio_venta: 45000, descuento: null }],
  })).status).toBe(200);
  expect(await restGet(request, `movimientos?id=eq.${mov.id}&select=canal,metodo_pago,precio_venta`))
    .toEqual([{ canal: "domicilio", metodo_pago: "nequi", precio_venta: 45000 }]);

  expect((await desdeApp(page, "eliminar-venta", { movimientoIds: [mov.id] })).status).toBe(200);
  expect(await restGet(request, `movimientos?id=eq.${mov.id}`)).toHaveLength(0);
  expect(await getStockTienda(request, "DEMO-001", "M", "ropa_adulto")).toBe(stock);

  const gasto = await gastoCaja(request);
  expect((await desdeApp(page, "eliminar-registro-caja", { id: gasto })).status).toBe(200);
  expect(await restGet(request, `registros_caja?id=eq.${gasto}`)).toHaveLength(0);

  const { abono, registroId } = await apartadoConAbono(request);
  expect((await desdeApp(page, "eliminar-registro-caja", { id: registroId })).status).toBe(409);
  expect((await desdeApp(page, "corregir-abono", { abono_id: abono.id, metodo_pago: "nequi" })).status).toBe(200);
  expect(await restGet(request, `abonos?id=eq.${abono.id}&select=metodo_pago`)).toEqual([{ metodo_pago: "nequi" }]);
  expect(await restGet(request, `registros_caja?id=eq.${registroId}&select=monto_efectivo,monto_transferencia`))
    .toEqual([{ monto_efectivo: 0, monto_transferencia: 10000 }]);
  expect((await desdeApp(page, "anular-abono", { abono_id: abono.id })).status).toBe(200);
  expect(await restGet(request, `abonos?id=eq.${abono.id}`)).toHaveLength(0);
  expect(await restGet(request, `registros_caja?id=eq.${registroId}`)).toHaveLength(0);
});

test("si la sesion vence la pantalla avisa y la venta queda intacta", async ({ page, request }) => {
  test.setTimeout(90_000);
  const mov = await venta(request);
  await loginAsAdmin(page);
  await page.context().clearCookies();
  await navegar(page, `/venta/${mov.movimiento_ref}`);
  await page.getByRole("button", { name: /Editar/ }).first().click();
  await page.getByRole("button", { name: /Guardar/ }).first().click();
  await expect(page.getByText(/sesión de administrador venció/)).toBeVisible();
  expect(await restGet(request, `movimientos?id=eq.${mov.id}&select=precio_venta`)).toEqual([{ precio_venta: 50000 }]);
  // Volver a entrar recupera el permiso.
  await loginAsAdmin(page);
  expect((await desdeApp(page, "eliminar-venta", { movimientoIds: [mov.id] })).status).toBe(200);
});

test("entrar como Empleados tras refrescar cierra la sesion admin", async ({ page }) => {
  await loginAsAdmin(page);
  await page.reload();
  await entrarEmpleado(page);
  expect((await page.context().cookies()).find(c => c.name === COOKIE)).toBeUndefined();
  for (const ruta of RUTAS) expect((await desdeApp(page, ruta, {})).status, ruta).toBe(401);
});

test("Empleados no abre pantallas de escritura y conserva las de consulta", async ({ page, request }) => {
  test.setTimeout(240_000);
  const { apartado } = await apartadoConAbono(request);
  const { producto_id } = await catalogo(request);
  const mov = await venta(request);
  await entrarEmpleado(page);
  const bloqueo = page.getByRole("heading", { name: "Solo administradores" });
  const escritura = [
    "/venta", "/entrada", "/traslado", "/devolucion", "/cambio", "/retiro",
    "/productos", "/productos/nuevo", `/productos/${producto_id}`, "/apartados/nuevo",
  ];
  for (const ruta of escritura) {
    await navegar(page, ruta);
    await expect(bloqueo, ruta).toBeVisible({ timeout: 20_000 });
  }
  const lectura = ["/inventario", "/apartados", "/caja", "/caja/historial", "/reportes", `/venta/${mov.movimiento_ref}`];
  for (const ruta of lectura) {
    await navegar(page, ruta);
    await expect(page.locator("main h1, main h2").first(), ruta).toBeVisible({ timeout: 20_000 });
    await expect(bloqueo, ruta).toHaveCount(0);
  }
  await navegar(page, `/apartados/${apartado.id}`);
  const titulo = page.getByRole("heading", { name: "Canal de entrega" });
  await expect(titulo).toBeVisible({ timeout: 20_000 });
  const canales = titulo.locator("xpath=following-sibling::div[1]").getByRole("button");
  await expect(canales).toHaveCount(3);
  for (const n of [0, 1, 2]) await expect(canales.nth(n)).toBeDisabled();
});

test("el admin abre todas las pantallas de escritura", async ({ page }) => {
  test.setTimeout(180_000);
  await loginAsAdmin(page);
  const rutas = [
    "/venta", "/entrada", "/traslado", "/devolucion", "/cambio", "/retiro",
    "/productos", "/productos/nuevo", "/apartados/nuevo",
  ];
  for (const ruta of rutas) {
    await navegar(page, ruta);
    await expect(page.locator("main h1").first(), ruta).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "Solo administradores" })).toHaveCount(0);
  }
});

test("la clave publica no lee PIN ni modifica usuarios", async ({ request }) => {
  const base = `${URL_DB}/rest/v1/usuarios`;
  for (const q of ["select=pin", "select=*", "pin=eq.1234&select=id", "select=id&order=pin"]) {
    expect((await request.get(`${base}?${q}`, { headers: HEADERS })).ok(), q).toBeFalsy();
  }
  const consulta = "usuarios?select=id,nombre,rol,activo&order=id";
  const antes = await restGet(request, consulta);
  expect(antes.length).toBeGreaterThan(0);
  const fila = `${base}?id=eq.${antes[0].id}`;
  expect((await request.patch(fila, { headers: HEADERS, data: { rol: "admin" } })).ok()).toBeFalsy();
  expect((await request.delete(fila, { headers: HEADERS })).ok()).toBeFalsy();
  expect((await request.post(base, { headers: HEADERS, data: { nombre: "Intruso" } })).ok()).toBeFalsy();
  expect(await restGet(request, consulta)).toEqual(antes);
});

test("las operaciones siguen entrando con y sin usuario asociado", async ({ request }) => {
  const ids = await catalogo(request);
  // Misma consulta que usaba la version que fallo en produccion (fe33749).
  const [usuario] = await restGet(request, "usuarios?select=id&rol=eq.admin&activo=eq.true&order=nombre&limit=1");
  for (const usuario_id of [null, usuario.id]) {
    for (const tipo of ["entrada", "salida", "devolucion"]) {
      const [m] = await restPost(request, "movimientos", {
        ...ids, ubicacion_id: 1, cantidad: 1, tipo, canal: "ajuste", usuario_id,
      });
      expect(m.usuario_id).toBe(usuario_id);
    }
    const [c] = await restPost(request, "clientes", { nombre: `FK ${Date.now()}` });
    const [a] = await restPost(request, "apartados", { cliente_id: c.id, ...ids, precio: 50000, usuario_id });
    expect(a.usuario_id).toBe(usuario_id);
    const [ab] = await restPost(request, "abonos", {
      apartado_id: a.id, grupo_id: a.id, monto: 1000, metodo_pago: "efectivo", registrado_por: usuario_id,
    });
    expect(ab.registrado_por).toBe(usuario_id);
  }
});

// La caja puede haber quedado cerrada por otro spec: estas pruebas no dependen del orden.
test.beforeAll(async ({ request }) => {
  const { data: hoy } = await restRpc(request, "fecha_operativa", {});
  await restPatch(request, `caja_diaria?fecha=eq.${hoy}`, { estado: "abierta" });
});
