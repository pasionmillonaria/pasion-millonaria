"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, PackageSearch, Pencil, Save, Trash2, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/lib/context/ProfileContext";
import {
  formatCurrency,
  formatDateTime,
  LABELS_CANAL,
  LABELS_METODO_PAGO,
} from "@/lib/utils";
import {
  buildPedidosVenta,
  CANALES_PEDIDO,
  getSyntheticPedidoId,
  type MetodoPagoPedido,
  type PedidoVentaItem,
  type PedidoVentaResumen,
} from "@/lib/pedidos-venta";
import type { CanalMovimiento, MetodoPago } from "@/lib/types";
import Button from "@/components/ui/Button";
import InputDinero from "@/components/ui/InputDinero";
import Badge from "@/components/ui/Badge";
import Spinner from "@/components/ui/Spinner";
import toast from "react-hot-toast";

interface ItemEditable {
  movimientoId: number;
  referencia: string;
  talla: string;
  cantidad: number;
  precioVenta: string;
  descuento: string;
}

const CANALES_EDITABLES: { value: CanalMovimiento; label: string }[] = [
  { value: "venta_tienda", label: "Tienda" },
  { value: "domicilio", label: "Domicilio" },
  { value: "envio_nacional", label: "Envio nacional" },
];

const METODOS_EDITABLES: { value: MetodoPagoPedido; label: string }[] = [
  { value: "efectivo", label: "Efectivo" },
  { value: "nequi", label: "Nequi" },
  { value: "transferencia", label: "Transferencia" },
  { value: "datafono", label: "Datafono" },
  { value: "mixto", label: "Mixto" },
  { value: "sin_confirmar", label: "Sin confirmar" },
];

export default function PedidoVentaDetallePage() {
  const { ref } = useParams<{ ref: string }>();
  const supabase = createClient();
  const router = useRouter();
  const { isAdmin } = useProfile();

  const [pedido, setPedido] = useState<PedidoVentaResumen | null>(null);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [editando, setEditando] = useState(false);
  const [canalEdit, setCanalEdit] = useState<CanalMovimiento>("venta_tienda");
  const [metodoPagoEdit, setMetodoPagoEdit] =
    useState<MetodoPagoPedido>("sin_confirmar");
  const [itemsEdit, setItemsEdit] = useState<ItemEditable[]>([]);
  const [confirmEliminar, setConfirmEliminar] = useState(false);
  const [eliminando, setEliminando] = useState(false);

  async function cargarPedido() {
    setLoading(true);

    const pedidoIdSintetico = getSyntheticPedidoId(ref);
    let query = supabase
      .from("movimientos")
      .select(
        "id, fecha, canal, cantidad, precio_venta, descuento, metodo_pago, movimiento_ref, nota, productos(referencia), tallas(nombre)",
      )
      .eq("tipo", "salida")
      .in("canal", CANALES_PEDIDO);

    if (pedidoIdSintetico) {
      query = query.eq("id", pedidoIdSintetico);
    } else {
      query = query.eq("movimiento_ref", ref);
    }

    const { data, error } = await query.order("fecha", { ascending: true });

    if (error || !data || data.length === 0) {
      setPedido(null);
      setLoading(false);
      return;
    }

    const pedidoCargado = buildPedidosVenta(data as any[])[0] ?? null;
    setPedido(pedidoCargado);

    if (pedidoCargado) {
      setCanalEdit(pedidoCargado.canal);
      setMetodoPagoEdit(pedidoCargado.metodoPago);
      setItemsEdit(
        pedidoCargado.items.map((item) => ({
          movimientoId: item.movimientoId,
          referencia: item.referencia,
          talla: item.talla,
          cantidad: item.cantidad,
          precioVenta: String(item.precioVenta),
          descuento: item.descuento > 0 ? String(item.descuento) : "",
        })),
      );
    }

    setLoading(false);
  }

  useEffect(() => {
    cargarPedido();
  }, [ref]);

  function totalEditado() {
    return itemsEdit.reduce((acumulado, item) => {
      const precio = parseFloat(item.precioVenta) || 0;
      const descuento = parseFloat(item.descuento) || 0;
      return acumulado + Math.max(0, precio - descuento) * item.cantidad;
    }, 0);
  }

  function actualizarItem(
    movimientoId: number,
    patch: Partial<Pick<ItemEditable, "precioVenta" | "descuento">>,
  ) {
    setItemsEdit((prev) =>
      prev.map((item) =>
        item.movimientoId === movimientoId ? { ...item, ...patch } : item,
      ),
    );
  }

  async function guardarCambios() {
    if (!pedido || !isAdmin || guardando) return;

    const itemInvalido = itemsEdit.find((item) => {
      const precio = parseFloat(item.precioVenta) || 0;
      const descuento = parseFloat(item.descuento) || 0;
      return precio <= 0 || descuento < 0 || precio - descuento <= 0;
    });

    if (itemInvalido) {
      toast.error(
        `Revisa precio o descuento de ${itemInvalido.referencia} talla ${itemInvalido.talla}`,
      );
      return;
    }

    setGuardando(true);

    const metodoPago =
      metodoPagoEdit === "sin_confirmar" ? null : (metodoPagoEdit as MetodoPago);

    const body = {
      canal: canalEdit,
      metodo_pago: metodoPago,
      items: itemsEdit.map((item) => ({
        id: item.movimientoId,
        precio_venta: parseFloat(item.precioVenta) || 0,
        descuento:
          (parseFloat(item.descuento) || 0) > 0
            ? parseFloat(item.descuento) || 0
            : null,
      })),
    };

    const res = await fetch("/api/editar-movimiento", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: "Error desconocido" }));
      toast.error("No se pudo actualizar el pedido: " + (error ?? res.statusText));
      setGuardando(false);
      return;
    }

    toast.success("Pedido actualizado");
    setEditando(false);
    setGuardando(false);
    await cargarPedido();
  }

  async function eliminarPedido() {
    if (!pedido || !isAdmin || eliminando) return;
    setEliminando(true);

    const movimientoIds = pedido.items.map((i) => i.movimientoId);

    const res = await fetch("/api/eliminar-venta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ movimientoIds }),
    });

    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: "Error desconocido" }));
      toast.error("No se pudo eliminar: " + (error ?? res.statusText));
      setEliminando(false);
      return;
    }

    toast.success("Venta eliminada y stock restaurado");
    router.replace("/inicio");
  }

  if (loading) return <Spinner className="h-screen" />;

  if (!pedido) {
    return (
      <div className="max-w-3xl mx-auto px-4 md:px-8 pt-10 text-center">
        <PackageSearch className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="font-semibold text-gray-700">Pedido no encontrado</p>
        <p className="text-sm text-gray-400 mt-1">
          Puede que no exista o que ya no corresponda a una venta del dia.
        </p>
      </div>
    );
  }

  const totalPedido = editando ? totalEditado() : pedido.totalPedido;

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-8 pt-6 pb-24">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.back()}
          className="p-2 rounded-xl hover:bg-gray-100"
        >
          <ChevronLeft className="w-6 h-6 text-gray-600" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-gray-900 truncate">
            {pedido.displayRef}
          </h1>
          <p className="text-sm text-gray-400">{formatDateTime(pedido.fecha)}</p>
        </div>
        {isAdmin && (
          <Button
            variant={editando ? "secondary" : "primary"}
            size="sm"
            onClick={() => setEditando((prev) => !prev)}
          >
            <span className="flex items-center gap-2">
              <Pencil className="w-4 h-4" />
              {editando ? "Cancelar" : "Editar"}
            </span>
          </Button>
        )}
      </div>

      <div className="card mb-4">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <Badge
            variant={
              pedido.canal === "venta_tienda"
                ? "info"
                : pedido.canal === "domicilio"
                ? "warning"
                : "success"
            }
          >
            {editando ? LABELS_CANAL[canalEdit] : LABELS_CANAL[pedido.canal]}
          </Badge>
          <Badge variant="default">
            {
              LABELS_METODO_PAGO[
                editando ? metodoPagoEdit : pedido.metodoPago
              ]
            }
          </Badge>
          <Badge variant="default">
            {pedido.totalItems} item{pedido.totalItems !== 1 ? "s" : ""}
          </Badge>
          <Badge variant="default">
            {pedido.totalUnidades} ud{pedido.totalUnidades !== 1 ? "s" : ""}
          </Badge>
        </div>

        {editando ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Canal</label>
              <div className="grid grid-cols-3 gap-2">
                {CANALES_EDITABLES.map((opcion) => (
                  <button
                    key={opcion.value}
                    onClick={() => setCanalEdit(opcion.value)}
                    className={`py-2 px-2 rounded-xl text-xs font-medium ${
                      canalEdit === opcion.value
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
              <div className="grid grid-cols-2 gap-2">
                {METODOS_EDITABLES.map((opcion) => (
                  <button
                    key={opcion.value}
                    onClick={() => setMetodoPagoEdit(opcion.value)}
                    className={`py-2 px-2 rounded-xl text-xs font-medium ${
                      metodoPagoEdit === opcion.value
                        ? "bg-brand-blue text-white"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {opcion.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-gray-400 mb-1">Canal</p>
              <p className="font-semibold text-gray-900">
                {LABELS_CANAL[pedido.canal]}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">Metodo de pago</p>
              <p className="font-semibold text-gray-900">
                {LABELS_METODO_PAGO[pedido.metodoPago]}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="card mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-gray-800">Productos del pedido</h2>
          <p className="font-bold text-brand-blue">{formatCurrency(totalPedido)}</p>
        </div>

        <div className="space-y-3">
          {(editando ? itemsEdit : pedido.items).map((item) => {
            const editable = editando;
            const movimientoId = item.movimientoId;
            const cantidad = item.cantidad;
            const precio = editable
              ? parseFloat((item as ItemEditable).precioVenta) || 0
              : (item as PedidoVentaItem).precioVenta;
            const descuento = editable
              ? parseFloat((item as ItemEditable).descuento) || 0
              : (item as PedidoVentaItem).descuento;
            const total = Math.max(0, precio - descuento) * cantidad;

            return (
              <div
                key={movimientoId}
                className="rounded-2xl border border-gray-100 p-3"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-gray-900 truncate">
                      {item.referencia}
                    </p>
                    <p className="text-xs text-gray-500">
                      Talla {item.talla} · {cantidad} ud{cantidad !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <p className="text-sm font-bold text-gray-900">
                    {formatCurrency(total)}
                  </p>
                </div>

                {editando ? (
                  <div className="grid grid-cols-2 gap-2">
                    <InputDinero
                      value={(item as ItemEditable).precioVenta}
                      onChange={(raw) =>
                        actualizarItem(movimientoId, { precioVenta: raw })
                      }
                      className="input text-sm"
                      placeholder="Precio"
                    />
                    <InputDinero
                      value={(item as ItemEditable).descuento}
                      onChange={(raw) =>
                        actualizarItem(movimientoId, { descuento: raw })
                      }
                      className="input text-sm"
                      placeholder="Descuento"
                    />
                  </div>
                ) : (
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>Precio: {formatCurrency(precio)}</span>
                    <span>Descuento: {formatCurrency(descuento)}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {isAdmin && editando && (
        <Button className="w-full mb-4" size="lg" loading={guardando} onClick={guardarCambios}>
          <span className="flex items-center justify-center gap-2">
            <Save className="w-4 h-4" />
            Guardar cambios
          </span>
        </Button>
      )}

      {isAdmin && !editando && (
        <div className="border border-red-200 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <h3 className="font-bold text-red-700 text-sm">Zona peligrosa</h3>
          </div>

          {!confirmEliminar ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700">Eliminar venta</p>
                <p className="text-xs text-gray-400">
                  Restaura el stock y borra los registros
                </p>
              </div>
              <button
                onClick={() => setConfirmEliminar(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 text-sm font-medium transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Eliminar
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-red-700 font-medium">
                ¿Seguro? Se restaurará el stock de{" "}
                <span className="font-bold">{pedido.totalUnidades} unidad{pedido.totalUnidades !== 1 ? "es" : ""}</span>{" "}
                y se borrará la venta.
              </p>
              <div className="flex gap-2">
                <Button
                  className="flex-1 !bg-red-600 hover:!bg-red-700"
                  onClick={eliminarPedido}
                  loading={eliminando}
                >
                  Sí, eliminar
                </Button>
                <button
                  onClick={() => setConfirmEliminar(false)}
                  className="flex-1 py-2 rounded-xl bg-gray-100 text-gray-700 font-medium text-sm"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
