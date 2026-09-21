export interface MovimientoCambioResumen {
  id: number;
  fecha: string;
  tipo: "salida" | "devolucion";
  cantidad: number;
  precio_venta: number | null;
  movimiento_ref: string | null;
  nota: string | null;
  productos: { referencia: string; codigo: string } | null;
  tallas: { nombre: string } | null;
}

export interface CambioDelDia {
  referencia: string;
  fecha: string;
  entradas: MovimientoCambioResumen[];
  salidas: MovimientoCambioResumen[];
  totalEntrada: number;
  totalSalida: number;
  diferencia: number;
}

export function agruparCambiosDelDia(movimientos: MovimientoCambioResumen[]): CambioDelDia[] {
  const grupos = new Map<string, MovimientoCambioResumen[]>();
  for (const movimiento of movimientos) {
    const referencia = movimiento.movimiento_ref ?? `CAMBIO-${movimiento.id}`;
    grupos.set(referencia, [...(grupos.get(referencia) ?? []), movimiento]);
  }

  return Array.from(grupos, ([referencia, items]) => {
    const entradas = items.filter(item => item.tipo === "devolucion");
    const salidas = items.filter(item => item.tipo === "salida");
    const sumar = (lineas: MovimientoCambioResumen[]) => lineas.reduce(
      (total, linea) => total + Number(linea.precio_venta ?? 0) * linea.cantidad,
      0,
    );
    const totalEntrada = sumar(entradas);
    const totalSalida = sumar(salidas);
    return {
      referencia,
      fecha: items[0]?.fecha ?? "",
      entradas,
      salidas,
      totalEntrada,
      totalSalida,
      diferencia: totalSalida - totalEntrada,
    };
  }).sort((a, b) => b.fecha.localeCompare(a.fecha));
}

export function nombreMovimientoCambio(item: MovimientoCambioResumen) {
  return item.productos?.codigo === "LIBRE" && item.nota
    ? item.nota
    : item.productos?.referencia ?? "Producto";
}

export function tituloCambio(cambio: CambioDelDia) {
  const resumir = (items: MovimientoCambioResumen[]) => {
    const nombres = items.map(nombreMovimientoCambio);
    if (nombres.length === 0) return "Sin prendas";
    return nombres.length === 1 ? nombres[0] : `${nombres[0]} y ${nombres.length - 1} más`;
  };
  return `${resumir(cambio.entradas)} → ${resumir(cambio.salidas)}`;
}
