"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, Plus, CheckCircle, XCircle, Phone, Pencil, Store, PackageCheck, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDate, formatDateTime, getLocalDateString, getLocalTimeString } from "@/lib/utils";
import InputDinero from "@/components/ui/InputDinero";
import SelectorTalla from "@/components/SelectorTalla";
import ListaProductos from "@/components/ListaProductos";
import type { Abono, MetodoPago, SistemaTalla } from "@/lib/types";
import { useProfile } from "@/lib/context/ProfileContext";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";
import Spinner from "@/components/ui/Spinner";
import toast from "react-hot-toast";

interface ItemGrupo {
  id: number;
  referencia: string;
  talla: string;
  precio: number;
  total_abonado: number;
  saldo: number;
  estado: string;
  en_tienda: boolean;
  producto_id: number;
  talla_id: number;
  observacion: string | null;
}

interface TallaStock {
  talla_id: number; talla_nombre: string; stock_tienda: number; stock_bodega: number;
}

interface ProductoSel {
  id: number; referencia: string; codigo: string;
  precio_base: number; categoria_nombre: string; sistema_talla: SistemaTalla;
}

interface GrupoDetalle {
  grupoId: number;
  clienteId: number;
  clienteNombre: string;
  clienteTelefono: string | null;
  fecha: string;
  items: ItemGrupo[];
  abonos: Abono[];
  totalPrecio: number;
  totalAbonado: number;
  totalSaldo: number;
  estadoGrupo: string;
}

const METODOS: { value: MetodoPago; label: string }[] = [
  { value: "efectivo", label: "Efectivo" },
  { value: "nequi", label: "Nequi" },
  { value: "transferencia", label: "Transferencia" },
  { value: "datafono", label: "Datáfono" },
];

export default function ApartadoDetallePage() {
  const { id } = useParams<{ id: string }>();
  const grupoId = Number(id);
  const supabase = createClient();
  const router = useRouter();
  const { isAdmin } = useProfile();

  const [grupo, setGrupo] = useState<GrupoDetalle | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingCancel, setLoadingCancel] = useState(false);

  // Modal abono
  const [modalAbono, setModalAbono] = useState(false);
  const [montoAbono, setMontoAbono] = useState("");
  const [metodoPagoAbono, setMetodoPagoAbono] = useState<MetodoPago>("efectivo");
  const [loadingAbono, setLoadingAbono] = useState(false);

  // Modal agregar prenda
  const [modalAgregar, setModalAgregar] = useState(false);
  const [nuevoProd, setNuevoProd] = useState<ProductoSel | null>(null);
  const [nuevasTallas, setNuevasTallas] = useState<TallaStock[]>([]);
  const [nuevaTallaId, setNuevaTallaId] = useState<number | null>(null);
  const [nuevoPrecio, setNuevoPrecio] = useState("");
  const [nuevoEnTienda, setNuevoEnTienda] = useState(true);
  const [nuevaCantidad, setNuevaCantidad] = useState(1);
  const [loadingAgregar, setLoadingAgregar] = useState(false);

  // Modal editar prenda
  const [modalEdit, setModalEdit] = useState(false);
  const [editItem, setEditItem] = useState<ItemGrupo | null>(null);
  const [editTallas, setEditTallas] = useState<TallaStock[]>([]);
  const [editTallaId, setEditTallaId] = useState<number | null>(null);
  const [editEnTienda, setEditEnTienda] = useState(true);
  const [loadingEdit, setLoadingEdit] = useState(false);

  async function cargarDatos() {
    const { data: aps } = await supabase
      .from("v_apartados_pendientes")
      .select("*")
      .eq("grupo_id", grupoId)
      .order("id");

    const items = aps && aps.length > 0
      ? aps
      : (await supabase.from("v_apartados_pendientes").select("*").eq("id", grupoId)).data ?? [];

    if (!items || items.length === 0) { setLoading(false); return; }

    const apartadoIds = items.map(a => a.id);

    const [{ data: abonos }, { data: rawAps }] = await Promise.all([
      supabase.from("abonos").select("*").in("apartado_id", apartadoIds).order("fecha", { ascending: false }),
      supabase.from("apartados").select("id, producto_id, talla_id, en_tienda, cliente_id").in("id", apartadoIds),
    ]);

    const itemsDetalle: ItemGrupo[] = items.map(a => {
      const raw = rawAps?.find(r => r.id === a.id);
      return {
        id: a.id,
        referencia: a.referencia,
        talla: a.talla,
        precio: a.precio,
        total_abonado: a.total_abonado,
        saldo: a.saldo,
        estado: a.estado,
        en_tienda: raw?.en_tienda ?? false,
        producto_id: raw?.producto_id ?? 0,
        talla_id: raw?.talla_id ?? 0,
        observacion: a.observacion,
      };
    });

    const totalPrecio = itemsDetalle.reduce((s, i) => s + i.precio, 0);
    const totalAbonado = itemsDetalle.reduce((s, i) => s + i.total_abonado, 0);
    const totalSaldo = itemsDetalle.reduce((s, i) => s + i.saldo, 0);
    const estadoGrupo = itemsDetalle.some(i => i.estado === "pendiente")
      ? "pendiente"
      : itemsDetalle.every(i => i.estado === "entregado") ? "entregado" : "cancelado";

    setGrupo({
      grupoId, clienteId: rawAps?.[0]?.cliente_id ?? 0,
      clienteNombre: items[0].cliente_nombre,
      clienteTelefono: items[0].cliente_telefono, fecha: items[0].fecha,
      items: itemsDetalle, abonos: abonos ?? [],
      totalPrecio, totalAbonado, totalSaldo, estadoGrupo,
    });
    setLoading(false);
  }

  useEffect(() => { cargarDatos(); }, [id]);

  async function abrirEditarPrenda(item: ItemGrupo) {
    setEditItem(item);
    setEditTallaId(item.talla_id);
    setEditEnTienda(item.en_tienda);
    setLoadingEdit(false);
    setEditTallas([]);
    setModalEdit(true);

    // Obtener el sistema de talla de la talla actual
    const { data: tallaActual } = await supabase
      .from("tallas").select("sistema").eq("id", item.talla_id).single();

    if (tallaActual) {
      const [{ data: tallasSistema }, { data: stockData }] = await Promise.all([
        supabase.from("tallas").select("id, nombre").eq("sistema", tallaActual.sistema).order("orden"),
        supabase.from("v_stock_total").select("talla, stock_tienda, stock_bodega").eq("producto_id", item.producto_id),
      ]);
      setEditTallas((tallasSistema ?? []).map((t: any) => {
        const s = stockData?.find((d: any) => d.talla === t.nombre);
        return {
          talla_id: t.id, talla_nombre: t.nombre,
          stock_tienda: s?.stock_tienda ?? 0,
          stock_bodega: s?.stock_bodega ?? 0,
        };
      }));
    }
  }

  async function guardarEdicionPrenda() {
    if (loadingEdit || !editItem || !editTallaId) return;
    setLoadingEdit(true);

    const cambioTalla = editTallaId !== editItem.talla_id;
    const estabaPendiente = !editItem.en_tienda;  // la prenda venía del proveedor
    const ahoraPendiente = !editEnTienda;

    if (cambioTalla && !estabaPendiente) {
      // Estaba en stock: devolver talla vieja y descontar talla nueva
      const { error: e1 } = await supabase.from("movimientos").insert({
        producto_id: editItem.producto_id, talla_id: editItem.talla_id,
        ubicacion_id: 1, cantidad: 1, tipo: "entrada", canal: "ajuste", usuario_id: null,
      });
      if (e1) { toast.error("Error devolviendo talla anterior: " + e1.message); setLoadingEdit(false); return; }

      if (!ahoraPendiente) {
        // Nueva talla también es de stock
        const { error: e2 } = await supabase.from("movimientos").insert({
          producto_id: editItem.producto_id, talla_id: editTallaId,
          ubicacion_id: 1, cantidad: 1, tipo: "salida", canal: "ajuste", usuario_id: null,
        });
        if (e2) { toast.error("Error descontando nueva talla: " + e2.message); setLoadingEdit(false); return; }
      }
      // Si ahoraPendiente=true: se devolvió al stock la talla vieja y la nueva se pedirá al proveedor
    } else if (!cambioTalla && estabaPendiente && !ahoraPendiente) {
      // Cambió de "pendiente de proveedor" a "en tienda": descontar del inventario
      const { error: e1 } = await supabase.from("movimientos").insert({
        producto_id: editItem.producto_id, talla_id: editItem.talla_id,
        ubicacion_id: 1, cantidad: 1, tipo: "salida", canal: "ajuste", usuario_id: null,
      });
      if (e1) { toast.error("Error actualizando inventario: " + e1.message); setLoadingEdit(false); return; }
    } else if (!cambioTalla && !estabaPendiente && ahoraPendiente) {
      // Cambió de "en tienda" a "pendiente de proveedor": devolver al inventario
      const { error: e1 } = await supabase.from("movimientos").insert({
        producto_id: editItem.producto_id, talla_id: editItem.talla_id,
        ubicacion_id: 1, cantidad: 1, tipo: "entrada", canal: "ajuste", usuario_id: null,
      });
      if (e1) { toast.error("Error actualizando inventario: " + e1.message); setLoadingEdit(false); return; }
    }

    // Actualizar el apartado
    const { error } = await supabase.from("apartados")
      .update({ talla_id: editTallaId, en_tienda: editEnTienda })
      .eq("id", editItem.id);

    if (error) { toast.error("Error: " + error.message); setLoadingEdit(false); return; }

    toast.success("Prenda actualizada");
    setModalEdit(false);
    await cargarDatos();
    setLoadingEdit(false);
  }

  async function cargarTallasProducto(productoId: number, sistemaTalla: SistemaTalla): Promise<TallaStock[]> {
    const [{ data: tallasSistema }, { data: stockData }] = await Promise.all([
      supabase.from("tallas").select("id, nombre").eq("sistema", sistemaTalla).order("orden"),
      supabase.from("v_stock_total").select("talla, stock_tienda, stock_bodega").eq("producto_id", productoId),
    ]);
    return (tallasSistema ?? []).map((t: any) => {
      const s = stockData?.find((d: any) => d.talla === t.nombre);
      return { talla_id: t.id, talla_nombre: t.nombre, stock_tienda: s?.stock_tienda ?? 0, stock_bodega: s?.stock_bodega ?? 0 };
    });
  }

  async function agregarPrenda() {
    if (loadingAgregar || !nuevoProd || !nuevaTallaId || !grupo) return;
    setLoadingAgregar(true);

    const precioNum = parseFloat(nuevoPrecio) || nuevoProd.precio_base;

    // Crear un apartado por cada unidad
    for (let i = 0; i < nuevaCantidad; i++) {
      const { error } = await supabase.from("apartados").insert({
        cliente_id: grupo.clienteId,
        producto_id: nuevoProd.id,
        talla_id: nuevaTallaId,
        precio: precioNum,
        estado: "pendiente",
        en_tienda: nuevoEnTienda,
        grupo_id: grupoId,
      });
      if (error) { toast.error("Error: " + error.message); setLoadingAgregar(false); return; }
    }

    // Si la prenda está en tienda, descontar del inventario (cantidad total)
    if (nuevoEnTienda) {
      await supabase.from("movimientos").insert({
        producto_id: nuevoProd.id, talla_id: nuevaTallaId,
        ubicacion_id: 1, cantidad: nuevaCantidad, tipo: "salida", canal: "ajuste", usuario_id: null,
      });
    }

    toast.success(`${nuevaCantidad} prenda${nuevaCantidad > 1 ? "s" : ""} agregada${nuevaCantidad > 1 ? "s" : ""} al pedido`);
    setModalAgregar(false);
    setNuevoProd(null);
    setNuevasTallas([]);
    setNuevaTallaId(null);
    setNuevoPrecio("");
    setNuevoEnTienda(true);
    setNuevaCantidad(1);
    setLoadingAgregar(false);
    await cargarDatos();
  }

  async function marcarEnTienda(item: ItemGrupo) {
    if (loadingCancel) return;

    // Verificar si la prenda ya está en inventario (el empleado pudo haber
    // registrado una entrada antes de marcar como recibida)
    const { data: stockRows } = await supabase
      .from("stock")
      .select("ubicacion_id, cantidad")
      .eq("producto_id", item.producto_id)
      .eq("talla_id", item.talla_id)
      .gt("cantidad", 0)
      .order("ubicacion_id", { ascending: true }) // tienda (1) primero
      .limit(1)
      .maybeSingle();

    if (stockRows) {
      // Hay stock: descontarlo para que quede reservado al cliente
      const { error: movErr } = await supabase.from("movimientos").insert({
        producto_id: item.producto_id,
        talla_id: item.talla_id,
        ubicacion_id: stockRows.ubicacion_id,
        cantidad: 1,
        tipo: "salida" as const,
        canal: "ajuste" as const,
        nota: `Reserva apartado — prenda recibida de proveedor`,
      });
      if (movErr) { toast.error("Error al descontar del inventario: " + movErr.message); return; }
    }

    const { error } = await supabase.from("apartados").update({ en_tienda: true }).eq("id", item.id);
    if (error) { toast.error("Error: " + error.message); return; }

    if (stockRows) {
      toast.success("Prenda marcada como recibida — descontada del inventario");
    } else {
      toast.success("Prenda marcada como recibida");
    }
    await cargarDatos();
  }

  async function eliminarPrenda(item: ItemGrupo) {
    if (loadingCancel) return;
    if (!confirm(`¿Quitar "${item.referencia} (${item.talla})" del pedido?`)) return;
    setLoadingCancel(true);

    const { error } = await supabase.from("apartados").update({ estado: "cancelado" }).eq("id", item.id);
    if (error) { toast.error("Error: " + error.message); return; }

    // Solo restaurar inventario si la prenda venía del stock
    if (item.en_tienda) {
      await supabase.from("movimientos").insert({
        producto_id: item.producto_id, talla_id: item.talla_id,
        ubicacion_id: 1, cantidad: 1, tipo: "entrada", canal: "ajuste", usuario_id: null,
      });
    }

    setLoadingCancel(false);
    toast.success(`${item.referencia} quitada del pedido${item.en_tienda ? " — devuelta al inventario" : ""}`);
    await cargarDatos();
  }

  async function registrarAbono() {
    const monto = parseFloat(montoAbono);
    if (!monto || monto <= 0) { toast.error("Ingresa un monto válido"); return; }
    if (!grupo) return;
    if (grupo.totalSaldo <= 0) { toast.error("Este apartado ya está pagado completamente"); return; }
    if (monto > grupo.totalSaldo) {
      toast.error(`El abono supera el saldo pendiente (${new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(grupo.totalSaldo)})`);
      return;
    }

    setLoadingAbono(true);

    // Registrar el abono como una sola entrada contra el primer apartado del grupo
    const { error } = await supabase.from("abonos").insert({
      apartado_id: grupoId,
      monto,
      metodo_pago: metodoPagoAbono,
      registrado_por: null,
    });
    if (error) { toast.error("Error: " + error.message); setLoadingAbono(false); return; }

    // Registrar en caja: buscar caja abierta hoy o crearla si no existe
    const hoy = getLocalDateString();
    let cajaDiariaId: number | null = null;
    const { data: cajaExistente } = await supabase
      .from("caja_diaria").select("id, estado")
      .eq("fecha", hoy).maybeSingle();

    if (cajaExistente?.estado === "abierta") {
      cajaDiariaId = cajaExistente.id;
    } else if (!cajaExistente) {
      // No hay caja hoy — crearla automáticamente
      const { data: ultima } = await supabase
        .from("v_resumen_caja" as any).select("saldo_final")
        .eq("estado", "cerrada").order("fecha", { ascending: false }).limit(1).maybeSingle();
      const saldoInicial = (ultima as any)?.saldo_final ?? 0;
      const { data: nueva } = await supabase
        .from("caja_diaria")
        .insert({ fecha: hoy, saldo_inicial: saldoInicial, guardado_caja_fuerte: 0, estado: "abierta" })
        .select("id").single();
      cajaDiariaId = nueva?.id ?? null;
    }
    // Si la caja de hoy está cerrada, no se agrega (evitar modificar un cierre ya registrado)

    if (cajaDiariaId) {
      const hora = getLocalTimeString();
      const esEfectivo = metodoPagoAbono === "efectivo";
      const { error: cajaErr } = await supabase.from("registros_caja").insert({
        caja_diaria_id: cajaDiariaId, fecha: hoy, hora,
        tipo: "ingreso" as const,
        descripcion: `Abono apartado #${grupoId} — ${grupo.clienteNombre}`,
        valor: monto, metodo_pago: metodoPagoAbono,
        monto_efectivo: esEfectivo ? monto : 0,
        monto_transferencia: !esEfectivo ? monto : 0,
      });
      if (cajaErr) toast.error("Abono guardado, pero error al registrar en caja: " + cajaErr.message);
    }

    const nuevoSaldo = grupo.totalSaldo - monto;
    toast.success("¡Abono registrado!");
    setModalAbono(false);
    setMontoAbono("");
    await cargarDatos();
    setLoadingAbono(false);

    if (nuevoSaldo <= 0) {
      if (confirm("¡El apartado está completamente pagado! ¿Marcarlo como entregado ahora?")) {
        await marcarEntregado();
      }
    }
  }

  async function marcarEntregado() {
    if (!grupo || loadingCancel) return;
    if (grupo.totalSaldo > 0) {
      toast.error(`Aún hay saldo pendiente de ${new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(grupo.totalSaldo)}`);
      return;
    }
    const idsPendientes = grupo.items.filter(i => i.estado === "pendiente").map(i => i.id);
    if (idsPendientes.length === 0) { toast.error("No hay prendas pendientes"); return; }
    const { error } = await supabase.from("apartados").update({ estado: "entregado" }).in("id", idsPendientes);
    if (error) { toast.error("Error: " + error.message); return; }
    toast.success("Apartado marcado como entregado");
    await cargarDatos();
  }

  async function cancelarApartado() {
    if (!grupo || loadingCancel) return;
    if (!confirm("¿Cancelar este apartado? Las prendas volverán al inventario.")) return;
    setLoadingCancel(true);
    const itemsPendientes = grupo.items.filter(i => i.estado === "pendiente");
    for (const item of itemsPendientes) {
      const { error } = await supabase.from("apartados").update({ estado: "cancelado" }).eq("id", item.id);
      if (error) { toast.error("Error: " + error.message); return; }

      // Solo restaurar inventario si la prenda venía del stock (en_tienda=true)
      // Si era "pendiente de llegada", nunca se descontó, no hay nada que devolver
      if (item.en_tienda) {
        await supabase.from("movimientos").insert({
          producto_id: item.producto_id, talla_id: item.talla_id,
          ubicacion_id: 1,
          cantidad: 1, tipo: "entrada", canal: "ajuste", usuario_id: null,
        });
      }
    }
    setLoadingCancel(false);
    toast.success("Apartado cancelado — prendas devueltas al inventario");
    router.push("/apartados");
  }

  if (loading) return <Spinner className="h-screen" />;
  if (!grupo) return <div className="p-6 text-center text-gray-500">Apartado no encontrado</div>;

  const esPendiente = grupo.estadoGrupo === "pendiente";

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-8 pt-6">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="p-2 rounded-xl hover:bg-gray-100">
          <ChevronLeft className="w-6 h-6 text-gray-600" />
        </button>
        <h1 className="text-xl font-bold text-gray-900">Apartado #{grupoId}</h1>
        <Badge variant={esPendiente ? "warning" : grupo.estadoGrupo === "entregado" ? "success" : "danger"}>
          {grupo.estadoGrupo}
        </Badge>
      </div>

      {/* Info cliente */}
      <div className="card mb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-bold text-lg text-gray-900">{grupo.clienteNombre}</p>
            {grupo.clienteTelefono && (
              <a href={`tel:${grupo.clienteTelefono}`} className="flex items-center gap-1 text-brand-blue text-sm mt-1">
                <Phone className="w-4 h-4" /> {grupo.clienteTelefono}
              </a>
            )}
          </div>
          <p className="text-sm text-gray-400">{formatDate(grupo.fecha)}</p>
        </div>
      </div>

      {/* Prendas */}
      <div className="card mb-4">
        <p className="text-sm text-gray-500 mb-3 font-semibold">
          {grupo.items.length === 1 ? "Prenda apartada" : `Prendas apartadas (${grupo.items.length})`}
        </p>
        <div className="space-y-3">
          {grupo.items.map(item => (
            <div key={item.id} className="border border-gray-100 rounded-xl p-3">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-gray-900">{item.referencia}</p>
                    {item.estado !== "pendiente" && (
                      <Badge variant={item.estado === "entregado" ? "success" : "danger"}>
                        {item.estado}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mt-0.5">Talla: <b>{item.talla}</b></p>
                  {item.observacion && <p className="text-xs text-gray-400 italic mt-0.5">"{item.observacion}"</p>}
                </div>
                <div className="text-right ml-3">
                  <p className="font-semibold text-sm">{formatCurrency(item.precio)}</p>
                </div>
              </div>

              {/* Estado en tienda + acciones */}
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-50">
                {item.en_tienda ? (
                  <span className="flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-1 rounded-lg font-medium">
                    <Store className="w-3.5 h-3.5" /> En tienda
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-orange-700 bg-orange-50 px-2 py-1 rounded-lg font-medium">
                    <PackageCheck className="w-3.5 h-3.5" /> Pendiente de llegada
                  </span>
                )}

                {item.estado === "pendiente" && isAdmin && (
                  <div className="flex items-center gap-2">
                    {!item.en_tienda && (
                      <button
                        onClick={() => marcarEnTienda(item)}
                        className="text-xs text-green-600 font-medium hover:underline"
                      >
                        Marcar recibida
                      </button>
                    )}
                    <button
                      onClick={() => abrirEditarPrenda(item)}
                      className="flex items-center gap-1 text-xs text-brand-blue font-medium hover:underline"
                    >
                      <Pencil className="w-3 h-3" /> Editar
                    </button>
                    {grupo.items.filter(i => i.estado === "pendiente").length > 1 && (
                      <button
                        onClick={() => eliminarPrenda(item)}
                        className="flex items-center gap-1 text-xs text-red-400 font-medium hover:text-red-600 hover:underline"
                      >
                        <Trash2 className="w-3 h-3" /> Quitar
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Resumen financiero — solo admin */}
      {isAdmin && (
        <div className="card mb-4">
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-600">Precio total</span>
              <span className="font-semibold">{formatCurrency(grupo.totalPrecio)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Total abonado</span>
              <span className="font-semibold text-green-600">{formatCurrency(grupo.totalAbonado)}</span>
            </div>
            <div className="flex justify-between text-xl font-bold border-t border-gray-100 pt-2 mt-2">
              <span>Saldo pendiente</span>
              <span className={grupo.totalSaldo > 0 ? "text-red-600" : "text-green-600"}>
                {formatCurrency(grupo.totalSaldo)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Historial de abonos — solo admin */}
      {isAdmin && (<div className="card mb-4">
        <h3 className="font-bold text-gray-700 mb-3">Abonos ({grupo.abonos.length})</h3>
        {grupo.abonos.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-3">Sin abonos registrados</p>
        ) : (
          <div className="space-y-2">
            {grupo.abonos.map(ab => (
              <div key={ab.id} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
                <div>
                  <p className="font-semibold text-sm">{formatCurrency(ab.monto)}</p>
                  <p className="text-xs text-gray-400">{formatDateTime(ab.fecha)}</p>
                </div>
                <Badge variant="info">{ab.metodo_pago}</Badge>
              </div>
            ))}
          </div>
        )}
      </div>)}

      {/* Acciones — solo admin */}
      {esPendiente && isAdmin && (
        <div className="space-y-3 mb-6">
          <Button variant="gold" className="w-full"
            onClick={() => { setMontoAbono(String(grupo.totalSaldo)); setModalAbono(true); }}>
            <Plus className="w-5 h-5" /> Registrar Abono
          </Button>
          <Button variant="secondary" className="w-full" onClick={() => { setNuevoProd(null); setModalAgregar(true); }}>
            <Plus className="w-5 h-5" /> Agregar prenda al pedido
          </Button>
          <Button variant="primary" className="w-full" onClick={marcarEntregado}>
            <CheckCircle className="w-5 h-5" /> Marcar como Entregado
          </Button>
          <Button variant="danger" className="w-full" onClick={cancelarApartado} loading={loadingCancel}>
            <XCircle className="w-5 h-5" /> Cancelar Apartado
          </Button>
        </div>
      )}

      {/* Modal abono */}
      <Modal open={modalAbono} onClose={() => setModalAbono(false)} title="Registrar Abono">
        <div className="space-y-4">
          <div>
            <label className="label">Monto del abono</label>
            <InputDinero value={montoAbono} onChange={raw => setMontoAbono(raw)}
              className="input text-2xl font-bold" placeholder="0" autoFocus />
            <p className="text-xs text-gray-400 mt-1">Saldo total: {formatCurrency(grupo.totalSaldo)}</p>
          </div>
          <div>
            <label className="label">Método de pago</label>
            <div className="grid grid-cols-2 gap-2">
              {METODOS.map(m => (
                <button key={m.value} onClick={() => setMetodoPagoAbono(m.value)}
                  className={`py-3 rounded-xl text-sm font-medium ${metodoPagoAbono === m.value ? "bg-brand-blue text-white" : "bg-gray-100 text-gray-600"}`}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <Button className="w-full" onClick={registrarAbono} loading={loadingAbono}>
            Confirmar Abono
          </Button>
        </div>
      </Modal>

      {/* Modal editar prenda */}
      <Modal open={modalEdit} onClose={() => setModalEdit(false)}
        title={editItem ? `Editar: ${editItem.referencia}` : "Editar prenda"}>
        {editItem && (
          <div className="space-y-4">
            <div>
              <p className="label mb-2">Talla</p>
              {editTallas.length > 0 ? (
                <SelectorTalla
                  tallas={editTallas}
                  seleccionada={editTallaId}
                  onSelect={setEditTallaId}
                  ubicacionId={editEnTienda ? 1 : 2}
                  permitirSinStock={!editEnTienda}
                />
              ) : (
                <p className="text-sm text-gray-400">Cargando tallas...</p>
              )}
              {editTallaId !== editItem.talla_id && (
                <p className="text-xs text-orange-600 mt-1">
                  ⚠️ Se ajustará el inventario: se devolverá la talla anterior y se descontará la nueva.
                </p>
              )}
            </div>

            <div>
              <p className="label mb-2">Ubicación de la prenda</p>
              <div className="flex gap-2">
                <button onClick={() => setEditEnTienda(true)}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-1
                    ${editEnTienda ? "bg-green-600 text-white" : "bg-gray-100 text-gray-600"}`}>
                  <Store className="w-4 h-4" /> En tienda
                </button>
                <button onClick={() => setEditEnTienda(false)}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-1
                    ${!editEnTienda ? "bg-orange-500 text-white" : "bg-gray-100 text-gray-600"}`}>
                  <PackageCheck className="w-4 h-4" /> Pendiente llegada
                </button>
              </div>
              {editEnTienda !== editItem.en_tienda && (
                <p className="text-xs text-orange-600 mt-1">
                  ⚠️ Se moverá la prenda entre tienda y bodega en el inventario.
                </p>
              )}
            </div>

            <Button className="w-full" onClick={guardarEdicionPrenda} loading={loadingEdit}
              disabled={editTallaId === editItem.talla_id && editEnTienda === editItem.en_tienda}>
              Guardar cambios
            </Button>
          </div>
        )}
      </Modal>

      {/* Modal agregar prenda */}
      <Modal open={modalAgregar} onClose={() => { setModalAgregar(false); setNuevoProd(null); }} title="Agregar prenda al pedido">
        <div className="space-y-4">
          {!nuevoProd ? (
            <ListaProductos onSelect={async p => {
              setNuevoProd(p);
              setNuevoPrecio(String(p.precio_base));
              setNuevaTallaId(null);
              setNuevaCantidad(1);
              const tallas = await cargarTallasProducto(p.id, p.sistema_talla);
              setNuevasTallas(tallas);
              const sinStock = tallas.every(t => t.stock_tienda === 0);
              setNuevoEnTienda(!sinStock);
            }} />
          ) : (
            <>
              <div className="flex items-center justify-between bg-gray-50 rounded-xl p-3">
                <div>
                  <p className="font-semibold">{nuevoProd.referencia}</p>
                  <p className="text-xs text-gray-400">{nuevoProd.categoria_nombre}</p>
                </div>
                <button onClick={() => { setNuevoProd(null); setNuevaTallaId(null); }} className="text-brand-blue text-sm">Cambiar</button>
              </div>

              <div>
                <p className="label mb-2">¿Está en tienda?</p>
                <div className="flex gap-2">
                  <button onClick={() => setNuevoEnTienda(true)}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-1 ${nuevoEnTienda ? "bg-green-600 text-white" : "bg-gray-100 text-gray-600"}`}>
                    <Store className="w-4 h-4" /> En tienda
                  </button>
                  <button onClick={() => setNuevoEnTienda(false)}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-1 ${!nuevoEnTienda ? "bg-orange-500 text-white" : "bg-gray-100 text-gray-600"}`}>
                    <PackageCheck className="w-4 h-4" /> Pedir al proveedor
                  </button>
                </div>
              </div>

              {nuevasTallas.length > 0 && (
                <div>
                  <p className="label mb-2">Talla</p>
                  <SelectorTalla tallas={nuevasTallas} seleccionada={nuevaTallaId} onSelect={setNuevaTallaId} permitirSinStock={!nuevoEnTienda} />
                </div>
              )}

              <div>
                <label className="label">Cantidad</label>
                <div className="flex items-center gap-4 justify-center">
                  <button onClick={() => setNuevaCantidad(c => Math.max(1, c - 1))}
                    className="w-10 h-10 rounded-xl bg-gray-100 font-bold text-xl flex items-center justify-center">−</button>
                  <span className="text-2xl font-bold w-8 text-center">{nuevaCantidad}</span>
                  <button onClick={() => setNuevaCantidad(c => c + 1)}
                    className="w-10 h-10 rounded-xl bg-gray-100 font-bold text-xl flex items-center justify-center">+</button>
                </div>
              </div>

              <div>
                <label className="label">Precio unitario</label>
                <InputDinero value={nuevoPrecio} onChange={raw => setNuevoPrecio(raw)} className="input" />
              </div>

              <Button className="w-full" onClick={agregarPrenda} loading={loadingAgregar} disabled={!nuevaTallaId}>
                Agregar al pedido
              </Button>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
