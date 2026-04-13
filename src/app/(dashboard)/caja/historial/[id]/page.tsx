"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, Download, TrendingUp, Wallet, ArrowUpCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDate } from "@/lib/utils";
import Spinner from "@/components/ui/Spinner";
import Button from "@/components/ui/Button";
import type { TipoRegistroCaja, VResumenCaja } from "@/lib/types";

interface RegistroLocal {
  id: string;
  hora: string;
  tipo: TipoRegistroCaja;
  descripcion: string | null;
  productoRef: string | null;
  tallaNombre: string | null;
  cantidad: number;
  valor: number;
  metodoPago: string | null;
  montoEfectivo: number;
  montoTransferencia: number;
}

const TIPO_ROW: Record<TipoRegistroCaja, string> = {
  venta: "bg-green-50 border-l-4 border-l-green-400",
  gasto: "bg-red-50 border-l-4 border-l-red-300",
  ingreso: "bg-blue-50 border-l-4 border-l-blue-400",
  caja_fuerte: "bg-yellow-50 border-l-4 border-l-yellow-400",
};

function genId() {
  return `l-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function parseRegistros(data: any[]): RegistroLocal[] {
  return data.map(r => ({
    id: genId(),
    hora: r.hora ?? "00:00:00",
    tipo: r.tipo as TipoRegistroCaja,
    descripcion: r.descripcion,
    productoRef: r.movimientos?.productos?.referencia ?? null,
    tallaNombre: r.movimientos?.tallas?.nombre ?? null,
    cantidad: r.movimientos?.cantidad ?? 1,
    valor: r.valor,
    metodoPago: r.metodo_pago,
    montoEfectivo: r.monto_efectivo ?? 0,
    montoTransferencia: r.monto_transferencia ?? 0,
  }));
}

export default function HistorialDetallePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();

  const [caja, setCaja] = useState<VResumenCaja | null>(null);
  const [registros, setRegistros] = useState<RegistroLocal[]>([]);
  const [loading, setLoading] = useState(true);
  const [generando, setGenerando] = useState(false);

  useEffect(() => {
    async function load() {
      const [{ data: cajaData }, { data: regsData }] = await Promise.all([
        supabase.from("v_resumen_caja" as any).select("*").eq("id", Number(id)).single(),
        supabase
          .from("registros_caja")
          .select("*, movimientos(producto_id, talla_id, cantidad, productos(referencia), tallas(nombre))")
          .eq("caja_diaria_id", Number(id))
          .order("hora", { ascending: true }),
      ]);
      setCaja(cajaData as unknown as VResumenCaja);
      setRegistros(parseRegistros(regsData ?? []));
      setLoading(false);
    }
    load();
  }, [id]);

  async function descargar() {
    if (!caja) return;
    setGenerando(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const el = document.getElementById("reporte-detalle");
      if (!el) { return; }
      const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: "#ffffff", logging: false });
      const link = document.createElement("a");
      link.download = `cierre-caja-${caja.fecha}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } finally {
      setGenerando(false);
    }
  }

  if (loading) return <Spinner className="h-screen" />;
  if (!caja) return <div className="p-6 text-center text-gray-500">Cierre no encontrado</div>;

  const ventas = registros.filter(r => r.tipo === "venta");
  const gastos = registros.filter(r => r.tipo === "gasto");
  const ingresos = registros.filter(r => r.tipo === "ingreso");
  const cajaFuerteList = registros.filter(r => r.tipo === "caja_fuerte");
  const totalVentas = (caja.total_efectivo ?? 0) + (caja.total_transferencias ?? 0);
  const ventasEfe = ventas.reduce((s, r) => s + r.montoEfectivo, 0);
  const ventasTransf = ventas.reduce((s, r) => s + r.montoTransferencia, 0);
  const totalGastos = caja.total_gastos ?? 0;
  const totalCajaFuerte = cajaFuerteList.filter(r => r.valor > 0).reduce((s, r) => s + r.valor, 0);
  const totalIngresos = ingresos.reduce((s, r) => s + r.valor, 0);
  const comisiones = ventas
    .filter(r => r.cantidad > 0 && r.valor / r.cantidad > 25000)
    .reduce((s, r) => s + r.cantidad * 1000, 0);

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-8 pt-6 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="p-2 rounded-xl hover:bg-gray-100">
          <ChevronLeft className="w-6 h-6 text-gray-600" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Cierre de Caja</h1>
          <p className="text-sm text-gray-400">{formatDate(caja.fecha)}</p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          className="ml-auto"
          onClick={descargar}
          loading={generando}
        >
          <Download className="w-4 h-4" /> Descargar
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="col-span-2 bg-green-50 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-green-600" />
            <p className="text-xs text-gray-500">Total ventas</p>
          </div>
          <p className="text-2xl font-black text-green-600">{formatCurrency(totalVentas)}</p>
        </div>
        <div className="bg-emerald-50 rounded-2xl p-4">
          <p className="text-xs text-gray-500 mb-1">Efectivo</p>
          <p className="text-xl font-black text-emerald-700">{formatCurrency(ventasEfe)}</p>
        </div>
        <div className="bg-blue-50 rounded-2xl p-4">
          <p className="text-xs text-gray-500 mb-1">Transferencias</p>
          <p className="text-xl font-black text-blue-600">{formatCurrency(ventasTransf)}</p>
        </div>
        <div className="bg-sky-50 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Wallet className="w-4 h-4 text-sky-600" />
            <p className="text-xs text-gray-500">En caja (contado)</p>
          </div>
          <p className="text-xl font-black text-sky-700">{formatCurrency(caja.efectivo_contado ?? 0)}</p>
          <p className="text-xs text-gray-400 mt-1">Inicial: {formatCurrency(caja.saldo_inicial ?? 0)}</p>
        </div>
        {comisiones > 0 && (
          <div className="bg-violet-50 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-violet-600" />
              <p className="text-xs text-gray-500">Comisiones</p>
            </div>
            <p className="text-2xl font-black text-violet-600">{formatCurrency(comisiones)}</p>
          </div>
        )}
        {totalCajaFuerte > 0 && (
          <div className={`${comisiones > 0 ? "" : "col-span-2"} bg-amber-50 rounded-2xl p-4`}>
            <div className="flex items-center gap-2 mb-1">
              <ArrowUpCircle className="w-4 h-4 text-amber-600" />
              <p className="text-xs text-gray-500">Guardado</p>
            </div>
            <p className="text-2xl font-black text-amber-700">{formatCurrency(totalCajaFuerte)}</p>
          </div>
        )}
      </div>

      {/* Tabla de ventas */}
      {ventas.length > 0 && (
        <div className="card mb-4 overflow-hidden p-0">
          <div className="px-4 pt-4 pb-2">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Ventas ({ventas.length})</p>
          </div>
          {/* Cabecera */}
          <div className="grid grid-cols-[2.5rem_1fr_3rem_5rem_4.5rem] gap-0 px-3 py-1.5 bg-gray-50 border-y border-gray-100 text-[10px] font-bold text-gray-400 uppercase tracking-wide">
            <span className="text-center">Cant</span>
            <span>Producto</span>
            <span className="text-center">Talla</span>
            <span className="text-right">Valor</span>
            <span className="text-center">Pago</span>
          </div>
          {/* Filas */}
          {ventas.map((r, i) => {
            const pagoColor =
              r.metodoPago === "efectivo"      ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
              r.metodoPago === "transferencia" ? "bg-blue-50 text-blue-700 border-blue-200" :
                                                 "bg-purple-50 text-purple-700 border-purple-200";
            const pagoLabel =
              r.metodoPago === "efectivo"      ? "Efe" :
              r.metodoPago === "transferencia" ? "Transf" : "Mixto";
            return (
              <div key={i} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
                <div className="grid grid-cols-[2.5rem_1fr_3rem_5rem_4.5rem] gap-0 px-3 py-2 items-center">
                  <span className="text-sm font-black text-gray-700 text-center">{r.cantidad}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate leading-tight">{r.productoRef}</p>
                    <p className="text-[10px] text-gray-400 leading-tight">{r.hora.slice(0, 5)}</p>
                  </div>
                  <span className="text-xs text-gray-500 text-center font-medium">{r.tallaNombre ?? "—"}</span>
                  <span className="text-sm font-black text-gray-900 text-right">{formatCurrency(r.valor)}</span>
                  <div className="flex justify-center">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${pagoColor}`}>
                      {pagoLabel}
                    </span>
                  </div>
                </div>
                {r.metodoPago === "mixto" && (
                  <div className="px-3 pb-2 flex gap-3 text-[10px] font-semibold">
                    <span className="text-emerald-600">Efe: {formatCurrency(r.montoEfectivo)}</span>
                    <span className="text-blue-600">Transf: {formatCurrency(r.montoTransferencia)}</span>
                  </div>
                )}
              </div>
            );
          })}
          {/* Total */}
          <div className="grid grid-cols-[2.5rem_1fr_3rem_5rem_4.5rem] gap-0 px-3 py-2.5 bg-gray-50 border-t border-gray-200">
            <span />
            <span className="text-xs font-bold text-gray-500">Total</span>
            <span />
            <span className="text-sm font-black text-green-600 text-right">{formatCurrency(totalVentas)}</span>
            <span />
          </div>
        </div>
      )}

      {gastos.length > 0 && (
        <div className="card mb-4">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Gastos</p>
          <div className="space-y-2">
            {gastos.map((r, i) => (
              <div key={i} className={`${TIPO_ROW[r.tipo]} rounded-xl px-3 py-2.5 flex justify-between items-center`}>
                <div>
                  <span className="text-sm font-semibold text-gray-900">{r.descripcion}</span>
                  <div className="text-xs text-gray-400 mt-0.5">{r.hora.slice(0, 5)} · <span className="capitalize">{r.metodoPago}</span></div>
                </div>
                <span className="font-black text-sm text-red-600 shrink-0 ml-2">−{formatCurrency(r.valor)}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-between text-sm font-bold pt-3 mt-1 border-t border-gray-100">
            <span className="text-gray-500">Total gastos</span>
            <span className="text-red-600">−{formatCurrency(totalGastos)}</span>
          </div>
        </div>
      )}

      {ingresos.length > 0 && (
        <div className="card mb-4">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Ingresos extra</p>
          <div className="space-y-2">
            {ingresos.map((r, i) => (
              <div key={i} className={`${TIPO_ROW[r.tipo]} rounded-xl px-3 py-2.5 flex justify-between items-center`}>
                <div>
                  <span className="text-sm font-semibold text-gray-900">{r.descripcion}</span>
                  <div className="text-xs text-gray-400 mt-0.5">{r.hora.slice(0, 5)}</div>
                </div>
                <span className="font-black text-sm text-blue-600 shrink-0 ml-2">+{formatCurrency(r.valor)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {cajaFuerteList.length > 0 && (
        <div className="card mb-4">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Guardado en caja fuerte</p>
          <div className="space-y-2">
            {cajaFuerteList.map((r, i) => (
              <div key={i} className={`${TIPO_ROW[r.tipo]} rounded-xl px-3 py-2.5 flex justify-between items-center`}>
                <div>
                  <span className="text-sm font-semibold text-gray-900">{r.descripcion}</span>
                  <div className="text-xs text-gray-400 mt-0.5">{r.hora.slice(0, 5)}</div>
                </div>
                <span className="font-black text-sm text-yellow-700 shrink-0 ml-2">−{formatCurrency(r.valor)}</span>
              </div>
            ))}
            <div className="flex justify-between text-sm font-bold pt-3 mt-1 border-t border-gray-100">
              <span className="text-gray-500">Total guardado</span>
              <span className="text-yellow-700">−{formatCurrency(totalCajaFuerte)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Resumen cuenta de caja */}
      <div className="card">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Cuenta de caja</p>
        <div className="space-y-2 text-sm">
          {[
            ["Saldo inicial", caja.saldo_inicial ?? 0, false],
            ["+ Ventas efectivo", ventasEfe, false],
            ["+ Ingresos extra", totalIngresos, false],
            ["− Gastos", totalGastos, true],
            ["− Caja fuerte", totalCajaFuerte, true],
          ].map(([label, val, neg]: any) => (
            <div key={label} className="flex justify-between">
              <span className="text-gray-500">{label}</span>
              <span className={`font-semibold ${neg ? "text-red-600" : "text-gray-900"}`}>
                {neg ? "−" : ""}{formatCurrency(val)}
              </span>
            </div>
          ))}
          <div className="flex justify-between font-black text-base pt-3 border-t border-gray-100">
            <span>Saldo final</span>
            <span className="text-brand-blue">{formatCurrency(caja.saldo_final ?? 0)}</span>
          </div>
          {(caja.diferencia_caja ?? 0) !== 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Diferencia conteo</span>
              <span className={`font-bold ${(caja.diferencia_caja ?? 0) > 0 ? "text-green-600" : "text-red-600"}`}>
                {(caja.diferencia_caja ?? 0) > 0 ? "+" : ""}{formatCurrency(caja.diferencia_caja ?? 0)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Elemento oculto para captura */}
      <div style={{ position: "absolute", left: -9999, top: 0 }}>
        <ReporteImpresion
          caja={caja}
          registros={registros}
          ventasEfe={ventasEfe}
          ventasTransf={ventasTransf}
          totalCajaFuerte={totalCajaFuerte}
          comisiones={comisiones}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Componente oculto para html2canvas
// ─────────────────────────────────────────────────────────────
function ReporteImpresion({ caja, registros, ventasEfe, ventasTransf, totalCajaFuerte, comisiones }: {
  caja: VResumenCaja;
  registros: RegistroLocal[];
  ventasEfe: number;
  ventasTransf: number;
  totalCajaFuerte: number;
  comisiones: number;
}) {
  const ventas  = registros.filter(r => r.tipo === "venta");
  const gastos  = registros.filter(r => r.tipo === "gasto");
  const ingresos = registros.filter(r => r.tipo === "ingreso");
  const guardadoList = registros.filter(r => r.tipo === "caja_fuerte" && r.valor > 0);
  const retiroList   = registros.filter(r => r.tipo === "caja_fuerte" && r.valor < 0);
  const totalVentas  = (caja.total_efectivo ?? 0) + (caja.total_transferencias ?? 0);
  const gastosEfe    = gastos.filter(r => r.metodoPago === "efectivo").reduce((s, r) => s + r.valor, 0);
  const ingresosEfe  = ingresos.filter(r => r.metodoPago === "efectivo").reduce((s, r) => s + r.valor, 0);
  const diferencia   = caja.diferencia_caja ?? 0;

  const kpiStyle = (bg: string): React.CSSProperties => ({
    background: bg, borderRadius: 12, padding: "12px 14px",
  });
  const kpiLabel: React.CSSProperties = { fontSize: 9, textTransform: "uppercase", color: "#9ca3af", fontWeight: 800, margin: "0 0 4px", letterSpacing: 1 };
  const rowStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", padding: "6px 10px", borderRadius: 8, marginBottom: 3, fontSize: 12 };

  return (
    <div id="reporte-detalle" style={{ width: 620, padding: 40, fontFamily: "Arial, sans-serif", background: "#fff", color: "#111", lineHeight: 1.4 }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "2px solid #e5e7eb", paddingBottom: 18, marginBottom: 20 }}>
        <div>
          <p style={{ fontSize: 26, fontWeight: 900, margin: 0 }}>Cierre de Caja</p>
          <p style={{ fontSize: 14, color: "#6b7280", margin: "4px 0 0" }}>{formatDate(caja.fecha)}</p>
        </div>
        <div style={{ textAlign: "right" }}>
          <p style={{ fontSize: 13, fontWeight: 800, color: "#003366", textTransform: "uppercase", letterSpacing: 1, margin: 0 }}>Pasión Millonaria</p>
          <p style={{ fontSize: 12, color: "#10b981", fontWeight: 700, margin: "4px 0 0" }}>✓ Verificado</p>
        </div>
      </div>

      {/* KPIs — fila 1: total ventas */}
      <div style={{ ...kpiStyle("#f0fdf4"), marginBottom: 8 }}>
        <p style={kpiLabel}>Total ventas</p>
        <p style={{ fontSize: 22, fontWeight: 900, color: "#16a34a", margin: 0 }}>{formatCurrency(totalVentas)}</p>
      </div>

      {/* KPIs — fila 2: efectivo + transferencias */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
        <div style={kpiStyle("#ecfdf5")}>
          <p style={kpiLabel}>Efectivo</p>
          <p style={{ fontSize: 17, fontWeight: 900, color: "#047857", margin: 0 }}>{formatCurrency(ventasEfe)}</p>
        </div>
        <div style={kpiStyle("#eff6ff")}>
          <p style={kpiLabel}>Transferencias</p>
          <p style={{ fontSize: 17, fontWeight: 900, color: "#1d4ed8", margin: 0 }}>{formatCurrency(ventasTransf)}</p>
        </div>
      </div>

      {/* KPIs — fila 3: en caja + comisiones (si hay) */}
      <div style={{ display: "grid", gridTemplateColumns: comisiones > 0 ? "1fr 1fr" : "1fr", gap: 8, marginBottom: 8 }}>
        <div style={kpiStyle("#f0f9ff")}>
          <p style={kpiLabel}>En caja</p>
          <p style={{ fontSize: 17, fontWeight: 900, color: "#0369a1", margin: 0 }}>{formatCurrency(caja.efectivo_contado ?? 0)}</p>
          <p style={{ fontSize: 10, color: "#94a3b8", margin: "3px 0 0" }}>Inicial: {formatCurrency(caja.saldo_inicial ?? 0)}</p>
        </div>
        {comisiones > 0 && (
          <div style={kpiStyle("#f5f3ff")}>
            <p style={kpiLabel}>Comisiones</p>
            <p style={{ fontSize: 17, fontWeight: 900, color: "#7c3aed", margin: 0 }}>{formatCurrency(comisiones)}</p>
            <p style={{ fontSize: 10, color: "#94a3b8", margin: "3px 0 0" }}>$1.000 × unid. &gt;$25.000</p>
          </div>
        )}
      </div>

      {/* KPI — guardado (si hay) */}
      {totalCajaFuerte > 0 && (
        <div style={{ ...kpiStyle("#fffbeb"), marginBottom: 8 }}>
          <p style={kpiLabel}>Guardado</p>
          <p style={{ fontSize: 17, fontWeight: 900, color: "#92400e", margin: 0 }}>{formatCurrency(totalCajaFuerte)}</p>
        </div>
      )}

      <div style={{ borderTop: "1px solid #e5e7eb", margin: "16px 0" }} />

      {/* Tabla ventas */}
      {ventas.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 10, fontWeight: 800, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 2, marginBottom: 6 }}>Ventas del día ({ventas.length})</p>
          <div style={{ display: "grid", gridTemplateColumns: "2rem 1fr 3rem 5rem 3.5rem", padding: "5px 8px", background: "#f3f4f6", borderRadius: "6px 6px 0 0", fontSize: 9, fontWeight: 800, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1 }}>
            <span style={{ textAlign: "center" }}>Cant</span>
            <span>Producto</span>
            <span style={{ textAlign: "center" }}>Talla</span>
            <span style={{ textAlign: "right" }}>Valor</span>
            <span style={{ textAlign: "center" }}>Pago</span>
          </div>
          {ventas.map((v, i) => {
            const pagoBg    = v.metodoPago === "efectivo" ? "#d1fae5" : v.metodoPago === "transferencia" ? "#dbeafe" : "#ede9fe";
            const pagoColor = v.metodoPago === "efectivo" ? "#065f46" : v.metodoPago === "transferencia" ? "#1e40af" : "#5b21b6";
            const pagoLabel = v.metodoPago === "efectivo" ? "Efe" : v.metodoPago === "transferencia" ? "Transf" : "Mixto";
            return (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "2rem 1fr 3rem 5rem 3.5rem", padding: "6px 8px", background: i % 2 === 0 ? "#fff" : "#f9fafb", borderBottom: "1px solid #f3f4f6", alignItems: "center" }}>
                <span style={{ textAlign: "center", fontWeight: 900, fontSize: 12 }}>{v.cantidad}</span>
                <span style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.productoRef}</span>
                <span style={{ textAlign: "center", fontSize: 11, color: "#6b7280" }}>{v.tallaNombre ?? "—"}</span>
                <span style={{ textAlign: "right", fontWeight: 800, fontSize: 12 }}>{formatCurrency(v.valor)}</span>
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <span style={{ background: pagoBg, color: pagoColor, fontSize: 9, fontWeight: 800, padding: "2px 4px", borderRadius: 4 }}>{pagoLabel}</span>
                </div>
              </div>
            );
          })}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 8px", background: "#f0fdf4", borderRadius: "0 0 6px 6px", fontSize: 12, fontWeight: 800 }}>
            <span style={{ color: "#6b7280" }}>Total ventas</span>
            <span style={{ color: "#059669" }}>{formatCurrency(totalVentas)}</span>
          </div>
        </div>
      )}

      {/* Gastos */}
      {gastos.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 10, fontWeight: 800, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 2, marginBottom: 6 }}>Gastos</p>
          {gastos.map((g, i) => (
            <div key={i} style={{ ...rowStyle, background: "#fff5f5" }}>
              <span style={{ fontWeight: 600 }}>{g.descripcion}</span>
              <span style={{ fontWeight: 800, color: "#dc2626" }}>− {formatCurrency(g.valor)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Ingresos extra */}
      {ingresos.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 10, fontWeight: 800, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 2, marginBottom: 6 }}>Ingresos extra</p>
          {ingresos.map((g, i) => (
            <div key={i} style={{ ...rowStyle, background: "#eff6ff" }}>
              <span style={{ fontWeight: 600 }}>{g.descripcion}</span>
              <span style={{ fontWeight: 800, color: "#1d4ed8" }}>+ {formatCurrency(g.valor)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Guardado / Retiros */}
      {(guardadoList.length > 0 || retiroList.length > 0) && (
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 10, fontWeight: 800, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 2, marginBottom: 6 }}>Guardado / Retiros</p>
          {guardadoList.map((g, i) => (
            <div key={i} style={{ ...rowStyle, background: "#fefce8" }}>
              <span style={{ fontWeight: 600 }}>{g.descripcion}</span>
              <span style={{ fontWeight: 800, color: "#92400e" }}>− {formatCurrency(g.valor)}</span>
            </div>
          ))}
          {retiroList.map((g, i) => (
            <div key={i} style={{ ...rowStyle, background: "#fff7ed" }}>
              <span style={{ fontWeight: 600 }}>{g.descripcion}</span>
              <span style={{ fontWeight: 800, color: "#ea580c" }}>+ {formatCurrency(Math.abs(g.valor))}</span>
            </div>
          ))}
        </div>
      )}

      {/* Cuenta de caja */}
      <div style={{ borderTop: "2px solid #e5e7eb", paddingTop: 16 }}>
        <p style={{ fontSize: 10, fontWeight: 800, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 2, marginBottom: 10 }}>Cuenta de caja</p>
        <div style={{ background: "#eff6ff", borderRadius: 12, padding: 14 }}>
          {([
            ["Saldo inicial",          caja.saldo_inicial ?? 0, false],
            ["+ Ventas efectivo",      ventasEfe,               false],
            ["+ Ingresos extra (efe)", ingresosEfe,             false],
            ["− Gastos efectivo",      gastosEfe,               true],
            ["− Guardado",             totalCajaFuerte,         true],
          ] as [string, number, boolean][]).map(([lbl, val, neg]) => (
            <div key={lbl} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4, color: neg ? "#dc2626" : "#374151" }}>
              <span>{lbl}</span>
              <span style={{ fontWeight: 700 }}>{neg ? "− " : ""}{formatCurrency(val)}</span>
            </div>
          ))}
          <div style={{ borderTop: "1px solid #bfdbfe", paddingTop: 8, marginTop: 6, display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 900, fontSize: 13, color: "#1d4ed8" }}>En caja</span>
            <span style={{ fontWeight: 900, fontSize: 16, color: "#1d4ed8" }}>{formatCurrency(caja.efectivo_contado ?? 0)}</span>
          </div>
          {diferencia !== 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, color: diferencia > 0 ? "#059669" : "#dc2626" }}>
              <span style={{ fontSize: 12 }}>Diferencia conteo</span>
              <span style={{ fontWeight: 800, fontSize: 13 }}>{diferencia > 0 ? "+" : ""}{formatCurrency(diferencia)}</span>
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: 20, paddingTop: 14, borderTop: "1px solid #f3f4f6", textAlign: "center" }}>
        <p style={{ fontSize: 9, color: "#d1d5db", textTransform: "uppercase", letterSpacing: "0.2em", fontWeight: 700, margin: 0 }}>
          Generado por Pasión Millonaria POS System
        </p>
      </div>
    </div>
  );
}
