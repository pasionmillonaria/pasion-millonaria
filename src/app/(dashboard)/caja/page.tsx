"use client";

import { useEffect, useState, useCallback } from "react";
import {
  LayoutDashboard, Plus, Lock, Trash2, Download, AlertCircle,
  ShoppingBag, TrendingDown, TrendingUp, Shield, History,
  CheckCircle, Calendar, FileText, X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/lib/context/ProfileContext";
import { formatCurrency, formatDate } from "@/lib/utils";
import BuscadorProducto from "@/components/BuscadorProducto";
import SelectorTalla from "@/components/SelectorTalla";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";
import toast from "react-hot-toast";
import type { MetodoPago, TipoRegistroCaja } from "@/lib/types";

// ─────────────────────────────────────────────────────────────
// LOCAL TYPES
// ─────────────────────────────────────────────────────────────
interface RegistroLocal {
  id: string;
  dbId?: string;
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

interface CajaDiariaResumen {
  id: number;
  fecha: string;
  saldo_inicial: number;
  saldo_final: number;
  total_efectivo: number;
  total_transferencias: number;
  total_gastos: number;
  total_ingresos_extra: number;
  guardado_caja_fuerte: number;
  cantidad_ventas: number;
  efectivo_contado: number | null;
  diferencia_caja: number | null;
  estado: "abierta" | "cerrada";
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────
function genId() {
  return `l-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function getNow() {
  const now = new Date();
  return {
    fecha: now.toISOString().slice(0, 10),
    hora: now.toTimeString().slice(0, 8),
  };
}

const TIPO_LABEL: Record<TipoRegistroCaja, string> = {
  venta: "VENTA",
  gasto: "GASTO",
  ingreso: "INGRESO",
  caja_fuerte: "CAJA FUERTE",
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

const LS_KEY = "caja_pending_v1";

// ─────────────────────────────────────────────────────────────
// MODAL VENTA
// ─────────────────────────────────────────────────────────────
function ModalVenta({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (r: Omit<RegistroLocal, "id" | "fecha" | "hora">) => void;
}) {
  const supabase = createClient();
  const [paso, setPaso] = useState<"producto" | "talla" | "detalle">("producto");
  const [producto, setProducto] = useState<any>(null);
  const [tallas, setTallas] = useState<TallaStock[]>([]);
  const [tallaId, setTallaId] = useState<number | null>(null);
  const [tallaNombre, setTallaNombre] = useState("");
  const [cantidad, setCantidad] = useState(1);
  const [precio, setPrecio] = useState("");
  const [metodo, setMetodo] = useState<"efectivo" | "transferencia" | "mixto">("efectivo");
  const [montoEfe, setMontoEfe] = useState(0);
  const [montoTransf, setMontoTransf] = useState(0);

  const total = (parseFloat(precio) || 0) * cantidad;

  async function handleSelectProducto(p: any) {
    setProducto(p);
    setPrecio(String(p.precio_base));

    const { data: stockData } = await supabase
      .from("v_stock_total")
      .select("talla, stock_tienda, stock_bodega")
      .eq("producto_id", p.id);

    if (stockData?.length) {
      const nombres = stockData.map((d: any) => d.talla);
      const { data: tallasData } = await supabase
        .from("tallas")
        .select("id, nombre")
        .in("nombre", nombres);

      setTallas(
        stockData.map((d: any) => ({
          talla_id: tallasData?.find((t: any) => t.nombre === d.talla)?.id ?? 0,
          talla_nombre: d.talla,
          stock_tienda: d.stock_tienda ?? 0,
          stock_bodega: d.stock_bodega ?? 0,
        }))
      );
    }
    setPaso("talla");
  }

  function handleSelectTalla(id: number) {
    setTallaId(id);
    setTallaNombre(tallas.find((t) => t.talla_id === id)?.talla_nombre ?? "");
    setPaso("detalle");
  }

  useEffect(() => {
    if (metodo === "efectivo") { setMontoEfe(total); setMontoTransf(0); }
    else if (metodo === "transferencia") { setMontoTransf(total); setMontoEfe(0); }
    // mixto: don't reset, let user fill
  }, [metodo, total]);

  const mixtoValido = metodo !== "mixto" || montoEfe + montoTransf === total;

  function handleSave() {
    if (!producto || !tallaId || total <= 0) return;
    if (!mixtoValido) { toast.error(`Efectivo + Transferencia debe sumar ${formatCurrency(total)}`); return; }
    onSave({
      tipo: "venta",
      descripcion: producto.referencia,
      productoId: producto.id,
      productoRef: producto.referencia,
      tallaId,
      tallaNombre,
      cantidad,
      valor: total,
      metodoPago: metodo,
      montoEfectivo: metodo === "efectivo" ? total : metodo === "mixto" ? montoEfe : 0,
      montoTransferencia: metodo === "transferencia" ? total : metodo === "mixto" ? montoTransf : 0,
    });
    onClose();
  }

  return (
    <Modal open onClose={onClose} title="Registrar Venta" size="md">
      <div className="space-y-4">
        {/* Producto */}
        <div>
          <label className="label">Producto</label>
          {producto ? (
            <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-4 py-3">
              <div>
                <p className="font-bold text-gray-900">{producto.referencia}</p>
                <p className="text-xs text-gray-500">{producto.codigo}</p>
              </div>
              <button
                onClick={() => { setProducto(null); setTallaId(null); setTallas([]); setPaso("producto"); }}
                className="text-xs text-brand-blue font-medium"
              >
                Cambiar
              </button>
            </div>
          ) : (
            <BuscadorProducto onSelect={handleSelectProducto} />
          )}
        </div>

        {/* Talla */}
        {paso !== "producto" && tallas.length > 0 && (
          <div>
            <label className="label">Talla</label>
            <SelectorTalla tallas={tallas} seleccionada={tallaId} onSelect={handleSelectTalla} />
          </div>
        )}

        {/* Detalle */}
        {paso === "detalle" && tallaId && (
          <>
            <div>
              <label className="label">Cantidad</label>
              <div className="flex items-center gap-3">
                <button onClick={() => setCantidad(Math.max(1, cantidad - 1))}
                  className="w-10 h-10 rounded-xl bg-gray-100 font-bold text-xl flex items-center justify-center">−</button>
                <span className="text-2xl font-bold w-8 text-center">{cantidad}</span>
                <button onClick={() => setCantidad(cantidad + 1)}
                  className="w-10 h-10 rounded-xl bg-gray-100 font-bold text-xl flex items-center justify-center">+</button>
              </div>
            </div>

            <div>
              <label className="label">Precio unitario</label>
              <input type="number" value={precio} onChange={(e) => setPrecio(e.target.value)}
                className="input" placeholder="0" />
            </div>

            <div>
              <label className="label">Método de pago</label>
              <div className="grid grid-cols-3 gap-2">
                {(["efectivo", "transferencia", "mixto"] as const).map((m) => (
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
                    <input type="number" value={montoEfe}
                      onChange={(e) => { const v = parseFloat(e.target.value) || 0; setMontoEfe(v); setMontoTransf(total - v); }}
                      className="input font-bold text-green-700" />
                  </div>
                  <div>
                    <label className="label text-blue-700">Transferencia</label>
                    <input type="number" value={montoTransf}
                      onChange={(e) => { const v = parseFloat(e.target.value) || 0; setMontoTransf(v); setMontoEfe(total - v); }}
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

            <Button className="w-full" onClick={handleSave} disabled={!mixtoValido || total <= 0}>
              Guardar Venta
            </Button>
          </>
        )}
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// MODAL GASTO
// ─────────────────────────────────────────────────────────────
function ModalGasto({
  onClose,
  onSave,
}: {
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
      tipo: "gasto",
      descripcion: descripcion.trim(),
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
          <input type="text" value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
            className="input" placeholder="Ej: Almuerzo, pago luz, bolsas..." autoFocus />
        </div>
        <div>
          <label className="label">Valor</label>
          <input type="number" value={valor} onChange={(e) => setValor(e.target.value)}
            className="input" placeholder="0" />
        </div>
        <div>
          <label className="label">Pagado con</label>
          <div className="grid grid-cols-2 gap-2">
            {(["efectivo", "transferencia"] as const).map((m) => (
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
function ModalIngreso({
  onClose,
  onSave,
}: {
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
      tipo: "ingreso",
      descripcion: descripcion.trim(),
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
          Dinero que entra a caja sin ser por venta: cambios que traen, préstamos, devoluciones de proveedores, etc.
        </p>
        <div>
          <label className="label">Descripción</label>
          <input type="text" value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
            className="input" placeholder="Ej: Cambio que trajeron, devolución proveedor..." autoFocus />
        </div>
        <div>
          <label className="label">Valor</label>
          <input type="number" value={valor} onChange={(e) => setValor(e.target.value)}
            className="input" placeholder="0" />
        </div>
        <div>
          <label className="label">Forma de ingreso</label>
          <div className="grid grid-cols-2 gap-2">
            {(["efectivo", "transferencia"] as const).map((m) => (
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
// MODAL CAJA FUERTE
// ─────────────────────────────────────────────────────────────
function ModalCajaFuerte({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (r: Omit<RegistroLocal, "id" | "fecha" | "hora">) => void;
}) {
  const [valor, setValor] = useState("");

  function handleSave() {
    const v = parseFloat(valor);
    if (!v) { toast.error("Ingresa el valor"); return; }
    onSave({
      tipo: "caja_fuerte",
      descripcion: "Guardado en caja fuerte",
      productoId: null, productoRef: null, tallaId: null, tallaNombre: null,
      cantidad: 1, valor: v, metodoPago: "efectivo",
      montoEfectivo: v, montoTransferencia: 0,
    });
    onClose();
  }

  return (
    <Modal open onClose={onClose} title="Guardar en Caja Fuerte">
      <div className="space-y-4">
        <p className="text-sm text-gray-500 bg-yellow-50 rounded-xl p-3 border border-yellow-100">
          Registra el efectivo que se saca de la caja para guardar en lugar seguro. Esto descuenta del efectivo disponible.
        </p>
        <div>
          <label className="label">Valor a guardar</label>
          <input type="number" value={valor} onChange={(e) => setValor(e.target.value)}
            className="input text-xl font-bold" placeholder="0" autoFocus />
        </div>
        <button
          onClick={handleSave}
          className="w-full btn-gold flex items-center justify-center gap-2"
        >
          <Shield className="w-5 h-5" /> Guardar en Caja Fuerte
        </button>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// REPORTE COMPONENT (rendered hidden, captured by html2canvas)
// ─────────────────────────────────────────────────────────────
interface ReporteParams {
  registros: RegistroLocal[];
  saldoInicial: number;
  fecha: string;
  efectivoContado: number;
}

function ReporteCierre({ registros, saldoInicial, fecha, efectivoContado }: ReporteParams) {
  const ventas = registros.filter((r) => r.tipo === "venta");
  const gastos = registros.filter((r) => r.tipo === "gasto");
  const ingresos = registros.filter((r) => r.tipo === "ingreso");
  const cajaFuerteList = registros.filter((r) => r.tipo === "caja_fuerte");

  const totalVentas = ventas.reduce((s, r) => s + r.valor, 0);
  const totalGastos = gastos.reduce((s, r) => s + r.valor, 0);
  const totalIngresos = ingresos.reduce((s, r) => s + r.valor, 0);
  const totalCajaFuerte = cajaFuerteList.reduce((s, r) => s + r.valor, 0);
  const ventasEfe = ventas.reduce((s, r) => s + r.montoEfectivo, 0);
  const ventasTransf = ventas.reduce((s, r) => s + r.montoTransferencia, 0);
  const gastosEfe = gastos.filter((r) => r.metodoPago === "efectivo").reduce((s, r) => s + r.valor, 0);
  const ingresosEfe = ingresos.filter((r) => r.metodoPago === "efectivo").reduce((s, r) => s + r.valor, 0);
  const debeHaber = saldoInicial + ventasEfe + ingresosEfe - gastosEfe - totalCajaFuerte;
  const diferencia = efectivoContado - debeHaber;

  const S = (v: number) => `font-size:${v}px`;

  return (
    <div
      id="reporte-cierre"
      style={{
        width: 600, padding: 40, fontFamily: "Arial, sans-serif",
        background: "#fff", color: "#111", lineHeight: 1.4,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "2px solid #e5e7eb", paddingBottom: 20, marginBottom: 24 }}>
        <div>
          <p style={{ fontSize: 26, fontWeight: 900, margin: 0 }}>Cierre de Caja</p>
          <p style={{ fontSize: 14, color: "#6b7280", margin: "4px 0 0" }}>{formatDate(fecha)}</p>
        </div>
        <div style={{ textAlign: "right" }}>
          <p style={{ fontSize: 13, fontWeight: 800, color: "#003366", textTransform: "uppercase", letterSpacing: 1, margin: 0 }}>Pasión Millonaria</p>
          <p style={{ fontSize: 12, color: "#10b981", fontWeight: 700, margin: "4px 0 0" }}>✓ Verificado</p>
        </div>
      </div>

      {/* Top totals */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
        {[
          ["Total Ventas", totalVentas, "#f9fafb", "#111"],
          ["Transferencias", ventasTransf, "#eff6ff", "#1d4ed8"],
          ["Ventas Efectivo", ventasEfe, "#f0fdf4", "#047857"],
        ].map(([label, val, bg, color]) => (
          <div key={String(label)} style={{ flex: 1, background: String(bg), borderRadius: 12, padding: 14 }}>
            <p style={{ fontSize: 10, textTransform: "uppercase", color: "#9ca3af", fontWeight: 700, margin: "0 0 4px" }}>{String(label)}</p>
            <p style={{ fontSize: 18, fontWeight: 900, color: String(color), margin: 0 }}>{formatCurrency(Number(val))}</p>
          </div>
        ))}
      </div>

      {/* Ventas */}
      {ventas.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 10, fontWeight: 800, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>Ventas del día ({ventas.length})</p>
          {ventas.map((v, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "7px 10px", background: "#f9fafb", borderRadius: 8, marginBottom: 3, fontSize: 12 }}>
              <div>
                <span style={{ fontWeight: 700 }}>{v.cantidad}× {v.productoRef}</span>
                {v.tallaNombre && <span style={{ color: "#9ca3af", marginLeft: 8 }}>Talla: {v.tallaNombre}</span>}
                <span style={{ color: "#9ca3af", marginLeft: 8, textTransform: "capitalize" }}>{v.metodoPago}</span>
              </div>
              <div style={{ textAlign: "right" }}>
                <span style={{ fontWeight: 800 }}>{formatCurrency(v.valor)}</span>
                {v.metodoPago === "mixto" && (
                  <div style={{ fontSize: 10, color: "#9ca3af" }}>
                    E:{formatCurrency(v.montoEfectivo)} T:{formatCurrency(v.montoTransferencia)}
                  </div>
                )}
              </div>
            </div>
          ))}
          <div style={{ textAlign: "right", fontSize: 12, fontWeight: 800, marginTop: 4 }}>
            Total ventas: {formatCurrency(totalVentas)}
          </div>
        </div>
      )}

      {/* Gastos */}
      {gastos.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 10, fontWeight: 800, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>Gastos</p>
          {gastos.map((g, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "7px 10px", background: "#fff5f5", borderRadius: 8, marginBottom: 3, fontSize: 12 }}>
              <span style={{ fontWeight: 600 }}>{g.descripcion}</span>
              <span style={{ fontWeight: 800, color: "#dc2626" }}>- {formatCurrency(g.valor)}</span>
            </div>
          ))}
          <div style={{ textAlign: "right", fontSize: 12, fontWeight: 800, marginTop: 4, color: "#dc2626" }}>
            Total gastos: - {formatCurrency(totalGastos)}
          </div>
        </div>
      )}

      {/* Ingresos extra */}
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

      {/* Caja fuerte guardado */}
      {cajaFuerteList.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 10, fontWeight: 800, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>Guardado en Caja Fuerte</p>
          {cajaFuerteList.map((g, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "7px 10px", background: "#fefce8", borderRadius: 8, marginBottom: 3, fontSize: 12 }}>
              <span style={{ fontWeight: 600 }}>{g.descripcion}</span>
              <span style={{ fontWeight: 800, color: "#92400e" }}>- {formatCurrency(g.valor)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Cuenta de caja */}
      <div style={{ borderTop: "2px solid #e5e7eb", paddingTop: 20 }}>
        <p style={{ fontSize: 10, fontWeight: 800, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 2, marginBottom: 12 }}>Cuenta de Caja</p>
        <div style={{ display: "flex", gap: 12 }}>
          {/* Cálculo */}
          <div style={{ flex: 2, background: "#eff6ff", borderRadius: 12, padding: 16 }}>
            {[
              ["Saldo inicial", saldoInicial, false],
              ["+ Ventas efectivo", ventasEfe, false],
              ["+ Ingresos extra (efe)", ingresosEfe, false],
              ["− Gastos efectivo", gastosEfe, true],
              ["− Guardado caja fuerte", totalCajaFuerte, true],
            ].map(([lbl, val, neg]) => (
              <div key={String(lbl)} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 5, color: neg ? "#dc2626" : "#374151" }}>
                <span>{String(lbl)}</span>
                <span style={{ fontWeight: 700 }}>{neg ? "- " : ""}{formatCurrency(Number(val))}</span>
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
          {/* Guardado */}
          <div style={{ flex: 1, background: "#111827", borderRadius: 12, padding: 16, color: "#fff" }}>
            <p style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", fontWeight: 700, marginBottom: 12 }}>Guardado</p>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", margin: "0 0 4px" }}>Total guardado hoy</p>
            <p style={{ fontSize: 22, fontWeight: 900, margin: 0 }}>{formatCurrency(totalCajaFuerte)}</p>
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
// SUMMARY ROW
// ─────────────────────────────────────────────────────────────
function SRow({ label, value, color, bold }: { label: string; value: number; color?: string; bold?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className={`text-sm ${bold ? "font-bold text-gray-900" : "text-gray-500"}`}>{label}</span>
      <span className={`text-sm font-semibold ${color ?? (bold ? "text-gray-900 font-black" : "text-gray-700")}`}>
        {formatCurrency(value)}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// HISTORIAL TAB
// ─────────────────────────────────────────────────────────────
function HistorialTab({
  historial,
  onVer,
  onDescargar,
}: {
  historial: CajaDiariaResumen[];
  onVer: (c: CajaDiariaResumen) => void;
  onDescargar: (c: CajaDiariaResumen) => void;
}) {
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
      {historial.map((c) => (
        <div key={c.id} className="card flex items-center justify-between">
          <div>
            <p className="font-bold text-gray-900">{formatDate(c.fecha)}</p>
            <div className="flex gap-3 text-xs text-gray-500 mt-1">
              <span>{c.cantidad_ventas ?? 0} ventas</span>
              <span>Ventas: {formatCurrency((c.total_efectivo ?? 0) + (c.total_transferencias ?? 0))}</span>
              {(c.total_gastos ?? 0) > 0 && <span>Gastos: {formatCurrency(c.total_gastos ?? 0)}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-right mr-1">
              <p className="font-black text-brand-blue text-lg">{formatCurrency(c.saldo_final)}</p>
              <p className="text-xs text-gray-400">Saldo final</p>
            </div>
            <button onClick={() => onVer(c)}
              title="Ver detalle"
              className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
              <FileText className="w-4 h-4" />
            </button>
            <button onClick={() => onDescargar(c)}
              title="Descargar reporte"
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

  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"hoy" | "historial">("hoy");

  // Today
  const [registros, setRegistros] = useState<RegistroLocal[]>([]);
  const [saldoInicial, setSaldoInicial] = useState(0);
  const [cajaDiariaId, setCajaDiariaId] = useState<number | null>(null);
  const [cajaEstado, setCajaEstado] = useState<"abierta" | "cerrada">("abierta");

  // History
  const [historial, setHistorial] = useState<CajaDiariaResumen[]>([]);
  const [historialDetalle, setHistorialDetalle] = useState<{
    caja: CajaDiariaResumen;
    registros: RegistroLocal[];
  } | null>(null);

  // Modals
  const [modalVenta, setModalVenta] = useState(false);
  const [modalGasto, setModalGasto] = useState(false);
  const [modalIngreso, setModalIngreso] = useState(false);
  const [modalCajaFuerte, setModalCajaFuerte] = useState(false);
  const [modalCerrar, setModalCerrar] = useState(false);
  const [loadingCerrar, setLoadingCerrar] = useState(false);
  const [efectivoContado, setEfectivoContado] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Report rendering
  const [reporteParams, setReporteParams] = useState<ReporteParams | null>(null);
  const [generandoReporte, setGenerandoReporte] = useState(false);

  const hoy = new Date().toISOString().slice(0, 10);

  // ─── Computed ─────────────────────────────────────────────
  const ventas = registros.filter((r) => r.tipo === "venta");
  const gastos = registros.filter((r) => r.tipo === "gasto");
  const ingresos = registros.filter((r) => r.tipo === "ingreso");
  const cajaFuerteItems = registros.filter((r) => r.tipo === "caja_fuerte");

  const totalVentas = ventas.reduce((s, r) => s + r.valor, 0);
  const totalGastos = gastos.reduce((s, r) => s + r.valor, 0);
  const totalIngresos = ingresos.reduce((s, r) => s + r.valor, 0);
  const totalCajaFuerte = cajaFuerteItems.reduce((s, r) => s + r.valor, 0);
  const ventasEfectivo = ventas.reduce((s, r) => s + r.montoEfectivo, 0);
  const ventasTransferencia = ventas.reduce((s, r) => s + r.montoTransferencia, 0);
  const gastosEfectivo = gastos.filter((r) => r.metodoPago === "efectivo").reduce((s, r) => s + r.valor, 0);
  const ingresosEfectivo = ingresos.filter((r) => r.metodoPago === "efectivo").reduce((s, r) => s + r.valor, 0);
  const debeHaberEnCaja = saldoInicial + ventasEfectivo + ingresosEfectivo - gastosEfectivo - totalCajaFuerte;
  const efectivoContadoNum = parseFloat(efectivoContado) || 0;
  const diferenciaCaja = efectivoContadoNum - debeHaberEnCaja;

  // ─── Parse DB registros ───────────────────────────────────
  function parseRegistros(data: any[]): RegistroLocal[] {
    return data.map((r) => ({
      id: genId(),
      dbId: r.id,
      fecha: r.fecha,
      hora: r.hora ?? "00:00:00",
      tipo: r.tipo as TipoRegistroCaja,
      descripcion: r.descripcion,
      productoId: r.producto_id,
      productoRef: r.productos?.referencia ?? null,
      tallaId: r.talla_id,
      tallaNombre: r.tallas?.nombre ?? null,
      cantidad: r.cantidad ?? 1,
      valor: r.valor,
      metodoPago: r.metodo_pago,
      montoEfectivo: r.monto_efectivo ?? 0,
      montoTransferencia: r.monto_transferencia ?? 0,
    }));
  }

  // ─── Load data ────────────────────────────────────────────
  const cargarDatos = useCallback(async () => {
    setLoading(true);

    const [{ data: cajaHoy }, { data: hist }] = await Promise.all([
      supabase.from("caja_diaria").select("*").eq("fecha", hoy).maybeSingle(),
      supabase.from("caja_diaria").select("*").eq("estado", "cerrada").order("fecha", { ascending: false }).limit(30),
    ]);

    setHistorial((hist as CajaDiariaResumen[]) ?? []);

    if (cajaHoy) {
      setCajaDiariaId(cajaHoy.id);
      setSaldoInicial(cajaHoy.saldo_inicial);
      setCajaEstado(cajaHoy.estado);

      const { data: regs } = await supabase
        .from("registros_caja")
        .select("*, productos(referencia), tallas(nombre)")
        .eq("fecha", hoy)
        .order("hora", { ascending: true });

      setRegistros(parseRegistros(regs ?? []));
    } else {
      // Use last closed caja's saldo_final as default
      const { data: ultima } = await supabase
        .from("caja_diaria")
        .select("saldo_final")
        .eq("estado", "cerrada")
        .order("fecha", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (ultima) setSaldoInicial(ultima.saldo_final);
      setCajaDiariaId(null);
      setCajaEstado("abierta");
      setRegistros([]);
    }

    setLoading(false);
  }, [hoy]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    cargarDatos();
    // Check for pending offline records
    const pending = JSON.parse(localStorage.getItem(LS_KEY) ?? "[]") as RegistroLocal[];
    if (pending.length > 0) {
      toast(`${pending.length} registro(s) pendientes de sincronizar`, { icon: "⚠️" });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Ensure caja diaria exists ────────────────────────────
  async function ensureCajaDiaria(): Promise<number> {
    if (cajaDiariaId) return cajaDiariaId;

    const { data: existing } = await supabase
      .from("caja_diaria")
      .select("id")
      .eq("fecha", hoy)
      .eq("estado", "abierta")
      .maybeSingle();

    if (existing) {
      setCajaDiariaId(existing.id);
      return existing.id;
    }

    const { data, error } = await supabase
      .from("caja_diaria")
      .insert({
        fecha: hoy,
        saldo_inicial: saldoInicial,
        total_efectivo: 0,
        total_nequi: 0,
        total_transferencias: 0,
        total_datafono: 0,
        total_descuentos: 0,
        total_devoluciones: 0,
        total_gastos: 0,
        total_ingresos_extra: 0,
        guardado_caja_fuerte: 0,
        saldo_final: 0,
        cantidad_ventas: 0,
        estado: "abierta",
      } as any)
      .select("id")
      .single();

    if (error || !data) throw new Error("Error creando caja: " + error?.message);
    setCajaDiariaId(data.id);
    return data.id;
  }

  // ─── Add registro ──────────────────────────────────────────
  async function agregarRegistro(data: Omit<RegistroLocal, "id" | "fecha" | "hora">) {
    const { fecha, hora } = getNow();
    const id = genId();
    const reg: RegistroLocal = { id, fecha, hora, pending: true, ...data };

    // Optimistic update
    setRegistros((prev) => [...prev, reg]);

    try {
      const cid = await ensureCajaDiaria();
      const { data: saved, error } = await supabase
        .from("registros_caja")
        .insert({
          fecha,
          hora,
          tipo: data.tipo,
          descripcion: data.descripcion,
          producto_id: data.productoId,
          talla_id: data.tallaId,
          cantidad: data.cantidad,
          valor: data.valor,
          metodo_pago: data.metodoPago,
          monto_efectivo: data.montoEfectivo,
          monto_transferencia: data.montoTransferencia,
          caja_diaria_id: cid,
        })
        .select("id")
        .single();

      if (error) throw error;

      setRegistros((prev) =>
        prev.map((r) => (r.id === id ? { ...r, dbId: saved?.id, pending: false } : r))
      );

      const labels: Record<TipoRegistroCaja, string> = {
        venta: "Venta registrada",
        gasto: "Gasto registrado",
        ingreso: "Ingreso registrado",
        caja_fuerte: "Guardado en caja fuerte",
      };
      toast.success(labels[data.tipo]);
    } catch (err: any) {
      setRegistros((prev) => prev.map((r) => (r.id === id ? { ...r, pending: true } : r)));
      const pending = JSON.parse(localStorage.getItem(LS_KEY) ?? "[]");
      localStorage.setItem(LS_KEY, JSON.stringify([...pending, reg]));
      toast.error("Sin conexión — guardado localmente");
    }
  }

  // ─── Delete registro ──────────────────────────────────────
  async function eliminarRegistro(localId: string) {
    const reg = registros.find((r) => r.id === localId);
    setRegistros((prev) => prev.filter((r) => r.id !== localId));
    setDeleteId(null);
    if (reg?.dbId) {
      await supabase.from("registros_caja").delete().eq("id", reg.dbId);
    }
    toast.success("Eliminado");
  }

  // ─── Close caja ───────────────────────────────────────────
  async function cerrarCaja() {
    if (!isAdmin) return;
    setLoadingCerrar(true);

    // Snapshot for report (before state changes)
    const regsSnapshot = [...registros];
    const saldoSnap = saldoInicial;
    const contadoSnap = efectivoContadoNum || debeHaberEnCaja;

    try {
      const cid = await ensureCajaDiaria();

      await supabase.from("caja_diaria").update({
        saldo_inicial: saldoInicial,
        total_efectivo: ventasEfectivo,
        total_transferencias: ventasTransferencia,
        total_nequi: 0,
        total_datafono: 0,
        total_gastos: totalGastos,
        total_ingresos_extra: totalIngresos,
        guardado_caja_fuerte: totalCajaFuerte,
        saldo_final: contadoSnap,
        cantidad_ventas: ventas.length,
        efectivo_contado: contadoSnap,
        diferencia_caja: diferenciaCaja,
        estado: "cerrada",
      } as any).eq("id", cid);

      // Create movimientos for each venta
      for (const v of ventas) {
        if (!v.productoId || !v.tallaId) continue;
        const { data: stockData } = await supabase
          .from("stock")
          .select("ubicacion_id")
          .eq("producto_id", v.productoId)
          .eq("talla_id", v.tallaId)
          .order("cantidad", { ascending: false })
          .limit(1)
          .maybeSingle();

        await supabase.from("movimientos").insert({
          producto_id: v.productoId,
          talla_id: v.tallaId,
          ubicacion_id: stockData?.ubicacion_id ?? 1,
          cantidad: v.cantidad,
          tipo: "salida",
          canal: "venta_tienda",
          precio_venta: v.valor / v.cantidad,
          metodo_pago: v.metodoPago as MetodoPago,
          usuario_id: null,
        });
      }

      setCajaEstado("cerrada");
      setModalCerrar(false);
      toast.success("¡Caja cerrada! Generando reporte...");

      // Download report immediately with snapshot
      await descargarReporte({
        registros: regsSnapshot,
        saldoInicial: saldoSnap,
        fecha: hoy,
        efectivoContado: contadoSnap,
      });

      await cargarDatos();
    } catch (err: any) {
      toast.error("Error: " + err.message);
    } finally {
      setLoadingCerrar(false);
    }
  }

  // ─── Download report ──────────────────────────────────────
  async function descargarReporte(params: ReporteParams) {
    setGenerandoReporte(true);
    setReporteParams(params);
    // Wait for React to render the hidden ReporteCierre
    await new Promise((r) => setTimeout(r, 300));

    try {
      const html2canvas = (await import("html2canvas")).default;
      const el = document.getElementById("reporte-cierre");
      if (!el) { toast.error("No se pudo generar el reporte"); return; }

      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
      });

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

  // ─── View historial detail ────────────────────────────────
  async function verHistorialDetalle(caja: CajaDiariaResumen) {
    const { data: regs } = await supabase
      .from("registros_caja")
      .select("*, productos(referencia), tallas(nombre)")
      .eq("fecha", caja.fecha)
      .order("hora", { ascending: true });

    setHistorialDetalle({ caja, registros: parseRegistros(regs ?? []) });
  }

  async function descargarHistorial(caja: CajaDiariaResumen) {
    const { data: regs } = await supabase
      .from("registros_caja")
      .select("*, productos(referencia), tallas(nombre)")
      .eq("fecha", caja.fecha)
      .order("hora", { ascending: true });

    await descargarReporte({
      registros: parseRegistros(regs ?? []),
      saldoInicial: caja.saldo_inicial,
      fecha: caja.fecha,
      efectivoContado: caja.efectivo_contado ?? caja.saldo_final,
    });
  }

  // ─── Date display ─────────────────────────────────────────
  const fechaFormateada = new Intl.DateTimeFormat("es-CO", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
  }).format(new Date());

  if (loading) return <Spinner className="py-20" />;

  // ─────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hidden report for html2canvas */}
      {reporteParams && (
        <div style={{ position: "fixed", left: -9999, top: -9999, zIndex: -1, pointerEvents: "none" }}>
          <ReporteCierre {...reporteParams} />
        </div>
      )}

      <div className="max-w-7xl mx-auto px-3 sm:px-6 pb-24 pt-4">
        {/* ─── HEADER ──────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <LayoutDashboard className="w-6 h-6 text-brand-blue" />
              <h1 className="text-xl font-bold text-gray-900">Caja del Día</h1>
              {cajaEstado === "cerrada" && tab === "hoy" && (
                <span className="px-2 py-0.5 bg-gray-200 text-gray-600 text-xs font-bold rounded-full uppercase">
                  Cerrada
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-0.5 capitalize">{fechaFormateada}</p>
          </div>

          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
            <button
              onClick={() => setTab("hoy")}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === "hoy" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              Hoy
            </button>
            <button
              onClick={() => setTab("historial")}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${tab === "historial" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              <History className="w-3.5 h-3.5" /> Historial
            </button>
          </div>
        </div>

        {tab === "historial" ? (
          <HistorialTab
            historial={historial}
            onVer={verHistorialDetalle}
            onDescargar={descargarHistorial}
          />
        ) : (
          <>
            {/* ─── SALDO INICIAL ─────────────────────────── */}
            <div className="card mb-4 flex flex-wrap items-center gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-700">Saldo inicial de caja</p>
                <p className="text-xs text-gray-400">Del cierre del día anterior — editable si necesita ajuste</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-gray-400 text-lg">$</span>
                <input
                  type="number"
                  value={saldoInicial}
                  onChange={(e) => setSaldoInicial(parseFloat(e.target.value) || 0)}
                  disabled={cajaEstado === "cerrada"}
                  className="w-36 text-right text-xl font-black text-gray-900 border-0 border-b-2 border-gray-200 focus:border-brand-blue outline-none bg-transparent py-1 disabled:opacity-50"
                  placeholder="0"
                />
              </div>
            </div>

            {/* ─── ACTION BUTTONS ───────────────────────── */}
            {cajaEstado !== "cerrada" && (
              <div className="flex flex-wrap gap-2 mb-4">
                <button
                  onClick={() => setModalVenta(true)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-xl font-semibold text-sm active:scale-95 transition-all"
                >
                  <ShoppingBag className="w-4 h-4" /> Venta
                </button>
                <button
                  onClick={() => setModalGasto(true)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl font-semibold text-sm active:scale-95 transition-all"
                >
                  <TrendingDown className="w-4 h-4" /> Gasto
                </button>
                <button
                  onClick={() => setModalIngreso(true)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-semibold text-sm active:scale-95 transition-all"
                >
                  <TrendingUp className="w-4 h-4" /> Ingreso
                </button>
                <button
                  onClick={() => setModalCajaFuerte(true)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-yellow-500 hover:bg-yellow-600 text-white rounded-xl font-semibold text-sm active:scale-95 transition-all"
                >
                  <Shield className="w-4 h-4" /> Caja Fuerte
                </button>
                {isAdmin && (
                  <button
                    onClick={() => setModalCerrar(true)}
                    className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl font-semibold text-sm active:scale-95 transition-all sm:ml-auto"
                  >
                    <Lock className="w-4 h-4" /> Cerrar Caja
                  </button>
                )}
              </div>
            )}

            {/* ─── CLOSED BANNER ────────────────────────── */}
            {cajaEstado === "cerrada" && (
              <div className="bg-gray-900 text-white rounded-2xl p-5 mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-8 h-8 text-green-400 shrink-0" />
                  <div>
                    <p className="font-bold text-lg">Caja cerrada</p>
                    <p className="text-sm text-gray-400">Este día ya fue cerrado</p>
                  </div>
                </div>
                <button
                  onClick={() =>
                    descargarReporte({
                      registros,
                      saldoInicial,
                      fecha: hoy,
                      efectivoContado: efectivoContadoNum || debeHaberEnCaja,
                    })
                  }
                  disabled={generandoReporte}
                  className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />
                  {generandoReporte ? "Generando..." : "Descargar reporte"}
                </button>
              </div>
            )}

            <div className="flex flex-col xl:flex-row gap-4">
              {/* ─── TABLE ───────────────────────────────── */}
              <div className="flex-1 card p-0 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[700px]">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        {["#", "Hora", "Tipo", "Descripción / Producto", "Talla", "Cant.", "Valor", "Efectivo", "Transf.", ""].map(
                          (h, i) => (
                            <th
                              key={i}
                              className={`px-3 py-3 text-xs font-bold text-gray-400 uppercase ${i >= 6 ? "text-right" : "text-left"} ${i === 9 ? "w-16" : ""}`}
                            >
                              {h}
                            </th>
                          )
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {registros.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="text-center py-14 text-gray-400">
                            <LayoutDashboard className="w-10 h-10 mx-auto mb-3 opacity-20" />
                            <p className="font-medium">Aún no hay registros hoy</p>
                            <p className="text-xs mt-1">Usa los botones de arriba para agregar</p>
                          </td>
                        </tr>
                      ) : (
                        registros.map((r, i) => (
                          <tr
                            key={r.id}
                            className={`border-b border-gray-50 transition-colors ${TIPO_ROW[r.tipo]} ${r.pending ? "opacity-60" : ""}`}
                          >
                            <td className="px-3 py-2.5 text-gray-400 text-xs w-8">{i + 1}</td>
                            <td className="px-3 py-2.5 text-gray-500 text-xs font-mono w-16">
                              {r.hora.slice(0, 5)}
                            </td>
                            <td className="px-3 py-2.5 w-28">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${TIPO_BADGE[r.tipo]}`}>
                                {TIPO_LABEL[r.tipo]}
                              </span>
                              {r.pending && <span className="ml-1 text-orange-400 text-xs">⏳</span>}
                            </td>
                            <td className="px-3 py-2.5 font-medium text-gray-900 min-w-[160px]">
                              {r.descripcion}
                            </td>
                            <td className="px-3 py-2.5 text-gray-500 text-xs w-16">
                              {r.tallaNombre ?? "—"}
                            </td>
                            <td className="px-3 py-2.5 text-right text-gray-700 w-12">
                              {r.tipo === "venta" ? r.cantidad : "—"}
                            </td>
                            <td className="px-3 py-2.5 text-right font-bold w-28">
                              <span
                                className={
                                  r.tipo === "gasto" || r.tipo === "caja_fuerte"
                                    ? "text-red-600"
                                    : r.tipo === "ingreso"
                                    ? "text-blue-700"
                                    : "text-gray-900"
                                }
                              >
                                {r.tipo === "gasto" || r.tipo === "caja_fuerte" ? "−" : ""}
                                {formatCurrency(r.valor)}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-right text-green-700 font-medium text-xs w-28">
                              {r.montoEfectivo > 0 ? formatCurrency(r.montoEfectivo) : "—"}
                            </td>
                            <td className="px-3 py-2.5 text-right text-blue-700 font-medium text-xs w-28">
                              {r.montoTransferencia > 0 ? formatCurrency(r.montoTransferencia) : "—"}
                            </td>
                            <td className="px-3 py-2.5 w-16">
                              {cajaEstado !== "cerrada" &&
                                (deleteId === r.id ? (
                                  <div className="flex gap-1">
                                    <button
                                      onClick={() => eliminarRegistro(r.id)}
                                      className="px-2 py-1 bg-red-500 text-white rounded-lg text-xs font-bold"
                                    >
                                      ✓
                                    </button>
                                    <button
                                      onClick={() => setDeleteId(null)}
                                      className="px-2 py-1 bg-gray-200 rounded-lg text-xs"
                                    >
                                      ✗
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => setDeleteId(r.id)}
                                    className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                ))}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>

                    {/* Totals footer */}
                    {registros.length > 0 && (
                      <tfoot>
                        <tr className="bg-gray-50 border-t-2 border-gray-200">
                          <td colSpan={6} className="px-3 py-3 text-xs font-bold text-gray-500 uppercase">
                            Totales del día
                          </td>
                          <td className="px-3 py-3 text-right font-bold text-gray-900">
                            {formatCurrency(totalVentas - totalGastos + totalIngresos)}
                          </td>
                          <td className="px-3 py-3 text-right font-bold text-green-700">
                            {formatCurrency(ventasEfectivo + ingresosEfectivo - gastosEfectivo - totalCajaFuerte)}
                          </td>
                          <td className="px-3 py-3 text-right font-bold text-blue-700">
                            {formatCurrency(ventasTransferencia)}
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>

              {/* ─── SUMMARY PANEL ───────────────────────── */}
              <div className="xl:w-72 space-y-3 shrink-0">
                {/* Breakdown */}
                <div className="card space-y-2">
                  <p className="font-bold text-gray-700 text-sm mb-3">Resumen del Día</p>
                  <SRow label="Ventas en efectivo" value={ventasEfectivo} color="text-green-700" />
                  <SRow label="Ventas transferencia" value={ventasTransferencia} color="text-blue-700" />
                  <div className="border-t pt-2">
                    <SRow label="Total ventas" value={totalVentas} bold />
                  </div>
                  <SRow label="Total gastos" value={-totalGastos} color="text-red-600" />
                  {totalIngresos > 0 && (
                    <SRow label="Ingresos extra" value={totalIngresos} color="text-blue-600" />
                  )}
                  {totalCajaFuerte > 0 && (
                    <SRow label="Caja fuerte" value={-totalCajaFuerte} color="text-yellow-700" />
                  )}
                </div>

                {/* Cash calculation */}
                <div className="bg-brand-blue text-white rounded-2xl p-4">
                  <p className="text-xs font-bold uppercase tracking-wider opacity-70 mb-3">
                    Cuenta de Caja
                  </p>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between opacity-80">
                      <span>Saldo inicial</span>
                      <span>{formatCurrency(saldoInicial)}</span>
                    </div>
                    <div className="flex justify-between opacity-80">
                      <span>+ Efectivo del día</span>
                      <span>{formatCurrency(ventasEfectivo + ingresosEfectivo)}</span>
                    </div>
                    <div className="flex justify-between opacity-80">
                      <span>− Gastos efectivo</span>
                      <span>{formatCurrency(gastosEfectivo)}</span>
                    </div>
                    {totalCajaFuerte > 0 && (
                      <div className="flex justify-between opacity-80">
                        <span>− Caja fuerte</span>
                        <span>{formatCurrency(totalCajaFuerte)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-base font-black border-t border-white/30 pt-2 mt-1">
                      <span>DEBE HABER EN CAJA</span>
                      <span>{formatCurrency(debeHaberEnCaja)}</span>
                    </div>
                  </div>
                </div>

                {isAdmin && cajaEstado !== "cerrada" && (
                  <button
                    onClick={() => setModalCerrar(true)}
                    className="w-full btn-danger"
                  >
                    <Lock className="w-5 h-5" /> Cerrar Caja del Día
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ─── MODALS ──────────────────────────────────────────── */}
      {modalVenta && (
        <ModalVenta onClose={() => setModalVenta(false)} onSave={agregarRegistro} />
      )}
      {modalGasto && (
        <ModalGasto onClose={() => setModalGasto(false)} onSave={agregarRegistro} />
      )}
      {modalIngreso && (
        <ModalIngreso onClose={() => setModalIngreso(false)} onSave={agregarRegistro} />
      )}
      {modalCajaFuerte && (
        <ModalCajaFuerte onClose={() => setModalCajaFuerte(false)} onSave={agregarRegistro} />
      )}

      {/* Cerrar Caja Modal */}
      <Modal open={modalCerrar} onClose={() => setModalCerrar(false)} title="Cerrar Caja del Día" size="md">
        <div className="space-y-4">
          {/* Summary */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">{ventas.length} ventas</span>
              <span className="font-bold">{formatCurrency(totalVentas)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Gastos</span>
              <span className="font-bold text-red-600">− {formatCurrency(totalGastos)}</span>
            </div>
            {totalIngresos > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">Ingresos extra</span>
                <span className="font-bold text-blue-600">+ {formatCurrency(totalIngresos)}</span>
              </div>
            )}
            {totalCajaFuerte > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">Guardado caja fuerte</span>
                <span className="font-bold text-yellow-700">− {formatCurrency(totalCajaFuerte)}</span>
              </div>
            )}
          </div>

          {/* Caja calculation */}
          <div className="bg-brand-blue text-white rounded-xl p-4 text-sm">
            <div className="space-y-1 opacity-80">
              <div className="flex justify-between">
                <span>Saldo inicial</span><span>{formatCurrency(saldoInicial)}</span>
              </div>
              <div className="flex justify-between">
                <span>+ Efectivo del día</span><span>{formatCurrency(ventasEfectivo + ingresosEfectivo)}</span>
              </div>
              <div className="flex justify-between">
                <span>− Gastos efectivo</span><span>{formatCurrency(gastosEfectivo)}</span>
              </div>
              {totalCajaFuerte > 0 && (
                <div className="flex justify-between">
                  <span>− Caja fuerte</span><span>{formatCurrency(totalCajaFuerte)}</span>
                </div>
              )}
            </div>
            <div className="flex justify-between text-base font-black border-t border-white/30 pt-2 mt-2">
              <span>DEBE HABER EN CAJA</span>
              <span>{formatCurrency(debeHaberEnCaja)}</span>
            </div>
          </div>

          {/* Efectivo contado */}
          <div>
            <label className="label">Efectivo contado físicamente en caja</label>
            <input
              type="number"
              value={efectivoContado}
              onChange={(e) => setEfectivoContado(e.target.value)}
              className="input text-lg font-bold"
              placeholder={String(Math.round(debeHaberEnCaja))}
            />
            {efectivoContado && (
              <div
                className={`mt-2 flex items-center gap-1.5 text-sm font-semibold ${
                  diferenciaCaja === 0
                    ? "text-green-600"
                    : diferenciaCaja > 0
                    ? "text-blue-600"
                    : "text-red-600"
                }`}
              >
                <AlertCircle className="w-4 h-4" />
                {diferenciaCaja === 0
                  ? "¡Perfecto! Cuadra exacto"
                  : diferenciaCaja > 0
                  ? `Hay ${formatCurrency(diferenciaCaja)} de más`
                  : `Falta ${formatCurrency(Math.abs(diferenciaCaja))}`}
              </div>
            )}
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-xs text-yellow-800">
            ⚠️ Al cerrar caja se actualizará el inventario con todas las ventas del día y se generará el reporte automáticamente.
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" onClick={() => setModalCerrar(false)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={cerrarCaja} loading={loadingCerrar}>
              <Lock className="w-4 h-4" /> Confirmar Cierre
            </Button>
          </div>
        </div>
      </Modal>

      {/* Historial Detalle Modal */}
      {historialDetalle && (
        <Modal
          open
          onClose={() => setHistorialDetalle(null)}
          title={`Cierre ${formatDate(historialDetalle.caja.fecha)}`}
          size="lg"
        >
          <div className="space-y-2 max-h-[60vh] overflow-y-auto mb-4">
            {historialDetalle.registros.length === 0 ? (
              <p className="text-center text-gray-400 py-6">Sin registros para este día</p>
            ) : (
              historialDetalle.registros.map((r, i) => (
                <div
                  key={i}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-sm ${TIPO_ROW[r.tipo]}`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${TIPO_BADGE[r.tipo]}`}>
                      {TIPO_LABEL[r.tipo]}
                    </span>
                    <span className="font-medium text-gray-900">{r.descripcion}</span>
                    {r.tallaNombre && (
                      <span className="text-gray-400 text-xs">· {r.tallaNombre}</span>
                    )}
                  </div>
                  <span className="font-bold text-gray-900">{formatCurrency(r.valor)}</span>
                </div>
              ))
            )}
          </div>

          {/* Summary footer */}
          <div className="bg-gray-50 rounded-xl p-3 text-sm space-y-1 mb-4">
            {[
              ["Total ventas", historialDetalle.caja.total_efectivo + (historialDetalle.caja.total_transferencias ?? 0), "text-gray-900"],
              ["Total gastos", historialDetalle.caja.total_gastos ?? 0, "text-red-600"],
              ["Saldo final", historialDetalle.caja.saldo_final, "text-brand-blue font-black"],
            ].map(([lbl, val, cls]) => (
              <div key={String(lbl)} className="flex justify-between">
                <span className="text-gray-600">{String(lbl)}</span>
                <span className={`font-bold ${String(cls)}`}>{formatCurrency(Number(val))}</span>
              </div>
            ))}
          </div>

          <Button
            className="w-full"
            onClick={() =>
              descargarReporte({
                registros: historialDetalle.registros,
                saldoInicial: historialDetalle.caja.saldo_inicial,
                fecha: historialDetalle.caja.fecha,
                efectivoContado: historialDetalle.caja.efectivo_contado ?? historialDetalle.caja.saldo_final,
              })
            }
            loading={generandoReporte}
          >
            <Download className="w-4 h-4" /> Descargar Reporte PNG
          </Button>
        </Modal>
      )}
    </div>
  );
}
