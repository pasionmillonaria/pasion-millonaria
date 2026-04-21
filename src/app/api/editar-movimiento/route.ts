import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database, CanalMovimiento, MetodoPago } from "@/lib/types";

interface ItemUpdate {
  id: number;
  precio_venta: number;
  descuento: number | null;
}

interface RequestBody {
  canal: CanalMovimiento;
  metodo_pago: MetodoPago | null;
  items: ItemUpdate[];
}

const CANALES_VALIDOS: CanalMovimiento[] = [
  "venta_tienda",
  "domicilio",
  "envio_nacional",
];
const METODOS_VALIDOS: MetodoPago[] = [
  "efectivo",
  "nequi",
  "transferencia",
  "datafono",
  "mixto",
];

export async function POST(request: NextRequest) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!serviceKey || !url) {
    return NextResponse.json(
      { error: "Configuración de servidor incompleta" },
      { status: 500 },
    );
  }

  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const { canal, metodo_pago, items } = body;

  if (!CANALES_VALIDOS.includes(canal)) {
    return NextResponse.json({ error: "Canal inválido" }, { status: 400 });
  }
  if (metodo_pago !== null && !METODOS_VALIDOS.includes(metodo_pago)) {
    return NextResponse.json({ error: "Método de pago inválido" }, { status: 400 });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "Sin items" }, { status: 400 });
  }
  for (const item of items) {
    if (!Number.isInteger(item.id) || item.id <= 0) {
      return NextResponse.json({ error: "ID de movimiento inválido" }, { status: 400 });
    }
    if (typeof item.precio_venta !== "number" || item.precio_venta <= 0) {
      return NextResponse.json({ error: "Precio inválido" }, { status: 400 });
    }
    if (item.descuento !== null && (typeof item.descuento !== "number" || item.descuento < 0)) {
      return NextResponse.json({ error: "Descuento inválido" }, { status: 400 });
    }
  }

  // Service role bypasses RLS — solo usarlo server-side
  const supabase = createClient<Database>(url, serviceKey);

  const ids = items.map((i) => i.id);
  const { data: existentes, error: selectError } = await supabase
    .from("movimientos")
    .select("id, tipo, canal")
    .in("id", ids);

  if (selectError || !existentes) {
    return NextResponse.json(
      { error: "Error verificando movimientos" },
      { status: 500 },
    );
  }

  // Solo permitir editar movimientos de tipo salida con canal de venta
  for (const mov of existentes) {
    if (
      mov.tipo !== "salida" ||
      !CANALES_VALIDOS.includes(mov.canal as CanalMovimiento)
    ) {
      return NextResponse.json(
        { error: `Movimiento ${mov.id} no es una venta editable` },
        { status: 400 },
      );
    }
  }

  const results = await Promise.all(
    items.map((item) =>
      supabase
        .from("movimientos")
        .update({
          canal,
          metodo_pago,
          precio_venta: item.precio_venta,
          descuento: item.descuento,
        })
        .eq("id", item.id),
    ),
  );

  const failed = results.find((r) => r.error);
  if (failed?.error) {
    return NextResponse.json(
      { error: failed.error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
