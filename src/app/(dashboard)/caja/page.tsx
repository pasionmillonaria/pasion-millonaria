"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard, Plus, Lock, Trash2, Download, AlertCircle,
  ShoppingBag, TrendingDown, TrendingUp, Shield, History,
  CheckCircle, Calendar, FileText, X, WifiOff, RefreshCw,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/lib/context/ProfileContext";
import { formatCurrency, formatDate } from "@/lib/utils";
import BuscadorProducto from "@/components/BuscadorProducto";
import ListaProductos from "@/components/ListaProductos";
import SelectorTalla from "@/components/SelectorTalla";
import Modal from "@/components/ui/Modal";
import InputDinero from "@/components/ui/InputDinero";
import Button from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";
import toast from "react-hot-toast";
import type { MetodoPago, TipoRegistroCaja, VResumenCaja } from "@/lib/types";

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────
interface RegistroLocal {
  id: string;
  dbId?: number;
  movimientoId?: number;
  fecha: string;
  hora: string;
  tipo: TipoRegistroCaja;
  descripcion: string | null;
  productoId: number | null;
  productoRef: string | null;
  tallaId: number | null;
  tallaNombre: string | null;
  cantidad: number;
  valor: number;
  metodoPago: "efectivo" | "transferencia" | "mixto" | null;
  montoEfectivo: number;
  montoTransferencia: number;
  pending?: boolean;
}

interface TallaStock {
  talla_id: number;
  talla_nombre: string;
  stock_tienda: number;
  stock_bodega: number;
}

interface PendingQueueItem extends Omit<RegistroLocal, "id"> {
  localId: string;
}

const LS_KEY = "caja_pending_v2";

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────
function genId() {
  return `l-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function getNow() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return {
    fecha: `${year}-${month}-${day}`,
    hora: now.toTimeString().slice(0, 8),
  };
}

function getHoy() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

const TIPO_LABEL: Record<TipoRegistroCaja, string> = {
  venta: "VENTA", gasto: "GASTO", ingreso: "INGRESO", caja_fuerte: "GUARDADO",
};
const TIPO_ROW: Record<TipoRegistroCaja, string> = {
  venta: "bg-green-50 border-l-4 border-l-green-400",
  gasto: "bg-red-50 border-l-4 border-l-red-300",
  ingreso: "bg-blue-50 border-l-4 border-l-blue-400",
  caja_fuerte: "bg-yellow-50 border-l-4 border-l-yellow-400",
};
const TIPO_BADGE: Record<TipoRegistroCaja, string> = {
  venta: "bg-green-100 text-green-700",
  gasto: "bg-red-100 text-red-700",
  ingreso: "bg-blue-100 text-blue-700",
  caja_fuerte: "bg-yellow-100 text-yellow-800",
};

function getTipoLabel(tipo: TipoRegistroCaja, valor: number) {
  if (tipo === "caja_fuerte") return valor < 0 ? "RETIRO" : "GUARDADO";
  return TIPO_LABEL[tipo];
}
function getTipoRow(tipo: TipoRegistroCaja, valor: number) {
  if (tipo === "caja_fuerte" && valor < 0) return "bg-orange-50 border-l-4 border-l-orange-400";
  return TIPO_ROW[tipo];
}
function getTipoBadge(tipo: TipoRegistroCaja, valor: number) {
  if (tipo === "caja_fuerte" && valor < 0) return "bg-orange-100 text-orange-700";
  return TIPO_BADGE[tipo];
}

// ─────────────────────────────────────────────────────────────
// MODAL VENTA
// ─────────────────────────────────────────────────────────────
function ModalVenta({ onClose, onSave }: {
  onClose: () => void;
  onSave: (r: Omit<RegistroLocal, "id" | "fecha" | "hora">) => void;
}) {
  const supabase = createClient();
  const [modo, setModo] = useState<"inventario" | "libre">("inventario");

  // Modo inventario
  const [paso, setPaso] = useState<"producto" | "talla" | "detalle">("producto");
  const [producto, setProducto] = useState<any>(null);
  const [tallas, setTallas] = useState<TallaStock[]>([]);
  const [tallaId, setTallaId] = useState<number | null>(null);
  const [tallaNombre, setTallaNombre] = useState("");
  const [cantidadInv, setCantidadInv] = useState(1);
  const [precioInv, setPrecioInv] = useState("");

  // Modo libre
  const [descLibre, setDescLibre] = useState("");
  const [cantidadLibre, setCantidadLibre] = useState(1);
  const [precioLibre, setPrecioLibre] = useState("");

  // Compartido
  const [metodo, setMetodo] = useState<"efectivo" | "transferencia" | "mixto">("efectivo");
  const [montoEfe, setMontoEfe] = useState(0);
  const [montoTransf, setMontoTransf] = useState(0);

  const totalInv = (parseFloat(precioInv) || 0) * cantidadInv;
  const totalLibre = (parseFloat(precioLibre) || 0) * cantidadLibre;
  const total = modo === "inventario" ? totalInv : totalLibre;

  const stockTallaActual = tallas.find(t => t.talla_id === tallaId)?.stock_tienda ?? 0;

  useEffect(() => {
    if (metodo === "efectivo") { setMontoEfe(total); setMontoTransf(0); }
    else if (metodo === "transferencia") { setMontoTransf(total); setMontoEfe(0); }
  }, [metodo, total]);

  const mixtoValido = metodo !== "mixto" || Math.abs(montoEfe + montoTransf - total) < 1;

  async function handleSelectProducto(p: any) {
    setProducto(p);
    setPrecioInv(String(p.precio_base));
    const { data: stockData } = await supabase
      .from("v_stock_total")
      .select("talla, talla_id, stock_tienda, stock_bodega")
      .eq("producto_id", p.id);
    if (stockData?.length) {
      setTallas(stockData.map((d: any) => ({
        talla_id: d.talla_id,
        talla_nombre: d.talla,
        stock_tienda: d.stock_tienda ?? 0,
        stock_bodega: d.stock_bodega ?? 0,
      })));
    }
    setPaso("talla");
  }

  function handleSelectTalla(id: number) {
    setTallaId(id);
    setTallaNombre(tallas.find(t => t.talla_id === id)?.talla_nombre ?? "");
    setCantidadInv(1);
    setPaso("detalle");
  }

  function handleSaveInventario() {
    if (!producto || !tallaId || totalInv <= 0) return;
    if (cantidadInv > stockTallaActual) { toast.error(`Solo hay ${stockTallaActual} unidad${stockTallaActual !== 1 ? "es" : ""} en tienda`); return; }
    if (!mixtoValido) { toast.error(`Efectivo + Transferencia debe sumar ${formatCurrency(totalInv)}`); return; }
    onSave({
      tipo: "venta",
      descripcion: producto.referencia,
      productoId: producto.id,
      productoRef: producto.referencia,
      tallaId, tallaNombre, cantidad: cantidadInv, valor: totalInv,
      metodoPago: metodo,
      montoEfectivo: metodo === "efectivo" ? totalInv : metodo === "mixto" ? montoEfe : 0,
      montoTransferencia: metodo === "transferencia" ? totalInv : metodo === "mixto" ? montoTransf : 0,
    });
    onClose();
  }

  function handleSaveLibre() {
    if (!descLibre.trim() || totalLibre <= 0) { toast.error("Completa descripción y precio"); return; }
    if (!mixtoValido) { toast.error(`Efectivo + Transferencia debe sumar ${formatCurrency(totalLibre)}`); return; }
    const desc = cantidadLibre > 1 ? `${descLibre.trim()} (x${cantidadLibre})` : descLibre.trim();
    onSave({
      tipo: "venta",
      descripcion: desc,
      productoId: null, productoRef: null, tallaId: null, tallaNombre: null,
      cantidad: cantidadLibre, valor: totalLibre,
      metodoPago: metodo,
      montoEfectivo: metodo === "efectivo" ? totalLibre : metodo === "mixto" ? montoEfe : 0,
      montoTransferencia: metodo === "transferencia" ? totalLibre : metodo === "mixto" ? montoTransf : 0,
    });
    onClose();
  }

  /* ── Bloque de pago compartido ── */
  const BloquePago = (
    <div className="space-y-4">
      <div>
        <label className="label">Método de pago</label>
        <div className="grid grid-cols-3 gap-2">
          {(["efectivo", "transferencia", "mixto"] as const).map(m => (
            <button key={m} onClick={() => setMetodo(m)}
              className={`py-2 px-3 rounded-xl text-sm font-medium capitalize transition-colors ${metodo === m ? "bg-brand-blue text-white" : "bg-gray-100 text-gray-600"}`}>
              {m === "efectivo" ? "Efectivo" : m === "transferencia" ? "Transferencia" : "Mixto"}
            </button>
          ))}
        </div>
      </div>
      {metodo === "mixto" && (
        <div className="bg-gray-50 rounded-xl p-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label text-green-700">Efectivo</label>
              <InputDinero value={montoEfe}
                onChange={raw => { const v = parseFloat(raw) || 0; setMontoEfe(v); setMontoTransf(total - v); }}
                className="input font-bold text-green-700" />
            </div>
            <div>
              <label className="label text-blue-700">Transferencia</label>
              <InputDinero value={montoTransf}
                onChange={raw => { const v = parseFloat(raw) || 0; setMontoTransf(v); setMontoEfe(total - v); }}
                className="input font-bold text-blue-700" />
            </div>
          </div>
          {!mixtoValido && (
            <p className="text-xs text-red-500 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> La suma debe ser {formatCurrency(total)}
            </p>
          )}
        </div>
      )}
      <div className="bg-brand-blue text-white rounded-xl p-4 flex justify-between items-center">
        <span className="font-bold">Total</span>
        <span className="text-2xl font-black">{formatCurrency(total)}</span>
      </div>
    </div>
  );

  return (
    <Modal open onClose={onClose} title="Registrar Venta" size="3xl" panelClassName="min-h-[78vh] md:min-h-0">

      {/* Selector de modo */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-4">
        <button onClick={() => setModo("inventario")}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${modo === "inventario" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
          Del inventario
        </button>
        <button onClick={() => setModo("libre")}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${modo === "libre" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
          Artículo libre
        </button>
      </div>

      {/* ── MODO INVENTARIO ── */}
      {modo === "inventario" && (
        <div className="md:grid md:grid-cols-2 md:gap-6 md:items-start space-y-4 md:space-y-0">
          <div className="space-y-4">
            <div>
              <label className="label">Producto</label>
              {producto ? (
                <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                  <div>
                    <p className="font-bold text-gray-900">{producto.referencia}</p>
                    <p className="text-xs text-gray-500">{producto.categoria_nombre}</p>
                  </div>
                  <button onClick={() => { setProducto(null); setTallaId(null); setTallas([]); setPaso("producto"); }}
                    className="text-xs text-brand-blue font-medium">Cambiar</button>
                </div>
              ) : (
                <>
                  <div className="md:hidden">
                    <BuscadorProducto onSelect={handleSelectProducto} />
                  </div>
                  <div className="hidden md:block">
                    <ListaProductos onSelect={handleSelectProducto} />
                  </div>
                </>
              )}
            </div>
            {paso !== "producto" && tallas.length > 0 && (
              <div>
                <label className="label">Talla</label>
                <SelectorTalla tallas={tallas} seleccionada={tallaId} onSelect={handleSelectTalla} />
              </div>
            )}
          </div>

          {paso === "detalle" && tallaId && (
            <div className="space-y-4">
              <div>
                <label className="label">Cantidad</label>
                <div className="flex items-center gap-3">
                  <button onClick={() => setCantidadInv(Math.max(1, cantidadInv - 1))}
                    className="w-10 h-10 rounded-xl bg-gray-100 font-bold text-xl flex items-center justify-center">−</button>
                  <span className="text-2xl font-bold w-8 text-center">{cantidadInv}</span>
                  <button onClick={() => setCantidadInv(Math.min(stockTallaActual, cantidadInv + 1))}
                    disabled={cantidadInv >= stockTallaActual}
                    className="w-10 h-10 rounded-xl bg-gray-100 font-bold text-xl flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed">+</button>
                </div>
                {stockTallaActual > 0 && <p className="text-xs text-gray-400 mt-1">Stock disponible: {stockTallaActual} uds</p>}
              </div>
              <div>
                <label className="label">Precio unitario</label>
                <InputDinero value={precioInv} onChange={raw => setPrecioInv(raw)} className="input" placeholder="0" />
              </div>
              {BloquePago}
              <Button className="w-full" onClick={handleSaveInventario} disabled={!mixtoValido || totalInv <= 0}>
                Guardar Venta
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ── MODO LIBRE ── */}
      {modo === "libre" && (
        <div className="space-y-4">
          <p className="text-xs text-gray-500 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
            Para llaveros, gorras, manillas, billeteras u otros artículos sin inventario.
          </p>
          <div>
            <label className="label">Descripción del artículo</label>
            <input type="text" value={descLibre} onChange={e => setDescLibre(e.target.value)}
              className="input" placeholder="Ej: Llavero Millonarios, Manilla azul..." autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Precio unitario</label>
              <InputDinero value={precioLibre} onChange={raw => setPrecioLibre(raw)} className="input" placeholder="0" />
            </div>
            <div>
              <label className="label">Cantidad</label>
              <div className="flex items-center gap-2">
                <button onClick={() => setCantidadLibre(Math.max(1, cantidadLibre - 1))}
                  className="w-10 h-10 rounded-xl bg-gray-100 font-bold text-xl flex items-center justify-center">−</button>
                <span className="text-2xl font-bold w-8 text-center">{cantidadLibre}</span>
                <button onClick={() => setCantidadLibre(cantidadLibre + 1)}
                  className="w-10 h-10 rounded-xl bg-gray-100 font-bold text-xl flex items-center justify-center">+</button>
              </div>
            </div>
          </div>
          {BloquePago}
          <Button className="w-full" onClick={handleSaveLibre} disabled={!mixtoValido || totalLibre <= 0 || !descLibre.trim()}>
            Guardar Venta
          </Button>
        </div>
      )}
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// MODAL GASTO
// ─────────────────────────────────────────────────────────────
function ModalGasto({ onClose, onSave }: {
  onClose: () => void;
  onSave: (r: Omit<RegistroLocal, "id" | "fecha" | "hora">) => void;
}) {
  const [descripcion, setDescripcion] = useState("");
  const [valor, setValor] = useState("");
  const [metodo, setMetodo] = useState<"efectivo" | "transferencia">("efectivo");

  function handleSave() {
    const v = parseFloat(valor);
    if (!descripcion.trim() || !v) { toast.error("Completa todos los campos"); return; }
    onSave({
      tipo: "gasto", descripcion: descripcion.trim(),
      productoId: null, productoRef: null, tallaId: null, tallaNombre: null,
      cantidad: 1, valor: v, metodoPago: metodo,
      montoEfectivo: metodo === "efectivo" ? v : 0,
      montoTransferencia: metodo === "transferencia" ? v : 0,
    });
    onClose();
  }

  return (
    <Modal open onClose={onClose} title="Registrar Gasto">
      <div className="space-y-4">
        <div>
          <label className="label">Descripción</label>
          <input type="text" value={descripcion} onChange={e => setDescripcion(e.target.value)}
            className="input" placeholder="Ej: Almuerzo, pago luz, bolsas..." autoFocus />
        </div>
        <div>
          <label className="label">Valor</label>
          <InputDinero value={valor} onChange={raw => setValor(raw)} className="input" placeholder="0" />
        </div>
        <div>
          <label className="label">Pagado con</label>
          <div className="grid grid-cols-2 gap-2">
            {(["efectivo", "transferencia"] as const).map(m => (
              <button key={m} onClick={() => setMetodo(m)}
                className={`py-2.5 rounded-xl text-sm font-medium ${metodo === m ? "bg-brand-blue text-white" : "bg-gray-100 text-gray-600"}`}>
                {m === "efectivo" ? "Efectivo" : "Transferencia"}
              </button>
            ))}
          </div>
        </div>
        <Button variant="danger" className="w-full" onClick={handleSave}>
          <TrendingDown className="w-4 h-4" /> Guardar Gasto
        </Button>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// MODAL INGRESO
// ─────────────────────────────────────────────────────────────
function ModalIngreso({ onClose, onSave }: {
  onClose: () => void;
  onSave: (r: Omit<RegistroLocal, "id" | "fecha" | "hora">) => void;
}) {
  const [descripcion, setDescripcion] = useState("");
  const [valor, setValor] = useState("");
  const [metodo, setMetodo] = useState<"efectivo" | "transferencia">("efectivo");

  function handleSave() {
    const v = parseFloat(valor);
    if (!descripcion.trim() || !v) { toast.error("Completa todos los campos"); return; }
    onSave({
      tipo: "ingreso", descripcion: descripcion.trim(),
      productoId: null, productoRef: null, tallaId: null, tallaNombre: null,
      cantidad: 1, valor: v, metodoPago: metodo,
      montoEfectivo: metodo === "efectivo" ? v : 0,
      montoTransferencia: metodo === "transferencia" ? v : 0,
    });
    onClose();
  }

  return (
    <Modal open onClose={onClose} title="Ingreso Extra">
      <div className="space-y-4">
        <p className="text-sm text-gray-500 bg-blue-50 rounded-xl p-3">
          Dinero que entra a caja sin ser venta: cambios, préstamos, devoluciones de proveedores, etc.
        </p>
        <div>
          <label className="label">Descripción</label>
          <input type="text" value={descripcion} onChange={e => setDescripcion(e.target.value)}
            className="input" placeholder="Ej: Cambio que trajeron, devolución proveedor..." autoFocus />
        </div>
        <div>
          <label className="label">Valor</label>
          <InputDinero value={valor} onChange={raw => setValor(raw)} className="input" placeholder="0" />
        </div>
        <div>
          <label className="label">Forma de ingreso</label>
          <div className="grid grid-cols-2 gap-2">
            {(["efectivo", "transferencia"] as const).map(m => (
              <button key={m} onClick={() => setMetodo(m)}
                className={`py-2.5 rounded-xl text-sm font-medium ${metodo === m ? "bg-brand-blue text-white" : "bg-gray-100 text-gray-600"}`}>
                {m === "efectivo" ? "Efectivo" : "Transferencia"}
              </button>
            ))}
          </div>
        </div>
        <Button className="w-full" onClick={handleSave}>
          <TrendingUp className="w-4 h-4" /> Guardar Ingreso
        </Button>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// MODAL GUARDADO / RETIRO
// ─────────────────────────────────────────────────────────────
function ModalCajaFuerte({ onClose, onSave, modo = "guardar" }: {
  onClose: () => void;
  onSave: (r: Omit<RegistroLocal, "id" | "fecha" | "hora">) => void;
  modo?: "guardar" | "retirar";
}) {
  const [valor, setValor] = useState("");
  const esRetiro = modo === "retirar";

  function handleSave() {
    const v = parseFloat(valor);
    if (!v || v <= 0) { toast.error("Ingresa un valor válido"); return; }
    const valorFinal = esRetiro ? -v : v;
    onSave({
      tipo: "caja_fuerte",
      descripcion: esRetiro ? "Retiro de guardado" : "Guardado",
      productoId: null, productoRef: null, tallaId: null, tallaNombre: null,
      cantidad: 1, valor: valorFinal, metodoPago: "efectivo",
      montoEfectivo: valorFinal, montoTransferencia: 0,
    });
    onClose();
  }

  return (
    <Modal open onClose={onClose} title={esRetiro ? "Retirar de lo guardado" : "Guardar"}>
      <div className="space-y-4">
        <p className={`text-sm rounded-xl p-3 border ${esRetiro ? "text-gray-500 bg-orange-50 border-orange-100" : "text-gray-500 bg-yellow-50 border-yellow-100"}`}>
          {esRetiro
            ? "Registra el dinero que se retira de lo guardado y vuelve a circular."
            : "Registra el efectivo que se saca de la caja para guardar en lugar seguro."}
        </p>
        <div>
          <label className="label">{esRetiro ? "Valor a retirar" : "Valor a guardar"}</label>
          <InputDinero value={valor} onChange={raw => setValor(raw)}
            onKeyDown={e => e.key === "Enter" && handleSave()}
            className="input text-xl font-bold" placeholder="0" autoFocus />
        </div>
        <button
          onClick={handleSave}
          className={`w-full flex items-center justify-center gap-2 font-bold py-3.5 rounded-2xl transition-colors ${esRetiro ? "bg-orange-500 hover:bg-orange-600 text-white" : "btn-gold"}`}
        >
          <Shield className="w-5 h-5" />
          {esRetiro ? "Confirmar retiro" : "Guardar"}
        </button>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// REPORTE DE CIERRE (componente oculto capturado por html2canvas)
// ─────────────────────────────────────────────────────────────
interface ReporteParams {
  registros: RegistroLocal[];
  saldoInicial: number;
  fecha: string;
  efectivoContado: number;
}

function ReporteCierre({ registros, saldoInicial, fecha, efectivoContado }: ReporteParams) {
  const ventas = registros.filter(r => r.tipo === "venta");
  const gastos = registros.filter(r => r.tipo === "gasto");
  const ingresos = registros.filter(r => r.tipo === "ingreso");
  const cajaFuerteList = registros.filter(r => r.tipo === "caja_fuerte");
  const totalVentas = ventas.reduce((s, r) => s + r.valor, 0);
  const totalGastos = gastos.reduce((s, r) => s + r.valor, 0);
  const totalIngresos = ingresos.reduce((s, r) => s + r.valor, 0);
  const guardadoList = cajaFuerteList.filter(r => r.valor > 0);
  const retiroList   = cajaFuerteList.filter(r => r.valor < 0);
  const totalGuardado  = guardadoList.reduce((s, r) => s + r.valor, 0);
  const totalRetiros   = retiroList.reduce((s, r) => s + Math.abs(r.valor), 0);
  const saldoGuardado  = totalGuardado - totalRetiros;
  const ventasEfe = ventas.reduce((s, r) => s + r.montoEfectivo, 0);
  const ventasTransf = ventas.reduce((s, r) => s + r.montoTransferencia, 0);
  const gastosEfe = gastos.filter(r => r.metodoPago === "efectivo").reduce((s, r) => s + r.valor, 0);
  const ingresosEfe = ingresos.filter(r => r.metodoPago === "efectivo").reduce((s, r) => s + r.valor, 0);
  const debeHaber = saldoInicial + ventasEfe + ingresosEfe - gastosEfe - totalGuardado;
  const diferencia = efectivoContado - debeHaber;

  return (
    <div id="reporte-cierre" style={{ width: 600, padding: 40, fontFamily: "Arial, sans-serif", background: "#fff", color: "#111", lineHeight: 1.4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid #e5e7eb", paddingBottom: 20, marginBottom: 24 }}>
        <div>
          <p style={{ fontSize: 26, fontWeight: 900, margin: 0 }}>Cierre de Caja</p>
          <p style={{ fontSize: 14, color: "#6b7280", margin: "4px 0 0" }}>{formatDate(fecha)}</p>
        </div>
        <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.webp" alt="Pasión Millonaria" style={{ width: 52, height: 52, objectFit: "contain", borderRadius: 10, background: "#f3f4f6", padding: 4 }} />
          <p style={{ fontSize: 10, color: "#10b981", fontWeight: 700, margin: 0 }}>✓ Verificado</p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
        {([
          ["Total Ventas", totalVentas, "#f9fafb", "#111"],
          ["Transferencias", ventasTransf, "#eff6ff", "#1d4ed8"],
          ["Ventas Efectivo", ventasEfe, "#f0fdf4", "#047857"],
        ] as [string, number, string, string][]).map(([label, val, bg, color]) => (
          <div key={label} style={{ flex: 1, background: bg, borderRadius: 12, padding: 14 }}>
            <p style={{ fontSize: 10, textTransform: "uppercase", color: "#9ca3af", fontWeight: 700, margin: "0 0 4px" }}>{label}</p>
            <p style={{ fontSize: 18, fontWeight: 900, color, margin: 0 }}>{formatCurrency(val)}</p>
          </div>
        ))}
      </div>

      {ventas.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 10, fontWeight: 800, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 2, marginBottom: 6 }}>Ventas del día ({ventas.length})</p>
          {/* Cabecera tabla */}
          <div style={{ display: "grid", gridTemplateColumns: "2rem 1fr 3rem 5rem 4rem", gap: 0, padding: "5px 8px", background: "#f3f4f6", borderRadius: "6px 6px 0 0", fontSize: 9, fontWeight: 800, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1 }}>
            <span style={{ textAlign: "center" }}>Cant</span>
            <span>Producto</span>
            <span style={{ textAlign: "center" }}>Talla</span>
            <span style={{ textAlign: "right" }}>Valor</span>
            <span style={{ textAlign: "center" }}>Pago</span>
          </div>
          {ventas.map((v, i) => {
            const pagoBg = v.metodoPago === "efectivo" ? "#d1fae5" : v.metodoPago === "transferencia" ? "#dbeafe" : "#ede9fe";
            const pagoColor = v.metodoPago === "efectivo" ? "#065f46" : v.metodoPago === "transferencia" ? "#1e40af" : "#5b21b6";
            const pagoLabel = v.metodoPago === "efectivo" ? "Efe" : v.metodoPago === "transferencia" ? "Transf" : "Mixto";
            return (
              <div key={i} style={{ background: i % 2 === 0 ? "#fff" : "#f9fafb", borderBottom: "1px solid #f3f4f6" }}>
                <div style={{ display: "grid", gridTemplateColumns: "2rem 1fr 3rem 5rem 4rem", gap: 0, padding: "6px 8px", alignItems: "center" }}>
                  <span style={{ textAlign: "center", fontWeight: 900, fontSize: 12 }}>{v.cantidad}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.productoRef ?? v.descripcion ?? "Artículo"}</span>
                  <span style={{ textAlign: "center", fontSize: 11, color: "#6b7280" }}>{v.tallaNombre ?? "—"}</span>
                  <span style={{ textAlign: "right", fontWeight: 800, fontSize: 12 }}>{formatCurrency(v.valor)}</span>
                  <div style={{ display: "flex", justifyContent: "center" }}>
                    <span style={{ background: pagoBg, color: pagoColor, fontSize: 9, fontWeight: 800, padding: "2px 5px", borderRadius: 4 }}>{pagoLabel}</span>
                  </div>
                </div>
                {v.metodoPago === "mixto" && (
                  <div style={{ padding: "0 8px 5px", display: "flex", gap: 12, fontSize: 9, fontWeight: 700 }}>
                    <span style={{ color: "#047857" }}>Efe: {formatCurrency(v.montoEfectivo)}</span>
                    <span style={{ color: "#1d4ed8" }}>Transf: {formatCurrency(v.montoTransferencia)}</span>
                  </div>
                )}
              </div>
            );
          })}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 8px", background: "#f0fdf4", borderRadius: "0 0 6px 6px", fontSize: 12, fontWeight: 800 }}>
            <span style={{ color: "#6b7280" }}>Total ventas</span>
            <span style={{ color: "#059669" }}>{formatCurrency(totalVentas)}</span>
          </div>
        </div>
      )}

      {gastos.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 10, fontWeight: 800, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>Gastos</p>
          {gastos.map((g, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "7px 10px", background: "#fff5f5", borderRadius: 8, marginBottom: 3, fontSize: 12 }}>
              <span style={{ fontWeight: 600 }}>{g.descripcion}</span>
              <span style={{ fontWeight: 800, color: "#dc2626" }}>- {formatCurrency(g.valor)}</span>
            </div>
          ))}
        </div>
      )}

      {ingresos.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 10, fontWeight: 800, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>Ingresos Extra</p>
          {ingresos.map((g, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "7px 10px", background: "#eff6ff", borderRadius: 8, marginBottom: 3, fontSize: 12 }}>
              <span style={{ fontWeight: 600 }}>{g.descripcion}</span>
              <span style={{ fontWeight: 800, color: "#1d4ed8" }}>+ {formatCurrency(g.valor)}</span>
            </div>
          ))}
        </div>
      )}

      {cajaFuerteList.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 10, fontWeight: 800, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>Guardado / Retiros</p>
          {cajaFuerteList.map((g, i) => {
            const esRet = g.valor < 0;
            return (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "7px 10px", background: esRet ? "#fff7ed" : "#fefce8", borderRadius: 8, marginBottom: 3, fontSize: 12 }}>
                <span style={{ fontWeight: 600 }}>{g.descripcion}</span>
                <span style={{ fontWeight: 800, color: esRet ? "#ea580c" : "#92400e" }}>
                  {esRet ? `+ ${formatCurrency(Math.abs(g.valor))}` : `− ${formatCurrency(g.valor)}`}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ borderTop: "2px solid #e5e7eb", paddingTop: 20 }}>
        <p style={{ fontSize: 10, fontWeight: 800, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 2, marginBottom: 12 }}>Cuenta de Caja</p>
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 2, background: "#eff6ff", borderRadius: 12, padding: 16 }}>
            {([
              ["Saldo inicial", saldoInicial, false],
              ["+ Ventas efectivo", ventasEfe, false],
              ["+ Ingresos extra (efe)", ingresosEfe, false],
              ["− Gastos efectivo", gastosEfe, true],
              ["− Guardado", totalGuardado, true],
            ] as [string, number, boolean][]).map(([lbl, val, neg]) => (
              <div key={lbl} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 5, color: neg ? "#dc2626" : "#374151" }}>
                <span>{lbl}</span>
                <span style={{ fontWeight: 700 }}>{neg ? "- " : ""}{formatCurrency(val)}</span>
              </div>
            ))}
            <div style={{ borderTop: "1px solid #bfdbfe", paddingTop: 8, marginTop: 8, display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontWeight: 900, fontSize: 13, color: "#1d4ed8" }}>Debe haber en caja</span>
              <span style={{ fontWeight: 900, fontSize: 16, color: "#1d4ed8" }}>{formatCurrency(debeHaber)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
              <span style={{ fontSize: 12, color: "#6b7280" }}>Contado real</span>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{formatCurrency(efectivoContado)}</span>
            </div>
            {diferencia !== 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, color: diferencia > 0 ? "#059669" : "#dc2626" }}>
                <span style={{ fontSize: 12 }}>Diferencia</span>
                <span style={{ fontWeight: 800, fontSize: 13 }}>{diferencia > 0 ? "+" : ""}{formatCurrency(diferencia)}</span>
              </div>
            )}
          </div>
          <div style={{ flex: 1, background: "#111827", borderRadius: 12, padding: 16, color: "#fff" }}>
            <p style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", fontWeight: 700, marginBottom: 12 }}>Guardado (neto)</p>
            <p style={{ fontSize: 22, fontWeight: 900, margin: 0 }}>{formatCurrency(saldoGuardado)}</p>
            {totalIngresos > 0 && (
              <>
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", margin: "12px 0 4px" }}>Ingresos extra</p>
                <p style={{ fontSize: 16, fontWeight: 700, color: "#60a5fa", margin: 0 }}>{formatCurrency(totalIngresos)}</p>
              </>
            )}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid #f3f4f6", textAlign: "center" }}>
        <p style={{ fontSize: 9, color: "#d1d5db", textTransform: "uppercase", letterSpacing: "0.2em", fontWeight: 700, margin: 0 }}>
          Generado por Pasión Millonaria POS System
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// HISTORIAL TAB
// ─────────────────────────────────────────────────────────────
function HistorialTab({ historial, onDescargar }: {
  historial: VResumenCaja[];
  onDescargar: (c: VResumenCaja) => void;
}) {
  const router = useRouter();

  if (historial.length === 0) {
    return (
      <div className="card text-center py-14 text-gray-400">
        <Calendar className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="font-medium">No hay cierres anteriores</p>
        <p className="text-sm mt-1 opacity-70">Los cierres de caja aparecerán aquí</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {historial.map(c => (
        <div key={c.id} className="card flex items-center justify-between">
          <button className="flex-1 text-left" onClick={() => router.push(`/caja/historial/${c.id}`)}>
            <p className="font-bold text-gray-900">{formatDate(c.fecha)}</p>
            <div className="flex gap-3 text-xs text-gray-500 mt-1">
              <span>{c.cantidad_ventas} ventas</span>
              <span>Ventas: {formatCurrency((c.total_efectivo ?? 0) + (c.total_transferencias ?? 0))}</span>
              {(c.total_gastos ?? 0) > 0 && <span>Gastos: {formatCurrency(c.total_gastos ?? 0)}</span>}
            </div>
          </button>
          <div className="flex items-center gap-2 shrink-0">
            <div className="text-right mr-1">
              <p className="font-black text-brand-blue text-lg">{formatCurrency(c.saldo_final ?? 0)}</p>
              <p className="text-xs text-gray-400">Saldo final</p>
            </div>
            <button onClick={() => router.push(`/caja/historial/${c.id}`)} title="Ver detalle"
              className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
              <FileText className="w-4 h-4" />
            </button>
            <button onClick={() => onDescargar(c)} title="Descargar reporte"
              className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
              <Download className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────
export default function CajaPage() {
  const supabase = createClient();
  const { isAdmin } = useProfile();
  const hoy = getHoy();

  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"hoy" | "historial">("hoy");
  const [isOnline, setIsOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const [registros, setRegistros] = useState<RegistroLocal[]>([]);
  const [saldoInicial, setSaldoInicial] = useState(0);
  const [cajaDiariaId, setCajaDiariaId] = useState<number | null>(null);
  const [cajaEstado, setCajaEstado] = useState<"abierta" | "cerrada">("abierta");
  const [pendingCount, setPendingCount] = useState(0);

  const [historial, setHistorial] = useState<VResumenCaja[]>([]);

  const [modalVenta, setModalVenta] = useState(false);
  const [modalGasto, setModalGasto] = useState(false);
  const [modalIngreso, setModalIngreso] = useState(false);
  const [modalCajaFuerte, setModalCajaFuerte] = useState(false);
  const [modalRetiro, setModalRetiro] = useState(false);
  const [modalCerrar, setModalCerrar] = useState(false);
  const [loadingCerrar, setLoadingCerrar] = useState(false);
  const [efectivoContado, setEfectivoContado] = useState("");
  const [efectivoContadoCierre, setEfectivoContadoCierre] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [loadingDelete, setLoadingDelete] = useState(false);
  const [reporteParams, setReporteParams] = useState<ReporteParams | null>(null);
  const [generandoReporte, setGenerandoReporte] = useState(false);

  const cajaDiariaIdRef = useRef<number | null>(null);
  cajaDiariaIdRef.current = cajaDiariaId;

  // ── Totales computados ─────────────────────────────────────
  const ventas = registros.filter(r => r.tipo === "venta");
  const gastos = registros.filter(r => r.tipo === "gasto");
  const ingresos = registros.filter(r => r.tipo === "ingreso");
  const cajaFuerteItems = registros.filter(r => r.tipo === "caja_fuerte" && r.valor > 0);
  const retiroItems     = registros.filter(r => r.tipo === "caja_fuerte" && r.valor < 0);
  const totalVentas = ventas.reduce((s, r) => s + r.valor, 0);
  const totalGastos = gastos.reduce((s, r) => s + r.valor, 0);
  const comisiones = ventas
    .filter(r => r.cantidad > 0 && r.valor / r.cantidad >= 30000)
    .reduce((s, r) => s + r.cantidad * 1000, 0);
  const totalIngresos = ingresos.reduce((s, r) => s + r.valor, 0);
  // Lo que salió de la caja hacia el guardado
  const totalGuardado = cajaFuerteItems.reduce((s, r) => s + r.valor, 0);
  // Lo que salió del guardado hacia afuera (pago mercancía, etc.)
  const totalRetiros  = retiroItems.reduce((s, r) => s + Math.abs(r.valor), 0);
  // Saldo neto que queda en el guardado
  const saldoGuardadoNeto = totalGuardado - totalRetiros;
  const ventasEfectivo = ventas.reduce((s, r) => s + r.montoEfectivo, 0);
  const ventasTransferencia = ventas.reduce((s, r) => s + r.montoTransferencia, 0);
  const gastosEfectivo = gastos.filter(r => r.metodoPago === "efectivo").reduce((s, r) => s + r.valor, 0);
  const ingresosEfectivo = ingresos.filter(r => r.metodoPago === "efectivo").reduce((s, r) => s + r.valor, 0);
  // Solo se resta lo que salió de la caja al guardado, no los retiros del guardado
  const debeHaberEnCaja = saldoInicial + ventasEfectivo + ingresosEfectivo - gastosEfectivo - totalGuardado;
  const efectivoContadoNum = parseFloat(efectivoContado) || 0;
  const diferenciaCaja = efectivoContadoNum - debeHaberEnCaja;

  // ── Parse DB registros ──────────────────────────────────────
  function parseRegistros(data: any[]): RegistroLocal[] {
    return data.map(r => ({
      id: genId(),
      dbId: r.id,
      movimientoId: r.movimiento_id ?? undefined,
      fecha: r.fecha,
      hora: r.hora ?? "00:00:00",
      tipo: r.tipo as TipoRegistroCaja,
      descripcion: r.descripcion,
      productoId: r.movimientos?.producto_id ?? null,
      productoRef: r.movimientos?.productos?.referencia ?? null,
      tallaId: r.movimientos?.talla_id ?? null,
      tallaNombre: r.movimientos?.tallas?.nombre ?? null,
      cantidad: r.movimientos?.cantidad ?? 1,
      valor: r.valor,
      metodoPago: r.metodo_pago,
      montoEfectivo: r.monto_efectivo ?? 0,
      montoTransferencia: r.monto_transferencia ?? 0,
    }));
  }

  // ── Load data ───────────────────────────────────────────────
  const cargarDatos = useCallback(async () => {
    setLoading(true);
    const [{ data: cajaHoy }, { data: hist }] = await Promise.all([
      supabase.from("caja_diaria").select("*").eq("fecha", hoy).maybeSingle(),
      supabase.from("v_resumen_caja" as any).select("*").eq("estado", "cerrada")
        .order("fecha", { ascending: false }).limit(30),
    ]);

    setHistorial((hist as unknown as VResumenCaja[]) ?? []);

    if (cajaHoy) {
      setCajaDiariaId(cajaHoy.id);
      setSaldoInicial(cajaHoy.saldo_inicial);
      setCajaEstado(cajaHoy.estado);
      setEfectivoContadoCierre(cajaHoy.efectivo_contado ?? null);
      const { data: regs } = await supabase
        .from("registros_caja")
        .select("*, movimientos(producto_id, talla_id, cantidad, productos(referencia), tallas(nombre))")
        .eq("caja_diaria_id", cajaHoy.id)
        .order("hora", { ascending: true });
      setRegistros(parseRegistros(regs ?? []));
    } else {
      const { data: ultima } = await supabase
        .from("v_resumen_caja" as any).select("saldo_final")
        .eq("estado", "cerrada").order("fecha", { ascending: false }).limit(1).maybeSingle();
      if (ultima) setSaldoInicial((ultima as any).saldo_final ?? 0);
      setCajaDiariaId(null);
      setCajaEstado("abierta");
      setRegistros([]);
    }
    setLoading(false);
  }, [hoy]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Online / Offline detection ──────────────────────────────
  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => {
      setIsOnline(true);
      sincronizarPendientes();
    };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    cargarDatos();
    const pending = JSON.parse(localStorage.getItem(LS_KEY) ?? "[]") as PendingQueueItem[];
    setPendingCount(pending.length);
    if (pending.length > 0) toast(`${pending.length} registro(s) pendientes de sincronizar`, { icon: "⚠️" });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Ensure caja diaria exists ───────────────────────────────
  async function ensureCajaDiaria(): Promise<number> {
    if (cajaDiariaIdRef.current) return cajaDiariaIdRef.current;
    const { data: existing } = await supabase
      .from("caja_diaria").select("id").eq("fecha", hoy).maybeSingle();
    if (existing) {
      setCajaDiariaId(existing.id);
      return existing.id;
    }
    const { data, error } = await supabase
      .from("caja_diaria")
      .insert({ fecha: hoy, saldo_inicial: saldoInicial, guardado_caja_fuerte: 0, estado: "abierta" })
      .select("id").single();
    if (error || !data) throw new Error("Error creando caja: " + error?.message);
    setCajaDiariaId(data.id);
    return data.id;
  }

  // ── Guardar un registro en DB ────────────────────────────────
  async function guardarEnDB(
    data: Omit<RegistroLocal, "id" | "fecha" | "hora">,
    fecha: string,
    hora: string,
    cid: number
  ): Promise<{ dbId: number; movimientoId?: number }> {
    let movimientoId: number | undefined;

    // Para ventas: crear movimiento inmediatamente (stock se actualiza via trigger)
    if (data.tipo === "venta" && data.productoId && data.tallaId) {
      const { data: stockRow } = await supabase
        .from("stock").select("ubicacion_id, cantidad")
        .eq("producto_id", data.productoId).eq("talla_id", data.tallaId)
        .gt("cantidad", 0).order("cantidad", { ascending: false })
        .limit(1).maybeSingle();

      const { data: mov, error: movErr } = await supabase
        .from("movimientos")
        .insert({
          producto_id: data.productoId,
          talla_id: data.tallaId,
          ubicacion_id: stockRow?.ubicacion_id ?? 1,
          cantidad: data.cantidad,
          tipo: "salida" as const,
          canal: "venta_tienda" as const,
          precio_venta: data.valor / data.cantidad,
          metodo_pago: data.metodoPago as MetodoPago,
          caja_diaria_id: cid,
        }).select("id").single();

      if (movErr) throw movErr;
      movimientoId = mov?.id;
    }

    const { data: saved, error } = await supabase
      .from("registros_caja")
      .insert({
        caja_diaria_id: cid,
        movimiento_id: movimientoId ?? null,
        fecha,
        hora,
        tipo: data.tipo,
        descripcion: data.descripcion,
        valor: data.valor,
        metodo_pago: data.metodoPago,
        monto_efectivo: data.montoEfectivo,
        monto_transferencia: data.montoTransferencia,
      }).select("id").single();

    if (error) throw error;
    return { dbId: saved.id, movimientoId };
  }

  // ── Agregar registro (con optimistic update y fallback offline) ──
  async function agregarRegistro(data: Omit<RegistroLocal, "id" | "fecha" | "hora">) {
    const { fecha, hora } = getNow();
    const id = genId();
    const reg: RegistroLocal = { id, fecha, hora, pending: true, ...data };
    setRegistros(prev => [...prev, reg]);

    try {
      const cid = await ensureCajaDiaria();
      const { dbId, movimientoId } = await guardarEnDB(data, fecha, hora, cid);
      setRegistros(prev => prev.map(r => r.id === id ? { ...r, dbId, movimientoId, pending: false } : r));
      const labels: Record<TipoRegistroCaja, string> = {
        venta: "Venta registrada", gasto: "Gasto registrado",
        ingreso: "Ingreso registrado", caja_fuerte: "Guardado en caja fuerte",
      };
      toast.success(labels[data.tipo]);
    } catch {
      setRegistros(prev => prev.map(r => r.id === id ? { ...r, pending: true } : r));
      const pending: PendingQueueItem[] = JSON.parse(localStorage.getItem(LS_KEY) ?? "[]");
      pending.push({ ...reg, localId: id });
      localStorage.setItem(LS_KEY, JSON.stringify(pending));
      setPendingCount(pending.length);
      toast.error("Sin conexión — guardado localmente");
    }
  }

  // ── Sincronizar pendientes offline ──────────────────────────
  async function sincronizarPendientes() {
    const pending: PendingQueueItem[] = JSON.parse(localStorage.getItem(LS_KEY) ?? "[]");
    if (pending.length === 0) return;
    setSyncing(true);
    const restantes: PendingQueueItem[] = [];
    for (const item of pending) {
      try {
        const cid = await ensureCajaDiaria();
        const { dbId, movimientoId } = await guardarEnDB(item, item.fecha, item.hora, cid);
        setRegistros(prev => prev.map(r =>
          r.id === item.localId ? { ...r, dbId, movimientoId, pending: false } : r
        ));
      } catch {
        restantes.push(item);
      }
    }
    localStorage.setItem(LS_KEY, JSON.stringify(restantes));
    setPendingCount(restantes.length);
    if (restantes.length < pending.length)
      toast.success(`${pending.length - restantes.length} registro(s) sincronizados`);
    setSyncing(false);
  }

  // ── Eliminar registro ───────────────────────────────────────
  async function eliminarRegistro(localId: string) {
    if (loadingDelete) return;
    setLoadingDelete(true);
    const reg = registros.find(r => r.id === localId);
    setDeleteId(null);
    if (reg?.dbId) {
      // Primero borrar el registro de caja (tiene FK hacia movimientos)
      await supabase.from("registros_caja").delete().eq("id", reg.dbId);
      // Luego borrar el movimiento — al eliminarlo el stock se restaura automáticamente
      if (reg.movimientoId) {
        await supabase.from("movimientos").delete().eq("id", reg.movimientoId);
      }
    }
    setRegistros(prev => prev.filter(r => r.id !== localId));
    setLoadingDelete(false);
    toast.success(reg?.tipo === "venta" ? "Venta eliminada — stock restaurado" : "Registro eliminado");
  }

  // ── Cerrar caja ─────────────────────────────────────────────
  async function cerrarCaja() {
    if (!isAdmin) return;
    setLoadingCerrar(true);
    const regsSnapshot = [...registros];
    const saldoSnap = saldoInicial;
    const contadoSnap = efectivoContadoNum || debeHaberEnCaja;

    try {
      const cid = await ensureCajaDiaria();
      // Solo actualizar estado y datos de cierre — los totales se calculan en v_resumen_caja
      await supabase.from("caja_diaria").update({
        guardado_caja_fuerte: totalGuardado,
        efectivo_contado: contadoSnap,
        diferencia_caja: contadoSnap - debeHaberEnCaja,
        estado: "cerrada",
      }).eq("id", cid);

      setCajaEstado("cerrada");
      setModalCerrar(false);
      toast.success("¡Caja cerrada!");

      await cargarDatos();
    } catch (err: any) {
      toast.error("Error: " + err.message);
    } finally {
      setLoadingCerrar(false);
    }
  }

  // ── Reabrir caja ────────────────────────────────────────────
  async function reabrirCaja() {
    if (!isAdmin || !cajaDiariaId) return;
    if (!confirm("¿Reabrir la caja? Se podrán agregar más registros.")) return;
    const { error } = await supabase.from("caja_diaria").update({ estado: "abierta" }).eq("id", cajaDiariaId);
    if (error) { toast.error("Error al reabrir"); return; }
    setCajaEstado("abierta");
    toast.success("Caja reabierta");
    await cargarDatos();
  }

  // ── Descargar reporte ───────────────────────────────────────
  async function descargarReporte(params: ReporteParams) {
    setGenerandoReporte(true);
    setReporteParams(params);
    await new Promise(r => setTimeout(r, 300));
    try {
      const html2canvas = (await import("html2canvas")).default;
      const el = document.getElementById("reporte-cierre");
      if (!el) { toast.error("No se pudo generar el reporte"); return; }
      const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: "#ffffff", logging: false });
      const link = document.createElement("a");
      link.download = `cierre-caja-${params.fecha}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      toast.success("Reporte descargado");
    } catch {
      toast.error("Error generando reporte");
    } finally {
      setGenerandoReporte(false);
      setReporteParams(null);
    }
  }

  async function descargarHistorial(caja: VResumenCaja) {
    const { data: regs } = await supabase
      .from("registros_caja")
      .select("*, movimientos(producto_id, talla_id, cantidad, productos(referencia), tallas(nombre))")
      .eq("caja_diaria_id", caja.id).order("hora", { ascending: true });
    await descargarReporte({
      registros: parseRegistros(regs ?? []),
      saldoInicial: caja.saldo_inicial,
      fecha: caja.fecha,
      efectivoContado: caja.efectivo_contado ?? caja.saldo_final ?? 0,
    });
  }

  const fechaFormateada = new Intl.DateTimeFormat("es-CO", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
  }).format(new Date());

  // ── RENDER ─────────────────────────────────────────────────
  if (loading) return <Spinner className="h-screen" />;

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-8 pt-6 pb-24">

      {/* Reporte oculto para html2canvas */}
      {reporteParams && (
        <div style={{ position: "absolute", left: -9999, top: 0 }}>
          <ReporteCierre {...reporteParams} />
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <LayoutDashboard className="w-6 h-6 text-brand-blue" /> Caja
          </h1>
          <p className="text-xs text-gray-400 capitalize">{fechaFormateada}</p>
        </div>
        <div className="flex items-center gap-2">
          {!isOnline && (
            <span className="flex items-center gap-1 text-xs text-orange-600 bg-orange-50 border border-orange-200 px-2 py-1 rounded-lg">
              <WifiOff className="w-3 h-3" /> Sin conexión
            </span>
          )}
          {pendingCount > 0 && isOnline && (
            <button onClick={sincronizarPendientes} disabled={syncing}
              className="flex items-center gap-1 text-xs text-blue-600 bg-blue-50 border border-blue-200 px-2 py-1 rounded-lg hover:bg-blue-100">
              <RefreshCw className={`w-3 h-3 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Sincronizando..." : `${pendingCount} pendiente(s)`}
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6">
        {(["hoy", "historial"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${tab === t ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
            {t === "hoy" ? "Hoy" : "Historial"}
          </button>
        ))}
      </div>

      {/* ── TAB HOY ──────────────────────────────────────────── */}
      {tab === "hoy" && (
        <>
          {/* Resumen */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {[
              { label: "Ventas", value: totalVentas, color: "text-green-600", bg: "bg-green-50" },
              { label: "Efectivo", value: ventasEfectivo, color: "text-emerald-700", bg: "bg-emerald-50" },
              { label: "Transferencias", value: ventasTransferencia, color: "text-blue-600", bg: "bg-blue-50" },
              { label: "Comisiones", value: comisiones, color: "text-violet-600", bg: "bg-violet-50" },
            ].map(item => (
              <div key={item.label} className={`${item.bg} rounded-2xl p-4`}>
                <p className="text-xs text-gray-500 mb-1">{item.label}</p>
                <p className={`text-lg font-black ${item.color}`}>{formatCurrency(item.value)}</p>
              </div>
            ))}
          </div>

          {/* Saldo en caja */}
          <div className="card bg-brand-blue text-white mb-4">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                {/* Número grande: contado real si está cerrada, debe haber si está abierta */}
                {cajaEstado === "cerrada" && efectivoContadoCierre !== null ? (
                  <>
                    <p className="text-blue-200 text-sm">Contado real</p>
                    <p className="text-3xl font-black mb-1">{formatCurrency(efectivoContadoCierre)}</p>
                    {efectivoContadoCierre !== debeHaberEnCaja && (
                      <p className={`text-xs font-semibold mb-3 ${efectivoContadoCierre > debeHaberEnCaja ? "text-green-300" : "text-red-300"}`}>
                        {efectivoContadoCierre > debeHaberEnCaja ? "+" : ""}{formatCurrency(efectivoContadoCierre - debeHaberEnCaja)} vs lo esperado
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-blue-200 text-sm">Debe haber en caja</p>
                    <p className="text-3xl font-black mb-3">{formatCurrency(debeHaberEnCaja)}</p>
                  </>
                )}
                <div className="space-y-1 text-xs text-blue-200">
                  <div className="flex justify-between"><span>Saldo inicial</span><span>{formatCurrency(saldoInicial)}</span></div>
                  {ventasEfectivo > 0 && <div className="flex justify-between"><span>+ Ventas efectivo</span><span className="text-green-300">{formatCurrency(ventasEfectivo)}</span></div>}
                  {ventasTransferencia > 0 && <div className="flex justify-between opacity-60"><span>+ Ventas transferencia</span><span>{formatCurrency(ventasTransferencia)}</span></div>}
                  {ingresosEfectivo > 0 && <div className="flex justify-between"><span>+ Ingresos extra</span><span className="text-green-300">{formatCurrency(ingresosEfectivo)}</span></div>}
                  {gastosEfectivo > 0 && <div className="flex justify-between"><span>− Gastos</span><span className="text-red-300">{formatCurrency(gastosEfectivo)}</span></div>}
                  {totalGuardado > 0 && <div className="flex justify-between"><span>− Guardado</span><span className="text-amber-300">{formatCurrency(totalGuardado)}</span></div>}
                  {cajaEstado === "cerrada" && efectivoContadoCierre !== null && (
                    <div className="flex justify-between border-t border-blue-400 pt-1 mt-1">
                      <span>Debe haber en caja</span>
                      <span className="font-semibold text-white">{formatCurrency(debeHaberEnCaja)}</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="ml-4 mt-1">
                {cajaEstado === "cerrada" ? (
                  <div className="flex flex-col items-center gap-1">
                    <CheckCircle className="w-8 h-8 text-green-300" />
                    <span className="text-xs text-green-300 font-semibold">Cerrada</span>
                  </div>
                ) : (
                  <Lock className="w-8 h-8 text-blue-300 opacity-40" />
                )}
              </div>
            </div>
          </div>

          {/* Botones de acción */}
          {cajaEstado === "abierta" && (
            <div className="grid grid-cols-2 gap-3 mb-6">
              <button onClick={() => setModalVenta(true)}
                className="flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white font-bold py-3.5 rounded-2xl transition-colors active:scale-95">
                <ShoppingBag className="w-5 h-5" /> Venta
              </button>
              <button onClick={() => setModalGasto(true)}
                className="flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 text-white font-bold py-3.5 rounded-2xl transition-colors active:scale-95">
                <TrendingDown className="w-5 h-5" /> Gasto
              </button>
              <button onClick={() => setModalIngreso(true)}
                className="flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-600 text-white font-bold py-3.5 rounded-2xl transition-colors active:scale-95">
                <TrendingUp className="w-5 h-5" /> Ingreso
              </button>
              <button onClick={() => setModalCajaFuerte(true)}
                className="flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-bold py-3.5 rounded-2xl transition-colors active:scale-95">
                <Shield className="w-5 h-5" /> Guardar
              </button>
              <button onClick={() => setModalRetiro(true)}
                className="flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-bold py-3.5 rounded-2xl transition-colors active:scale-95">
                <Shield className="w-5 h-5" /> Retirar(de guardado)
              </button>
            </div>
          )}

          {/* Lista de registros */}
          <div className="space-y-2 mb-6">
            {registros.length === 0 ? (
              <div className="card text-center py-12 text-gray-400">
                <LayoutDashboard className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="font-medium">Sin movimientos hoy</p>
                <p className="text-sm mt-1 opacity-70">Los registros del día aparecerán aquí</p>
              </div>
            ) : (
              [...registros].reverse().map(r => {
                const esRetiro = r.tipo === "caja_fuerte" && r.valor < 0;
                const esPositivo = r.tipo === "venta" || r.tipo === "ingreso";
                const colorValor = r.tipo === "venta" || r.tipo === "ingreso" ? "text-green-600"
                  : esRetiro ? "text-orange-600"
                  : r.tipo === "caja_fuerte" ? "text-amber-700"
                  : "text-red-600";

                if (r.tipo === "venta") {
                  const pagoColor =
                    r.metodoPago === "efectivo"      ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                    r.metodoPago === "transferencia" ? "bg-blue-50 text-blue-700 border-blue-200" :
                                                       "bg-purple-50 text-purple-700 border-purple-200";
                  const pagoLabel =
                    r.metodoPago === "efectivo"      ? "Efe" :
                    r.metodoPago === "transferencia" ? "Transf" : "Mixto";
                  return (
                    <div key={r.id} className={`${getTipoRow(r.tipo, r.valor)} rounded-xl overflow-hidden ${r.pending ? "opacity-60" : ""}`}>
                      <div className={`grid items-center px-3 py-2.5 ${cajaEstado === "abierta" ? "grid-cols-[2.5rem_1fr_3rem_5rem_4.5rem_2rem]" : "grid-cols-[2.5rem_1fr_3rem_5rem_4.5rem]"}`}>
                        <span className="text-sm font-black text-gray-700 text-center">{r.cantidad}</span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate leading-tight">{r.productoRef ?? r.descripcion ?? "Artículo"}</p>
                          <p className="text-[10px] text-gray-400 leading-tight">{r.hora.slice(0, 5)}{r.pending && " · pendiente"}</p>
                        </div>
                        <span className="text-xs text-gray-500 text-center">{r.tallaNombre ?? "—"}</span>
                        <span className="text-sm font-black text-green-600 text-right">+{formatCurrency(r.valor)}</span>
                        <div className="flex justify-center">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${pagoColor}`}>{pagoLabel}</span>
                        </div>
                        {cajaEstado === "abierta" && (
                          <button onClick={() => setDeleteId(r.id)}
                            className="flex items-center justify-center p-1 rounded-lg text-gray-400 hover:text-red-500 hover:bg-white/60 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      {r.metodoPago === "mixto" && (
                        <div className="px-3 pb-2 flex gap-3 text-[10px] font-semibold">
                          <span className="text-emerald-600">Efe: {formatCurrency(r.montoEfectivo)}</span>
                          <span className="text-blue-600">Transf: {formatCurrency(r.montoTransferencia)}</span>
                        </div>
                      )}
                    </div>
                  );
                }

                return (
                  <div key={r.id} className={`${getTipoRow(r.tipo, r.valor)} rounded-xl px-4 py-3 flex items-center justify-between ${r.pending ? "opacity-60" : ""}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${getTipoBadge(r.tipo, r.valor)}`}>
                          {getTipoLabel(r.tipo, r.valor)}
                        </span>
                        {r.pending && <span className="text-xs text-orange-500 font-medium">• pendiente</span>}
                      </div>
                      <p className="text-sm font-semibold text-gray-900 truncate">{r.descripcion}</p>
                      <p className="text-xs text-gray-400">{r.hora.slice(0, 5)}</p>
                    </div>
                    <div className="flex items-center gap-2 ml-3">
                      <p className={`text-base font-black ${colorValor}`}>
                        {esPositivo ? "+" : "−"}{formatCurrency(Math.abs(r.valor))}
                      </p>
                      {cajaEstado === "abierta" && (
                        <button onClick={() => setDeleteId(r.id)}
                          className="p-1.5 rounded-lg hover:bg-white/60 text-gray-400 hover:text-red-500 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Acciones de cierre */}
          {cajaEstado === "abierta" && isAdmin && registros.length > 0 && (
            <button onClick={() => setModalCerrar(true)}
              className="w-full flex items-center justify-center gap-2 bg-gray-900 hover:bg-gray-800 text-white font-bold py-4 rounded-2xl transition-colors">
              <Lock className="w-5 h-5" /> Cerrar Caja
            </button>
          )}
          {cajaEstado === "cerrada" && isAdmin && (
            <div className="space-y-3">
              <button onClick={() => descargarReporte({ registros, saldoInicial, fecha: hoy, efectivoContado: efectivoContadoNum || debeHaberEnCaja })}
                className="w-full flex items-center justify-center gap-2 bg-brand-blue hover:bg-blue-700 text-white font-bold py-4 rounded-2xl transition-colors">
                <Download className="w-5 h-5" /> Descargar Reporte
              </button>
              <button onClick={reabrirCaja}
                className="w-full flex items-center justify-center gap-2 bg-white border-2 border-gray-200 hover:border-gray-300 text-gray-700 font-bold py-3 rounded-2xl transition-colors">
                Reabrir Caja
              </button>
            </div>
          )}
        </>
      )}

      {/* ── TAB HISTORIAL ─────────────────────────────────────── */}
      {tab === "historial" && (
        <HistorialTab
          historial={historial}
          onDescargar={descargarHistorial}
        />
      )}

      {/* ── MODALS ────────────────────────────────────────────── */}
      {modalVenta && <ModalVenta onClose={() => setModalVenta(false)} onSave={agregarRegistro} />}
      {modalGasto && <ModalGasto onClose={() => setModalGasto(false)} onSave={agregarRegistro} />}
      {modalIngreso && <ModalIngreso onClose={() => setModalIngreso(false)} onSave={agregarRegistro} />}
      {modalCajaFuerte && <ModalCajaFuerte onClose={() => setModalCajaFuerte(false)} onSave={agregarRegistro} modo="guardar" />}
      {modalRetiro && <ModalCajaFuerte onClose={() => setModalRetiro(false)} onSave={agregarRegistro} modo="retirar" />}

      {/* Modal confirmar cierre */}
      {modalCerrar && (
        <Modal open onClose={() => setModalCerrar(false)} title="Cerrar Caja">
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-xl p-4 space-y-1.5">
              <div className="flex justify-between text-sm"><span className="text-gray-500">Saldo inicial</span><span className="font-semibold text-gray-700">{formatCurrency(saldoInicial)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-500">+ Ventas efectivo</span><span className="font-semibold text-green-600">+ {formatCurrency(ventasEfectivo)}</span></div>
              {ventasTransferencia > 0 && <div className="flex justify-between text-sm"><span className="text-gray-400 italic">  Ventas transferencia</span><span className="text-gray-400 italic">{formatCurrency(ventasTransferencia)}</span></div>}
              {ingresosEfectivo > 0 && <div className="flex justify-between text-sm"><span className="text-gray-500">+ Ingresos extra (efe)</span><span className="font-semibold text-blue-600">+ {formatCurrency(ingresosEfectivo)}</span></div>}
              {gastosEfectivo > 0 && <div className="flex justify-between text-sm"><span className="text-gray-500">− Gastos efectivo</span><span className="font-semibold text-red-600">− {formatCurrency(gastosEfectivo)}</span></div>}
              {totalGuardado > 0 && <div className="flex justify-between text-sm"><span className="text-gray-500">− Guardado caja fuerte</span><span className="font-semibold text-amber-600">− {formatCurrency(totalGuardado)}</span></div>}
              <div className="border-t pt-2 mt-2 flex justify-between"><span className="font-bold text-gray-900">Debe haber en caja</span><span className="font-black text-brand-blue text-lg">{formatCurrency(debeHaberEnCaja)}</span></div>
            </div>
            <div>
              <label className="label">Efectivo contado (opcional)</label>
              <InputDinero value={efectivoContado} onChange={raw => setEfectivoContado(raw)}
                className="input" placeholder={String(Math.round(debeHaberEnCaja))} />
              {efectivoContado && diferenciaCaja !== 0 && (
                <p className={`text-sm mt-2 font-semibold ${diferenciaCaja > 0 ? "text-green-600" : "text-red-600"}`}>
                  Diferencia: {diferenciaCaja > 0 ? "+" : ""}{formatCurrency(diferenciaCaja)}
                </p>
              )}
            </div>
            <Button className="w-full" size="lg" onClick={cerrarCaja} loading={loadingCerrar}>
              <Lock className="w-5 h-5" /> Confirmar Cierre
            </Button>
          </div>
        </Modal>
      )}

      {/* Modal confirmar eliminación */}
      {deleteId && (
        <Modal open onClose={() => setDeleteId(null)} title="Eliminar registro">
          <div className="space-y-4">
            <p className="text-sm text-gray-500">¿Eliminar este registro? Si es una venta, el stock se restaurará automáticamente.</p>
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setDeleteId(null)}>Cancelar</Button>
              <Button variant="danger" className="flex-1" onClick={() => eliminarRegistro(deleteId)}>
                <Trash2 className="w-4 h-4" /> Eliminar
              </Button>
            </div>
          </div>
        </Modal>
      )}

    </div>
  );
}
