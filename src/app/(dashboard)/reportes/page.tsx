"use client";

import { useEffect, useState, useCallback } from "react";
import { BarChart2, TrendingUp, TrendingDown, ShoppingBag, CreditCard, Calendar, Wallet, Banknote, Smartphone, RefreshCw, Store, Truck, Globe } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDate } from "@/lib/utils";
import Spinner from "@/components/ui/Spinner";
import type { VResumenCaja } from "@/lib/types";

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

interface ResumenCanal {
  canal: string;
  total: number;
  cantidad: number;
}

const CANAL_LABEL: Record<string, string> = {
  venta_tienda:   "Tienda",
  domicilio:      "Domicilio",
  envio_nacional: "Envío Nacional",
  cambio:         "Cambio",
};

const CANAL_COLOR: Record<string, string> = {
  venta_tienda:   "bg-brand-blue/10 text-brand-blue",
  domicilio:      "bg-orange-100 text-orange-700",
  envio_nacional: "bg-teal-100 text-teal-700",
  cambio:         "bg-gray-100 text-gray-600",
};

const CANAL_BAR: Record<string, string> = {
  venta_tienda:   "bg-brand-blue",
  domicilio:      "bg-orange-500",
  envio_nacional: "bg-teal-500",
  cambio:         "bg-gray-400",
};

const CANAL_ICON: Record<string, React.ReactNode> = {
  venta_tienda:   <Store className="w-4 h-4" />,
  domicilio:      <Truck className="w-4 h-4" />,
  envio_nacional: <Globe className="w-4 h-4" />,
  cambio:         <RefreshCw className="w-4 h-4" />,
};

type Periodo = "7d" | "30d" | "90d";

const PERIODO_LABEL: Record<Periodo, string> = {
  "7d": "7 días",
  "30d": "30 días",
  "90d": "90 días",
};

function getFechaDesde(periodo: Periodo): string {
  const d = new Date();
  const dias = periodo === "7d" ? 7 : periodo === "30d" ? 30 : 90;
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}

function getHoy(): string {
  return new Date().toISOString().slice(0, 10);
}

const METODO_ICON: Record<string, React.ReactNode> = {
  efectivo:      <Banknote className="w-4 h-4" />,
  transferencia: <Smartphone className="w-4 h-4" />,
  nequi:         <Smartphone className="w-4 h-4" />,
  datafono:      <CreditCard className="w-4 h-4" />,
  mixto:         <Wallet className="w-4 h-4" />,
};

const METODO_COLOR: Record<string, string> = {
  efectivo:      "bg-emerald-100 text-emerald-700",
  transferencia: "bg-blue-100 text-blue-700",
  nequi:         "bg-pink-100 text-pink-700",
  datafono:      "bg-purple-100 text-purple-700",
  mixto:         "bg-amber-100 text-amber-700",
};

const METODO_BAR: Record<string, string> = {
  efectivo:      "bg-emerald-500",
  transferencia: "bg-blue-500",
  nequi:         "bg-pink-500",
  datafono:      "bg-purple-500",
  mixto:         "bg-amber-500",
};

export default function ReportesPage() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState<Periodo>("30d");
  const [cajas, setCajas] = useState<VResumenCaja[]>([]);
  const [topProductos, setTopProductos] = useState<TopProducto[]>([]);
  const [resumenMetodos, setResumenMetodos] = useState<ResumenMetodo[]>([]);
  const [resumenCanales, setResumenCanales] = useState<ResumenCanal[]>([]);

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
        .select("producto_id, cantidad, precio_venta, metodo_pago, canal, productos(referencia)")
        .eq("tipo", "salida")
        .gte("fecha", desde + "T00:00:00"),
    ]);

    setCajas((cajasData as unknown as VResumenCaja[]) ?? []);

    const porProducto = new Map<number, TopProducto>();
    const porMetodo   = new Map<string, ResumenMetodo>();
    const porCanal    = new Map<string, ResumenCanal>();

    for (const m of (movsData ?? []) as any[]) {
      const id      = m.producto_id as number;
      const ref     = (m.productos as any)?.referencia ?? "Sin ref";
      const unidades = m.cantidad as number;
      const ingresos = ((m.precio_venta ?? 0) as number) * unidades;
      const met     = (m.metodo_pago as string) ?? "otro";
      const canal   = (m.canal as string) ?? "venta_tienda";

      // Top productos
      if (id) {
        const prev = porProducto.get(id);
        if (prev) { prev.total_unidades += unidades; prev.total_ingresos += ingresos; }
        else porProducto.set(id, { producto_id: id, referencia: ref, total_unidades: unidades, total_ingresos: ingresos });
      }

      // Por método de pago
      const prevMet = porMetodo.get(met);
      if (prevMet) { prevMet.total += ingresos; prevMet.cantidad += 1; }
      else porMetodo.set(met, { metodo: met, total: ingresos, cantidad: 1 });

      // Por canal
      const prevCanal = porCanal.get(canal);
      if (prevCanal) { prevCanal.total += ingresos; prevCanal.cantidad += 1; }
      else porCanal.set(canal, { canal, total: ingresos, cantidad: 1 });
    }

    setTopProductos(
      Array.from(porProducto.values())
        .sort((a, b) => b.total_ingresos - a.total_ingresos)
        .slice(0, 10)
    );
    setResumenMetodos(Array.from(porMetodo.values()).sort((a, b) => b.total - a.total));
    setResumenCanales(Array.from(porCanal.values()).sort((a, b) => b.total - a.total));

    setLoading(false);
  }, [periodo]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { cargarDatos(); }, [cargarDatos]);

  const totalVentas    = cajas.reduce((s, c) => s + (c.total_efectivo ?? 0) + (c.total_transferencias ?? 0), 0);
  const totalGastos    = cajas.reduce((s, c) => s + (c.total_gastos ?? 0), 0);
  const totalCajas     = cajas.length;
  const promedioDiario = totalCajas > 0 ? totalVentas / totalCajas : 0;
  const maxIngresos    = topProductos[0]?.total_ingresos ?? 1;

  if (loading) return <Spinner className="h-screen" />;

  const sinDatos = cajas.length === 0 && topProductos.length === 0;

  return (
    <div className="px-4 md:px-8 pt-6 pb-24 max-w-7xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart2 className="w-6 h-6 text-brand-blue" /> Reportes
          </h1>
          <p className="text-xs text-gray-400">Análisis de ventas y caja</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={cargarDatos} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400">
            <RefreshCw className="w-4 h-4" />
          </button>
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
            {(["7d", "30d", "90d"] as Periodo[]).map(p => (
              <button key={p} onClick={() => setPeriodo(p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${periodo === p ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
                {PERIODO_LABEL[p]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {sinDatos ? (
        <div className="text-center py-24 text-gray-400">
          <BarChart2 className="w-14 h-14 mx-auto mb-4 opacity-25" />
          <p className="font-semibold text-lg">Sin datos para este período</p>
          <p className="text-sm mt-1">Registra ventas en Caja para ver reportes aquí</p>
        </div>
      ) : (
        <>
          {/* ── KPIs ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            {[
              { label: "Ingresos totales", value: formatCurrency(totalVentas), icon: TrendingUp, color: "text-green-600", bg: "bg-green-50", border: "border-green-100" },
              { label: "Gastos totales",   value: formatCurrency(totalGastos), icon: TrendingDown, color: "text-red-500", bg: "bg-red-50", border: "border-red-100" },
              { label: "Días con caja",    value: String(totalCajas),          icon: Calendar,    color: "text-brand-blue", bg: "bg-blue-50", border: "border-blue-100" },
              { label: "Promedio / día",   value: formatCurrency(promedioDiario), icon: BarChart2, color: "text-purple-600", bg: "bg-purple-50", border: "border-purple-100" },
            ].map(item => (
              <div key={item.label} className={`${item.bg} border ${item.border} rounded-2xl p-4 flex items-start gap-3`}>
                <div className={`w-9 h-9 rounded-xl ${item.bg} flex items-center justify-center shrink-0`}>
                  <item.icon className={`w-5 h-5 ${item.color}`} />
                </div>
                <div>
                  <p className="text-xs text-gray-500 leading-tight">{item.label}</p>
                  <p className={`text-xl font-black ${item.color} leading-tight mt-0.5`}>{item.value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* ── Grid principal desktop ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* ── Columna izquierda (2/3): Top productos + Cierres ── */}
            <div className="lg:col-span-2 space-y-6">

              {/* Top productos */}
              {topProductos.length > 0 && (
                <div className="card">
                  <h2 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <ShoppingBag className="w-5 h-5 text-brand-blue" /> Productos más vendidos
                  </h2>
                  <div className="space-y-3">
                    {topProductos.map((p, i) => {
                      const pct = (p.total_ingresos / maxIngresos) * 100;
                      const medalColor = i === 0 ? "bg-yellow-400 text-white" : i === 1 ? "bg-gray-300 text-white" : i === 2 ? "bg-amber-600 text-white" : "bg-gray-100 text-gray-500";
                      return (
                        <div key={p.producto_id} className="flex items-center gap-3">
                          <span className={`w-6 h-6 rounded-full ${medalColor} text-xs font-black flex items-center justify-center shrink-0`}>
                            {i + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <p className="text-sm font-semibold text-gray-900 truncate pr-2">{p.referencia}</p>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-xs text-gray-400">{p.total_unidades} uds</span>
                                <span className="text-sm font-bold text-green-600">{formatCurrency(p.total_ingresos)}</span>
                              </div>
                            </div>
                            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full bg-brand-blue rounded-full transition-all" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Cierres de caja */}
              {cajas.length > 0 && (
                <div className="card">
                  <h2 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-brand-blue" /> Cierres de caja
                  </h2>

                  {/* Tabla desktop */}
                  <div className="hidden md:block overflow-hidden rounded-xl border border-gray-100">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-xs font-bold text-gray-400 uppercase tracking-wide">
                        <tr>
                          <th className="px-4 py-2.5 text-left">Fecha</th>
                          <th className="px-4 py-2.5 text-center">Ventas</th>
                          <th className="px-4 py-2.5 text-right">Efectivo</th>
                          <th className="px-4 py-2.5 text-right">Transferencias</th>
                          <th className="px-4 py-2.5 text-right">Gastos</th>
                          <th className="px-4 py-2.5 text-right font-bold text-gray-600">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {cajas.map(c => {
                          const total = (c.total_efectivo ?? 0) + (c.total_transferencias ?? 0);
                          return (
                            <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                              <td className="px-4 py-2.5 font-medium text-gray-900">{formatDate(c.fecha)}</td>
                              <td className="px-4 py-2.5 text-center text-gray-500">{c.cantidad_ventas}</td>
                              <td className="px-4 py-2.5 text-right text-emerald-600 font-medium">{formatCurrency(c.total_efectivo ?? 0)}</td>
                              <td className="px-4 py-2.5 text-right text-blue-600 font-medium">{formatCurrency(c.total_transferencias ?? 0)}</td>
                              <td className="px-4 py-2.5 text-right text-red-500">{(c.total_gastos ?? 0) > 0 ? formatCurrency(c.total_gastos ?? 0) : "—"}</td>
                              <td className="px-4 py-2.5 text-right font-black text-brand-blue">{formatCurrency(total)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="bg-gray-50 text-sm font-bold border-t-2 border-gray-200">
                        <tr>
                          <td className="px-4 py-2.5 text-gray-500">Total {PERIODO_LABEL[periodo]}</td>
                          <td className="px-4 py-2.5 text-center text-gray-700">{cajas.reduce((s, c) => s + c.cantidad_ventas, 0)}</td>
                          <td className="px-4 py-2.5 text-right text-emerald-700">{formatCurrency(cajas.reduce((s, c) => s + (c.total_efectivo ?? 0), 0))}</td>
                          <td className="px-4 py-2.5 text-right text-blue-700">{formatCurrency(cajas.reduce((s, c) => s + (c.total_transferencias ?? 0), 0))}</td>
                          <td className="px-4 py-2.5 text-right text-red-600">{formatCurrency(totalGastos)}</td>
                          <td className="px-4 py-2.5 text-right text-brand-blue">{formatCurrency(totalVentas)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {/* Lista mobile */}
                  <div className="md:hidden space-y-2">
                    {cajas.map(c => (
                      <div key={c.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{formatDate(c.fecha)}</p>
                          <p className="text-xs text-gray-400">{c.cantidad_ventas} ventas{(c.total_gastos ?? 0) > 0 ? ` · Gastos: ${formatCurrency(c.total_gastos ?? 0)}` : ""}</p>
                        </div>
                        <p className="font-bold text-brand-blue">{formatCurrency((c.total_efectivo ?? 0) + (c.total_transferencias ?? 0))}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ── Columna derecha (1/3): Métodos de pago ── */}
            <div className="space-y-6">

              {resumenMetodos.length > 0 && (
                <div className="card">
                  <h2 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-brand-blue" /> Métodos de pago
                  </h2>
                  <div className="space-y-3">
                    {resumenMetodos.map(rm => {
                      const pct = totalVentas > 0 ? (rm.total / totalVentas) * 100 : 0;
                      const colorBadge = METODO_COLOR[rm.metodo] ?? "bg-gray-100 text-gray-600";
                      const colorBar   = METODO_BAR[rm.metodo]   ?? "bg-gray-400";
                      const icon       = METODO_ICON[rm.metodo]  ?? <Wallet className="w-4 h-4" />;
                      return (
                        <div key={rm.metodo}>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${colorBadge}`}>
                              {icon}
                              <span className="capitalize">{rm.metodo}</span>
                            </span>
                            <div className="text-right">
                              <p className="text-sm font-bold text-gray-900">{formatCurrency(rm.total)}</p>
                              <p className="text-[10px] text-gray-400">{pct.toFixed(1)}% · {rm.cantidad} ventas</p>
                            </div>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full ${colorBar} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Totalizador */}
                  <div className="mt-4 pt-3 border-t border-gray-100 flex justify-between items-center">
                    <span className="text-xs text-gray-400 font-medium">Total del período</span>
                    <span className="text-base font-black text-green-600">{formatCurrency(totalVentas)}</span>
                  </div>
                </div>
              )}

              {/* Canales de venta */}
              {resumenCanales.length > 0 && (
                <div className="card">
                  <h2 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <Truck className="w-5 h-5 text-brand-blue" /> Canales de venta
                  </h2>
                  <div className="space-y-3">
                    {resumenCanales.map(rc => {
                      const totalCanales = resumenCanales.reduce((s, c) => s + c.total, 0);
                      const pct = totalCanales > 0 ? (rc.total / totalCanales) * 100 : 0;
                      const colorBadge = CANAL_COLOR[rc.canal] ?? "bg-gray-100 text-gray-600";
                      const colorBar   = CANAL_BAR[rc.canal]   ?? "bg-gray-400";
                      const icon       = CANAL_ICON[rc.canal]  ?? <Store className="w-4 h-4" />;
                      const label      = CANAL_LABEL[rc.canal] ?? rc.canal;
                      return (
                        <div key={rc.canal}>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${colorBadge}`}>
                              {icon}
                              <span>{label}</span>
                            </span>
                            <div className="text-right">
                              <p className="text-sm font-bold text-gray-900">{formatCurrency(rc.total)}</p>
                              <p className="text-[10px] text-gray-400">{pct.toFixed(1)}% · {rc.cantidad} ventas</p>
                            </div>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full ${colorBar} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-4 pt-3 border-t border-gray-100 flex justify-between items-center">
                    <span className="text-xs text-gray-400 font-medium">Total período</span>
                    <span className="text-base font-black text-green-600">
                      {formatCurrency(resumenCanales.reduce((s, c) => s + c.total, 0))}
                    </span>
                  </div>
                </div>
              )}

              {/* Mini resumen numérico */}
              {totalCajas > 0 && (
                <div className="card bg-brand-blue text-white">
                  <h3 className="text-sm font-bold text-blue-200 mb-3 uppercase tracking-wide">Resumen {PERIODO_LABEL[periodo]}</h3>
                  <div className="space-y-2">
                    {[
                      { label: "Días activos",   value: `${totalCajas} días` },
                      { label: "Ventas / día",   value: formatCurrency(promedioDiario) },
                      { label: "Total gastos",   value: formatCurrency(totalGastos) },
                      { label: "Neto (ventas − gastos)", value: formatCurrency(totalVentas - totalGastos) },
                    ].map(row => (
                      <div key={row.label} className="flex justify-between items-center text-sm">
                        <span className="text-blue-200">{row.label}</span>
                        <span className="font-bold">{row.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
