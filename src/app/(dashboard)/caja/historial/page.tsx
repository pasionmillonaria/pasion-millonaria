"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { History, ChevronRight, TrendingUp, Calendar } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { VResumenCaja } from "@/lib/types";
import Spinner from "@/components/ui/Spinner";
import Badge from "@/components/ui/Badge";
import { useProfile } from "@/lib/context/ProfileContext";

export default function HistorialPage() {
  const supabase = createClient();
  const router = useRouter();
  const { isAdmin } = useProfile();
  const [cajas, setCajas] = useState<VResumenCaja[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("v_resumen_caja" as any)
        .select("*")
        .order("fecha", { ascending: false })
        .limit(60);
      setCajas((data ?? []) as unknown as VResumenCaja[]);
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-8 pt-6">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="p-2 rounded-xl hover:bg-gray-100 md:hidden">
          <ChevronRight className="w-5 h-5 text-gray-500 rotate-180" />
        </button>
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <History className="w-6 h-6 text-brand-blue" /> Historial de Caja
        </h1>
      </div>

      {loading ? (
        <Spinner className="py-16" />
      ) : cajas.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <History className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Sin cierres registrados</p>
        </div>
      ) : (
        <div className="space-y-2">
          {cajas.map(c => {
            const totalVentas = (c.total_efectivo ?? 0) + (c.total_transferencias ?? 0);
            const esCerrada = c.estado === "cerrada";
            return (
              <Link
                key={c.id}
                href={`/caja/historial/${c.id}`}
                className="card hover:shadow-md active:scale-95 transition-all flex items-center gap-3"
              >
                <div className="w-10 h-10 bg-brand-blue/10 rounded-xl flex items-center justify-center shrink-0">
                  <Calendar className="w-5 h-5 text-brand-blue" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-gray-900">{formatDate(c.fecha)}</p>
                    {!esCerrada && <Badge variant="warning">Abierta</Badge>}
                  </div>
                  {isAdmin ? (
                    <p className="text-xs text-gray-500">
                      {c.cantidad_ventas} venta{c.cantidad_ventas !== 1 ? "s" : ""} · {formatCurrency(totalVentas)}
                    </p>
                  ) : (
                    <p className="text-xs text-gray-500">
                      {c.cantidad_ventas} venta{c.cantidad_ventas !== 1 ? "s" : ""}
                    </p>
                  )}
                </div>
                {isAdmin && (
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-green-600">{formatCurrency(totalVentas)}</p>
                    {c.total_transferencias > 0 && (
                      <p className="text-[10px] text-blue-500">Transf: {formatCurrency(c.total_transferencias)}</p>
                    )}
                  </div>
                )}
                <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
              </Link>
            );
          })}
        </div>
      )}
      <div className="h-4" />
    </div>
  );
}
