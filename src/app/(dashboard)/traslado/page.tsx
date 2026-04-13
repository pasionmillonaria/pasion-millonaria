"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, CheckCircle, ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/lib/context/ProfileContext";
import ListaProductos from "@/components/ListaProductos";
import SelectorTalla from "@/components/SelectorTalla";
import Button from "@/components/ui/Button";
import toast from "react-hot-toast";

interface ProductoSel {
  id: number; referencia: string; codigo: string;
  precio_base: number; categoria_nombre: string; sistema_talla: string;
}
interface TallaStock {
  talla_id: number; talla_nombre: string; stock_tienda: number; stock_bodega: number;
}

export default function TrasladoPage() {
  const supabase = createClient();
  const { profile } = useProfile();
  const router = useRouter();

  const [producto, setProducto] = useState<ProductoSel | null>(null);
  const [tallas, setTallas] = useState<TallaStock[]>([]);
  const [tallaId, setTallaId] = useState<number | null>(null);
  const [origen, setOrigen] = useState<1 | 2>(1); // 1=tienda, 2=bodega
  const [cantidad, setCantidad] = useState(1);
  const [loading, setLoading] = useState(false);
  const [confirmado, setConfirmado] = useState(false);

  const destino = origen === 1 ? 2 : 1;

  async function handleSelectProducto(p: ProductoSel) {
    setProducto(p);
    setTallaId(null);
    const { data } = await supabase
      .from("v_stock_total").select("talla, stock_tienda, stock_bodega").eq("producto_id", p.id);
    if (data) {
      const names = data.map(d => d.talla);
      const { data: td } = await supabase.from("tallas").select("id, nombre").in("nombre", names);
      setTallas(data.map(d => ({
        talla_id: td?.find(t => t.nombre === d.talla)?.id ?? 0,
        talla_nombre: d.talla,
        stock_tienda: d.stock_tienda ?? 0,
        stock_bodega: d.stock_bodega ?? 0,
      })));
    }
  }

  const tallaSeleccionada = tallas.find(t => t.talla_id === tallaId);
  const stockOrigen = origen === 1 ? (tallaSeleccionada?.stock_tienda ?? 0) : (tallaSeleccionada?.stock_bodega ?? 0);

  async function confirmar() {
    if (loading) return;
    if (!producto || !tallaId) return;
    if (cantidad > stockOrigen) { toast.error("Stock insuficiente en origen"); return; }
    setLoading(true);

    // Salida del origen + entrada al destino
    const { error } = await supabase.from("movimientos").insert([
      {
        producto_id: producto.id, talla_id: tallaId,
        ubicacion_id: origen, ubicacion_destino_id: destino,
        cantidad, tipo: "salida", canal: "traslado", usuario_id: null,
      },
      {
        producto_id: producto.id, talla_id: tallaId,
        ubicacion_id: destino, cantidad, tipo: "entrada", canal: "traslado", usuario_id: null,
      },
    ]);

    if (error) { toast.error("Error: " + error.message); setLoading(false); return; }
    toast.success("¡Traslado realizado!");
    setConfirmado(true);
    setLoading(false);
  }

  if (confirmado) {
    return (
      <div className="max-w-2xl mx-auto px-4 md:px-8 pt-16 text-center">
        <div className="w-20 h-20 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-10 h-10 text-purple-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">¡Traslado realizado!</h2>
        <p className="text-gray-500 mb-1">{producto?.referencia}</p>
        <p className="text-lg font-semibold text-gray-700 mb-8">
          {cantidad} uds · {origen === 1 ? "Tienda → Bodega" : "Bodega → Tienda"}
        </p>
        <div className="space-y-3">
          <Button className="w-full" onClick={() => { setProducto(null); setTallaId(null); setConfirmado(false); setCantidad(1); }}>
            Nuevo traslado
          </Button>
          <Button variant="secondary" className="w-full" onClick={() => router.push("/")}>Ir al inicio</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-8 pt-6">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="p-2 rounded-xl hover:bg-gray-100">
          <ChevronLeft className="w-6 h-6 text-gray-600" />
        </button>
        <ArrowLeftRight className="w-6 h-6 text-purple-600" />
        <h1 className="text-xl font-bold text-gray-900">Traslado</h1>
      </div>

      <div className="md:grid md:grid-cols-2 md:gap-6 md:items-start">
        {/* Columna izquierda: Dirección + Producto */}
        <div className="space-y-4 mb-4 md:mb-0">
          {/* Dirección */}
          <div className="card">
            <h3 className="font-bold text-gray-700 mb-3">Dirección del traslado</h3>
            <div className="flex gap-3">
              <button onClick={() => setOrigen(1)} className={`flex-1 py-3 rounded-xl font-medium transition-colors ${origen === 1 ? "bg-purple-600 text-white" : "bg-gray-100 text-gray-600"}`}>
                🏪 Tienda → 📦 Bodega
              </button>
              <button onClick={() => setOrigen(2)} className={`flex-1 py-3 rounded-xl font-medium transition-colors ${origen === 2 ? "bg-purple-600 text-white" : "bg-gray-100 text-gray-600"}`}>
                📦 Bodega → 🏪 Tienda
              </button>
            </div>
          </div>

          {/* Producto */}
          <div className="card">
            <h3 className="font-bold text-gray-700 mb-3">Producto</h3>
            {producto ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-900">{producto.referencia}</p>
                  <p className="text-xs text-gray-500">{producto.categoria_nombre}</p>
                </div>
                <button onClick={() => { setProducto(null); setTallaId(null); }} className="text-brand-blue text-sm font-medium">Cambiar</button>
              </div>
            ) : (
              <ListaProductos onSelect={handleSelectProducto} />
            )}
          </div>
        </div>

        {/* Columna derecha: Talla + Cantidad + Submit */}
        <div className="space-y-4">
          {producto && tallas.length > 0 && (
            <div className="card">
              <h3 className="font-bold text-gray-700 mb-3">Talla</h3>
              <SelectorTalla tallas={tallas} seleccionada={tallaId} onSelect={setTallaId} ubicacionId={origen} />
            </div>
          )}

          {tallaId && (
            <div className="card">
              <h3 className="font-bold text-gray-700 mb-3">Cantidad (stock en {origen === 1 ? "tienda" : "bodega"}: {stockOrigen})</h3>
              <div className="flex items-center gap-4 justify-center">
                <button onClick={() => setCantidad(Math.max(1, cantidad - 1))} className="w-12 h-12 rounded-xl bg-gray-100 font-bold text-2xl">-</button>
                <span className="text-3xl font-bold text-gray-900 w-12 text-center">{cantidad}</span>
                <button onClick={() => setCantidad(Math.min(stockOrigen, cantidad + 1))} className="w-12 h-12 rounded-xl bg-gray-100 font-bold text-2xl">+</button>
              </div>
            </div>
          )}

          {tallaId && (
            <Button className="w-full" size="lg" onClick={confirmar} loading={loading}>
              Confirmar Traslado
            </Button>
          )}
        </div>
      </div>

      <div className="h-6" />
    </div>
  );
}
