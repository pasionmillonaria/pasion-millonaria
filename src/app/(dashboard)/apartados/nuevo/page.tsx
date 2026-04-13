"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, CheckCircle, ChevronLeft, UserPlus, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";
import InputDinero from "@/components/ui/InputDinero";
import ListaProductos from "@/components/ListaProductos";
import SelectorTalla from "@/components/SelectorTalla";
import Button from "@/components/ui/Button";
import toast from "react-hot-toast";
import type { Cliente, MetodoPago } from "@/lib/types";

import type { SistemaTalla } from "@/lib/types";

interface ProductoSel {
  id: number; referencia: string; codigo: string;
  precio_base: number; categoria_nombre: string; sistema_talla: SistemaTalla;
}
interface TallaStock {
  talla_id: number; talla_nombre: string; stock_tienda: number; stock_bodega: number;
}
interface ItemCarrito {
  key: number;
  producto: ProductoSel;
  tallas: TallaStock[];
  tallaId: number | null;
  precio: string;
  cantidad: number;
  enTienda: boolean;
}

const METODOS: { value: MetodoPago; label: string }[] = [
  { value: "efectivo", label: "Efectivo" },
  { value: "nequi", label: "Nequi" },
  { value: "transferencia", label: "Transferencia" },
  { value: "datafono", label: "Datáfono" },
];

let keyCounter = 0;

export default function NuevoApartadoPage() {
  const supabase = createClient();
  const router = useRouter();

  // Cliente
  const [clienteNombre, setClienteNombre] = useState("");
  const [clienteTelefono, setClienteTelefono] = useState("");
  const [clienteSugerencias, setClienteSugerencias] = useState<Cliente[]>([]);
  const [clienteId, setClienteId] = useState<number | null>(null);

  // Carrito de productos
  const [items, setItems] = useState<ItemCarrito[]>([]);
  const [agregandoItem, setAgregandoItem] = useState(false);
  const [itemTempProducto, setItemTempProducto] = useState<ProductoSel | null>(null);
  const [itemTempTallas, setItemTempTallas] = useState<TallaStock[]>([]);
  const [itemTempTallaId, setItemTempTallaId] = useState<number | null>(null);
  const [itemTempPrecio, setItemTempPrecio] = useState("");
  const [itemTempEnTienda, setItemTempEnTienda] = useState(true);
  const [itemTempCantidad, setItemTempCantidad] = useState(1);

  // Pago
  const [abono, setAbono] = useState("");
  const [metodoPago, setMetodoPago] = useState<MetodoPago>("efectivo");
  const [observacion, setObservacion] = useState("");

  const [loading, setLoading] = useState(false);
  const [confirmado, setConfirmado] = useState(false);
  const [apartadosCreados, setApartadosCreados] = useState<number[]>([]);

  const totalPrecio = items.reduce((s, i) => s + (parseFloat(i.precio) || 0) * i.cantidad, 0);
  const totalUnidades = items.reduce((s, i) => s + i.cantidad, 0);
  const abonoNum = parseFloat(abono) || 0;
  const saldo = totalPrecio - abonoNum;

  async function buscarClientes(nombre: string) {
    setClienteNombre(nombre);
    setClienteId(null);
    if (nombre.length < 1) { setClienteSugerencias([]); return; }
    const { data } = await supabase.from("clientes").select("*").ilike("nombre", `%${nombre}%`).limit(5);
    setClienteSugerencias(data ?? []);
  }

  async function handleSelectProductoTemp(p: ProductoSel) {
    setItemTempProducto(p);
    setItemTempPrecio(String(p.precio_base));
    setItemTempTallaId(null);
    const tallas = await cargarTallasProducto(p.id, p.sistema_talla);
    setItemTempTallas(tallas);
    // Si el producto no tiene stock en ninguna talla, pasar automáticamente a "pendiente de llegada"
    const sinStock = tallas.every(t => t.stock_tienda + t.stock_bodega === 0);
    if (sinStock) setItemTempEnTienda(false);
  }

  async function cargarTallasProducto(productoId: number, sistemaTalla: SistemaTalla): Promise<TallaStock[]> {
    // Cargar TODAS las tallas del sistema del producto y el stock de cada una (si existe)
    const [{ data: tallasSistema }, { data: stockData }] = await Promise.all([
      supabase.from("tallas").select("id, nombre").eq("sistema", sistemaTalla).order("orden"),
      supabase.from("v_stock_total").select("talla, stock_tienda, stock_bodega").eq("producto_id", productoId),
    ]);

    return (tallasSistema ?? []).map((t: any) => {
      const s = stockData?.find((d: any) => d.talla === t.nombre);
      return {
        talla_id: t.id,
        talla_nombre: t.nombre,
        stock_tienda: s?.stock_tienda ?? 0,
        stock_bodega: s?.stock_bodega ?? 0,
      };
    });
  }

  function agregarItemAlCarrito() {
    if (!itemTempProducto || !itemTempTallaId) {
      toast.error("Selecciona producto y talla");
      return;
    }
    const nuevoItem: ItemCarrito = {
      key: ++keyCounter,
      producto: itemTempProducto,
      tallas: itemTempTallas,
      tallaId: itemTempTallaId,
      precio: itemTempPrecio,
      cantidad: itemTempCantidad,
      enTienda: itemTempEnTienda,
    };
    setItems(prev => [...prev, nuevoItem]);
    // Reset estado temporal
    setItemTempProducto(null);
    setItemTempTallas([]);
    setItemTempTallaId(null);
    setItemTempPrecio("");
    setItemTempCantidad(1);
    setItemTempEnTienda(true);
    setAgregandoItem(false);
  }

  function eliminarItem(key: number) {
    setItems(prev => prev.filter(i => i.key !== key));
  }

  function actualizarItemPrecio(key: number, precio: string) {
    setItems(prev => prev.map(i => i.key === key ? { ...i, precio } : i));
  }

  function actualizarItemCantidad(key: number, cantidad: number) {
    setItems(prev => prev.map(i => i.key === key ? { ...i, cantidad: Math.max(1, cantidad) } : i));
  }

  async function confirmar() {
    if (loading) return;
    if (items.length === 0) { toast.error("Agrega al menos un producto"); return; }
    if (items.some(i => !i.tallaId)) { toast.error("Todos los productos deben tener talla seleccionada"); return; }
    if (!clienteNombre.trim()) { toast.error("Ingresa el nombre del cliente"); return; }
    if (clienteTelefono && clienteTelefono.length !== 10) { toast.error("El teléfono debe tener exactamente 10 dígitos"); return; }
    if (totalPrecio <= 0) { toast.error("El precio total debe ser mayor a 0"); return; }
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

    const idsCreados: number[] = [];

    // Crear un apartado por cada unidad de cada item
    let grupoId: number | null = null;
    let esElPrimero = true;
    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
      const itemPrecio = parseFloat(item.precio) || 0;

      for (let u = 0; u < item.cantidad; u++) {
        const apResult = await supabase.from("apartados").insert({
          grupo_id: grupoId,
          cliente_id: finalClienteId!,
          producto_id: item.producto.id,
          talla_id: item.tallaId!,
          precio: itemPrecio,
          en_tienda: item.enTienda,
          observacion: esElPrimero && observacion ? observacion : null,
        }).select("id").single();

        if (apResult.error) { toast.error(`Error creando apartado: ${apResult.error.message}`); setLoading(false); return; }
        const apId: number = (apResult.data as { id: number }).id;
        idsCreados.push(apId);

        // El primer apartado usa su propio id como grupo_id
        if (esElPrimero) {
          grupoId = apId;
          await supabase.from("apartados").update({ grupo_id: grupoId }).eq("id", grupoId);
        }
        esElPrimero = false;

        // Solo descontar inventario si la prenda está disponible (no si es pedido a proveedor)
        if (item.enTienda) {
          const { error: movError } = await supabase.from("movimientos").insert({
            producto_id: item.producto.id,
            talla_id: item.tallaId!,
            ubicacion_id: 1,
            cantidad: 1,
            tipo: "salida",
            canal: "ajuste",
            usuario_id: null,
          });
          if (movError) {
            toast.error(`Error actualizando inventario para ${item.producto.referencia}: ${movError.message}`);
            setLoading(false);
            return;
          }
        }
      }
    }

    // Registrar abono inicial como una sola entrada contra el primer apartado (grupoId)
    if (abonoNum > 0 && grupoId) {
      await supabase.from("abonos").insert({
        apartado_id: grupoId,
        monto: abonoNum,
        metodo_pago: metodoPago,
        registrado_por: null,
      });

      const hoy = new Date().toISOString().split("T")[0];
      const { data: cajaHoy } = await supabase
        .from("caja_diaria").select("id")
        .eq("fecha", hoy).eq("estado", "abierta").maybeSingle();

      if (cajaHoy) {
        const hora = new Date().toTimeString().slice(0, 8);
        const esEfectivo = metodoPago === "efectivo";
        await supabase.from("registros_caja").insert({
          caja_diaria_id: cajaHoy.id, fecha: hoy, hora,
          tipo: "ingreso" as const,
          descripcion: `Abono inicial apartado #${grupoId} — ${clienteNombre.trim()}`,
          valor: abonoNum, metodo_pago: metodoPago,
          monto_efectivo: esEfectivo ? abonoNum : 0,
          monto_transferencia: !esEfectivo ? abonoNum : 0,
        });
      }
    }

    toast.success(`¡${idsCreados.length > 1 ? `${idsCreados.length} apartados creados` : "Apartado creado"}!`);
    setApartadosCreados(idsCreados);
    setConfirmado(true);
    setLoading(false);
  }

  if (confirmado) {
    return (
      <div className="max-w-2xl mx-auto px-4 md:px-8 pt-16 text-center">
        <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-10 h-10 text-amber-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          {totalUnidades > 1 ? `¡${totalUnidades} apartados creados!` : "¡Apartado creado!"}
        </h2>
        <p className="text-gray-500 mb-1">{clienteNombre}</p>
        <p className="text-lg font-bold text-red-600 mb-4">Saldo total: {formatCurrency(saldo)}</p>
        <div className="space-y-3 mt-6">
          <Button variant="gold" className="w-full" onClick={() => router.push(`/apartados/${apartadosCreados[0]}`)}>
            Ver apartado
          </Button>
          <Button variant="secondary" className="w-full" onClick={() => router.push("/apartados")}>
            Ver todos los apartados
          </Button>
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
        <Bookmark className="w-6 h-6 text-brand-gold" />
        <h1 className="text-xl font-bold text-gray-900">Nuevo Apartado</h1>
      </div>

      <div className="md:grid md:grid-cols-2 md:gap-6 md:items-start">
        {/* Columna izquierda */}
        <div className="space-y-4 mb-4 md:mb-0">

          {/* Cliente */}
          <div className="card">
            <h3 className="font-bold text-gray-700 mb-3 flex items-center gap-2">
              <UserPlus className="w-5 h-5" /> Cliente
            </h3>
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
            <div className="relative">
              <input
                type="tel"
                value={clienteTelefono}
                onChange={e => setClienteTelefono(e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder="Teléfono (10 dígitos, opcional)"
                className={`input pr-16 ${clienteTelefono && clienteTelefono.length !== 10 ? "border-red-300 focus:ring-red-300" : ""}`}
              />
              {clienteTelefono.length > 0 && (
                <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold ${clienteTelefono.length === 10 ? "text-green-500" : "text-red-400"}`}>
                  {clienteTelefono.length}/10
                </span>
              )}
            </div>
            {clienteTelefono.length > 0 && clienteTelefono.length !== 10 && (
              <p className="text-xs text-red-500 mt-1">El teléfono debe tener exactamente 10 dígitos</p>
            )}
          </div>

          {/* Carrito de productos */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-gray-700">Productos apartados</h3>
              {!agregandoItem && (
                <button
                  onClick={() => setAgregandoItem(true)}
                  className="flex items-center gap-1 text-brand-blue text-sm font-medium hover:underline"
                >
                  <Plus className="w-4 h-4" /> Agregar
                </button>
              )}
            </div>

            {/* Items en carrito */}
            {items.length > 0 && (
              <div className="space-y-2 mb-3">
                {items.map((item) => (
                  <div key={item.key} className="bg-gray-50 rounded-xl px-3 py-2 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-gray-900 truncate">{item.producto.referencia}</p>
                        <p className="text-xs text-gray-500">
                          Talla: {item.tallas.find(t => t.talla_id === item.tallaId)?.talla_nombre ?? "—"}
                          {" · "}
                          {item.enTienda ? "Tienda" : "Bodega"}
                        </p>
                      </div>
                      <button onClick={() => eliminarItem(item.key)} className="text-red-400 hover:text-red-600 p-1 ml-2">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Cantidad */}
                      <div className="flex items-center gap-1 bg-white rounded-lg border border-gray-200 px-2 py-1">
                        <button onClick={() => actualizarItemCantidad(item.key, item.cantidad - 1)} className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-gray-800 font-bold text-lg leading-none">−</button>
                        <span className="w-5 text-center text-sm font-bold">{item.cantidad}</span>
                        <button onClick={() => actualizarItemCantidad(item.key, item.cantidad + 1)} className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-gray-800 font-bold text-lg leading-none">+</button>
                      </div>
                      {/* Precio unitario */}
                      <div className="flex-1">
                        <InputDinero
                          value={item.precio}
                          onChange={raw => actualizarItemPrecio(item.key, raw)}
                          className="input text-sm py-1"
                          placeholder="Precio c/u"
                        />
                      </div>
                      {item.cantidad > 1 && (
                        <span className="text-xs text-gray-500 whitespace-nowrap">
                          = {formatCurrency((parseFloat(item.precio) || 0) * item.cantidad)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Formulario agregar item */}
            {agregandoItem && (
              <div className="border border-dashed border-brand-blue rounded-xl p-3 space-y-3">
                <p className="text-sm font-semibold text-brand-blue">Nuevo producto</p>
                {!itemTempProducto ? (
                  <ListaProductos onSelect={handleSelectProductoTemp} />
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-sm">{itemTempProducto.referencia}</p>
                        <p className="text-xs text-gray-400">{itemTempProducto.categoria_nombre}</p>
                      </div>
                      <button onClick={() => { setItemTempProducto(null); setItemTempTallaId(null); }} className="text-brand-blue text-xs">Cambiar</button>
                    </div>

                    {itemTempTallas.length > 0 && (
                      <>
                        <div>
                          <label className="label mb-1">¿La prenda está disponible?</label>
                          <div className="flex gap-2">
                            <button onClick={() => setItemTempEnTienda(true)} className={`flex-1 py-2 rounded-xl text-sm font-medium ${itemTempEnTienda ? "bg-green-600 text-white" : "bg-gray-100 text-gray-600"}`}>
                              ✓ En tienda/bodega
                            </button>
                            <button onClick={() => setItemTempEnTienda(false)} className={`flex-1 py-2 rounded-xl text-sm font-medium ${!itemTempEnTienda ? "bg-orange-500 text-white" : "bg-gray-100 text-gray-600"}`}>
                              📦 Pedir al proveedor
                            </button>
                          </div>
                          {!itemTempEnTienda && (
                            <p className="text-xs text-orange-600 mt-1">Las tallas se pueden seleccionar aunque no haya stock — la prenda llegará directo del proveedor.</p>
                          )}
                        </div>
                        <SelectorTalla
                          tallas={itemTempTallas}
                          seleccionada={itemTempTallaId}
                          onSelect={setItemTempTallaId}
                          permitirSinStock={!itemTempEnTienda}
                        />
                      </>
                    )}

                    {itemTempTallaId && (
                      <div className="flex gap-3 items-end">
                        <div className="flex-1">
                          <label className="label">Precio unitario</label>
                          <InputDinero value={itemTempPrecio} onChange={raw => setItemTempPrecio(raw)} className="input" />
                        </div>
                        <div>
                          <label className="label">Cantidad</label>
                          <div className="flex items-center gap-1 bg-white rounded-xl border border-gray-200 px-2 h-[42px]">
                            <button onClick={() => setItemTempCantidad(c => Math.max(1, c - 1))} className="w-7 h-7 flex items-center justify-center text-gray-500 hover:text-gray-800 font-bold text-lg leading-none">−</button>
                            <span className="w-6 text-center font-bold">{itemTempCantidad}</span>
                            <button onClick={() => setItemTempCantidad(c => c + 1)} className="w-7 h-7 flex items-center justify-center text-gray-500 hover:text-gray-800 font-bold text-lg leading-none">+</button>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
                <div className="flex gap-2 pt-1">
                  <Button variant="secondary" className="flex-1" size="sm" onClick={() => { setAgregandoItem(false); setItemTempProducto(null); setItemTempTallaId(null); }}>
                    Cancelar
                  </Button>
                  {itemTempTallaId && (
                    <Button className="flex-1" size="sm" onClick={agregarItemAlCarrito}>
                      Añadir
                    </Button>
                  )}
                </div>
              </div>
            )}

            {items.length === 0 && !agregandoItem && (
              <p className="text-sm text-gray-400 text-center py-3">Sin productos. Toca "Agregar".</p>
            )}
          </div>
        </div>

        {/* Columna derecha: pago */}
        {items.length > 0 && (
          <div className="space-y-4">
            <div className="card space-y-4">
              <h3 className="font-bold text-gray-700">Abono y pago</h3>
              <div>
                <label className="label">Abono inicial (opcional)</label>
                <InputDinero value={abono} onChange={raw => setAbono(raw)} className="input" placeholder="0" />
              </div>

              {abonoNum > 0 && (
                <div>
                  <label className="label">Método de pago</label>
                  <div className="grid grid-cols-2 gap-2">
                    {METODOS.map(m => (
                      <button key={m.value} onClick={() => setMetodoPago(m.value)} className={`py-2 rounded-xl text-sm font-medium ${metodoPago === m.value ? "bg-brand-blue text-white" : "bg-gray-100 text-gray-600"}`}>{m.label}</button>
                    ))}
                  </div>
                </div>
              )}

              <div className={`rounded-xl p-4 ${saldo > 0 ? "bg-red-50" : "bg-green-50"}`}>
                <div className="flex justify-between mb-1">
                  <span className="text-sm text-gray-600">Total ({totalUnidades} prenda{totalUnidades > 1 ? "s" : ""}):</span>
                  <span className="font-semibold">{formatCurrency(totalPrecio)}</span>
                </div>
                {abonoNum > 0 && (
                  <div className="flex justify-between mb-1">
                    <span className="text-sm text-gray-600">Abono:</span>
                    <span className="font-semibold text-green-600">- {formatCurrency(abonoNum)}</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold border-t border-gray-200 pt-2 mt-1">
                  <span>Saldo pendiente:</span>
                  <span className={saldo > 0 ? "text-red-600" : "text-green-600"}>{formatCurrency(saldo)}</span>
                </div>
              </div>

              <div>
                <label className="label">Observación (opcional)</label>
                <input type="text" value={observacion} onChange={e => setObservacion(e.target.value)} className="input" placeholder="Notas..." />
              </div>

              <Button className="w-full" size="lg" onClick={confirmar} loading={loading}>
                Crear {totalUnidades > 1 ? `${totalUnidades} Apartados` : "Apartado"}
              </Button>
            </div>
          </div>
        )}
      </div>
      <div className="h-6" />
    </div>
  );
}
