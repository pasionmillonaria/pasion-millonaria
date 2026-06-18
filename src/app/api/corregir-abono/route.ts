import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database, MetodoPago } from "@/lib/types";

interface RequestBody {
  abono_id: number;
  metodo_pago: MetodoPago;
}

// Métodos válidos para un abono (sin 'mixto': un abono se registra con un único método).
const METODOS_VALIDOS: MetodoPago[] = [
  "efectivo",
  "nequi",
  "transferencia",
  "datafono",
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

  const { abono_id, metodo_pago } = body;

  if (!Number.isInteger(abono_id) || abono_id <= 0) {
    return NextResponse.json({ error: "ID de abono inválido" }, { status: 400 });
  }
  if (!METODOS_VALIDOS.includes(metodo_pago)) {
    return NextResponse.json({ error: "Método de pago inválido" }, { status: 400 });
  }

  // Service role bypasses RLS — solo usarlo server-side.
  const supabase = createClient<Database>(url, serviceKey);

  // La RPC actualiza el abono y su ingreso de caja vinculado en una sola
  // transacción (supabase-js no soporta transacciones desde el cliente).
  const { data, error } = await supabase.rpc("corregir_metodo_abono", {
    p_abono_id: abono_id,
    p_metodo: metodo_pago,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ...data });
}
