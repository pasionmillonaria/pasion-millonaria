"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ShoppingBag, PackagePlus, Bookmark, ArrowLeftRight,
  AlertTriangle, RefreshCw, ChevronRight, Eye, TrendingUp, LogOut, UserMinus,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/lib/context/ProfileContext";
import { formatCurrency, LABELS_CANAL } from "@/lib/utils";
import { buildPedidosVenta, CANALES_PEDIDO, type PedidoVentaResumen } from "@/lib/pedidos-venta";
import type { VApartadosPendientes, VStockBajo, VResumenCajaHoy } from "@/lib/types";
import Spinner from "@/components/ui/Spinner";
import Badge from "@/components/ui/Badge";

const accionesAdmin = [
  { href: "/venta",           label: "Venta",     icon: ShoppingBag,    color: "bg-brand-blue",  desc: "Registrar salida" },
  { href: "/entrada",         label: "Entrada",   icon: PackagePlus,    color: "bg-green-600",   desc: "Nueva mercancía" },
  { href: "/apartados/nuevo", label: "Apartado",  icon: Bookmark,       color: "bg-brand-gold",  desc: "Cliente aparta" },
  { href: "/traslado",        label: "Traslado",  icon: ArrowLeftRight, color: "bg-purple-600",  desc: "Tienda ↔ Bodega" },
];

const accionesExtra = [
  { href: "/devolucion", icon: RefreshCw,      color: "bg-orange-100", iconColor: "text-orange-600", label: "Devolución",  desc: "Cliente devuelve" },
  { href: "/cambio",     icon: ArrowLeftRight, color: "bg-blue-100",   iconColor: "text-blue-600",   label: "Cambio",      desc: "Cambio de producto" },
  { href: "/retiro",     icon: UserMinus,      color: "bg-gray-100",   iconColor: "text-gray-600",   label: "Retiro",      desc: "Uso personal dueño" },
];

export default function InicioPage() {
  const supabase = createClient();
  const { profile, isAdmin, setProfile } = useProfile();
  const router = useRouter();

  function handleSalir() {
    setProfile(null);
    router.push("/");
  }

  const [apartados, setApartados] = useState<VApartadosPendientes[]>([]);
  const [stockBajo, setStockBajo] = useState<VStockBajo[]>([]);
  const [resumenHoy, setResumenHoy] = useState<VResumenCajaHoy[]>([]);
  const [pedidosHoy, setPedidosHoy] = useState<PedidoVentaResumen[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchData() {
    setLoading(true);
    const inicioDia = new Date();
    inicioDia.setHours(0, 0, 0, 0);
    const finDia = new Date(inicioDia);
    finDia.setDate(finDia.getDate() + 1);

    const [{ data: ap }, { data: sb }, { data: ventasData }, resumenResponse] = await Promise.all([
      supabase.from("v_apartados_pendientes").select("*").eq("estado", "pendiente").order("en_tienda", { ascending: true }).order("fecha", { ascending: true }).limit(20),
      supabase.from("v_stock_bajo").select("*").limit(20),
      supabase
        .from("movimientos")
        .select("id, fecha, canal, cantidad, precio_venta, descuento, metodo_pago, movimiento_ref, productos(referencia), tallas(nombre)")
        .eq("tipo", "salida")
        .in("canal", CANALES_PEDIDO)
        .gte("fecha", inicioDia.toISOString())
        .lt("fecha", finDia.toISOString())
        .order("fecha", { ascending: false }),
      isAdmin
        ? supabase.from("v_resumen_caja_hoy").select("*")
        : Promise.resolve({ data: [] as VResumenCajaHoy[] | null }),
    ]);
    setApartados(ap ?? []);
    setStockBajo(sb ?? []);
    setPedidosHoy(buildPedidosVenta((ventasData ?? []) as any[]));
    setResumenHoy(resumenResponse.data ?? []);
    setLoading(false);
  }

  useEffect(() => { fetchData(); }, [isAdmin]);

  const totalVentasHoy = resumenHoy.reduce((s, r) => s + r.total, 0);
  const cantVentasHoy  = resumenHoy.reduce((s, r) => s + r.cantidad, 0);
  const pedidosPorCanal = CANALES_PEDIDO.map(canal => ({
    canal,
    pedidos: pedidosHoy.filter(pedido => pedido.canal === canal),
  }));

  function formatHora(fecha: string) {
    return new Intl.DateTimeFormat("es-CO", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(fecha));
  }

  return (
    <div className="px-4 md:px-8 pt-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shadow"
            style={{ backgroundColor: profile?.color ?? "#003BC4" }}>
            {profile?.emoji}
          </div>
          <div>
            <p className="text-xs text-gray-400">Bienvenido</p>
            <p className="font-bold text-gray-900">{profile?.nombre}</p>
          </div>
          <button
            onClick={handleSalir}
            className="flex items-center gap-1.5 ml-1 px-2.5 py-1.5 rounded-xl border border-gray-200 hover:border-red-200 hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors text-xs font-medium"
            title="Cambiar perfil"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Cambiar</span>
          </button>
        </div>
        <button onClick={fetchData} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400">
          <RefreshCw className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Banner ventas del día (admin) */}
      {isAdmin && (
        <div className="bg-brand-blue rounded-2xl p-5 mb-6 flex flex-wrap items-center gap-4">
          <img src="/logo.webp" alt="PM" className="w-12 h-12 rounded-xl object-contain shrink-0 shadow bg-white p-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold">Pasión Millonaria</p>
            <p className="text-blue-200 text-xs">Inventario & Punto de Venta</p>
          </div>
          {cantVentasHoy > 0 && (
            <div className="text-right">
              <p className="text-white font-bold text-xl">{formatCurrency(totalVentasHoy)}</p>
              <p className="text-blue-200 text-sm">{cantVentasHoy} venta{cantVentasHoy !== 1 ? "s" : ""} hoy</p>
            </div>
          )}
          {isAdmin && (
            <Link href="/caja"
              className="shrink-0 bg-white/15 hover:bg-white/25 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors">
              Ver caja →
            </Link>
          )}
        </div>
      )}

      {/* Vista empleado */}
      {!isAdmin && (
        <div className="card mb-6 bg-brand-blue/5 border-brand-blue/15 flex items-center gap-3">
          <Eye className="w-6 h-6 text-brand-blue shrink-0" />
          <div>
            <p className="font-semibold text-brand-blue">Modo consulta</p>
            <p className="text-brand-blue/70 text-sm">Inventario, apartados, historial y reportes en modo solo lectura.</p>
          </div>
        </div>
      )}

      {/* Grid principal — desktop 3 columnas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Columna izquierda (2/3): acciones + apartados */}
        <div className="lg:col-span-2 space-y-6">

          {/* Acciones rápidas — solo admin */}
          {isAdmin && (
            <div>
              <h2 className="font-bold text-gray-700 mb-3 text-sm uppercase tracking-wide">Acciones rápidas</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {accionesAdmin.map(({ href, label, icon: Icon, color, desc }) => (
                  <Link key={href} href={href}
                    className="card hover:shadow-md active:scale-95 transition-all flex flex-col items-center text-center gap-3 py-5">
                    <div className={`${color} w-12 h-12 rounded-2xl flex items-center justify-center shadow`}>
                      <Icon className="text-white w-6 h-6" />
                    </div>
                    <div>
                      <p className="font-bold text-gray-900 text-sm">{label}</p>
                      <p className="text-gray-400 text-xs hidden sm:block">{desc}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Acciones secundarias — admin */}
          {isAdmin && (
            <div className="card">
              <h3 className="font-bold text-gray-700 mb-3 text-sm">Más acciones</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {accionesExtra.map(item => (
                  <Link key={item.href} href={item.href}
                    className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 active:scale-95 transition-all">
                    <div className={`w-9 h-9 ${item.color} rounded-xl flex items-center justify-center shrink-0`}>
                      <item.icon className={`w-5 h-5 ${item.iconColor}`} />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-sm">{item.label}</p>
                      <p className="text-xs text-gray-400">{item.desc}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-gray-800 flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-brand-blue" />
                Pedidos de hoy
              </h3>
              {pedidosHoy.length > 0 && <Badge variant="info">{pedidosHoy.length}</Badge>}
            </div>

            {loading ? (
              <Spinner className="py-4" />
            ) : pedidosHoy.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-4">Sin pedidos registrados hoy</p>
            ) : (
              <div className="space-y-4">
                {pedidosPorCanal.map(({ canal, pedidos }) => (
                  <div key={canal} className="rounded-2xl border border-gray-100 p-3">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            canal === "venta_tienda"
                              ? "info"
                              : canal === "domicilio"
                              ? "warning"
                              : "success"
                          }
                        >
                          {LABELS_CANAL[canal]}
                        </Badge>
                        <span className="text-xs text-gray-400">
                          {pedidos.length} pedido{pedidos.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>

                    {pedidos.length === 0 ? (
                      <p className="text-xs text-gray-400">No hay pedidos por este canal hoy.</p>
                    ) : (
                      <div className="space-y-2">
                        {pedidos.map((pedido) => (
                          <Link
                            key={pedido.key}
                            href={`/venta/${pedido.key}`}
                            className="block rounded-xl bg-gray-50 hover:bg-gray-100 active:scale-[0.99] transition-all p-3"
                          >
                            <div className="flex items-start justify-between gap-3 mb-2">
                              <div className="min-w-0">
                                <p className="font-semibold text-sm text-gray-900 truncate">
                                  {pedido.displayRef}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {formatHora(pedido.fecha)} · {pedido.totalUnidades} ud{pedido.totalUnidades !== 1 ? "s" : ""}
                                </p>
                              </div>
                              <span className="text-xs font-medium text-brand-blue shrink-0">
                                {isAdmin ? "Editar" : "Ver"}
                              </span>
                            </div>

                            <div className="space-y-1">
                              {pedido.items.map((item) => (
                                <p
                                  key={item.movimientoId}
                                  className="text-xs text-gray-600 truncate"
                                >
                                  {item.cantidad}x {item.referencia} · Talla {item.talla}
                                </p>
                              ))}
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Apartados pendientes */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-gray-800 flex items-center gap-2">
                <Bookmark className="w-5 h-5 text-brand-gold" />
                Apartados pendientes
                {apartados.length > 0 && <Badge variant="warning">{apartados.length}</Badge>}
              </h3>
              <Link href="/apartados" className="text-brand-blue text-sm font-medium">Ver todos</Link>
            </div>
            {loading ? (
              <Spinner className="py-4" />
            ) : apartados.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-4">Sin apartados pendientes</p>
            ) : (
              <div className="space-y-2">
                {apartados.map(a => (
                  <Link key={a.id} href={`/apartados/${a.grupo_id ?? a.id}`}
                    className="flex items-center gap-3 p-2.5 rounded-xl bg-gray-50 hover:bg-gray-100 active:scale-95 transition-all">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{a.cliente_nombre}</p>
                      <p className="text-xs text-gray-500 truncate">{a.referencia} · T:{a.talla}</p>
                    </div>
                    {!a.en_tienda && (
                      <span className="text-[10px] font-semibold text-orange-600 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded-lg shrink-0">
                        Por llegar
                      </span>
                    )}
                    {isAdmin && (
                      <p className="text-sm font-bold text-red-600 shrink-0">{formatCurrency(a.saldo)}</p>
                    )}
                    <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Columna derecha (1/3): ventas hoy + stock bajo */}
        <div className="space-y-6">

          {/* Resumen ventas por método — admin */}
          {isAdmin && resumenHoy.length > 0 && (
            <div className="card">
              <h3 className="font-bold text-gray-800 flex items-center gap-2 mb-3">
                <TrendingUp className="w-5 h-5 text-green-500" /> Ventas de hoy
              </h3>
              <div className="space-y-2">
                {resumenHoy.map(r => (
                  <div key={r.metodo_pago} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2">
                    <div>
                      <p className="text-xs text-gray-500 capitalize">{r.metodo_pago}</p>
                      <p className="text-xs text-gray-400">{r.cantidad} venta{r.cantidad !== 1 ? "s" : ""}</p>
                    </div>
                    <p className="font-bold text-gray-900 text-sm">{formatCurrency(r.total)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Stock bajo */}
          {!loading && stockBajo.length > 0 && (
            <div className="card">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                <h3 className="font-bold text-gray-800">Stock bajo</h3>
                <Badge variant="warning">{stockBajo.length}</Badge>
              </div>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {stockBajo.map((s, i) => (
                  <div key={i} className="flex items-center justify-between p-2.5 rounded-xl bg-amber-50">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm truncate">{s.referencia}</p>
                      <p className="text-xs text-gray-500">{s.talla}</p>
                    </div>
                    <Badge variant={s.stock_total === 0 ? "danger" : "warning"}>{s.stock_total} uds</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="h-4" />
    </div>
  );
}
