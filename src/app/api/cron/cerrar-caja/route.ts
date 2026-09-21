import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) {
    return NextResponse.json({ error: "Falta configurar CRON_SECRET" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secreto}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("cerrar_cajas_vencidas", {
      p_ahora: new Date().toISOString(),
    });
    if (error) throw error;
    return NextResponse.json({ ok: true, cajas_cerradas: data });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "Error cerrando cajas";
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
