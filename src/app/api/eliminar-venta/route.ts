import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";

const CANALES_VENTA = ["venta_tienda", "domicilio", "envio_nacional"];

export async function POST(request: NextRequest) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!serviceKey || !url) {
    return NextResponse.json(
      { error: "Configuración de servidor incompleta. Falta SUPABASE_SERVICE_ROLE_KEY." },
      { status: 500 },
    );
  }

  let body: { movimientoIds: number[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const { movimientoIds } = body;

  if (!Array.isArray(movimientoIds) || movimientoIds.length === 0) {
    return NextResponse.json({ error: "Sin movimientoIds" }, { status: 400 });
  }
  if (movimientoIds.some((id) => !Number.isInteger(id) || id <= 0)) {
    return NextResponse.json({ error: "IDs inválidos" }, { status: 400 });
  }

  const supabase = createClient<Database>(url, serviceKey);

  // 1. Cargar los movimientos originales
  const { data: movs, error: fetchError } = await supabase
    .from("movimientos")
    .select("id, tipo, canal, producto_id, talla_id, ubicacion_id, cantidad, movimiento_ref")
    .in("id", movimientoIds);

  if (fetchError || !movs) {
    return NextResponse.json({ error: "Error al obtener movimientos" }, { status: 500 });
  }

  // 2. Validar que todos son salidas de venta
  for (const m of movs) {
    if (m.tipo !== "salida" || !CANALES_VENTA.includes(m.canal)) {
      return NextResponse.json(
        { error: `El movimiento ${m.id} no es una venta eliminable` },
        { status: 400 },
      );
    }
  }

  // 3. Insertar movimientos de corrección (tipo=devolucion) para restaurar stock.
  //    El trigger actualizar_stock_tras_movimiento los procesa y suma las unidades de vuelta.
  const compensaciones = movs.map((m) => ({
    producto_id: m.producto_id,
    talla_id: m.talla_id,
    ubicacion_id: m.ubicacion_id,
    cantidad: m.cantidad,
    tipo: "devolucion" as const,
    canal: "ajuste" as const,
    nota: `Corrección por anulación de venta (mov #${m.id})`,
  }));

  const { error: insertError } = await supabase.from("movimientos").insert(compensaciones);
  if (insertError) {
    return NextResponse.json(
      { error: "Error al restaurar stock: " + insertError.message },
      { status: 500 },
    );
  }

  // 4. Eliminar registros_caja vinculados a estos movimientos
  const { error: cajaBorradoError } = await supabase
    .from("registros_caja")
    .delete()
    .in("movimiento_id", movimientoIds);

  if (cajaBorradoError) {
    return NextResponse.json(
      { error: "Error al limpiar registros de caja: " + cajaBorradoError.message },
      { status: 500 },
    );
  }

  // 5. Eliminar los movimientos originales
  const { error: deleteError } = await supabase
    .from("movimientos")
    .delete()
    .in("id", movimientoIds);

  if (deleteError) {
    return NextResponse.json(
      { error: "Error al eliminar movimientos: " + deleteError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
