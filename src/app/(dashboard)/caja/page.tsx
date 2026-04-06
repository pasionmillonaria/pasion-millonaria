"use client";

import { useEffect, useState } from "react";
import { LayoutDashboard, Plus, Lock, ChevronDown, ChevronUp } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/lib/context/ProfileContext";
import { formatCurrency, formatDate, LABELS_METODO_PAGO } from "@/lib/utils";
import type { Gasto, CajaDiaria, CategoriaGasto, MetodoPago } from "@/lib/types";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";
import Spinner from "@/components/ui/Spinner";
import toast from "react-hot-toast";

const CATEGORIAS_GASTO: { value: CategoriaGasto; label: string }[] = [
  { value: "alimentacion", label: "Alimentación" },
  { value: "transporte", label: "Transporte" },
  { value: "insumos", label: "Insumos" },
  { value: "servicios", label: "Servicios" },
  { value: "caja_fuerte", label: "Caja Fuerte" },
  { value: "otro", label: "Otro" },
];

const METODOS: { value: MetodoPago; label: string }[] = [
  { value: "efectivo", label: "Efectivo" },
  { value: "nequi", label: "Nequi" },
  { value: "transferencia", label: "Transferencia" },
];

export default function CajaPage() {
  const supabase = createClient();
  const { isAdmin } = useProfile();

  const [resumen, setResumen] = useState<{ metodo_pago: string; total: number; cantidad: number }[]>([]);
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [historial, setHistorial] = useState<CajaDiaria[]>([]);
  const [cajaHoy, setCajaHoy] = useState<CajaDiaria | null>(null);
  const [loading, setLoading] = useState(true);
  const [mostrarHistorial, setMostrarHistorial] = useState(false);

  const [modalGasto, setModalGasto] = useState(false);
  const [gastoConcepto, setGastoConcepto] = useState("");
  const [gastoMonto, setGastoMonto] = useState("");
  const [gastoCategoria, setGastoCategoria] = useState<CategoriaGasto>("otro");
  const [gastoMetodo, setGastoMetodo] = useState<MetodoPago>("efectivo");
  const [loadingGasto, setLoadingGasto] = useState(false);

  const [modalCerrar, setModalCerrar] = useState(false);
  const [saldoInicial, setSaldoInicial] = useState("");
  const [guardadoCajaFuerte, setGuardadoCajaFuerte] = useState("");
  const [loadingCerrar, setLoadingCerrar] = useState(false);

  async function cargarDatos() {
    setLoading(true);
    const hoy = new Date().toISOString().slice(0, 10);

    const [{ data: res }, { data: gas }, { data: hist }, { data: cajaAbierta }] = await Promise.all([
      supabase.from("v_resumen_caja_hoy").select("*"),
      supabase.from("gastos").select("*").gte("fecha", hoy + "T00:00:00").order("fecha", { ascending: false }),
      supabase.from("caja_diaria").select("*").order("fecha", { ascending: false }).limit(10),
      supabase.from("caja_diaria").select("*").eq("fecha", hoy).eq("estado", "abierta").maybeSingle(),
    ]);

    setResumen(res ?? []);
    setGastos(gas ?? []);
    setHistorial(hist ?? []);
    setCajaHoy(cajaAbierta ?? null);
    setLoading(false);
  }

  useEffect(() => { cargarDatos(); }, []);

  if (!isAdmin) {
    return (
      <div className="max-w-lg mx-auto px-4 pt-20 text-center">
        <Lock className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-gray-700">Acceso restringido</h2>
        <p className="text-gray-400 mt-2">Solo el administrador puede ver la caja.</p>
      </div>
    );
  }

  const totalVentas = resumen.reduce((s, r) => s + r.total, 0);
  const totalGastos = gastos.reduce((s, g) => s + g.monto, 0);
  const efectivoHoy = resumen.find(r => r.metodo_pago === "efectivo")?.total ?? 0;
  const gastosEfectivo = gastos.filter(g => g.metodo_pago === "efectivo").reduce((s, g) => s + g.monto, 0);

  async function agregarGasto() {
    const monto = parseFloat(gastoMonto);
    if (!gastoConcepto.trim() || !monto) { toast.error("Completa todos los campos"); return; }
    setLoadingGasto(true);
    const { error } = await supabase.from("gastos").insert({
      concepto: gastoConcepto.trim(),
      monto,
      categoria: gastoCategoria,
      metodo_pago: gastoMetodo,
      registrado_por: null,
    });
    if (error) { toast.error("Error: " + error.message); setLoadingGasto(false); return; }
    toast.success("Gasto registrado");
    setModalGasto(false);
    setGastoConcepto(""); setGastoMonto("");
    await cargarDatos();
    setLoadingGasto(false);
  }

  async function cerrarCaja() {
    const saldoIni = parseFloat(saldoInicial) || 0;
    const guardado = parseFloat(guardadoCajaFuerte) || 0;
    const hoy = new Date().toISOString().slice(0, 10);

    const totalEfe = resumen.find(r => r.metodo_pago === "efectivo")?.total ?? 0;
    const totalNequi = resumen.find(r => r.metodo_pago === "nequi")?.total ?? 0;
    const totalTransf = resumen.find(r => r.metodo_pago === "transferencia")?.total ?? 0;
    const totalDatafono = resumen.find(r => r.metodo_pago === "datafono")?.total ?? 0;
    const cantVentas = resumen.reduce((s, r) => s + r.cantidad, 0);
    const saldoFinal = saldoIni + totalEfe - gastosEfectivo - guardado;

    setLoadingCerrar(true);
    const { error } = await supabase.from("caja_diaria").upsert({
      ...(cajaHoy ? { id: cajaHoy.id } : {}),
      fecha: hoy,
      saldo_inicial: saldoIni,
      total_efectivo: totalEfe,
      total_nequi: totalNequi,
      total_transferencias: totalTransf,
      total_datafono: totalDatafono,
      total_descuentos: 0,
      total_devoluciones: 0,
      total_gastos: totalGastos,
      guardado_caja_fuerte: guardado,
      saldo_final: saldoFinal,
      cantidad_ventas: cantVentas,
      estado: "cerrada",
    });

    if (error) { toast.error("Error: " + error.message); setLoadingCerrar(false); return; }
    toast.success("¡Caja cerrada!");
    setModalCerrar(false);
    await cargarDatos();
    setLoadingCerrar(false);
  }

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-8 pt-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <LayoutDashboard className="w-6 h-6 text-brand-blue" />
          <h1 className="text-xl font-bold text-gray-900">Caja del día</h1>
        </div>
        <p className="text-sm text-gray-500">{formatDate(new Date().toISOString())}</p>
      </div>

      {loading ? <Spinner className="py-16" /> : (
        <>
          {/* Ventas por método */}
          <div className="card mb-4">
            <h3 className="font-bold text-gray-700 mb-3">Ventas del día</h3>
            {resumen.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-3">Sin ventas hoy</p>
            ) : (
              <div className="space-y-2">
                {resumen.map(r => (
                  <div key={r.metodo_pago} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
                    <div>
                      <span className="font-semibold text-gray-800">{LABELS_METODO_PAGO[r.metodo_pago] ?? r.metodo_pago}</span>
                      <span className="text-xs text-gray-400 ml-2">({r.cantidad})</span>
                    </div>
                    <span className="font-bold">{formatCurrency(r.total)}</span>
                  </div>
                ))}
                <div className="flex justify-between pt-2 border-t-2 border-gray-200">
                  <span className="font-bold">Total ventas</span>
                  <span className="font-bold text-xl text-brand-blue">{formatCurrency(totalVentas)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Gastos */}
          <div className="card mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-gray-700">Gastos del día</h3>
              <button onClick={() => setModalGasto(true)} className="flex items-center gap-1 text-red-600 text-sm font-medium">
                <Plus className="w-4 h-4" /> Agregar
              </button>
            </div>
            {gastos.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-3">Sin gastos hoy</p>
            ) : (
              <div className="space-y-2">
                {gastos.map(g => (
                  <div key={g.id} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
                    <div>
                      <p className="font-semibold text-sm">{g.concepto}</p>
                      <p className="text-xs text-gray-400">{g.categoria} · {g.metodo_pago}</p>
                    </div>
                    <span className="font-bold text-red-600">{formatCurrency(g.monto)}</span>
                  </div>
                ))}
                <div className="flex justify-between pt-2 border-t border-gray-100">
                  <span className="font-bold text-gray-700">Total gastos</span>
                  <span className="font-bold text-red-600">{formatCurrency(totalGastos)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Efectivo en caja */}
          <div className="bg-brand-blue rounded-2xl p-5 mb-4 text-white">
            <h3 className="font-semibold mb-3 opacity-80">Efectivo disponible</h3>
            <div className="flex justify-between text-sm opacity-80 mb-1">
              <span>Efectivo vendido hoy</span><span>{formatCurrency(efectivoHoy)}</span>
            </div>
            <div className="flex justify-between text-sm opacity-80 mb-2">
              <span>Gastos en efectivo</span><span>- {formatCurrency(gastosEfectivo)}</span>
            </div>
            <div className="flex justify-between text-xl font-bold border-t border-white/30 pt-2">
              <span>Disponible</span><span>{formatCurrency(efectivoHoy - gastosEfectivo)}</span>
            </div>
          </div>

          <Button variant="danger" className="w-full mb-4" size="lg" onClick={() => setModalCerrar(true)}>
            <Lock className="w-5 h-5" /> Cerrar Caja del Día
          </Button>

          {/* Historial */}
          <button onClick={() => setMostrarHistorial(!mostrarHistorial)} className="flex items-center justify-between w-full card mb-3">
            <span className="font-bold text-gray-700">Historial de cierres</span>
            {mostrarHistorial ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
          </button>
          {mostrarHistorial && (
            <div className="space-y-2 mb-6">
              {historial.filter(c => c.estado === "cerrada").map(c => (
                <div key={c.id} className="card">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-bold">{formatDate(c.fecha)}</p>
                      <p className="text-xs text-gray-400">{c.cantidad_ventas} ventas</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-brand-blue">{formatCurrency(c.saldo_final)}</p>
                      <Badge variant="success">cerrada</Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Modal gasto */}
      <Modal open={modalGasto} onClose={() => setModalGasto(false)} title="Nuevo Gasto">
        <div className="space-y-4">
          <div>
            <label className="label">Concepto</label>
            <input type="text" value={gastoConcepto} onChange={e => setGastoConcepto(e.target.value)} className="input" placeholder="Descripción..." />
          </div>
          <div>
            <label className="label">Monto</label>
            <input type="number" value={gastoMonto} onChange={e => setGastoMonto(e.target.value)} className="input" placeholder="0" />
          </div>
          <div>
            <label className="label">Categoría</label>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORIAS_GASTO.map(c => (
                <button key={c.value} onClick={() => setGastoCategoria(c.value)}
                  className={`py-2 rounded-xl text-sm font-medium ${gastoCategoria === c.value ? "bg-brand-blue text-white" : "bg-gray-100 text-gray-600"}`}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Método</label>
            <div className="grid grid-cols-3 gap-2">
              {METODOS.map(m => (
                <button key={m.value} onClick={() => setGastoMetodo(m.value)}
                  className={`py-2 rounded-xl text-sm font-medium ${gastoMetodo === m.value ? "bg-brand-blue text-white" : "bg-gray-100 text-gray-600"}`}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <Button className="w-full" onClick={agregarGasto} loading={loadingGasto}>Guardar Gasto</Button>
        </div>
      </Modal>

      {/* Modal cerrar caja */}
      <Modal open={modalCerrar} onClose={() => setModalCerrar(false)} title="Cerrar Caja">
        <div className="space-y-4">
          <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-600">Total ventas</span><span className="font-bold">{formatCurrency(totalVentas)}</span></div>
            <div className="flex justify-between"><span className="text-gray-600">Total gastos</span><span className="font-bold text-red-600">{formatCurrency(totalGastos)}</span></div>
          </div>
          <div>
            <label className="label">Saldo inicial (efectivo apertura)</label>
            <input type="number" value={saldoInicial} onChange={e => setSaldoInicial(e.target.value)} className="input" placeholder="0" />
          </div>
          <div>
            <label className="label">Guardado en caja fuerte</label>
            <input type="number" value={guardadoCajaFuerte} onChange={e => setGuardadoCajaFuerte(e.target.value)} className="input" placeholder="0" />
          </div>
          <div className="bg-brand-blue text-white rounded-xl p-4">
            <div className="flex justify-between text-lg font-bold">
              <span>Saldo final en caja</span>
              <span>{formatCurrency((parseFloat(saldoInicial) || 0) + efectivoHoy - gastosEfectivo - (parseFloat(guardadoCajaFuerte) || 0))}</span>
            </div>
          </div>
          <Button variant="danger" className="w-full" onClick={cerrarCaja} loading={loadingCerrar}>
            <Lock className="w-5 h-5" /> Confirmar Cierre
          </Button>
        </div>
      </Modal>
      <div className="h-4" />
    </div>
  );
}
