"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, CheckCircle, ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/lib/context/ProfileContext";
import { formatCurrency } from "@/lib/utils";
import BuscadorProducto from "@/components/BuscadorProducto";
import SelectorTalla from "@/components/SelectorTalla";
import Button from "@/components/ui/Button";
import toast from "react-hot-toast";
import type { MetodoPago } from "@/lib/types";

interface ProductoSel {
  id: number; referencia: string; codigo: string;
  precio_base: number; categoria_nombre: string; sistema_talla: string;
}
interface TallaStock {
  talla_id: number; talla_nombre: string; stock_tienda: number; stock_bodega: number;
}

const METODOS: { value: MetodoPago; label: string }[] = [
  { value: "efectivo", label: "Efectivo" },
  { value: "nequi", label: "Nequi" },
  { value: "transferencia", label: "Transferencia" },
  { value: "datafono", label: "Datáfono" },
];

async function cargarTallas(supabase: any, productoId: number): Promise<TallaStock[]> {
  const { data } = await supabase.from("v_stock_total").select("talla, stock_tienda, stock_bodega").eq("producto_id", productoId);
  if (!data) return [];
  const names = data.map((d: any) => d.talla);
  const { data: td } = await supabase.from("tallas").select("id, nombre").in("nombre", names);
  return data.map((d: any) => ({
    talla_id: td?.find((t: any) => t.nombre === d.talla)?.id ?? 0,
    talla_nombre: d.talla,
    stock_tienda: d.stock_tienda ?? 0,
    stock_bodega: d.stock_bodega ?? 0,
  }));
}

export default function CambioPage() {
  const supabase = createClient();
  const { profile } = useProfile();
  const router = useRouter();

  // Producto que devuelve el cliente
  const [prodEntrada, setProdEntrada] = useState<ProductoSel | null>(null);
  const [tallasEntrada, setTallasEntrada] = useState<TallaStock[]>([]);
  const [tallaEntradaId, setTallaEntradaId] = useState<number | null>(null);
  const [precioEntrada, setPrecioEntrada] = useState("");

  // Producto que se lleva el cliente
  const [prodSalida, setProdSalida] = useState<ProductoSel | null>(null);
  const [tallasSalida, setTallasSalida] = useState<TallaStock[]>([]);
  const [tallaSalidaId, setTallaSalidaId] = useState<number | null>(null);
  const [precioSalida, setPrecioSalida] = useState("");
  const [ubicacionSalidaId, setUbicacionSalidaId] = useState<number>(1);

  const [metodoPago, setMetodoPago] = useState<MetodoPago>("efectivo");
  const [loading, setLoading] = useState(false);
  const [confirmado, setConfirmado] = useState(false);

  const diferencia = (parseFloat(precioSalida) || 0) - (parseFloat(precioEntrada) || 0);

  async function confirmar() {
    if (!prodEntrada || !tallaEntradaId || !prodSalida || !tallaSalidaId) {
      toast.error("Completa ambos productos"); return;
    }
    setLoading(true);

    // Generar referencia compartida
    const ref = `CAM-${Date.now().toString().slice(-6)}`;

    const { error } = await supabase.from("movimientos").insert([
      {
        producto_id: prodEntrada.id, talla_id: tallaEntradaId,
        ubicacion_id: 1, cantidad: 1, tipo: "devolucion", canal: "cambio",
        precio_venta: parseFloat(precioEntrada) || null,
        movimiento_ref: ref, usuario_id: null,
      },
      {
        producto_id: prodSalida.id, talla_id: tallaSalidaId,
        ubicacion_id: ubicacionSalidaId, cantidad: 1, tipo: "salida", canal: "cambio",
        precio_venta: parseFloat(precioSalida) || null,
        metodo_pago: diferencia !== 0 ? metodoPago : null,
        movimiento_ref: ref, usuario_id: null,
      },
    ]);

    if (error) { toast.error("Error: " + error.message); setLoading(false); return; }
    toast.success("¡Cambio registrado!");
    setConfirmado(true);
    setLoading(false);
  }

  if (confirmado) {
    return (
      <div className="max-w-2xl mx-auto px-4 md:px-8 pt-16 text-center">
        <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-10 h-10 text-blue-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-4">¡Cambio registrado!</h2>
        {diferencia > 0 && <p className="text-green-600 font-semibold mb-1">Cliente pagó: {formatCurrency(diferencia)}</p>}
        {diferencia < 0 && <p className="text-red-600 font-semibold mb-1">Se devolvió al cliente: {formatCurrency(Math.abs(diferencia))}</p>}
        {diferencia === 0 && <p className="text-gray-600 mb-1">Cambio exacto, sin diferencia</p>}
        <div className="space-y-3 mt-8">
          <Button className="w-full" onClick={() => { setProdEntrada(null); setProdSalida(null); setTallaEntradaId(null); setTallaSalidaId(null); setConfirmado(false); }}>Nuevo cambio</Button>
          <Button variant="secondary" className="w-full" onClick={() => router.push("/")}>Ir al inicio</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-8 pt-6">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="p-2 rounded-xl hover:bg-gray-100"><ChevronLeft className="w-6 h-6" /></button>
        <ArrowLeftRight className="w-6 h-6 text-blue-600" />
        <h1 className="text-xl font-bold text-gray-900">Cambio de producto</h1>
      </div>

      {/* Producto que devuelve */}
      <div className="card mb-4 border-l-4 border-orange-400">
        <h3 className="font-bold text-gray-700 mb-1">📥 Producto que devuelve el cliente</h3>
        <p className="text-xs text-gray-400 mb-3">Lo que entra a la tienda</p>
        {prodEntrada ? (
          <div className="flex justify-between items-center mb-3">
            <div>
              <p className="font-semibold">{prodEntrada.referencia}</p>
              <p className="text-xs text-gray-400">{prodEntrada.categoria_nombre}</p>
            </div>
            <button onClick={() => { setProdEntrada(null); setTallaEntradaId(null); }} className="text-brand-blue text-sm">Cambiar</button>
          </div>
        ) : (
          <BuscadorProducto onSelect={async p => { setProdEntrada(p); setPrecioEntrada(String(p.precio_base)); setTallasEntrada(await cargarTallas(supabase, p.id)); }} />
        )}
        {prodEntrada && tallasEntrada.length > 0 && (
          <>
            <SelectorTalla tallas={tallasEntrada} seleccionada={tallaEntradaId} onSelect={setTallaEntradaId} />
            <div className="mt-3">
              <label className="label">Precio al que compró</label>
              <input type="number" value={precioEntrada} onChange={e => setPrecioEntrada(e.target.value)} className="input" />
            </div>
          </>
        )}
      </div>

      {/* Producto que se lleva */}
      <div className="card mb-4 border-l-4 border-green-400">
        <h3 className="font-bold text-gray-700 mb-1">📤 Producto que se lleva el cliente</h3>
        <p className="text-xs text-gray-400 mb-3">Lo que sale de la tienda</p>
        {prodSalida ? (
          <div className="flex justify-between items-center mb-3">
            <div>
              <p className="font-semibold">{prodSalida.referencia}</p>
              <p className="text-xs text-gray-400">{prodSalida.categoria_nombre}</p>
            </div>
            <button onClick={() => { setProdSalida(null); setTallaSalidaId(null); }} className="text-brand-blue text-sm">Cambiar</button>
          </div>
        ) : (
          <BuscadorProducto onSelect={async p => { setProdSalida(p); setPrecioSalida(String(p.precio_base)); setTallasSalida(await cargarTallas(supabase, p.id)); }} />
        )}
        {prodSalida && tallasSalida.length > 0 && (
          <>
            <div className="flex gap-2 mb-3">
              <button onClick={() => setUbicacionSalidaId(1)} className={`flex-1 py-2 rounded-xl text-sm font-medium ${ubicacionSalidaId === 1 ? "bg-brand-blue text-white" : "bg-gray-100 text-gray-600"}`}>🏪 Tienda</button>
              <button onClick={() => setUbicacionSalidaId(2)} className={`flex-1 py-2 rounded-xl text-sm font-medium ${ubicacionSalidaId === 2 ? "bg-brand-blue text-white" : "bg-gray-100 text-gray-600"}`}>📦 Bodega</button>
            </div>
            <SelectorTalla tallas={tallasSalida} seleccionada={tallaSalidaId} onSelect={setTallaSalidaId} ubicacionId={ubicacionSalidaId} />
            <div className="mt-3">
              <label className="label">Precio del nuevo producto</label>
              <input type="number" value={precioSalida} onChange={e => setPrecioSalida(e.target.value)} className="input" />
            </div>
          </>
        )}
      </div>

      {/* Diferencia */}
      {tallaEntradaId && tallaSalidaId && (
        <div className={`card mb-4 ${diferencia > 0 ? "bg-green-50 border-green-200" : diferencia < 0 ? "bg-red-50 border-red-200" : "bg-gray-50"}`}>
          <div className="flex justify-between items-center">
            <span className="font-semibold text-gray-700">Diferencia de precio:</span>
            <span className={`text-xl font-bold ${diferencia > 0 ? "text-green-600" : diferencia < 0 ? "text-red-600" : "text-gray-600"}`}>
              {diferencia > 0 ? "+" : ""}{formatCurrency(diferencia)}
            </span>
          </div>
          {diferencia > 0 && <p className="text-sm text-green-600 mt-1">El cliente debe pagar {formatCurrency(diferencia)}</p>}
          {diferencia < 0 && <p className="text-sm text-red-600 mt-1">Se devuelve al cliente {formatCurrency(Math.abs(diferencia))}</p>}

          {diferencia !== 0 && (
            <div className="mt-3">
              <label className="label">Método de pago de la diferencia</label>
              <div className="grid grid-cols-2 gap-2">
                {METODOS.map(m => (
                  <button key={m.value} onClick={() => setMetodoPago(m.value)} className={`py-2 rounded-xl text-sm font-medium ${metodoPago === m.value ? "bg-brand-blue text-white" : "bg-gray-100 text-gray-600"}`}>{m.label}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tallaEntradaId && tallaSalidaId && (
        <Button className="w-full" size="lg" onClick={confirmar} loading={loading}>
          Confirmar Cambio
        </Button>
      )}
      <div className="h-6" />
    </div>
  );
}
