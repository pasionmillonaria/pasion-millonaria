"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, ChevronLeft, UserMinus, Trash2, PackagePlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import ListaProductos from "@/components/ListaProductos";
import SelectorTalla from "@/components/SelectorTalla";
import Button from "@/components/ui/Button";
import toast from "react-hot-toast";

interface TallaStock {
  talla_id: number;
  talla_nombre: string;
  stock_tienda: number;
  stock_bodega: number;
}

interface ProductoSeleccionado {
  id: number;
  referencia: string;
  codigo: string;
  precio_base: number;
  categoria_nombre: string;
  linea_nombre: string;
  sistema_talla: string;
}

interface ItemRetiro {
  key: number;
  producto: ProductoSeleccionado;
  tallas: TallaStock[];
  tallaId: number;
  ubicacionId: number;
  cantidad: number;
}

let itemKeyCounter = 0;

export default function RetiroPage() {
  const supabase = createClient();
  const router = useRouter();

  const [items, setItems] = useState<ItemRetiro[]>([]);
  const [agregandoItem, setAgregandoItem] = useState(true);
  const [nota, setNota] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmado, setConfirmado] = useState(false);

  const [itemTempProducto, setItemTempProducto] = useState<ProductoSeleccionado | null>(null);
  const [itemTempTallas, setItemTempTallas] = useState<TallaStock[]>([]);
  const [itemTempTallaId, setItemTempTallaId] = useState<number | null>(null);
  const [itemTempUbicacionId, setItemTempUbicacionId] = useState<number>(1);
  const [itemTempCantidad, setItemTempCantidad] = useState(1);

  async function cargarTallasProducto(productoId: number): Promise<TallaStock[]> {
    const { data, error } = await supabase
      .from("v_stock_total")
      .select("talla, talla_id, stock_tienda, stock_bodega")
      .eq("producto_id", productoId);

    if (error) {
      toast.error("No se pudo cargar el stock del producto");
      return [];
    }

    return (data ?? []).map((t) => ({
      talla_id: t.talla_id,
      talla_nombre: t.talla,
      stock_tienda: t.stock_tienda ?? 0,
      stock_bodega: t.stock_bodega ?? 0,
    }));
  }

  function getCantidadReservada(
    itemsSnapshot: ItemRetiro[],
    productoId: number,
    tallaId: number,
    ubicacionId: number,
    excludeKey?: number,
  ) {
    return itemsSnapshot.reduce((acc, item) => {
      if (excludeKey && item.key === excludeKey) return acc;
      if (item.producto.id !== productoId || item.tallaId !== tallaId || item.ubicacionId !== ubicacionId) return acc;
      return acc + item.cantidad;
    }, 0);
  }

  function getStockDisponible(
    itemsSnapshot: ItemRetiro[],
    tallas: TallaStock[],
    productoId: number,
    tallaId: number | null,
    ubicacionId: number,
    excludeKey?: number,
  ) {
    if (!tallaId) return 0;
    const talla = tallas.find((t) => t.talla_id === tallaId);
    if (!talla) return 0;
    const base = ubicacionId === 1 ? talla.stock_tienda : talla.stock_bodega;
    const reservado = getCantidadReservada(itemsSnapshot, productoId, tallaId, ubicacionId, excludeKey);
    return Math.max(0, base - reservado);
  }

  function getTallasAjustadas(productoId: number, tallas: TallaStock[], excludeKey?: number) {
    return tallas.map((talla) => ({
      ...talla,
      stock_tienda: Math.max(0, talla.stock_tienda - getCantidadReservada(items, productoId, talla.talla_id, 1, excludeKey)),
      stock_bodega: Math.max(0, talla.stock_bodega - getCantidadReservada(items, productoId, talla.talla_id, 2, excludeKey)),
    }));
  }

  async function handleSelectProductoTemp(producto: ProductoSeleccionado) {
    const tallas = await cargarTallasProducto(producto.id);
    setItemTempProducto(producto);
    setItemTempTallas(tallas);
    setItemTempTallaId(null);
    setItemTempUbicacionId(1);
    setItemTempCantidad(1);
    if (tallas.length === 0) toast.error("Este producto no tiene stock disponible");
  }

  function handleSelectTempTalla(tallaId: number) {
    if (!itemTempProducto) return;
    setItemTempTallaId(tallaId);
    const dispTienda = getStockDisponible(items, itemTempTallas, itemTempProducto.id, tallaId, 1);
    const dispBodega = getStockDisponible(items, itemTempTallas, itemTempProducto.id, tallaId, 2);
    if (dispTienda > 0) setItemTempUbicacionId(1);
    else if (dispBodega > 0) setItemTempUbicacionId(2);
  }

  function resetItemTemporal() {
    setItemTempProducto(null);
    setItemTempTallas([]);
    setItemTempTallaId(null);
    setItemTempUbicacionId(1);
    setItemTempCantidad(1);
  }

  function agregarItemAlRetiro() {
    if (!itemTempProducto || !itemTempTallaId) {
      toast.error("Selecciona producto y talla");
      return;
    }
    const stockDisponible = getStockDisponible(items, itemTempTallas, itemTempProducto.id, itemTempTallaId, itemTempUbicacionId);
    if (stockDisponible <= 0) {
      toast.error("No hay stock disponible en esa ubicación");
      return;
    }
    if (itemTempCantidad > stockDisponible) {
      toast.error(`Solo hay ${stockDisponible} unidad(es) disponibles`);
      return;
    }

    setItems((prev) => [
      ...prev,
      {
        key: ++itemKeyCounter,
        producto: itemTempProducto,
        tallas: itemTempTallas,
        tallaId: itemTempTallaId,
        ubicacionId: itemTempUbicacionId,
        cantidad: itemTempCantidad,
      },
    ]);
    resetItemTemporal();
    setAgregandoItem(false);
  }

  function eliminarItem(key: number) {
    setItems((prev) => prev.filter((i) => i.key !== key));
  }

  function actualizarCantidad(key: number, nueva: number) {
    setItems((prev) =>
      prev.map((item) => {
        if (item.key !== key) return item;
        const max = getStockDisponible(prev, item.tallas, item.producto.id, item.tallaId, item.ubicacionId, item.key);
        return { ...item, cantidad: Math.max(1, Math.min(nueva, max)) };
      }),
    );
  }

  function getTallaNombre(item: ItemRetiro) {
    return item.tallas.find((t) => t.talla_id === item.tallaId)?.talla_nombre ?? "-";
  }

  function resetFormulario() {
    setItems([]);
    setAgregandoItem(true);
    setNota("");
    setConfirmado(false);
    resetItemTemporal();
  }

  async function confirmarRetiro() {
    if (loading) return;
    if (items.length === 0) {
      toast.error("Agrega al menos un producto");
      return;
    }

    setLoading(true);

    // Validar stock real antes de insertar
    const productoIds = Array.from(new Set(items.map((i) => i.producto.id)));
    const { data: stockActual, error: stockError } = await supabase
      .from("v_stock_total")
      .select("producto_id, talla_id, stock_tienda, stock_bodega")
      .in("producto_id", productoIds);

    if (stockError) {
      toast.error("No se pudo validar el stock");
      setLoading(false);
      return;
    }

    const stockMap = new Map<string, { stock_tienda: number; stock_bodega: number }>();
    for (const fila of stockActual ?? []) {
      stockMap.set(`${fila.producto_id}-${fila.talla_id}`, {
        stock_tienda: fila.stock_tienda ?? 0,
        stock_bodega: fila.stock_bodega ?? 0,
      });
    }

    const consumido = new Map<string, number>();
    for (const item of items) {
      const s = stockMap.get(`${item.producto.id}-${item.tallaId}`) ?? { stock_tienda: 0, stock_bodega: 0 };
      const base = item.ubicacionId === 1 ? s.stock_tienda : s.stock_bodega;
      const key = `${item.producto.id}-${item.tallaId}-${item.ubicacionId}`;
      const usado = consumido.get(key) ?? 0;
      if (item.cantidad > Math.max(0, base - usado)) {
        toast.error(`${item.producto.referencia} talla ${getTallaNombre(item)} ya no tiene suficiente stock`);
        setLoading(false);
        return;
      }
      consumido.set(key, usado + item.cantidad);
    }

    const ref = `RET-${Date.now()}`;
    const payload = items.map((item) => ({
      producto_id: item.producto.id,
      talla_id: item.tallaId,
      ubicacion_id: item.ubicacionId,
      cantidad: item.cantidad,
      tipo: "salida" as const,
      canal: "retiro_dueño" as const,
      precio_venta: null,
      metodo_pago: null,
      movimiento_ref: ref,
      nota: nota.trim() || null,
      usuario_id: null,
    }));

    const { error } = await supabase.from("movimientos").insert(payload);

    if (error) {
      toast.error("Error al registrar el retiro: " + error.message);
      setLoading(false);
      return;
    }

    setConfirmado(true);
    toast.success("Retiro registrado");
    setLoading(false);
  }

  const tallasTempDisponibles = itemTempProducto ? getTallasAjustadas(itemTempProducto.id, itemTempTallas) : [];
  const stockTempDisponible = itemTempProducto && itemTempTallaId
    ? getStockDisponible(items, itemTempTallas, itemTempProducto.id, itemTempTallaId, itemTempUbicacionId)
    : 0;
  const totalUnidades = items.reduce((s, i) => s + i.cantidad, 0);

  if (confirmado) {
    return (
      <div className="max-w-2xl mx-auto px-4 md:px-8 pt-16 text-center">
        <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-10 h-10 text-gray-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Retiro registrado</h2>
        <p className="text-gray-500 mb-6">
          {items.length} producto{items.length !== 1 ? "s" : ""} · {totalUnidades} unidad{totalUnidades !== 1 ? "es" : ""}
        </p>
        <div className="space-y-3">
          <Button className="w-full" onClick={resetFormulario}>
            Nuevo retiro
          </Button>
          <Button variant="secondary" className="w-full" onClick={() => router.push("/inicio")}>
            Ir al inicio
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-8 pt-6 pb-24">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="p-2 rounded-xl hover:bg-gray-100">
          <ChevronLeft className="w-6 h-6 text-gray-600" />
        </button>
        <div className="flex items-center gap-2">
          <UserMinus className="w-6 h-6 text-gray-600" />
          <h1 className="text-xl font-bold text-gray-900">Retiro dueño</h1>
        </div>
      </div>

      <p className="text-sm text-gray-500 mb-4">
        Registra prendas que el dueño se lleva para uso personal. Se descuenta del inventario sin contar como venta.
      </p>

      {/* Lista de items agregados */}
      <div className="card mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-gray-700">Prendas a retirar</h3>
          {!agregandoItem && (
            <button
              onClick={() => setAgregandoItem(true)}
              className="flex items-center gap-1 text-brand-blue text-sm font-medium hover:underline"
            >
              <PackagePlus className="w-4 h-4" />
              Agregar
            </button>
          )}
        </div>

        {items.length === 0 && !agregandoItem && (
          <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-400">
            Aún no hay prendas en este retiro.
          </div>
        )}

        {items.length > 0 && (
          <div className="space-y-3 mb-4">
            {items.map((item) => {
              const maxCantidad = getStockDisponible(items, item.tallas, item.producto.id, item.tallaId, item.ubicacionId, item.key);
              return (
                <div key={item.key} className="bg-gray-50 rounded-2xl p-3 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-gray-900 truncate">{item.producto.referencia}</p>
                      <p className="text-xs text-gray-500">
                        Talla {getTallaNombre(item)} · {item.ubicacionId === 1 ? "Tienda" : "Bodega"}
                      </p>
                    </div>
                    <button onClick={() => eliminarItem(item.key)} className="text-red-400 hover:text-red-600 p-1">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 bg-white rounded-lg border border-gray-200 px-2 py-1">
                      <button
                        onClick={() => actualizarCantidad(item.key, item.cantidad - 1)}
                        className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-gray-800 font-bold text-lg leading-none"
                      >-</button>
                      <span className="w-6 text-center text-sm font-bold">{item.cantidad}</span>
                      <button
                        onClick={() => actualizarCantidad(item.key, item.cantidad + 1)}
                        disabled={item.cantidad >= maxCantidad}
                        className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-gray-800 disabled:opacity-30 font-bold text-lg leading-none"
                      >+</button>
                    </div>
                    <span className="text-xs text-gray-400">max {maxCantidad}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Agregar item temporal */}
        {agregandoItem && (
          <div className="border border-dashed border-brand-blue rounded-2xl p-4 space-y-4">
            <p className="text-sm font-semibold text-brand-blue">Agregar prenda</p>

            {!itemTempProducto ? (
              <ListaProductos onSelect={handleSelectProductoTemp} placeholder="Buscar producto..." />
            ) : (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{itemTempProducto.referencia}</p>
                    <p className="text-xs text-gray-400">{itemTempProducto.categoria_nombre}</p>
                  </div>
                  <button onClick={resetItemTemporal} className="text-brand-blue text-sm font-medium">Cambiar</button>
                </div>

                <div>
                  <label className="label">Ubicación</label>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {[{ id: 1, label: "Tienda" }, { id: 2, label: "Bodega" }].map(({ id, label }) => (
                      <button
                        key={id}
                        onClick={() => setItemTempUbicacionId(id)}
                        className={`py-2 rounded-xl text-sm font-medium ${itemTempUbicacionId === id ? "bg-brand-blue text-white" : "bg-gray-100 text-gray-600"}`}
                      >{label}</button>
                    ))}
                  </div>

                  {tallasTempDisponibles.length > 0 ? (
                    <SelectorTalla
                      tallas={tallasTempDisponibles}
                      seleccionada={itemTempTallaId}
                      onSelect={handleSelectTempTalla}
                      ubicacionId={itemTempUbicacionId}
                    />
                  ) : (
                    <div className="rounded-xl bg-gray-50 text-sm text-gray-400 text-center py-4">
                      Sin stock disponible para este producto.
                    </div>
                  )}
                </div>

                <div>
                  <label className="label">Cantidad (max. {stockTempDisponible})</label>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setItemTempCantidad(Math.max(1, itemTempCantidad - 1))}
                      className="w-10 h-10 rounded-xl bg-gray-100 font-bold text-xl text-gray-700 flex items-center justify-center"
                    >-</button>
                    <span className="text-2xl font-bold text-gray-900 w-8 text-center">{itemTempCantidad}</span>
                    <button
                      onClick={() => setItemTempCantidad(Math.min(stockTempDisponible, itemTempCantidad + 1))}
                      className="w-10 h-10 rounded-xl bg-gray-100 font-bold text-xl text-gray-700 flex items-center justify-center"
                    >+</button>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    className="flex-1"
                    onClick={() => {
                      resetItemTemporal();
                      setAgregandoItem(items.length === 0);
                    }}
                  >Cancelar</Button>
                  <Button className="flex-1" onClick={agregarItemAlRetiro}>Agregar</Button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Nota opcional */}
      <div className="card mb-4">
        <label className="label">Nota (opcional)</label>
        <textarea
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Ej: para partido del domingo..."
          rows={2}
          className="input w-full resize-none"
        />
      </div>

      {/* Resumen y confirmar */}
      {items.length > 0 && (
        <div className="card space-y-4">
          <div className="bg-gray-800 rounded-2xl p-4 text-white space-y-2">
            <div className="flex justify-between text-sm">
              <span>Productos</span>
              <span>{items.length}</span>
            </div>
            <div className="flex justify-between text-sm font-bold pt-2 border-t border-gray-600">
              <span>Total unidades</span>
              <span>{totalUnidades}</span>
            </div>
          </div>

          <Button className="w-full bg-gray-700 hover:bg-gray-800" size="lg" onClick={confirmarRetiro} loading={loading}>
            Confirmar retiro
          </Button>
        </div>
      )}
    </div>
  );
}
