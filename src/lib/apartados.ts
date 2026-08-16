import type { EstadoApartado } from "@/lib/types";

interface ItemFinancieroApartado {
  precio: number;
  estado: string;
}

interface AbonoFinancieroApartado {
  monto: number;
}

/**
 * Los abonos pertenecen al pedido completo, no a una prenda particular.
 * Por eso el saldo se calcula una sola vez por grupo y las prendas canceladas
 * se conservan en el historial, pero dejan de formar parte del valor vigente.
 */
export function calcularResumenFinancieroApartado(
  items: ItemFinancieroApartado[],
  abonos: AbonoFinancieroApartado[],
) {
  const totalPrecio = items
    .filter(item => item.estado !== "cancelado")
    .reduce((total, item) => total + Number(item.precio), 0);
  const totalAbonado = abonos.reduce(
    (total, abono) => total + Number(abono.monto),
    0,
  );
  const diferencia = totalPrecio - totalAbonado;

  return {
    totalPrecio,
    totalAbonado,
    totalSaldo: Math.max(0, diferencia),
    saldoAFavor: Math.max(0, -diferencia),
  };
}

/**
 * Un grupo sigue pendiente mientras tenga alguna prenda pendiente. Al cerrar,
 * una mezcla de prendas entregadas y canceladas cuenta como entregada; solo un
 * grupo cuyas prendas fueron todas canceladas queda cancelado.
 */
export function calcularEstadoGrupoApartado(
  items: Array<{ estado: string }>,
): EstadoApartado {
  if (items.some(item => item.estado === "pendiente")) return "pendiente";
  if (items.some(item => item.estado === "entregado")) return "entregado";
  return "cancelado";
}
