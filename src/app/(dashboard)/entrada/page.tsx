"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, PackagePlus, ChevronLeft, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/lib/context/ProfileContext";
import { formatCurrency } from "@/lib/utils";
import BuscadorProducto from "@/components/BuscadorProducto";
import Button from "@/components/ui/Button";
import toast from "react-hot-toast";

interface ProductoSeleccionado {
  id: number;
  referencia: string;
  codigo: string;
  precio_base: number;
  categoria_nombre: string;
  sistema_talla: string;
}

interface FilaTalla {
  talla_id: number;
  talla_nombre: string;
  cantidad: number;
}

export default function EntradaPage() {
  const supabase = createClient();
  const { profile } = useProfile();
  const router = useRouter();

  const [producto, setProducto] = useState<ProductoSeleccionado | null>(null);
  const [tallasDisponibles, setTallasDisponibles] = useState<{ id: number; nombre: string }[]>([]);
  const [filas, setFilas] = useState<FilaTalla[]>([]);
  const [ubicacionId, setUbicacionId] = useState<number>(1);
  const [loading, setLoading] = useState(false);
  const [confirmado, setConfirmado] = useState(false);

  async function handleSelectProducto(p: ProductoSeleccionado) {
    setProducto(p);
    setFilas([]);

    const { data } = await supabase
      .from("tallas")
      .select("id, nombre")
      .eq("sistema", p.sistema_talla)
      .order("id");

    setTallasDisponibles(data ?? []);
  }

  function agregarFila() {
    const disponibles = tallasDisponibles.filter(
      t => !filas.find(f => f.talla_id === t.id)
    );
    if (disponibles.length === 0) return;
    setFilas([...filas, { talla_id: disponibles[0].id, talla_nombre: disponibles[0].nombre, cantidad: 1 }]);
  }

  function actualizarFila(idx: number, campo: keyof FilaTalla, valor: number | string) {
    setFilas(prev => {
      const copia = [...prev];
      if (campo === "talla_id") {
        const t = tallasDisponibles.find(t => t.id === Number(valor));
        copia[idx] = { ...copia[idx], talla_id: Number(valor), talla_nombre: t?.nombre ?? "" };
      } else {
        copia[idx] = { ...copia[idx], [campo]: Number(valor) };
      }
      return copia;
    });
  }

  function eliminarFila(idx: number) {
    setFilas(prev => prev.filter((_, i) => i !== idx));
  }

  const totalUnidades = filas.reduce((s, f) => s + f.cantidad, 0);

  async function confirmarEntrada() {
    if (!producto || filas.length === 0) {
      toast.error("Agrega al menos una talla con cantidad");
      return;
    }
    if (filas.some(f => f.cantidad <= 0)) {
      toast.error("Todas las cantidades deben ser mayores a 0");
      return;
    }

    setLoading(true);
    const movimientos = filas.map(f => ({
      producto_id: producto.id,
      talla_id: f.talla_id,
      ubicacion_id: ubicacionId,
      cantidad: f.cantidad,
      tipo: "entrada" as const,
      canal: "compra_proveedor" as const,
      usuario_id: null,
    }));

    const { error } = await supabase.from("movimientos").insert(movimientos);

    if (error) {
      toast.error("Error al registrar: " + error.message);
      setLoading(false);
      return;
    }

    toast.success("¡Entrada registrada!");
    setConfirmado(true);
    setLoading(false);
  }

  if (confirmado) {
    return (
      <div className="max-w-2xl mx-auto px-4 md:px-8 pt-16 text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-10 h-10 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">¡Entrada registrada!</h2>
        <p className="text-gray-500 mb-2">{producto?.referencia}</p>
        <p className="text-3xl font-bold text-green-600 mb-2">{totalUnidades} unidades</p>
        <p className="text-gray-400 text-sm mb-8">
          {ubicacionId === 1 ? "🏪 Tienda" : "📦 Bodega"}
        </p>
        <div className="space-y-3">
          <Button className="w-full" onClick={() => {
            setProducto(null); setFilas([]); setConfirmado(false);
          }}>
            Nueva entrada
          </Button>
          <Button variant="secondary" className="w-full" onClick={() => router.push("/")}>
            Ir al inicio
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-8 pt-6">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="p-2 rounded-xl hover:bg-gray-100">
          <ChevronLeft className="w-6 h-6 text-gray-600" />
        </button>
        <div className="flex items-center gap-2">
          <PackagePlus className="w-6 h-6 text-green-600" />
          <h1 className="text-xl font-bold text-gray-900">Entrada de Mercancía</h1>
        </div>
      </div>

      {/* Producto */}
      <div className="card mb-4">
        <h3 className="font-bold text-gray-700 mb-3">Producto</h3>
        {producto ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-gray-900">{producto.referencia}</p>
              <p className="text-xs text-gray-500">{producto.codigo} · {producto.categoria_nombre}</p>
            </div>
            <button
              onClick={() => { setProducto(null); setFilas([]); }}
              className="text-brand-blue text-sm font-medium"
            >
              Cambiar
            </button>
          </div>
        ) : (
          <BuscadorProducto onSelect={handleSelectProducto} />
        )}
      </div>

      {producto && (
        <>
          {/* Ubicación destino */}
          <div className="card mb-4">
            <h3 className="font-bold text-gray-700 mb-3">Destino</h3>
            <div className="flex gap-3">
              <button
                onClick={() => setUbicacionId(1)}
                className={`flex-1 py-3 rounded-xl font-medium transition-colors ${ubicacionId === 1 ? "bg-brand-blue text-white" : "bg-gray-100 text-gray-600"}`}
              >
                🏪 Tienda
              </button>
              <button
                onClick={() => setUbicacionId(2)}
                className={`flex-1 py-3 rounded-xl font-medium transition-colors ${ubicacionId === 2 ? "bg-brand-blue text-white" : "bg-gray-100 text-gray-600"}`}
              >
                📦 Bodega
              </button>
            </div>
          </div>

          {/* Tallas */}
          <div className="card mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-gray-700">Tallas y cantidades</h3>
              <button
                onClick={agregarFila}
                disabled={filas.length >= tallasDisponibles.length}
                className="flex items-center gap-1 text-brand-blue text-sm font-medium disabled:opacity-40"
              >
                <Plus className="w-4 h-4" /> Agregar
              </button>
            </div>

            {filas.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-4">
                Toca "Agregar" para añadir tallas
              </p>
            ) : (
              <div className="space-y-3">
                {filas.map((fila, idx) => {
                  const tallasOcupadas = filas.filter((_, i) => i !== idx).map(f => f.talla_id);
                  const opcionesTallas = tallasDisponibles.filter(
                    t => !tallasOcupadas.includes(t.id) || t.id === fila.talla_id
                  );
                  return (
                    <div key={idx} className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
                      <select
                        value={fila.talla_id}
                        onChange={e => actualizarFila(idx, "talla_id", e.target.value)}
                        className="flex-1 input py-2 text-sm"
                      >
                        {opcionesTallas.map(t => (
                          <option key={t.id} value={t.id}>{t.nombre}</option>
                        ))}
                      </select>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => actualizarFila(idx, "cantidad", Math.max(1, fila.cantidad - 1))}
                          className="w-8 h-8 rounded-lg bg-gray-200 font-bold text-lg flex items-center justify-center"
                        >-</button>
                        <span className="w-8 text-center font-bold text-gray-900">{fila.cantidad}</span>
                        <button
                          onClick={() => actualizarFila(idx, "cantidad", fila.cantidad + 1)}
                          className="w-8 h-8 rounded-lg bg-gray-200 font-bold text-lg flex items-center justify-center"
                        >+</button>
                      </div>
                      <button
                        onClick={() => eliminarFila(idx)}
                        className="p-2 text-red-400 hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {filas.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between text-sm text-gray-600">
                <span>{filas.length} talla{filas.length !== 1 ? "s" : ""}</span>
                <span className="font-bold text-gray-900">{totalUnidades} unidades en total</span>
              </div>
            )}
          </div>

          <Button
            className="w-full"
            size="lg"
            onClick={confirmarEntrada}
            loading={loading}
            disabled={filas.length === 0}
          >
            Confirmar Entrada ({totalUnidades} uds)
          </Button>
        </>
      )}

      <div className="h-6" />
    </div>
  );
}
