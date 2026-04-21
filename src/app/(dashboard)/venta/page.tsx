"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, ShoppingBag, ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";
import ListaProductos from "@/components/ListaProductos";
import SelectorTalla from "@/components/SelectorTalla";
import Button from "@/components/ui/Button";
import InputDinero from "@/components/ui/InputDinero";
import toast from "react-hot-toast";
import type { CanalMovimiento, MetodoPago } from "@/lib/types";

type Paso = "producto" | "talla" | "detalle" | "confirmado";
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

const CANALES: { value: CanalMovimiento; label: string }[] = [
  { value: "venta_tienda", label: "Tienda" },
  { value: "domicilio", label: "Domicilio" },
  { value: "envio_nacional", label: "Envio Nacional" },
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

export default function VentaPage() {
  const supabase = createClient();
  const router = useRouter();

  const [paso, setPaso] = useState<Paso>("producto");
  const [producto, setProducto] = useState<ProductoSeleccionado | null>(null);
  const [tallas, setTallas] = useState<TallaStock[]>([]);
  const [tallaId, setTallaId] = useState<number | null>(null);
  const [ubicacionId, setUbicacionId] = useState<number>(1);
  const [cantidad, setCantidad] = useState(1);
  const [precioVenta, setPrecioVenta] = useState("");
  const [descuento, setDescuento] = useState("");
  const [canal, setCanal] = useState<CanalMovimiento>("venta_tienda");
  const [metodoPago, setMetodoPago] = useState<MetodoPagoVenta>("efectivo");
  const [loading, setLoading] = useState(false);

  async function handleSelectProducto(p: ProductoSeleccionado) {
    setProducto(p);
    setPrecioVenta(String(p.precio_base));

    const { data } = await supabase
      .from("v_stock_total")
      .select("talla, stock_tienda, stock_bodega")
      .eq("producto_id", p.id);

    if (data) {
      const tallaNames = data.map((d) => d.talla);
      const { data: tallasData } = await supabase
        .from("tallas")
        .select("id, nombre")
        .in("nombre", tallaNames);

      const merged: TallaStock[] = data.map((d) => ({
        talla_id: tallasData?.find((t) => t.nombre === d.talla)?.id ?? 0,
        talla_nombre: d.talla,
        stock_tienda: d.stock_tienda ?? 0,
        stock_bodega: d.stock_bodega ?? 0,
      }));

      setTallas(merged);
    }

    setPaso("talla");
  }

  function handleSelectTalla(id: number) {
    setTallaId(id);

    const talla = tallas.find((item) => item.talla_id === id);
    if (talla && talla.stock_tienda > 0) setUbicacionId(1);
    else if (talla && talla.stock_bodega > 0) setUbicacionId(2);

    setPaso("detalle");
  }

  function handleSelectCanal(nuevoCanal: CanalMovimiento) {
    setCanal(nuevoCanal);

    if (nuevoCanal !== "domicilio" && metodoPago === "por_confirmar") {
      setMetodoPago("efectivo");
    }
  }

  function resetFormulario() {
    setPaso("producto");
    setProducto(null);
    setTallas([]);
    setTallaId(null);
    setUbicacionId(1);
    setCantidad(1);
    setPrecioVenta("");
    setDescuento("");
    setCanal("venta_tienda");
    setMetodoPago("efectivo");
  }

  const tallaSeleccionada = tallas.find((item) => item.talla_id === tallaId);
  const stockDisponible =
    ubicacionId === 1
      ? (tallaSeleccionada?.stock_tienda ?? 0)
      : (tallaSeleccionada?.stock_bodega ?? 0);

  const precioNum = parseFloat(precioVenta) || 0;
  const descuentoNum = parseFloat(descuento) || 0;
  const totalFinal = (precioNum - descuentoNum) * cantidad;
  const opcionesMetodoPago =
    canal === "domicilio" ? METODOS_DOMICILIO : METODOS_BASE;

  async function confirmarVenta() {
    if (loading || !producto || !tallaId) return;

    setLoading(true);

    const { error } = await supabase.from("movimientos").insert({
      producto_id: producto.id,
      talla_id: tallaId,
      ubicacion_id: ubicacionId,
      cantidad,
      tipo: "salida",
      canal,
      precio_venta: precioNum,
      descuento: descuentoNum > 0 ? descuentoNum : null,
      metodo_pago: metodoPago === "por_confirmar" ? null : metodoPago,
      usuario_id: null,
    });

    if (error) {
      toast.error("Error al registrar la venta: " + error.message);
      setLoading(false);
      return;
    }

    toast.success("Venta registrada!");
    setPaso("confirmado");
    setLoading(false);
  }

  if (paso === "confirmado") {
    return (
      <div className="max-w-2xl mx-auto px-4 md:px-8 pt-16 text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-10 h-10 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Venta registrada!
        </h2>
        <p className="text-gray-500 mb-2">{producto?.referencia}</p>
        <p className="text-3xl font-bold text-brand-blue mb-8">
          {formatCurrency(totalFinal)}
        </p>
        <div className="space-y-3">
          <Button className="w-full" onClick={resetFormulario}>
            Nueva venta
          </Button>
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => router.push("/")}
          >
            Ir al inicio
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-8 pt-6">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.back()}
          className="p-2 rounded-xl hover:bg-gray-100"
        >
          <ChevronLeft className="w-6 h-6 text-gray-600" />
        </button>
        <div className="flex items-center gap-2">
          <ShoppingBag className="w-6 h-6 text-brand-blue" />
          <h1 className="text-xl font-bold text-gray-900">Nueva Venta</h1>
        </div>
      </div>

      <div className="md:grid md:grid-cols-2 md:gap-6 md:items-start">
        <div className="space-y-4 mb-4 md:mb-0">
          <div className="card">
            <h3 className="font-bold text-gray-700 mb-3 flex items-center gap-2">
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  paso !== "producto"
                    ? "bg-green-500 text-white"
                    : "bg-brand-blue text-white"
                }`}
              >
                {paso !== "producto" ? "OK" : "1"}
              </span>
              Producto
            </h3>

            {producto ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-900">
                    {producto.referencia}
                  </p>
                  <p className="text-xs text-gray-500">
                    {producto.categoria_nombre}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setPaso("producto");
                    setProducto(null);
                    setTallaId(null);
                  }}
                  className="text-brand-blue text-sm font-medium"
                >
                  Cambiar
                </button>
              </div>
            ) : (
              <ListaProductos onSelect={handleSelectProducto} />
            )}
          </div>

          {paso !== "producto" && (
            <div className="card">
              <h3 className="font-bold text-gray-700 mb-3 flex items-center gap-2">
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    tallaId
                      ? "bg-green-500 text-white"
                      : "bg-brand-blue text-white"
                  }`}
                >
                  {tallaId ? "OK" : "2"}
                </span>
                Selecciona talla
              </h3>

              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => setUbicacionId(1)}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
                    ubicacionId === 1
                      ? "bg-brand-blue text-white"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  Tienda
                </button>
                <button
                  onClick={() => setUbicacionId(2)}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
                    ubicacionId === 2
                      ? "bg-brand-blue text-white"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  Bodega
                </button>
              </div>

              <SelectorTalla
                tallas={tallas}
                seleccionada={tallaId}
                onSelect={handleSelectTalla}
                ubicacionId={ubicacionId}
              />
            </div>
          )}
        </div>

        {paso === "detalle" && tallaId && (
          <div className="card space-y-4">
            <h3 className="font-bold text-gray-700 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-brand-blue text-white flex items-center justify-center text-xs font-bold">
                3
              </span>
              Detalle de la venta
            </h3>

            <div>
              <label className="label">Cantidad (max. {stockDisponible})</label>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setCantidad(Math.max(1, cantidad - 1))}
                  className="w-10 h-10 rounded-xl bg-gray-100 font-bold text-xl text-gray-700 flex items-center justify-center"
                >
                  -
                </button>
                <span className="text-2xl font-bold text-gray-900 w-8 text-center">
                  {cantidad}
                </span>
                <button
                  onClick={() =>
                    setCantidad(Math.min(stockDisponible, cantidad + 1))
                  }
                  className="w-10 h-10 rounded-xl bg-gray-100 font-bold text-xl text-gray-700 flex items-center justify-center"
                >
                  +
                </button>
              </div>
            </div>

            <div>
              <label className="label">Canal de venta</label>
              <div className="grid grid-cols-3 gap-2">
                {CANALES.map((item) => (
                  <button
                    key={item.value}
                    onClick={() => handleSelectCanal(item.value)}
                    className={`py-2 px-2 rounded-xl text-xs font-medium transition-colors text-center ${
                      canal === item.value
                        ? "bg-brand-blue text-white"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="label">Precio de venta</label>
              <InputDinero
                value={precioVenta}
                onChange={(raw) => setPrecioVenta(raw)}
                className="input"
                placeholder="0"
              />
            </div>

            <div>
              <label className="label">Descuento (opcional)</label>
              <InputDinero
                value={descuento}
                onChange={(raw) => setDescuento(raw)}
                className="input"
                placeholder="0"
              />
            </div>

            <div>
              <label className="label">Metodo de pago</label>
              <div className="grid grid-cols-3 gap-2">
                {opcionesMetodoPago.map((item) => (
                  <button
                    key={item.value}
                    onClick={() => setMetodoPago(item.value)}
                    className={`py-2 px-2 rounded-xl text-xs font-medium transition-colors text-center ${
                      metodoPago === item.value
                        ? "bg-brand-blue text-white"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              {canal === "domicilio" && metodoPago === "por_confirmar" && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mt-2">
                  La venta descontara inventario y quedara sin medio de pago
                  confirmado para no alterar el reporte por metodo.
                </p>
              )}
            </div>

            <div className="bg-brand-blue rounded-xl p-4 text-white">
              <div className="flex justify-between text-sm">
                <span>Precio</span>
                <span>{formatCurrency(precioNum)}</span>
              </div>
              {descuentoNum > 0 && (
                <div className="flex justify-between text-sm text-blue-200">
                  <span>Descuento</span>
                  <span>- {formatCurrency(descuentoNum)}</span>
                </div>
              )}
              {cantidad > 1 && (
                <div className="flex justify-between text-sm text-blue-200">
                  <span>x {cantidad} unidades</span>
                  <span>
                    {formatCurrency((precioNum - descuentoNum) * cantidad)}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-xl font-bold mt-2 border-t border-blue-400 pt-2">
                <span>Total</span>
                <span>{formatCurrency(totalFinal)}</span>
              </div>
            </div>

            <Button
              className="w-full"
              size="lg"
              onClick={confirmarVenta}
              loading={loading}
            >
              Confirmar Venta
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
