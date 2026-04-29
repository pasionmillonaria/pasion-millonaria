import type { CanalMovimiento, MetodoPago } from "@/lib/types";

export type MetodoPagoPedido = MetodoPago | "sin_confirmar";

export interface MovimientoPedidoRow {
  id: number;
  fecha: string;
  canal: CanalMovimiento;
  cantidad: number;
  precio_venta: number | null;
  descuento: number | null;
  metodo_pago: MetodoPago | null;
  movimiento_ref: string | null;
  nota?: string | null;
  productos?: { referencia: string; codigo?: string } | null;
  tallas?: { nombre: string } | null;
}

export interface PedidoVentaItem {
  movimientoId: number;
  referencia: string;
  talla: string;
  cantidad: number;
  precioVenta: number;
  descuento: number;
  total: number;
}

export interface PedidoVentaResumen {
  key: string;
  displayRef: string;
  canal: CanalMovimiento;
  metodoPago: MetodoPagoPedido;
  fecha: string;
  items: PedidoVentaItem[];
  totalUnidades: number;
  totalPedido: number;
  totalItems: number;
  esSintetico: boolean;
}

export const CANALES_PEDIDO: CanalMovimiento[] = [
  "venta_tienda",
  "domicilio",
  "envio_nacional",
];

export function buildPedidosVenta(
  rows: MovimientoPedidoRow[],
): PedidoVentaResumen[] {
  const grouped = new Map<string, PedidoVentaResumen>();

  for (const row of rows) {
    const key = row.movimiento_ref ?? `SINREF-${row.id}`;
    const precioVenta = row.precio_venta ?? 0;
    const descuento = row.descuento ?? 0;
    const total = Math.max(0, precioVenta - descuento) * row.cantidad;

    if (!grouped.has(key)) {
      grouped.set(key, {
        key,
        displayRef: row.movimiento_ref ?? `Venta #${row.id}`,
        canal: row.canal,
        metodoPago: row.metodo_pago ?? "sin_confirmar",
        fecha: row.fecha,
        items: [],
        totalUnidades: 0,
        totalPedido: 0,
        totalItems: 0,
        esSintetico: row.movimiento_ref == null,
      });
    }

    const pedido = grouped.get(key)!;
    pedido.items.push({
      movimientoId: row.id,
      referencia: (row.productos?.codigo === "LIBRE" || row.productos?.referencia.toLowerCase().includes("libre")) && row.nota
        ? row.nota
        : (row.productos?.referencia ?? "Sin referencia"),
      talla: row.tallas?.nombre ?? "-",
      cantidad: row.cantidad,
      precioVenta,
      descuento,
      total,
    });
    pedido.totalUnidades += row.cantidad;
    pedido.totalPedido += total;
    pedido.totalItems += 1;

    if (new Date(row.fecha) > new Date(pedido.fecha)) {
      pedido.fecha = row.fecha;
    }
  }

  return Array.from(grouped.values()).sort(
    (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime(),
  );
}

export function getSyntheticPedidoId(ref: string) {
  if (!ref.startsWith("SINREF-")) return null;

  const id = Number(ref.replace("SINREF-", ""));
  return Number.isFinite(id) ? id : null;
}
