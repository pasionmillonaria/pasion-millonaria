import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";

interface RequestBody {
  id: number;
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

  const { id } = body;
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  // Service role bypasses RLS — solo usarlo server-side.
  const supabase = createClient<Database>(url, serviceKey);

  const { data: registro, error: selectError } = await supabase
    .from("registros_caja")
    .select("id, abono_id")
    .eq("id", id)
    .maybeSingle();

  if (selectError) {
    return NextResponse.json({ error: selectError.message }, { status: 500 });
  }
  if (!registro) {
    return NextResponse.json({ error: "Registro no encontrado" }, { status: 404 });
  }

  // Un ingreso vinculado a un abono no se borra desde caja: hacerlo dejaría el
  // abono y el apartado desincronizados. Se gestiona desde el apartado.
  if (registro.abono_id !== null) {
    return NextResponse.json(
      { error: "Este ingreso viene de un abono. Anúlalo desde el apartado, no desde la caja." },
      { status: 409 },
    );
  }

  const { error: deleteError } = await supabase
    .from("registros_caja")
    .delete()
    .eq("id", id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
