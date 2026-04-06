"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, CheckCircle, ChevronLeft } from "lucide-react";
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

export default function DevolucionPage() {
  const supabase = createClient();
  const { profile } = useProfile();
  const router = useRouter();

  const [producto, setProducto] = useState<ProductoSel | null>(null);
  const [tallas, setTallas] = useState<TallaStock[]>([]);
  const [tallaId, setTallaId] = useState<number | null>(null);
  const [ubicacionId, setUbicacionId] = useState<number>(1);
  const [cantidad, setCantidad] = useState(1);
  const [devuelvedinero, setDevuelveDinero] = useState(false);
  const [monto, setMonto] = useState("");
  const [metodoPago, setMetodoPago] = useState<MetodoPago>("efectivo");
  const [nota, setNota] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmado, setConfirmado] = useState(false);

  async function handleSelectProducto(p: ProductoSel) {
    setProducto(p);
    setTallaId(null);
    setMonto(String(p.precio_base));
    const { data } = await supabase.from("v_stock_total").select("talla, stock_tienda, stock_bodega").eq("producto_id", p.id);
    if (data) {
      const names = data.map((d: any) => d.talla);
      const { data: td } = await supabase.from("tallas").select("id, nombre").in("nombre", names);
      setTallas(data.map((d: any) => ({
        talla_id: td?.find((t: any) => t.nombre === d.talla)?.id ?? 0,
        talla_nombre: d.talla,
        stock_tienda: d.stock_tienda ?? 0,
        stock_bodega: d.stock_bodega ?? 0,
      })));
    }
  }

  async function confirmar() {
    if (!producto || !tallaId) return;
    setLoading(true);

    const { error } = await supabase.from("movimientos").insert({
      producto_id: producto.id,
      talla_id: tallaId,
      ubicacion_id: ubicacionId,
      cantidad,
      tipo: "devolucion",
      canal: "cambio",
      precio_venta: devuelvedinero ? parseFloat(monto) || 0 : null,
      metodo_pago: devuelvedinero ? metodoPago : null,
      nota: nota || null,
      usuario_id: null,
    });

    if (error) { toast.error("Error: " + error.message); setLoading(false); return; }
    toast.success("¡Devolución registrada!");
    setConfirmado(true);
    setLoading(false);
  }

  if (confirmado) {
    return (
      <div className="max-w-2xl mx-auto px-4 md:px-8 pt-16 text-center">
        <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-10 h-10 text-orange-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">¡Devolución registrada!</h2>
        <p className="text-gray-500 mb-8">{producto?.referencia}</p>
        <div className="space-y-3">
          <Button className="w-full" onClick={() => { setProducto(null); setTallaId(null); setConfirmado(false); }}>Nueva devolución</Button>
          <Button variant="secondary" className="w-full" onClick={() => router.push("/")}>Ir al inicio</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-8 pt-6">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="p-2 rounded-xl hover:bg-gray-100"><ChevronLeft className="w-6 h-6 text-gray-600" /></button>
        <RefreshCw className="w-6 h-6 text-orange-600" />
        <h1 className="text-xl font-bold text-gray-900">Devolución</h1>
      </div>

      <div className="card mb-4">
        <h3 className="font-bold text-gray-700 mb-3">Producto devuelto</h3>
        {producto ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-gray-900">{producto.referencia}</p>
              <p className="text-xs text-gray-500">{producto.categoria_nombre}</p>
            </div>
            <button onClick={() => { setProducto(null); setTallaId(null); }} className="text-brand-blue text-sm font-medium">Cambiar</button>
          </div>
        ) : (
          <BuscadorProducto onSelect={handleSelectProducto} />
        )}
      </div>

      {producto && tallas.length > 0 && (
        <>
          <div className="card mb-4">
            <h3 className="font-bold text-gray-700 mb-3">Destino del retorno</h3>
            <div className="flex gap-3">
              <button onClick={() => setUbicacionId(1)} className={`flex-1 py-2 rounded-xl text-sm font-medium ${ubicacionId === 1 ? "bg-brand-blue text-white" : "bg-gray-100 text-gray-600"}`}>🏪 Tienda</button>
              <button onClick={() => setUbicacionId(2)} className={`flex-1 py-2 rounded-xl text-sm font-medium ${ubicacionId === 2 ? "bg-brand-blue text-white" : "bg-gray-100 text-gray-600"}`}>📦 Bodega</button>
            </div>
          </div>

          <div className="card mb-4">
            <h3 className="font-bold text-gray-700 mb-3">Talla</h3>
            <SelectorTalla tallas={tallas} seleccionada={tallaId} onSelect={setTallaId} />
          </div>

          {tallaId && (
            <>
              <div className="card mb-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-gray-700">Cantidad</h3>
                </div>
                <div className="flex items-center gap-4 justify-center">
                  <button onClick={() => setCantidad(Math.max(1, cantidad - 1))} className="w-12 h-12 rounded-xl bg-gray-100 font-bold text-2xl">-</button>
                  <span className="text-3xl font-bold w-12 text-center">{cantidad}</span>
                  <button onClick={() => setCantidad(cantidad + 1)} className="w-12 h-12 rounded-xl bg-gray-100 font-bold text-2xl">+</button>
                </div>
              </div>

              <div className="card mb-4 space-y-4">
                <h3 className="font-bold text-gray-700">¿Se devuelve dinero al cliente?</h3>
                <div className="flex gap-3">
                  <button onClick={() => setDevuelveDinero(true)} className={`flex-1 py-2 rounded-xl text-sm font-medium ${devuelvedinero ? "bg-red-500 text-white" : "bg-gray-100 text-gray-600"}`}>Sí, devolver</button>
                  <button onClick={() => setDevuelveDinero(false)} className={`flex-1 py-2 rounded-xl text-sm font-medium ${!devuelvedinero ? "bg-gray-600 text-white" : "bg-gray-100 text-gray-600"}`}>No</button>
                </div>

                {devuelvedinero && (
                  <>
                    <div>
                      <label className="label">Monto a devolver</label>
                      <input type="number" value={monto} onChange={e => setMonto(e.target.value)} className="input" />
                    </div>
                    <div>
                      <label className="label">Método</label>
                      <div className="grid grid-cols-2 gap-2">
                        {METODOS.map(m => (
                          <button key={m.value} onClick={() => setMetodoPago(m.value)} className={`py-2 rounded-xl text-sm font-medium ${metodoPago === m.value ? "bg-brand-blue text-white" : "bg-gray-100 text-gray-600"}`}>{m.label}</button>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                <div>
                  <label className="label">Nota (opcional)</label>
                  <input type="text" value={nota} onChange={e => setNota(e.target.value)} className="input" placeholder="Razón de la devolución..." />
                </div>
              </div>

              <Button className="w-full" size="lg" onClick={confirmar} loading={loading}>
                Confirmar Devolución
              </Button>
            </>
          )}
        </>
      )}
      <div className="h-6" />
    </div>
  );
}
