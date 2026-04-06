"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ShoppingBag,
  PackagePlus,
  Bookmark,
  ArrowLeftRight,
  AlertTriangle,
  LogOut,
  RefreshCw,
  ChevronRight,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/lib/context/UserContext";
import { formatCurrency } from "@/lib/utils";
import type { VApartadosPendientes, VStockBajo } from "@/lib/types";
import Spinner from "@/components/ui/Spinner";
import Badge from "@/components/ui/Badge";

const acciones = [
  {
    href: "/venta",
    label: "Venta",
    icon: ShoppingBag,
    color: "bg-brand-blue",
    desc: "Registrar salida",
  },
  {
    href: "/entrada",
    label: "Entrada",
    icon: PackagePlus,
    color: "bg-green-600",
    desc: "Nueva mercancía",
  },
  {
    href: "/apartados/nuevo",
    label: "Apartado",
    icon: Bookmark,
    color: "bg-brand-gold",
    desc: "Cliente aparta",
  },
  {
    href: "/traslado",
    label: "Traslado",
    icon: ArrowLeftRight,
    color: "bg-purple-600",
    desc: "Tienda ↔ Bodega",
  },
];

export default function HomePage() {
  const supabase = createClient();
  const { user, loading: userLoading, signOut } = useUser();
  const router = useRouter();

  const [apartados, setApartados] = useState<VApartadosPendientes[]>([]);
  const [stockBajo, setStockBajo] = useState<VStockBajo[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchData() {
    setLoading(true);
    const [{ data: ap }, { data: sb }] = await Promise.all([
      supabase
        .from("v_apartados_pendientes")
        .select("*")
        .order("fecha", { ascending: true })
        .limit(5),
      supabase.from("v_stock_bajo").select("*").limit(10),
    ]);
    setApartados(ap ?? []);
    setStockBajo(sb ?? []);
    setLoading(false);
  }

  useEffect(() => {
    fetchData();
  }, []);

  async function handleSignOut() {
    await signOut();
    router.push("/login");
  }

  if (userLoading) return <Spinner className="h-screen" />;

  return (
    <div className="max-w-lg mx-auto px-4 pt-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-sm text-gray-500">Bienvenido,</p>
          <h1 className="text-xl font-bold text-gray-900">
            {user?.nombre ?? "Usuario"}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchData}
            className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 transition-colors"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={handleSignOut}
            className="p-2 rounded-xl hover:bg-red-50 text-red-500 transition-colors"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Logo / Brand */}
      <div className="bg-brand-blue rounded-2xl p-5 mb-6 flex items-center gap-4">
        <div className="w-14 h-14 bg-brand-gold rounded-2xl flex items-center justify-center shrink-0">
          <span className="text-white font-bold text-xl">PM</span>
        </div>
        <div>
          <h2 className="text-white font-bold text-lg leading-tight">
            Pasión Millonaria
          </h2>
          <p className="text-blue-200 text-sm">Inventario & Punto de Venta</p>
        </div>
      </div>

      {/* Acciones rápidas */}
      <h2 className="font-bold text-gray-700 mb-3">Acciones rápidas</h2>
      <div className="grid grid-cols-2 gap-3 mb-6">
        {acciones.map(({ href, label, icon: Icon, color, desc }) => (
          <Link
            key={href}
            href={href}
            className="card hover:shadow-md active:scale-95 transition-all duration-150 flex flex-col items-center text-center gap-3 py-6"
          >
            <div className={`${color} w-14 h-14 rounded-2xl flex items-center justify-center shadow-md`}>
              <Icon className="text-white w-7 h-7" />
            </div>
            <div>
              <p className="font-bold text-gray-900 text-base">{label}</p>
              <p className="text-gray-400 text-xs">{desc}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* Apartados pendientes */}
      <div className="card mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-gray-800 flex items-center gap-2">
            <Bookmark className="w-5 h-5 text-brand-gold" />
            Apartados pendientes
            {apartados.length > 0 && (
              <Badge variant="warning">{apartados.length}</Badge>
            )}
          </h3>
          <Link href="/apartados" className="text-brand-blue text-sm font-medium">
            Ver todos
          </Link>
        </div>

        {loading ? (
          <Spinner className="py-4" />
        ) : apartados.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-4">
            No hay apartados pendientes
          </p>
        ) : (
          <div className="space-y-2">
            {apartados.map((a) => (
              <Link
                key={a.id}
                href={`/apartados/${a.id}`}
                className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 hover:bg-gray-100 active:scale-95 transition-all"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-gray-900 truncate">
                    {a.cliente_nombre}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {a.referencia} — T: {a.talla}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-red-600">
                    {formatCurrency(a.saldo)}
                  </p>
                  <p className="text-xs text-gray-400">pendiente</p>
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
            <h3 className="font-bold text-gray-800">
              Stock bajo
            </h3>
            <Badge variant="warning">{stockBajo.length}</Badge>
          </div>
          <div className="space-y-2">
            {stockBajo.slice(0, 5).map((s, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-3 rounded-xl bg-amber-50"
              >
                <div>
                  <p className="font-semibold text-sm text-gray-900">{s.referencia}</p>
                  <p className="text-xs text-gray-500">
                    {s.categoria} — T: {s.talla}
                  </p>
                </div>
                <Badge variant={s.stock_total === 0 ? "danger" : "warning"}>
                  {s.stock_total} uds
                </Badge>
              </div>
            ))}
            {stockBajo.length > 5 && (
              <Link
                href="/inventario?filtro=stock_bajo"
                className="block text-center text-brand-blue text-sm font-medium py-2"
              >
                Ver {stockBajo.length - 5} más...
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Acciones adicionales */}
      <div className="card mb-6">
        <h3 className="font-bold text-gray-700 mb-3">Más acciones</h3>
        <div className="space-y-2">
          <Link
            href="/devolucion"
            className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 active:scale-95 transition-all"
          >
            <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
              <RefreshCw className="w-5 h-5 text-orange-600" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-900 text-sm">Devolución</p>
              <p className="text-xs text-gray-400">Cliente devuelve una prenda</p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </Link>
          <Link
            href="/cambio"
            className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 active:scale-95 transition-all"
          >
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <ArrowLeftRight className="w-5 h-5 text-blue-600" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-900 text-sm">Cambio</p>
              <p className="text-xs text-gray-400">Cambiar producto por otro</p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </Link>
        </div>
      </div>
    </div>
  );
}
