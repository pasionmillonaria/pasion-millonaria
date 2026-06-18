import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";

interface RequestBody {
  abono_id: number;
}

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

  const { abono_id } = body;
  if (!Number.isInteger(abono_id) || abono_id <= 0) {
    return NextResponse.json({ error: "ID de abono inválido" }, { status: 400 });
  }

  // Service role bypasses RLS — solo usarlo server-side.
  const supabase = createClient<Database>(url, serviceKey);

  // La RPC borra el abono y su ingreso de caja vinculado en una sola
  // transacción, y bloquea si el apartado ya fue entregado.
  const { data, error } = await supabase.rpc("anular_abono", {
    p_abono_id: abono_id,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, ...data });
}
