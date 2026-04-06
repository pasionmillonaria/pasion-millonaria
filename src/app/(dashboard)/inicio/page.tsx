"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ShoppingBag, PackagePlus, Bookmark, ArrowLeftRight,
  AlertTriangle, LogOut, RefreshCw, ChevronRight,
  Eye, TrendingUp,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/lib/context/ProfileContext";
import { formatCurrency } from "@/lib/utils";
import type { VApartadosPendientes, VStockBajo, VResumenCajaHoy } from "@/lib/types";
import Spinner from "@/components/ui/Spinner";
import Badge from "@/components/ui/Badge";

// Acciones solo para admin
const accionesAdmin = [
  { href: "/venta",    label: "Venta",     icon: ShoppingBag,    color: "bg-brand-blue",  desc: "Registrar salida" },
  { href: "/entrada",  label: "Entrada",   icon: PackagePlus,    color: "bg-green-600",   desc: "Nueva mercancía" },
  { href: "/apartados/nuevo", label: "Apartado", icon: Bookmark, color: "bg-brand-gold",  desc: "Cliente aparta" },
  { href: "/traslado", label: "Traslado",  icon: ArrowLeftRight, color: "bg-purple-600",  desc: "Tienda ↔ Bodega" },
];

export default function InicioPage() {
  const supabase = createClient();
  const { profile, setProfile, isAdmin } = useProfile();
  const router = useRouter();

  const [apartados, setApartados] = useState<VApartadosPendientes[]>([]);
  const [stockBajo, setStockBajo] = useState<VStockBajo[]>([]);
  const [resumenHoy, setResumenHoy] = useState<VResumenCajaHoy[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchData() {
    setLoading(true);
    const [{ data: ap }, { data: sb }] = await Promise.all([
      supabase.from("v_apartados_pendientes").select("*").order("fecha", { ascending: true }).limit(5),
      supabase.from("v_stock_bajo").select("*").limit(10),
    ]);
    setApartados(ap ?? []);
    setStockBajo(sb ?? []);
    if (isAdmin) {
      const { data: res } = await supabase.from("v_resumen_caja_hoy").select("*");
      setResumenHoy(res ?? []);
    }
    setLoading(false);
  }

  useEffect(() => { fetchData(); }, []);

  function handleSalir() {
    setProfile(null);
    router.push("/");
  }

  const totalVentasHoy = resumenHoy.reduce((s, r) => s + r.total, 0);
  const cantVentasHoy = resumenHoy.reduce((s, r) => s + r.cantidad, 0);

  return (
    <div className="max-w-lg mx-auto px-4 pt-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shadow"
            style={{ backgroundColor: profile?.color ?? "#003366" }}
          >
            {profile?.emoji}
          </div>
          <div>
            <p className="text-xs text-gray-400">Bienvenido</p>
            <p className="font-bold text-gray-900">{profile?.nombre}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchData} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400">
            <RefreshCw className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button onClick={handleSalir} className="p-2 rounded-xl hover:bg-red-50 text-red-400">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Banner */}
      <div className="bg-brand-blue rounded-2xl p-4 mb-6 flex items-center gap-4">
        <div className="w-12 h-12 bg-brand-gold rounded-xl flex items-center justify-center shrink-0 shadow">
          <span className="text-white font-black text-lg">PM</span>
        </div>
        <div>
          <p className="text-white font-bold">Pasión Millonaria</p>
          <p className="text-blue-200 text-xs">Inventario & Punto de Venta</p>
        </div>
        {isAdmin && cantVentasHoy > 0 && (
          <div className="ml-auto text-right">
            <p className="text-white font-bold text-sm">{formatCurrency(totalVentasHoy)}</p>
            <p className="text-blue-200 text-xs">{cantVentasHoy} ventas hoy</p>
          </div>
        )}
      </div>

      {/* Acciones rápidas — solo admin */}
      {isAdmin && (
        <>
          <h2 className="font-bold text-gray-700 mb-3 text-sm uppercase tracking-wide">Acciones rápidas</h2>
          <div className="grid grid-cols-2 gap-3 mb-6">
            {accionesAdmin.map(({ href, label, icon: Icon, color, desc }) => (
              <Link key={href} href={href}
                className="card hover:shadow-md active:scale-95 transition-all duration-150 flex flex-col items-center text-center gap-3 py-5">
                <div className={`${color} w-12 h-12 rounded-2xl flex items-center justify-center shadow`}>
                  <Icon className="text-white w-6 h-6" />
                </div>
                <div>
                  <p className="font-bold text-gray-900 text-sm">{label}</p>
                  <p className="text-gray-400 text-xs">{desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      {/* Vista empleado — solo lectura */}
      {!isAdmin && (
        <div className="card mb-4 bg-purple-50 border-purple-100">
          <div className="flex items-center gap-2 mb-2">
            <Eye className="w-5 h-5 text-purple-500" />
            <p className="font-semibold text-purple-700">Modo consulta</p>
          </div>
          <p className="text-purple-500 text-sm">
            Puedes consultar el inventario y los apartados pendientes.
          </p>
        </div>
      )}

      {/* Resumen ventas del día — admin y empleado pueden ver */}
      {isAdmin && resumenHoy.length > 0 && (
        <div className="card mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-gray-800 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-green-500" /> Ventas de hoy
            </h3>
            <Link href="/caja" className="text-brand-blue text-sm font-medium">Ver caja</Link>
          </div>
          <div className="space-y-1">
            {resumenHoy.map(r => (
              <div key={r.metodo_pago} className="flex justify-between text-sm py-1 border-b border-gray-50 last:border-0">
                <span className="text-gray-600 capitalize">{r.metodo_pago}</span>
                <span className="font-semibold">{formatCurrency(r.total)}</span>
              </div>
            ))}
            <div className="flex justify-between font-bold pt-1">
              <span>Total</span>
              <span className="text-brand-blue">{formatCurrency(totalVentasHoy)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Apartados pendientes */}
      <div className="card mb-4">
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
              <Link key={a.id} href={`/apartados/${a.id}`}
                className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 hover:bg-gray-100 active:scale-95 transition-all">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{a.cliente_nombre}</p>
                  <p className="text-xs text-gray-500 truncate">{a.referencia} — T: {a.talla}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-red-600">{formatCurrency(a.saldo)}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Stock bajo */}
      {!loading && stockBajo.length > 0 && (
        <div className="card mb-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            <h3 className="font-bold text-gray-800">Stock bajo</h3>
            <Badge variant="warning">{stockBajo.length}</Badge>
          </div>
          <div className="space-y-2">
            {stockBajo.slice(0, 4).map((s, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-amber-50">
                <div>
                  <p className="font-semibold text-sm">{s.referencia}</p>
                  <p className="text-xs text-gray-500">{s.talla}</p>
                </div>
                <Badge variant={s.stock_total === 0 ? "danger" : "warning"}>{s.stock_total} uds</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Más acciones — solo admin */}
      {isAdmin && (
        <div className="card mb-6">
          <h3 className="font-bold text-gray-700 mb-3 text-sm">Más acciones</h3>
          <div className="space-y-1">
            {[
              { href: "/devolucion", icon: RefreshCw, color: "bg-orange-100", iconColor: "text-orange-600", label: "Devolución", desc: "Cliente devuelve una prenda" },
              { href: "/cambio", icon: ArrowLeftRight, color: "bg-blue-100", iconColor: "text-blue-600", label: "Cambio", desc: "Cambiar producto por otro" },
            ].map(item => (
              <Link key={item.href} href={item.href}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 active:scale-95 transition-all">
                <div className={`w-9 h-9 ${item.color} rounded-xl flex items-center justify-center`}>
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
    </div>
  );
}
