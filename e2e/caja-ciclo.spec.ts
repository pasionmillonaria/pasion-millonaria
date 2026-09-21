import { test, expect } from "@playwright/test";
import { restGet, restRpc } from "./helpers";

test("el corte de las 23:00 usa la fecha operativa de Bogotá", async ({ request }) => {
  const antes = await restRpc(request, "fecha_operativa", {
    p_instante: "2026-09-20T03:59:59Z",
  });
  const despues = await restRpc(request, "fecha_operativa", {
    p_instante: "2026-09-21T04:00:00Z",
  });
  expect(antes.data).toBe("2026-09-19");
  expect(despues.data).toBe("2026-09-21");
});

test("la primera operación abre caja, reintentar no duplica y el cierre es automático", async ({ request }) => {
  const operacionId = `E2E-CAJA-${Date.now()}`;
  const payload = {
    p_cliente_operacion_id: operacionId,
    p_ocurrio_en: "2026-09-10T20:00:00Z",
    p_tipo: "ingreso",
    p_descripcion: "Ingreso de prueba",
    p_valor: 15000,
    p_metodo_pago: "efectivo",
    p_monto_efectivo: 15000,
    p_monto_transferencia: 0,
  };

  const primero = await restRpc(request, "registrar_operacion_caja", payload);
  const repetido = await restRpc(request, "registrar_operacion_caja", payload);
  expect(primero.data.duplicado).toBe(false);
  expect(repetido.data.duplicado).toBe(true);
  expect(repetido.data.registro_id).toBe(primero.data.registro_id);

  expect(await restGet(request, `registros_caja?cliente_operacion_id=eq.${operacionId}&select=id`)).toHaveLength(1);

  const cierre = await restRpc(request, "cerrar_cajas_vencidas", {
    p_ahora: "2026-09-11T04:00:01Z",
  });
  expect(Number(cierre.data)).toBeGreaterThanOrEqual(1);
  const cajas = await restGet(request, "caja_diaria?fecha=eq.2026-09-10&select=estado,efectivo_contado,diferencia_caja,cerrada_automaticamente");
  expect(cajas).toMatchObject([{
    estado: "cerrada",
    efectivo_contado: 15000,
    diferencia_caja: 0,
    cerrada_automaticamente: true,
  }]);
});

test("una operación offline conserva su día original aunque sincronice después", async ({ request }) => {
  const operacionId = `E2E-OFFLINE-${Date.now()}`;
  await restRpc(request, "registrar_operacion_caja", {
    p_cliente_operacion_id: operacionId,
    p_ocurrio_en: "2026-09-10T22:30:00Z",
    p_tipo: "venta",
    p_descripcion: "Venta offline",
    p_valor: 25000,
    p_metodo_pago: "transferencia",
    p_monto_efectivo: 0,
    p_monto_transferencia: 25000,
  });
  const filas = await restGet(request, `registros_caja?cliente_operacion_id=eq.${operacionId}&select=fecha,metodo_pago,monto_transferencia,caja_diaria(fecha)`);
  expect(filas).toMatchObject([{
    fecha: "2026-09-10",
    metodo_pago: "transferencia",
    monto_transferencia: 25000,
    caja_diaria: { fecha: "2026-09-10" },
  }]);
});
