"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, CheckCircle, ChevronLeft, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/lib/context/ProfileContext";
import { formatCurrency } from "@/lib/utils";
import BuscadorProducto from "@/components/BuscadorProducto";
import SelectorTalla from "@/components/SelectorTalla";
import Button from "@/components/ui/Button";
import toast from "react-hot-toast";
import type { Cliente, MetodoPago } from "@/lib/types";

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

export default function NuevoApartadoPage() {
  const supabase = createClient();
  const { profile } = useProfile();
  const router = useRouter();

  const [clienteNombre, setClienteNombre] = useState("");
  const [clienteTelefono, setClienteTelefono] = useState("");
  const [clienteSugerencias, setClienteSugerencias] = useState<Cliente[]>([]);
  const [clienteId, setClienteId] = useState<number | null>(null);

  const [producto, setProducto] = useState<ProductoSel | null>(null);
  const [tallas, setTallas] = useState<TallaStock[]>([]);
  const [tallaId, setTallaId] = useState<number | null>(null);

  const [precio, setPrecio] = useState("");
  const [abono, setAbono] = useState("");
  const [metodoPago, setMetodoPago] = useState<MetodoPago>("efectivo");
  const [enTienda, setEnTienda] = useState(true);
  const [observacion, setObservacion] = useState("");

  const [loading, setLoading] = useState(false);
  const [confirmado, setConfirmado] = useState(false);
  const [apartadoId, setApartadoId] = useState<number | null>(null);

  const precioNum = parseFloat(precio) || 0;
  const abonoNum = parseFloat(abono) || 0;
  const saldo = precioNum - abonoNum;

  async function buscarClientes(nombre: string) {
    setClienteNombre(nombre);
    setClienteId(null);
    if (nombre.length < 2) { setClienteSugerencias([]); return; }
    const { data } = await supabase.from("clientes").select("*").ilike("nombre", `%${nombre}%`).limit(5);
    setClienteSugerencias(data ?? []);
  }

  async function handleSelectProducto(p: ProductoSel) {
    setProducto(p);
    setPrecio(String(p.precio_base));
    setTallaId(null);
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
    if (!producto || !tallaId) { toast.error("Selecciona producto y talla"); return; }
    if (!clienteNombre.trim()) { toast.error("Ingresa el nombre del cliente"); return; }
    if (precioNum <= 0) { toast.error("Ingresa el precio"); return; }
    if (abonoNum < 0) { toast.error("El abono no puede ser negativo"); return; }

    setLoading(true);

    // Crear o buscar cliente
    let finalClienteId = clienteId;
    if (!finalClienteId) {
      const { data: clienteExiste } = await supabase.from("clientes").select("id").eq("nombre", clienteNombre.trim()).single();
      if (clienteExiste) {
        finalClienteId = clienteExiste.id;
      } else {
        const { data: nuevoCliente } = await supabase.from("clientes").insert({
          nombre: clienteNombre.trim(),
          telefono: clienteTelefono || null,
        }).select("id").single();
        finalClienteId = nuevoCliente?.id ?? null;
      }
    }

    if (!finalClienteId) { toast.error("Error al crear cliente"); setLoading(false); return; }

    // Crear apartado
    const { data: apartado, error } = await supabase.from("apartados").insert({
      cliente_id: finalClienteId,
      producto_id: producto.id,
      talla_id: tallaId,
      precio: precioNum,
      total_abonado: abonoNum,
      estado: "pendiente",
      en_tienda: enTienda,
      observacion: observacion || null,
    }).select("id").single();

    if (error) { toast.error("Error: " + error.message); setLoading(false); return; }

    // Registrar abono inicial si hay
    if (abonoNum > 0 && apartado) {
      await supabase.from("abonos").insert({
        apartado_id: apartado.id,
        monto: abonoNum,
        metodo_pago: metodoPago,
        registrado_por: null,
      });
    }

    toast.success("¡Apartado creado!");
    setApartadoId(apartado?.id ?? null);
    setConfirmado(true);
    setLoading(false);
  }

  if (confirmado) {
    return (
      <div className="max-w-lg mx-auto px-4 pt-16 text-center">
        <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-10 h-10 text-amber-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">¡Apartado creado!</h2>
        <p className="text-gray-500 mb-1">{clienteNombre}</p>
        <p className="text-gray-700 font-semibold mb-1">{producto?.referencia}</p>
        <p className="text-lg font-bold text-red-600 mb-1">Saldo: {formatCurrency(saldo)}</p>
        <div className="space-y-3 mt-8">
          <Button variant="gold" className="w-full" onClick={() => router.push(`/apartados/${apartadoId}`)}>
            Ver apartado
          </Button>
          <Button variant="secondary" className="w-full" onClick={() => router.push("/apartados")}>
            Ver todos
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-6">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="p-2 rounded-xl hover:bg-gray-100"><ChevronLeft className="w-6 h-6 text-gray-600" /></button>
        <Bookmark className="w-6 h-6 text-brand-gold" />
        <h1 className="text-xl font-bold text-gray-900">Nuevo Apartado</h1>
      </div>

      {/* Cliente */}
      <div className="card mb-4">
        <h3 className="font-bold text-gray-700 mb-3 flex items-center gap-2"><UserPlus className="w-5 h-5" /> Cliente</h3>
        <div className="relative mb-3">
          <input
            type="text"
            value={clienteNombre}
            onChange={e => buscarClientes(e.target.value)}
            placeholder="Nombre del cliente..."
            className="input"
          />
          {clienteSugerencias.length > 0 && (
            <div className="absolute z-10 w-full mt-1 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden">
              {clienteSugerencias.map(c => (
                <button key={c.id} onClick={() => {
                  setClienteNombre(c.nombre);
                  setClienteTelefono(c.telefono ?? "");
                  setClienteId(c.id);
                  setClienteSugerencias([]);
                }} className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-50 last:border-0">
                  <p className="font-semibold text-sm">{c.nombre}</p>
                  {c.telefono && <p className="text-xs text-gray-400">{c.telefono}</p>}
                </button>
              ))}
            </div>
          )}
        </div>
        <input
          type="tel"
          value={clienteTelefono}
          onChange={e => setClienteTelefono(e.target.value)}
          placeholder="Teléfono (opcional)"
          className="input"
        />
      </div>

      {/* Producto */}
      <div className="card mb-4">
        <h3 className="font-bold text-gray-700 mb-3">Producto</h3>
        {producto ? (
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="font-semibold">{producto.referencia}</p>
              <p className="text-xs text-gray-500">{producto.categoria_nombre}</p>
            </div>
            <button onClick={() => { setProducto(null); setTallaId(null); }} className="text-brand-blue text-sm">Cambiar</button>
          </div>
        ) : (
          <BuscadorProducto onSelect={handleSelectProducto} />
        )}

        {producto && tallas.length > 0 && (
          <>
            <p className="text-sm text-gray-500 mb-2 mt-3">Talla:</p>
            <SelectorTalla tallas={tallas} seleccionada={tallaId} onSelect={setTallaId} />
          </>
        )}
      </div>

      {/* Precios */}
      {tallaId && (
        <div className="card mb-4 space-y-4">
          <h3 className="font-bold text-gray-700">Precio y abono</h3>
          <div>
            <label className="label">Precio total</label>
            <input type="number" value={precio} onChange={e => setPrecio(e.target.value)} className="input" />
          </div>
          <div>
            <label className="label">Abono inicial</label>
            <input type="number" value={abono} onChange={e => setAbono(e.target.value)} className="input" placeholder="0" />
          </div>

          {abonoNum > 0 && (
            <div>
              <label className="label">Método de pago del abono</label>
              <div className="grid grid-cols-2 gap-2">
                {METODOS.map(m => (
                  <button key={m.value} onClick={() => setMetodoPago(m.value)} className={`py-2 rounded-xl text-sm font-medium ${metodoPago === m.value ? "bg-brand-blue text-white" : "bg-gray-100 text-gray-600"}`}>{m.label}</button>
                ))}
              </div>
            </div>
          )}

          <div className={`rounded-xl p-4 ${saldo > 0 ? "bg-red-50" : "bg-green-50"}`}>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Precio:</span>
              <span className="font-semibold">{formatCurrency(precioNum)}</span>
            </div>
            {abonoNum > 0 && (
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Abono:</span>
                <span className="font-semibold text-green-600">- {formatCurrency(abonoNum)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold mt-2 border-t border-gray-200 pt-2">
              <span>Saldo pendiente:</span>
              <span className={saldo > 0 ? "text-red-600" : "text-green-600"}>{formatCurrency(saldo)}</span>
            </div>
          </div>

          <div>
            <label className="label">¿La prenda está en tienda?</label>
            <div className="flex gap-3">
              <button onClick={() => setEnTienda(true)} className={`flex-1 py-2 rounded-xl text-sm font-medium ${enTienda ? "bg-brand-blue text-white" : "bg-gray-100 text-gray-600"}`}>Sí, en tienda</button>
              <button onClick={() => setEnTienda(false)} className={`flex-1 py-2 rounded-xl text-sm font-medium ${!enTienda ? "bg-brand-blue text-white" : "bg-gray-100 text-gray-600"}`}>No disponible</button>
            </div>
          </div>

          <div>
            <label className="label">Observación (opcional)</label>
            <input type="text" value={observacion} onChange={e => setObservacion(e.target.value)} className="input" placeholder="Notas..." />
          </div>

          <Button className="w-full" size="lg" onClick={confirmar} loading={loading}>
            Crear Apartado
          </Button>
        </div>
      )}
      <div className="h-6" />
    </div>
  );
}
