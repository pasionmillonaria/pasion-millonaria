"use client";

import { CheckCircle, AlertCircle, TrendingUp, TrendingDown, Wallet, Shield } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Movimiento, Gasto, CajaDiaria } from "@/lib/types";

interface CierreResumenProps {
  fecha: string;
  ventas: any[]; // Using any for now to avoid complex type issues with joined data
  gastos: Gasto[];
  otrosIngresos: any[];
  caja: {
    inicial: number;
    ventasEfe: number;
    gastos: number;
    retiros: number;
    otros: number;
    esperado: number;
    contado: number;
    diferencia: number;
  };
  guardado: {
    inicial: number;
    entradas: number;
    esperado: number;
  };
}

export default function CierreResumen({ fecha, ventas, gastos, otrosIngresos, caja, guardado }: CierreResumenProps) {
  const totalVendido = ventas.reduce((s, v) => s + (v.total || v.precio_venta * (v.cantidad || 1)), 0);
  const totalTransf = ventas.reduce((s, v) => s + (v.monto_transferencia || (v.metodo_pago === "transferencia" ? v.total : 0)), 0);
  const totalEfe = totalVendido - totalTransf;

  return (
    <div id="cierre-reporte" className="bg-white p-8 rounded-3xl border border-gray-100 shadow-2xl max-w-2xl mx-auto font-sans">
      {/* Header */}
      <div className="flex justify-between items-start mb-8 pb-6 border-b border-gray-100">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Cierre de Caja</h1>
          <p className="text-gray-500 font-medium">{formatDate(fecha)}</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold text-brand-blue uppercase tracking-wider">Pasión Millonaria</p>
          <div className="flex items-center gap-1 text-green-600 justify-end mt-1">
            <CheckCircle className="w-4 h-4" />
            <span className="text-xs font-bold uppercase">Verificado</span>
          </div>
        </div>
      </div>

      {/* Main Totals */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-gray-50 p-4 rounded-2xl">
          <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Total Ventas</p>
          <p className="text-xl font-black text-gray-900">{formatCurrency(totalVendido)}</p>
        </div>
        <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100">
          <p className="text-[10px] font-bold text-blue-400 uppercase mb-1">Transferencias</p>
          <p className="text-xl font-black text-blue-700">{formatCurrency(totalTransf)}</p>
        </div>
        <div className="bg-green-50 p-4 rounded-2xl border border-green-100">
          <p className="text-[10px] font-bold text-green-400 uppercase mb-1">Efectivo Total</p>
          <p className="text-xl font-black text-green-700">{formatCurrency(totalEfe)}</p>
        </div>
      </div>

      {/* Details Sections */}
      <div className="space-y-6">
        {/* Ventas Detalladas */}
        <div>
          <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-brand-blue" /> Desglose de Ventas
          </h3>
          <div className="space-y-2">
            {ventas.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No se registraron ventas.</p>
            ) : (
              ventas.map((v, i) => (
                <div key={i} className="flex justify-between items-center text-sm py-2 px-3 bg-gray-50/50 rounded-xl">
                  <div>
                    <p className="font-bold text-gray-800">{v.cantidad}x {v.referencia || "Venta"}</p>
                    <p className="text-[10px] text-gray-400 font-medium">Talla: {v.talla || "N/A"} · {v.metodo_pago}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-black text-gray-900">{formatCurrency(v.total)}</p>
                    {v.monto_transferencia > 0 && v.monto_efectivo > 0 && (
                      <p className="text-[10px] text-gray-400 font-bold">
                        T: {formatCurrency(v.monto_transferencia)} | E: {formatCurrency(v.monto_efectivo)}
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Gastos / Otros */}
        <div>
          <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-red-400" /> Gastos y Otros Movimientos
          </h3>
          <div className="space-y-2">
            {[...gastos, ...otrosIngresos].length === 0 ? (
              <p className="text-sm text-gray-400 italic">No hubo gastos ni otros movimientos.</p>
            ) : (
              [...gastos, ...otrosIngresos].map((m, i) => (
                <div key={i} className="flex justify-between items-center text-sm py-2 px-3 bg-gray-50/30 rounded-xl">
                  <div>
                    <p className="font-bold text-gray-800">{m.concepto}</p>
                    <p className="text-[10px] text-gray-400 font-medium">{m.categoria || "Ingreso"}</p>
                  </div>
                  <span className={`font-black ${m.monto < 0 || m.tipo === 'salida' ? 'text-red-500' : 'text-green-500'}`}>
                    {formatCurrency(Math.abs(m.monto))}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Settlement Final */}
        <div className="pt-6 border-t border-gray-100 flex gap-4">
          {/* Columna CAJA (EFECTIVO DIARIO) */}
          <div className="flex-1 bg-gradient-to-br from-brand-blue/5 to-brand-blue/10 p-5 rounded-3xl border border-brand-blue/10">
            <h4 className="text-[10px] font-black text-brand-blue uppercase mb-4 flex items-center gap-2">
              <Wallet className="w-4 h-4" /> Resumen Caja
            </h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-gray-500 font-medium"><span>Saldo Inicial</span> <span>{formatCurrency(caja.inicial)}</span></div>
              <div className="flex justify-between text-gray-800 font-bold"><span>Ventas Efectivo</span> <span>+ {formatCurrency(caja.ventasEfe)}</span></div>
              <div className="flex justify-between text-red-500 font-bold"><span>Gastos/Retiros</span> <span>- {formatCurrency(caja.gastos + caja.retiros)}</span></div>
              <div className="flex justify-between items-center pt-3 mt-3 border-t border-brand-blue/20 text-brand-blue">
                <span className="font-black text-xs uppercase tracking-tighter">Debe Haber</span>
                <span className="text-xl font-black">{formatCurrency(caja.esperado)}</span>
              </div>
              <div className="flex justify-between items-center pt-1 text-gray-500">
                <span className="font-bold text-xs uppercase tracking-tighter italic">Contado Real</span>
                <span className="text-lg font-black">{formatCurrency(caja.contado)}</span>
              </div>
              {caja.diferencia !== 0 && (
                <div className={`flex justify-between items-center pt-2 mt-2 border-t border-dashed border-gray-200 ${caja.diferencia > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  <span className="font-black text-xs uppercase italic">Diferencia</span>
                  <span className="font-black">{caja.diferencia > 0 ? '+' : ''}{formatCurrency(caja.diferencia)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Columna GUARDADO */}
          <div className="flex-1 bg-gray-900 p-5 rounded-3xl text-white shadow-xl">
            <h4 className="text-[10px] font-black text-white/50 uppercase mb-4 flex items-center gap-2">
              <Shield className="w-4 h-4 text-brand-blue" /> Acumulado Guardado
            </h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-white/60 font-medium"><span>Saldo Inicial</span> <span>{formatCurrency(guardado.inicial)}</span></div>
              <div className="flex justify-between text-brand-blue font-bold"><span>Entradas hoy</span> <span>+ {formatCurrency(guardado.entradas)}</span></div>
              <div className="flex justify-between items-center pt-4 mt-4 border-t border-white/10">
                <span className="font-black text-xs uppercase tracking-tighter text-white/70">Total Guardado</span>
                <span className="text-2xl font-black text-white">{formatCurrency(guardado.esperado)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Branding */}
      <div className="mt-8 pt-6 border-t border-gray-50 text-center">
        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-[0.2em]">Generado por Pasión Millonaria POS System</p>
      </div>
    </div>
  );
}
