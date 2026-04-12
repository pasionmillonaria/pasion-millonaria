"use client";

import { useEffect, useState, useCallback } from "react";
import { BarChart2, TrendingUp, ShoppingBag, CreditCard, Calendar } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDate } from "@/lib/utils";
import Spinner from "@/components/ui/Spinner";
import type { VResumenCaja } from "@/lib/types";

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────
interface TopProducto {
  producto_id: number;
  referencia: string;
  total_unidades: number;
  total_ingresos: number;
}

interface ResumenMetodo {
  metodo: string;
  total: number;
  cantidad: number;
}

type Periodo = "7d" | "30d" | "90d";

const PERIODO_LABEL: Record<Periodo, string> = {
  "7d": "7 días",
  "30d": "30 días",
  "90d": "90 días",
};

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────
function getFechaDesde(periodo: Periodo): string {
  const d = new Date();
  const dias = periodo === "7d" ? 7 : periodo === "30d" ? 30 : 90;
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}

function getHoy(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────
export default function ReportesPage() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState<Periodo>("30d");

  const [cajas, setCajas] = useState<VResumenCaja[]>([]);
  const [topProductos, setTopProductos] = useState<TopProducto[]>([]);
  const [resumenMetodos, setResumenMetodos] = useState<ResumenMetodo[]>([]);

  const cargarDatos = useCallback(async () => {
    setLoading(true);
    const desde = getFechaDesde(periodo);
    const hoy = getHoy();

    const [{ data: cajasData }, { data: movsData }] = await Promise.all([
      supabase
        .from("v_resumen_caja" as any)
        .select("*")
        .gte("fecha", desde)
        .lte("fecha", hoy)
        .order("fecha", { ascending: false }),
      supabase
        .from("movimientos")
        .select("producto_id, cantidad, precio_venta, metodo_pago, productos(referencia)")
        .eq("tipo", "salida")
        .eq("canal", "venta_tienda")
        .gte("fecha", desde + "T00:00:00"),
    ]);

    setCajas((cajasData as unknown as VResumenCaja[]) ?? []);

    // Agrupar por producto
    const porProducto = new Map<number, TopProducto>();
    for (const m of (movsData ?? []) as any[]) {
      const id = m.producto_id as number;
      const ref = (m.productos as any)?.referencia ?? "Sin ref";
      const unidades = m.cantidad as number;
      const ingresos = ((m.precio_venta ?? 0) as number) * unidades;
      const prev = porProducto.get(id);
      if (prev) {
        prev.total_unidades += unidades;
        prev.total_ingresos += ingresos;
      } else {
        porProducto.set(id, { producto_id: id, referencia: ref, total_unidades: unidades, total_ingresos: ingresos });
      }
    }
    const top = Array.from(porProducto.values())
      .sort((a, b) => b.total_ingresos - a.total_ingresos)
      .slice(0, 10);
    setTopProductos(top);

    // Agrupar por método de pago
    const porMetodo = new Map<string, ResumenMetodo>();
    for (const m of (movsData ?? []) as any[]) {
      const met = (m.metodo_pago as string) ?? "otro";
      const ingresos = ((m.precio_venta ?? 0) as number) * (m.cantidad as number);
      const prev = porMetodo.get(met);
      if (prev) { prev.total += ingresos; prev.cantidad += 1; }
      else porMetodo.set(met, { metodo: met, total: ingresos, cantidad: 1 });
    }
    setResumenMetodos(Array.from(porMetodo.values()).sort((a, b) => b.total - a.total));

    setLoading(false);
  }, [periodo]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { cargarDatos(); }, [cargarDatos]);

  // ── Totales globales ────────────────────────────────────────
  const totalVentas = cajas.reduce((s, c) => s + (c.total_efectivo ?? 0) + (c.total_transferencias ?? 0), 0);
  const totalGastos = cajas.reduce((s, c) => s + (c.total_gastos ?? 0), 0);
  const totalCajas = cajas.length;
  const promedioDiario = totalCajas > 0 ? totalVentas / totalCajas : 0;

  if (loading) return <Spinner className="h-screen" />;

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-8 pt-6 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart2 className="w-6 h-6 text-brand-blue" /> Reportes
          </h1>
          <p className="text-xs text-gray-400">Análisis de ventas y caja</p>
        </div>
        {/* Selector de período */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
          {(["7d", "30d", "90d"] as Periodo[]).map(p => (
            <button key={p} onClick={() => setPeriodo(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${periodo === p ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
              {PERIODO_LABEL[p]}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Ingresos", value: formatCurrency(totalVentas), icon: TrendingUp, color: "text-green-600", bg: "bg-green-50" },
          { label: "Gastos", value: formatCurrency(totalGastos), icon: TrendingUp, color: "text-red-600", bg: "bg-red-50" },
          { label: "Días de caja", value: String(totalCajas), icon: Calendar, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Promedio/día", value: formatCurrency(promedioDiario), icon: BarChart2, color: "text-purple-600", bg: "bg-purple-50" },
        ].map(item => (
          <div key={item.label} className={`${item.bg} rounded-2xl p-4`}>
            <p className="text-xs text-gray-500 mb-1">{item.label}</p>
            <p className={`text-lg font-black ${item.color}`}>{item.value}</p>
          </div>
        ))}
      </div>

      {/* Por método de pago */}
      {resumenMetodos.length > 0 && (
        <div className="card mb-6">
          <h2 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-brand-blue" /> Por método de pago
          </h2>
          <div className="space-y-2">
            {resumenMetodos.map(rm => {
              const pct = totalVentas > 0 ? (rm.total / totalVentas) * 100 : 0;
              return (
                <div key={rm.metodo}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="capitalize font-medium text-gray-700">{rm.metodo}</span>
                    <span className="font-bold text-gray-900">{formatCurrency(rm.total)}
                      <span className="text-xs text-gray-400 ml-1">({rm.cantidad} ventas)</span>
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-brand-blue rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Top productos */}
      {topProductos.length > 0 && (
        <div className="card mb-6">
          <h2 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-brand-blue" /> Top productos
          </h2>
          <div className="space-y-2">
            {topProductos.map((p, i) => (
              <div key={p.producto_id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                <span className="w-6 h-6 rounded-full bg-gray-100 text-gray-500 text-xs font-bold flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{p.referencia}</p>
                  <p className="text-xs text-gray-400">{p.total_unidades} unidades</p>
                </div>
                <p className="font-bold text-green-600 text-sm">{formatCurrency(p.total_ingresos)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Historial de cajas */}
      {cajas.length > 0 && (
        <div className="card">
          <h2 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-brand-blue" /> Cierres de caja
          </h2>
          <div className="space-y-2">
            {cajas.map(c => (
              <div key={c.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div>
                  <p className="text-sm font-medium text-gray-900">{formatDate(c.fecha)}</p>
                  <div className="flex gap-3 text-xs text-gray-400 mt-0.5">
                    <span>{c.cantidad_ventas} ventas</span>
                    {(c.total_gastos ?? 0) > 0 && <span>Gastos: {formatCurrency(c.total_gastos ?? 0)}</span>}
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-brand-blue">{formatCurrency((c.total_efectivo ?? 0) + (c.total_transferencias ?? 0))}</p>
                  <p className="text-xs text-gray-400">Saldo: {formatCurrency(c.saldo_final ?? 0)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {cajas.length === 0 && topProductos.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <BarChart2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Sin datos para este período</p>
          <p className="text-sm mt-1">Registra ventas en Caja para ver reportes aquí</p>
        </div>
      )}
    </div>
  );
}
