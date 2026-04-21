"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle,
  ChevronLeft,
  PackagePlus,
  ShoppingBag,
  Trash2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";
import ListaProductos from "@/components/ListaProductos";
import SelectorTalla from "@/components/SelectorTalla";
import Button from "@/components/ui/Button";
import InputDinero from "@/components/ui/InputDinero";
import toast from "react-hot-toast";
import type { CanalMovimiento, MetodoPago } from "@/lib/types";

type MetodoPagoVenta = MetodoPago | "por_confirmar";

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

interface ItemVenta {
  key: number;
  producto: ProductoSeleccionado;
  tallas: TallaStock[];
  tallaId: number;
  ubicacionId: number;
  cantidad: number;
  precioVenta: string;
  descuento: string;
}

const CANALES: { value: CanalMovimiento; label: string }[] = [
  { value: "venta_tienda", label: "Tienda" },
  { value: "domicilio", label: "Domicilio" },
  { value: "envio_nacional", label: "Envio nacional" },
];

const METODOS_BASE: { value: MetodoPago; label: string }[] = [
  { value: "efectivo", label: "Efectivo" },
  { value: "nequi", label: "Nequi" },
  { value: "transferencia", label: "Transferencia" },
  { value: "datafono", label: "Datafono" },
  { value: "mixto", label: "Mixto" },
];

const METODOS_DOMICILIO: { value: MetodoPagoVenta; label: string }[] = [
  ...METODOS_BASE,
  { value: "por_confirmar", label: "Por confirmar" },
];

let itemKeyCounter = 0;

export default function VentaPage() {
  const supabase = createClient();
  const router = useRouter();

  const [items, setItems] = useState<ItemVenta[]>([]);
  const [agregandoItem, setAgregandoItem] = useState(true);

  const [itemTempProducto, setItemTempProducto] =
    useState<ProductoSeleccionado | null>(null);
  const [itemTempTallas, setItemTempTallas] = useState<TallaStock[]>([]);
  const [itemTempTallaId, setItemTempTallaId] = useState<number | null>(null);
  const [itemTempUbicacionId, setItemTempUbicacionId] = useState<number>(1);
  const [itemTempCantidad, setItemTempCantidad] = useState(1);
  const [itemTempPrecioVenta, setItemTempPrecioVenta] = useState("");
  const [itemTempDescuento, setItemTempDescuento] = useState("");

  const [canal, setCanal] = useState<CanalMovimiento>("venta_tienda");
  const [metodoPago, setMetodoPago] = useState<MetodoPagoVenta>("efectivo");
  const [loading, setLoading] = useState(false);
  const [confirmado, setConfirmado] = useState(false);
  const [pedidoRef, setPedidoRef] = useState("");

  const opcionesMetodoPago =
    canal === "domicilio" ? METODOS_DOMICILIO : METODOS_BASE;

  const subtotalPedido = items.reduce((acumulado, item) => {
    const precio = parseFloat(item.precioVenta) || 0;
    return acumulado + precio * item.cantidad;
  }, 0);

  const totalDescuentoPedido = items.reduce((acumulado, item) => {
    const descuento = parseFloat(item.descuento) || 0;
    return acumulado + descuento * item.cantidad;
  }, 0);

  const totalPedido = items.reduce(
    (acumulado, item) => acumulado + calcularTotalItem(item),
    0,
  );

  const totalUnidades = items.reduce(
    (acumulado, item) => acumulado + item.cantidad,
    0,
  );

  async function cargarTallasProducto(
    productoId: number,
  ): Promise<TallaStock[]> {
    const { data, error } = await supabase
      .from("v_stock_total")
      .select("talla, talla_id, stock_tienda, stock_bodega")
      .eq("producto_id", productoId);

    if (error) {
      toast.error("No se pudo cargar el stock del producto");
      return [];
    }

    return (data ?? []).map((talla) => ({
      talla_id: talla.talla_id,
      talla_nombre: talla.talla,
      stock_tienda: talla.stock_tienda ?? 0,
      stock_bodega: talla.stock_bodega ?? 0,
    }));
  }

  function calcularTotalItem(item: Pick<ItemVenta, "precioVenta" | "descuento" | "cantidad">) {
    const precio = parseFloat(item.precioVenta) || 0;
    const descuento = parseFloat(item.descuento) || 0;
    return Math.max(0, precio - descuento) * item.cantidad;
  }

  function getTallaNombre(item: ItemVenta) {
    return (
      item.tallas.find((talla) => talla.talla_id === item.tallaId)?.talla_nombre ??
      "-"
    );
  }

  function getUbicacionLabel(ubicacionId: number) {
    return ubicacionId === 1 ? "Tienda" : "Bodega";
  }

  function getCantidadReservada(
    itemsSnapshot: ItemVenta[],
    productoId: number,
    tallaId: number,
    ubicacionId: number,
    excludeKey?: number,
  ) {
    return itemsSnapshot.reduce((acumulado, item) => {
      if (excludeKey && item.key === excludeKey) return acumulado;
      if (
        item.producto.id !== productoId ||
        item.tallaId !== tallaId ||
        item.ubicacionId !== ubicacionId
      ) {
        return acumulado;
      }

      return acumulado + item.cantidad;
    }, 0);
  }

  function getStockDisponible(
    itemsSnapshot: ItemVenta[],
    tallas: TallaStock[],
    productoId: number,
    tallaId: number | null,
    ubicacionId: number,
    excludeKey?: number,
  ) {
    if (!tallaId) return 0;

    const talla = tallas.find((item) => item.talla_id === tallaId);
    if (!talla) return 0;

    const base = ubicacionId === 1 ? talla.stock_tienda : talla.stock_bodega;
    const reservado = getCantidadReservada(
      itemsSnapshot,
      productoId,
      tallaId,
      ubicacionId,
      excludeKey,
    );

    return Math.max(0, base - reservado);
  }

  function getTallasAjustadas(
    productoId: number,
    tallas: TallaStock[],
    excludeKey?: number,
  ) {
    return tallas.map((talla) => ({
      ...talla,
      stock_tienda: Math.max(
        0,
        talla.stock_tienda -
          getCantidadReservada(
            items,
            productoId,
            talla.talla_id,
            1,
            excludeKey,
          ),
      ),
      stock_bodega: Math.max(
        0,
        talla.stock_bodega -
          getCantidadReservada(
            items,
            productoId,
            talla.talla_id,
            2,
            excludeKey,
          ),
      ),
    }));
  }

  async function handleSelectProductoTemp(producto: ProductoSeleccionado) {
    const tallas = await cargarTallasProducto(producto.id);

    setItemTempProducto(producto);
    setItemTempTallas(tallas);
    setItemTempTallaId(null);
    setItemTempUbicacionId(1);
    setItemTempCantidad(1);
    setItemTempPrecioVenta(String(producto.precio_base));
    setItemTempDescuento("");

    if (tallas.length === 0) {
      toast.error("Este producto no tiene stock disponible");
    }
  }

  function handleSelectTempTalla(tallaId: number) {
    if (!itemTempProducto) return;

    setItemTempTallaId(tallaId);

    const disponibleTienda = getStockDisponible(
      items,
      itemTempTallas,
      itemTempProducto.id,
      tallaId,
      1,
    );
    const disponibleBodega = getStockDisponible(
      items,
      itemTempTallas,
      itemTempProducto.id,
      tallaId,
      2,
    );

    if (disponibleTienda > 0) setItemTempUbicacionId(1);
    else if (disponibleBodega > 0) setItemTempUbicacionId(2);
  }

  function resetItemTemporal() {
    setItemTempProducto(null);
    setItemTempTallas([]);
    setItemTempTallaId(null);
    setItemTempUbicacionId(1);
    setItemTempCantidad(1);
    setItemTempPrecioVenta("");
    setItemTempDescuento("");
  }

  function agregarItemAlPedido() {
    if (!itemTempProducto || !itemTempTallaId) {
      toast.error("Selecciona producto y talla");
      return;
    }

    const stockDisponible = getStockDisponible(
      items,
      itemTempTallas,
      itemTempProducto.id,
      itemTempTallaId,
      itemTempUbicacionId,
    );
    const precio = parseFloat(itemTempPrecioVenta) || 0;
    const descuento = parseFloat(itemTempDescuento) || 0;

    if (stockDisponible <= 0) {
      toast.error("No hay stock disponible en esa ubicacion");
      return;
    }

    if (itemTempCantidad > stockDisponible) {
      toast.error(`Solo hay ${stockDisponible} unidad(es) disponibles`);
      return;
    }

    if (precio <= 0) {
      toast.error("Ingresa un precio de venta valido");
      return;
    }

    if (descuento < 0 || precio - descuento <= 0) {
      toast.error("El descuento no puede dejar la venta en cero");
      return;
    }

    const nuevoItem: ItemVenta = {
      key: ++itemKeyCounter,
      producto: itemTempProducto,
      tallas: itemTempTallas,
      tallaId: itemTempTallaId,
      ubicacionId: itemTempUbicacionId,
      cantidad: itemTempCantidad,
      precioVenta: itemTempPrecioVenta,
      descuento: itemTempDescuento,
    };

    setItems((prev) => [...prev, nuevoItem]);
    resetItemTemporal();
    setAgregandoItem(false);
  }

  function eliminarItem(key: number) {
    setItems((prev) => prev.filter((item) => item.key !== key));
  }

  function actualizarCantidadItem(key: number, cantidadNueva: number) {
    setItems((prev) =>
      prev.map((item) => {
        if (item.key !== key) return item;

        const maxCantidad = getStockDisponible(
          prev,
          item.tallas,
          item.producto.id,
          item.tallaId,
          item.ubicacionId,
          item.key,
        );

        return {
          ...item,
          cantidad: Math.max(1, Math.min(cantidadNueva, maxCantidad)),
        };
      }),
    );
  }

  function actualizarPrecioItem(key: number, precioVenta: string) {
    setItems((prev) =>
      prev.map((item) =>
        item.key === key ? { ...item, precioVenta } : item,
      ),
    );
  }

  function actualizarDescuentoItem(key: number, descuento: string) {
    setItems((prev) =>
      prev.map((item) => (item.key === key ? { ...item, descuento } : item)),
    );
  }

  function resetFormulario() {
    setItems([]);
    setAgregandoItem(true);
    resetItemTemporal();
    setCanal("venta_tienda");
    setMetodoPago("efectivo");
    setConfirmado(false);
    setPedidoRef("");
  }

  function handleSelectCanal(nuevoCanal: CanalMovimiento) {
    setCanal(nuevoCanal);

    if (nuevoCanal !== "domicilio" && metodoPago === "por_confirmar") {
      setMetodoPago("efectivo");
    }
  }

  async function validarStockActual() {
    const productoIds = Array.from(
      new Set(items.map((item) => item.producto.id)),
    );
    const { data, error } = await supabase
      .from("v_stock_total")
      .select("producto_id, talla_id, stock_tienda, stock_bodega")
      .in("producto_id", productoIds);

    if (error) {
      return {
        ok: false as const,
        mensaje: "No se pudo validar el stock actual antes de guardar",
      };
    }

    const stockMap = new Map<
      string,
      { stock_tienda: number; stock_bodega: number }
    >();
    for (const fila of data ?? []) {
      stockMap.set(`${fila.producto_id}-${fila.talla_id}`, {
        stock_tienda: fila.stock_tienda ?? 0,
        stock_bodega: fila.stock_bodega ?? 0,
      });
    }

    const consumido = new Map<string, number>();

    for (const item of items) {
      const stockFila = stockMap.get(`${item.producto.id}-${item.tallaId}`) ?? {
        stock_tienda: 0,
        stock_bodega: 0,
      };
      const base =
        item.ubicacionId === 1
          ? stockFila.stock_tienda
          : stockFila.stock_bodega;
      const stockKey = `${item.producto.id}-${item.tallaId}-${item.ubicacionId}`;
      const yaUsado = consumido.get(stockKey) ?? 0;
      const disponible = Math.max(0, base - yaUsado);

      if (item.cantidad > disponible) {
        return {
          ok: false as const,
          mensaje: `${item.producto.referencia} talla ${getTallaNombre(item)} ya no tiene suficiente stock`,
        };
      }

      consumido.set(stockKey, yaUsado + item.cantidad);
    }

    return { ok: true as const };
  }

  async function confirmarPedido() {
    if (loading) return;

    if (items.length === 0) {
      toast.error("Agrega al menos un producto al pedido");
      return;
    }

    const itemInvalido = items.find((item) => {
      const precio = parseFloat(item.precioVenta) || 0;
      const descuento = parseFloat(item.descuento) || 0;
      return precio <= 0 || descuento < 0 || precio - descuento <= 0;
    });

    if (itemInvalido) {
      toast.error(
        `Revisa el precio o descuento de ${itemInvalido.producto.referencia}`,
      );
      return;
    }

    setLoading(true);

    const validacionStock = await validarStockActual();
    if (!validacionStock.ok) {
      toast.error(validacionStock.mensaje);
      setLoading(false);
      return;
    }

    const referenciaPedido = `VTA-${Date.now()}`;

    const payload = items.map((item) => ({
      producto_id: item.producto.id,
      talla_id: item.tallaId,
      ubicacion_id: item.ubicacionId,
      cantidad: item.cantidad,
      tipo: "salida" as const,
      canal,
      precio_venta: parseFloat(item.precioVenta) || 0,
      descuento: (parseFloat(item.descuento) || 0) > 0
        ? parseFloat(item.descuento) || 0
        : null,
      metodo_pago: metodoPago === "por_confirmar" ? null : metodoPago,
      movimiento_ref: referenciaPedido,
      usuario_id: null,
    }));

    const { error } = await supabase.from("movimientos").insert(payload);

    if (error) {
      toast.error("Error al registrar el pedido: " + error.message);
      setLoading(false);
      return;
    }

    setPedidoRef(referenciaPedido);
    setConfirmado(true);
    toast.success("Pedido registrado!");
    setLoading(false);
  }

  const tallasTempDisponibles = itemTempProducto
    ? getTallasAjustadas(itemTempProducto.id, itemTempTallas)
    : [];

  const stockTempDisponible =
    itemTempProducto && itemTempTallaId
      ? getStockDisponible(
          items,
          itemTempTallas,
          itemTempProducto.id,
          itemTempTallaId,
          itemTempUbicacionId,
        )
      : 0;

  if (confirmado) {
    return (
      <div className="max-w-2xl mx-auto px-4 md:px-8 pt-16 text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-10 h-10 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Pedido registrado!
        </h2>
        <p className="text-gray-500 mb-1">
          {items.length} producto{items.length !== 1 ? "s" : ""} · {totalUnidades}{" "}
          unidad{totalUnidades !== 1 ? "es" : ""}
        </p>
        <p className="text-gray-400 text-sm mb-2">{pedidoRef}</p>
        <p className="text-3xl font-bold text-brand-blue mb-8">
          {formatCurrency(totalPedido)}
        </p>
        <div className="space-y-3">
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => router.push(`/venta/${pedidoRef}`)}
          >
            Ver pedido
          </Button>
          <Button className="w-full" onClick={resetFormulario}>
            Nuevo pedido
          </Button>
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => router.push("/inicio")}
          >
            Ir al inicio
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-8 pt-6 pb-24">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.back()}
          className="p-2 rounded-xl hover:bg-gray-100"
        >
          <ChevronLeft className="w-6 h-6 text-gray-600" />
        </button>
        <div className="flex items-center gap-2">
          <ShoppingBag className="w-6 h-6 text-brand-blue" />
          <h1 className="text-xl font-bold text-gray-900">Nuevo pedido</h1>
        </div>
      </div>

      <div className="md:grid md:grid-cols-2 md:gap-6 md:items-start">
        <div className="space-y-4 mb-4 md:mb-0">
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-gray-700">Productos del pedido</h3>
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
                Aun no hay productos en este pedido.
              </div>
            )}

            {items.length > 0 && (
              <div className="space-y-3 mb-4">
                {items.map((item) => {
                  const maxCantidad = getStockDisponible(
                    items,
                    item.tallas,
                    item.producto.id,
                    item.tallaId,
                    item.ubicacionId,
                    item.key,
                  );

                  return (
                    <div
                      key={item.key}
                      className="bg-gray-50 rounded-2xl p-3 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-sm text-gray-900 truncate">
                            {item.producto.referencia}
                          </p>
                          <p className="text-xs text-gray-500">
                            Talla {getTallaNombre(item)} ·{" "}
                            {getUbicacionLabel(item.ubicacionId)}
                          </p>
                        </div>
                        <button
                          onClick={() => eliminarItem(item.key)}
                          className="text-red-400 hover:text-red-600 p-1"
                          title="Eliminar item"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 bg-white rounded-lg border border-gray-200 px-2 py-1">
                          <button
                            onClick={() =>
                              actualizarCantidadItem(item.key, item.cantidad - 1)
                            }
                            className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-gray-800 font-bold text-lg leading-none"
                          >
                            -
                          </button>
                          <span className="w-6 text-center text-sm font-bold">
                            {item.cantidad}
                          </span>
                          <button
                            onClick={() =>
                              actualizarCantidadItem(item.key, item.cantidad + 1)
                            }
                            disabled={item.cantidad >= maxCantidad}
                            className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-gray-800 disabled:opacity-30 font-bold text-lg leading-none"
                          >
                            +
                          </button>
                        </div>
                        <span className="text-xs text-gray-400">
                          max {maxCantidad}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <InputDinero
                          value={item.precioVenta}
                          onChange={(raw) => actualizarPrecioItem(item.key, raw)}
                          className="input text-sm"
                          placeholder="Precio"
                        />
                        <InputDinero
                          value={item.descuento}
                          onChange={(raw) =>
                            actualizarDescuentoItem(item.key, raw)
                          }
                          className="input text-sm"
                          placeholder="Descuento"
                        />
                      </div>

                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Total item</span>
                        <span className="font-bold text-gray-900">
                          {formatCurrency(calcularTotalItem(item))}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {agregandoItem && (
              <div className="border border-dashed border-brand-blue rounded-2xl p-4 space-y-4">
                <p className="text-sm font-semibold text-brand-blue">
                  Agregar producto
                </p>

                {!itemTempProducto ? (
                  <ListaProductos
                    onSelect={handleSelectProductoTemp}
                    placeholder="Buscar producto para el pedido..."
                  />
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 truncate">
                          {itemTempProducto.referencia}
                        </p>
                        <p className="text-xs text-gray-400">
                          {itemTempProducto.categoria_nombre}
                        </p>
                      </div>
                      <button
                        onClick={resetItemTemporal}
                        className="text-brand-blue text-sm font-medium"
                      >
                        Cambiar
                      </button>
                    </div>

                    <div>
                      <label className="label">Ubicacion</label>
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <button
                          onClick={() => setItemTempUbicacionId(1)}
                          className={`py-2 rounded-xl text-sm font-medium ${
                            itemTempUbicacionId === 1
                              ? "bg-brand-blue text-white"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          Tienda
                        </button>
                        <button
                          onClick={() => setItemTempUbicacionId(2)}
                          className={`py-2 rounded-xl text-sm font-medium ${
                            itemTempUbicacionId === 2
                              ? "bg-brand-blue text-white"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          Bodega
                        </button>
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
                      <label className="label">
                        Cantidad (max. {stockTempDisponible})
                      </label>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() =>
                            setItemTempCantidad(
                              Math.max(1, itemTempCantidad - 1),
                            )
                          }
                          className="w-10 h-10 rounded-xl bg-gray-100 font-bold text-xl text-gray-700 flex items-center justify-center"
                        >
                          -
                        </button>
                        <span className="text-2xl font-bold text-gray-900 w-8 text-center">
                          {itemTempCantidad}
                        </span>
                        <button
                          onClick={() =>
                            setItemTempCantidad(
                              Math.min(stockTempDisponible, itemTempCantidad + 1),
                            )
                          }
                          className="w-10 h-10 rounded-xl bg-gray-100 font-bold text-xl text-gray-700 flex items-center justify-center"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="label">Precio</label>
                        <InputDinero
                          value={itemTempPrecioVenta}
                          onChange={(raw) => setItemTempPrecioVenta(raw)}
                          className="input"
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <label className="label">Descuento</label>
                        <InputDinero
                          value={itemTempDescuento}
                          onChange={(raw) => setItemTempDescuento(raw)}
                          className="input"
                          placeholder="0"
                        />
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
                      >
                        Cancelar
                      </Button>
                      <Button className="flex-1" onClick={agregarItemAlPedido}>
                        Agregar al pedido
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="card space-y-4">
          <h3 className="font-bold text-gray-700">Resumen del pedido</h3>

          <div>
            <label className="label">Canal de venta</label>
            <div className="grid grid-cols-3 gap-2">
              {CANALES.map((opcion) => (
                <button
                  key={opcion.value}
                  onClick={() => handleSelectCanal(opcion.value)}
                  className={`py-2 px-2 rounded-xl text-xs font-medium text-center ${
                    canal === opcion.value
                      ? "bg-brand-blue text-white"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {opcion.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label">Metodo de pago</label>
            <div className="grid grid-cols-3 gap-2">
              {opcionesMetodoPago.map((opcion) => (
                <button
                  key={opcion.value}
                  onClick={() => setMetodoPago(opcion.value)}
                  className={`py-2 px-2 rounded-xl text-xs font-medium text-center ${
                    metodoPago === opcion.value
                      ? "bg-brand-blue text-white"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {opcion.label}
                </button>
              ))}
            </div>
            {canal === "domicilio" && metodoPago === "por_confirmar" && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mt-2">
                El pedido descontara inventario y quedara sin metodo de pago
                confirmado para no alterar el reporte por metodo.
              </p>
            )}
          </div>

          <div className="bg-brand-blue rounded-2xl p-4 text-white space-y-2">
            <div className="flex justify-between text-sm">
              <span>Productos</span>
              <span>{items.length}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Unidades</span>
              <span>{totalUnidades}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Subtotal</span>
              <span>{formatCurrency(subtotalPedido)}</span>
            </div>
            {totalDescuentoPedido > 0 && (
              <div className="flex justify-between text-sm text-blue-200">
                <span>Descuentos</span>
                <span>- {formatCurrency(totalDescuentoPedido)}</span>
              </div>
            )}
            <div className="flex justify-between text-xl font-bold pt-2 border-t border-blue-400">
              <span>Total</span>
              <span>{formatCurrency(totalPedido)}</span>
            </div>
          </div>

          <Button
            className="w-full"
            size="lg"
            onClick={confirmarPedido}
            loading={loading}
            disabled={items.length === 0}
          >
            Confirmar pedido
          </Button>
        </div>
      </div>
    </div>
  );
}
