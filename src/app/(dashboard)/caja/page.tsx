"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { 
  LayoutDashboard, 
  Plus, 
  Lock, 
  ChevronDown, 
  ChevronUp, 
  Download, 
  RefreshCcw,
  Wallet,
  Shield,
  ArrowRightLeft,
  CheckCircle2
} from "lucide-react";
import html2canvas from "html2canvas";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/lib/context/UserContext";
import { formatCurrency, formatDate, LABELS_METODO_PAGO } from "@/lib/utils";
import type { Gasto, CajaDiaria, CategoriaGasto, MetodoPago, Producto, Talla } from "@/lib/types";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";
import Spinner from "@/components/ui/Spinner";
import ExcelRow from "@/components/ExcelRow";
import CierreResumen from "@/components/CierreResumen";
import toast from "react-hot-toast";

const CATEGORIAS_GASTO: { value: CategoriaGasto; label: string }[] = [
  { value: "alimentacion", label: "Alimentación" },
  { value: "transporte", label: "Transporte" },
  { value: "insumos", label: "Insumos" },
  { value: "servicios", label: "Servicios" },
  { value: "caja_fuerte", label: "Guardado" },
  { value: "otro", label: "Otro" },
];

const isUUID = (str: string | null | undefined): boolean => 
  !!(str && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str));

export default function CajaPage() {
  const supabase = createClient();
  const { user, isAdmin } = useUser();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [tallas, setTallas] = useState<Talla[]>([]);
  
  const [ventas, setVentas] = useState<any[]>([]);
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [cajaHoy, setCajaHoy] = useState<CajaDiaria | null>(null);
  const [saldoAnt, setSaldoAnt] = useState({ caja: 0, guardado: 0 });
  
  const [contadoReal, setContadoReal] = useState<string>("");
  const [retiroGuardado, setRetiroGuardado] = useState<string>("");
  
  const [mostrarHistorial, setMostrarHistorial] = useState(false);
  const [historial, setHistorial] = useState<CajaDiaria[]>([]);
  
  const [modalGasto, setModalGasto] = useState(false);
  const [gastoForm, setGastoForm] = useState({ concepto: "", monto: "", categoria: "otro" as CategoriaGasto });
  const [loadingAction, setLoadingAction] = useState(false);

  async function cargarDatos() {
    setLoading(true);
    const hoy = new Date().toISOString().slice(0, 10);
    
    // 1. Productos y Tallas para el Excel
    const [{ data: prods }, { data: tals }] = await Promise.all([
      supabase.from("productos").select("*").eq("activo", true),
      supabase.from("tallas").select("*")
    ]);
    setProductos(prods ?? []);
    setTallas(tals ?? []);

    // 2. Ventas de hoy (Movimientos)
    // Intentamos obtener montos e/t de la nota si no existen columnas
    const { data: movs } = await supabase
      .from("movimientos")
      .select(`
        id, cantidad, precio_venta, descuento, metodo_pago, nota,
        productos(referencia),
        tallas(nombre)
      `)
      .eq("tipo", "salida")
      .gte("fecha", hoy + "T00:00:00")
      .order("fecha", { ascending: false });

    const parsedVentas = (movs ?? []).map(m => {
      let e = 0, t = 0;
      if (m.metodo_pago === "efectivo") e = (m.precio_venta! - (m.descuento || 0)) * m.cantidad;
      else if (m.metodo_pago === "transferencia") t = (m.precio_venta! - (m.descuento || 0)) * m.cantidad;
      else if (m.nota?.startsWith("{")) {
        try {
          const p = JSON.parse(m.nota);
          e = p.e || 0; t = p.t || 0;
        } catch(err) {}
      }
      
      const prod = Array.isArray(m.productos) ? m.productos[0] : m.productos;
      const tal = Array.isArray(m.tallas) ? m.tallas[0] : m.tallas;

      return {
        ...m,
        referencia: (prod as any)?.referencia,
        talla: (tal as any)?.nombre,
        total: (m.precio_venta! - (m.descuento || 0)) * m.cantidad,
        monto_efectivo: e,
        monto_transferencia: t
      };
    });
    setVentas(parsedVentas);

    // 3. Gastos
    const { data: gas } = await supabase
      .from("gastos")
      .select("*")
      .gte("fecha", hoy + "T00:00:00")
      .order("fecha", { ascending: false });
    setGastos(gas ?? []);

    // 4. Caja Diaria y Saldo Anterior
    const { data: cajaAbierta } = await supabase
      .from("caja_diaria")
      .select("*")
      .eq("fecha", hoy)
      .eq("estado", "abierta")
      .single();
    setCajaHoy(cajaAbierta ?? null);

    const { data: ultimoCierre } = await supabase
      .from("caja_diaria")
      .select("*")
      .eq("estado", "cerrada")
      .lt("fecha", hoy)
      .order("fecha", { ascending: false })
      .limit(1);

    if (ultimoCierre?.[0]) {
      setSaldoAnt({ 
        caja: ultimoCierre[0].saldo_final, 
        guardado: ultimoCierre[0].guardado_caja_fuerte || 0 
      });
    }

    setLoading(false);
  }

  useEffect(() => { cargarDatos(); }, []);

  if (!isAdmin) {
    return (
      <div className="max-w-lg mx-auto px-4 pt-20 text-center">
        <Lock className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-gray-700">Acceso restringido</h2>
        <p className="text-gray-400 mt-2">Solo los administradores pueden ver la caja.</p>
      </div>
    );
  }

  const handleSaveVenta = async (data: any) => {
    setLoadingAction(true);
    // Usamos 'nota' para guardar el desglose si es mixto
    const notaString = data.metodo_pago === "mixto" 
      ? JSON.stringify({ e: data.monto_efectivo, t: data.monto_transferencia })
      : "";

    const { error } = await supabase.from("movimientos").insert({
      producto_id: Number(data.producto_id),
      talla_id: Number(data.talla_id),
      cantidad: Number(data.cantidad),
      precio_venta: Number(data.precio_venta),
      metodo_pago: data.metodo_pago as MetodoPago,
      nota: notaString || null,
      tipo: "salida",
      canal: "venta_tienda",
      usuario_id: isUUID(user?.id) ? user?.id : null,
      ubicacion_id: 1
    });

    if (error) { toast.error("Error: " + error.message); }
    else { toast.success("Venta guardada"); await cargarDatos(); }
    setLoadingAction(false);
  };

  const handleAgregarGasto = async () => {
    const monto = parseFloat(gastoForm.monto);
    if (!gastoForm.concepto || !monto) return;
    setLoadingAction(true);
    const { error } = await supabase.from("gastos").insert({
      concepto: gastoForm.concepto,
      monto: Number(monto),
      categoria: gastoForm.categoria,
      metodo_pago: "efectivo",
      registrado_por: isUUID(user?.id) ? user?.id : null
    });
    if (error) toast.error(error.message);
    else { toast.success("Gasto registrado"); setGastoForm({ concepto: "", monto: "", categoria: "otro" }); setModalGasto(false); await cargarDatos(); }
    setLoadingAction(false);
  };

  const exportarImagen = async () => {
    const el = document.getElementById("cierre-reporte");
    if (!el) return;
    setLoadingAction(true);
    const canvas = await html2canvas(el, { scale: 2 });
    const link = document.createElement("a");
    link.download = `cierre_${new Date().toISOString().slice(0, 10)}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    setLoadingAction(false);
    toast.success("Imagen descargada");
  };

  // Cálculos
  const totalVentasEfe = ventas.reduce((s, v) => s + v.monto_efectivo, 0);
  const totalGastosEfe = gastos.reduce((s, g) => s + g.monto, 0);
  const totalRetiros = parseFloat(retiroGuardado) || 0;
  
  const cajaEsperado = saldoAnt.caja + totalVentasEfe - totalGastosEfe - totalRetiros;
  const guardadoEsperado = saldoAnt.guardado + totalRetiros;
  
  const handleCerrarDia = async () => {
    if (!contadoReal) return;
    setLoadingAction(true);
    const hoy = new Date().toISOString().slice(0, 10);
    
    const { error } = await supabase.from("caja_diaria").upsert({
      ...(cajaHoy ? { id: cajaHoy.id } : {}),
      fecha: hoy,
      saldo_inicial: saldoAnt.caja,
      total_efectivo: totalVentasEfe,
      total_transferencias: ventas.reduce((s,v) => s + v.monto_transferencia, 0),
      total_gastos: totalGastosEfe,
      guardado_caja_fuerte: guardadoEsperado, // Saldo final en guardado
      saldo_final: parseFloat(contadoReal), // Lo que realmente se contó queda como saldo para mañana
      cantidad_ventas: ventas.length,
      estado: "cerrada",
    });

    if (error) toast.error("Error al cerrar: " + error.message);
    else { toast.success("¡Cierre de día exitoso!"); await cargarDatos(); }
    setLoadingAction(false);
  };

  const diferencia = (parseFloat(contadoReal) || 0) - cajaEsperado;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header Interactivo */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 bg-brand-blue/10 rounded-xl flex items-center justify-center">
              <LayoutDashboard className="w-6 h-6 text-brand-blue" />
            </div>
            <h1 className="text-2xl font-black text-gray-900 tracking-tight">Registro de Caja</h1>
          </div>
          <p className="text-gray-400 font-medium ml-13 flex items-center gap-2">
            Hoy: {formatDate(new Date().toISOString())}
            <RefreshCcw className="w-3 h-3 cursor-pointer hover:rotate-180 transition-transform" onClick={cargarDatos} />
          </p>
        </div>
        
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setModalGasto(true)}>
            <Plus className="w-4 h-4" /> Gasto
          </Button>
          <Button onClick={exportarImagen} disabled={loadingAction}>
            <Download className="w-4 h-4" /> Reporte
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Columna Izquierda: Tabla Excel */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-gray-50 flex justify-between items-center bg-gray-50/30">
                <h3 className="font-bold text-gray-800 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                  Ventas en Tiempo Real
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 text-[10px] font-black uppercase text-gray-400 tracking-widest border-b border-gray-100">
                      <th className="p-4 w-16 text-center">Cant</th>
                      <th className="p-4">Producto / Referencia</th>
                      <th className="p-4 w-24">Talla</th>
                      <th className="p-4 w-32 text-right">Total</th>
                      <th className="p-4 w-32 text-right">Transf</th>
                      <th className="p-4 w-32 text-right">Efectivo</th>
                      <th className="p-4 w-16"></th>
                    </tr>
                  </thead>
                  <tbody>
                    <ExcelRow 
                      productos={productos} 
                      tallas={tallas} 
                      onSave={handleSaveVenta} 
                      loading={loadingAction}
                    />
                    {ventas.map((v, i) => (
                      <tr key={v.id || i} className="border-b border-gray-50 text-sm">
                        <td className="p-4 text-center font-bold text-gray-900">{v.cantidad}</td>
                        <td className="p-4">
                          <p className="font-semibold text-gray-800">{v.referencia}</p>
                          <p className="text-[10px] text-gray-400 font-bold uppercase">{v.metodo_pago}</p>
                        </td>
                        <td className="p-4 text-center text-gray-500">{v.talla}</td>
                        <td className="p-4 text-right font-black text-gray-900">{formatCurrency(v.total)}</td>
                        <td className="p-4 text-right text-blue-500 font-medium">{formatCurrency(v.monto_transferencia)}</td>
                        <td className="p-4 text-right text-green-600 font-medium">{formatCurrency(v.monto_efectivo)}</td>
                        <td className="p-4 text-center">
                          <CheckCircle2 className="w-4 h-4 text-green-400 mx-auto" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Otros Movimientos y Gastos */}
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6">
              <h3 className="font-bold text-gray-800 mb-4">Otros Movimientos y Gastos</h3>
              <div className="space-y-3">
                {gastos.length === 0 && <p className="text-sm text-gray-400 italic">No hay gastos hoy.</p>}
                {gastos.map(g => (
                  <div key={g.id} className="flex justify-between items-center p-3 rounded-2xl bg-red-50/50 border border-red-100">
                    <div>
                      <p className="font-bold text-gray-900 text-sm">{g.concepto}</p>
                      <p className="text-[10px] font-black text-red-400 uppercase tracking-tighter">{g.categoria}</p>
                    </div>
                    <span className="font-black text-red-600">{formatCurrency(g.monto)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Columna Derecha: Liquidación */}
          <div className="space-y-6">
            <div className="bg-gray-900 rounded-3xl p-6 text-white shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                    <Wallet className="w-20 h-20" />
                </div>
              <h3 className="text-xs font-black uppercase tracking-widest text-white/50 mb-6 flex items-center gap-2">
                <RefreshCcw className="w-4 h-4" /> Liquidación Diaria
              </h3>
              
              <div className="space-y-4">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-white/60 font-medium">Saldo Inicial Caja</span>
                  <span className="font-bold">{formatCurrency(saldoAnt.caja)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                   <span className="text-white/60 font-medium">Retiro p/ Guardar</span>
                   <input 
                    type="number" 
                    value={retiroGuardado} 
                    onChange={e => setRetiroGuardado(e.target.value)}
                    placeholder="0"
                    className="w-24 bg-white/10 border-none rounded-lg p-1 text-right text-sm focus:ring-1 focus:ring-brand-blue" 
                   />
                </div>
                
                <div className="pt-4 border-t border-white/10 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-brand-blue text-xs font-black uppercase">Debería haber</span>
                    <span className="text-2xl font-black">{formatCurrency(cajaEsperado)}</span>
                  </div>
                  
                  <div className="pt-2">
                    <label className="text-[10px] font-black text-white/40 uppercase mb-1 block tracking-wider">Contado en efectivo</label>
                    <input 
                      type="number" 
                      value={contadoReal} 
                      onChange={e => setContadoReal(e.target.value)}
                      placeholder="Ingrese monto..."
                      className="w-full bg-white text-gray-900 font-black text-xl rounded-2xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-brand-blue"
                    />
                  </div>
                  
                  {contadoReal && (
                    <div className={`flex justify-between items-center pt-2 ${diferencia === 0 ? "text-green-400" : (diferencia > 0 ? "text-yellow-400" : "text-red-400")}`}>
                      <span className="text-xs font-black uppercase italic">Diferencia</span>
                      <span className="font-black text-lg">{diferencia > 0 ? "+" : ""}{formatCurrency(diferencia)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Card Guardado */}
            <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm relative overflow-hidden">
                <div className="absolute -bottom-4 -right-4 opacity-5">
                    <Shield className="w-24 h-24" />
                </div>
              <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                 <Shield className="w-4 h-4" /> Acumulado Guardado
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                    <span className="text-gray-500 font-medium">Saldo Anterior</span>
                    <span className="font-bold text-gray-800">{formatCurrency(saldoAnt.guardado)}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-gray-500 font-medium">Entrada de hoy</span>
                    <span className="font-bold text-brand-blue">+ {formatCurrency(totalRetiros)}</span>
                </div>
                <div className="pt-3 border-t border-gray-50 flex justify-between items-center">
                    <span className="text-[10px] font-black text-gray-400 uppercase">Total Final</span>
                    <span className="text-xl font-black text-gray-900">{formatCurrency(guardadoEsperado)}</span>
                </div>
              </div>
            </div>
            
            <Button variant="danger" className="w-full py-6 rounded-3xl shadow-lg shadow-red-500/20" disabled={loadingAction || !contadoReal} onClick={handleCerrarDia}>
                <Lock className="w-5 h-5" /> Cerrar Día Definitivamente
            </Button>
          </div>
        </div>
      )}

      {/* Reporte oculto para html2canvas */}
      <div className="fixed -left-[2000px] top-0 pointer-events-none">
        <CierreResumen 
          fecha={new Date().toISOString()}
          ventas={ventas}
          gastos={gastos}
          otrosIngresos={[]}
          caja={{
            inicial: saldoAnt.caja,
            ventasEfe: totalVentasEfe,
            gastos: totalGastosEfe,
            retiros: totalRetiros,
            otros: 0,
            esperado: cajaEsperado,
            contado: parseFloat(contadoReal) || 0,
            diferencia: diferencia
          }}
          guardado={{
            inicial: saldoAnt.guardado,
            entradas: totalRetiros,
            esperado: guardadoEsperado
          }}
        />
      </div>

      {/* Modal Gastos */}
      <Modal open={modalGasto} onClose={() => setModalGasto(false)} title="Nuevo Gasto / Movimiento">
          <div className="space-y-4">
              <div>
                  <label className="label">Concepto</label>
                  <input 
                    type="text" 
                    value={gastoForm.concepto} 
                    onChange={e => setGastoForm({...gastoForm, concepto: e.target.value})} 
                    className="input" 
                    placeholder="Almuerzo, servicios, etc..." 
                  />
              </div>
              <div>
                  <label className="label">Monto</label>
                  <input 
                    type="number" 
                    value={gastoForm.monto} 
                    onChange={e => setGastoForm({...gastoForm, monto: e.target.value})} 
                    className="input" 
                    placeholder="0" 
                  />
              </div>
              <div>
                  <label className="label">Categoría</label>
                  <div className="grid grid-cols-2 gap-2">
                      {CATEGORIAS_GASTO.map(c => (
                          <button 
                            key={c.value} 
                            onClick={() => setGastoForm({...gastoForm, categoria: c.value})} 
                            className={`py-2 px-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${gastoForm.categoria === c.value ? "bg-brand-blue text-white shadow-lg shadow-brand-blue/20" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
                          >
                            {c.label}
                          </button>
                      ))}
                  </div>
              </div>
              <Button className="w-full mt-4" size="lg" onClick={handleAgregarGasto} loading={loadingAction}>Guardar Registro</Button>
          </div>
      </Modal>

    </div>
  );
}
