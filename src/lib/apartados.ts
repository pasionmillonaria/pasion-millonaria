import type { EstadoApartado } from "@/lib/types";

interface ItemFinancieroApartado {
  precio: number;
  estado: string;
}

interface AbonoFinancieroApartado {
  monto: number;
}

export interface PrendaAgrupableApartado {
  referencia: string;
  talla: string;
  precio: number;
  estado: string;
  en_tienda: boolean;
  observacion?: string | null;
}

export interface GrupoPrendasApartado<T extends PrendaAgrupableApartado> {
  key: string;
  items: T[];
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

/**
 * Agrupa solo prendas realmente equivalentes. Si cambia el precio, estado o
 * ubicación, se conserva un grupo separado para no mezclar subtotales ni
 * ocultar diferencias operativas. Las observaciones se muestran dentro del
 * grupo, pero no lo dividen porque el alta guarda la nota solo en la primera
 * unidad del pedido.
 */
export function agruparPrendasApartado<T extends PrendaAgrupableApartado>(
  items: T[],
): GrupoPrendasApartado<T>[] {
  const grupos = new Map<string, T[]>();

  for (const item of items) {
    const key = JSON.stringify([
      item.referencia,
      item.talla,
      Number(item.precio),
      item.estado,
      item.en_tienda,
    ]);
    grupos.set(key, [...(grupos.get(key) ?? []), item]);
  }

  return Array.from(grupos, ([key, prendas]) => ({
    key,
    items: prendas,
    cantidad: prendas.length,
    precioUnitario: Number(prendas[0].precio),
    subtotal: Number(prendas[0].precio) * prendas.length,
  }));
}

export function describirPrendasApartado(items: PrendaAgrupableApartado[]): string {
  return agruparPrendasApartado(items)
    .map(grupo => {
      const prenda = grupo.items[0];
      const cantidad = grupo.cantidad > 1 ? `${grupo.cantidad}× ` : "";
      return `${cantidad}${prenda.referencia} — Talla ${prenda.talla}`;
    })
    .join(", ");
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
