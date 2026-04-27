"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bookmark, Plus, ChevronRight, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { VApartadosPendientes } from "@/lib/types";
import Spinner from "@/components/ui/Spinner";
import EmptyState from "@/components/ui/EmptyState";
import Badge from "@/components/ui/Badge";
import { useProfile } from "@/lib/context/ProfileContext";

interface GrupoApartado {
  grupoId: number;
  clienteNombre: string;
  clienteTelefono: string | null;
  fecha: string;
  estado: "pendiente" | "entregado" | "cancelado";
  items: VApartadosPendientes[];
  totalPrecio: number;
  totalAbonado: number;
  totalSaldo: number;
}

function agrupar(apartados: VApartadosPendientes[]): GrupoApartado[] {
  const mapa = new Map<number, GrupoApartado>();
  for (const a of apartados) {
    const gid = a.grupo_id ?? a.id;
    if (!mapa.has(gid)) {
      mapa.set(gid, {
        grupoId: gid,
        clienteNombre: a.cliente_nombre,
        clienteTelefono: a.cliente_telefono,
        fecha: a.fecha,
        estado: a.estado as "pendiente" | "entregado" | "cancelado",
        items: [],
        totalPrecio: 0,
        totalAbonado: a.total_abonado,
        totalSaldo: a.saldo,
      });
    }
    const g = mapa.get(gid)!;
    g.items.push(a);
    if (a.estado !== "cancelado") {
      g.totalPrecio += a.precio;
    }
    // El estado del grupo: si alguno está pendiente → pendiente
    if (a.estado === "pendiente") g.estado = "pendiente";
    else if (a.estado === "entregado" && g.estado !== "pendiente") g.estado = "entregado";
  }
  return Array.from(mapa.values()).sort((a, b) => b.fecha.localeCompare(a.fecha));
}

export default function ApartadosPage() {
  const supabase = createClient();
  const { isAdmin } = useProfile();
  const [apartados, setApartados] = useState<VApartadosPendientes[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<"pendiente" | "entregado" | "cancelado">("pendiente");

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from("v_apartados_pendientes")
        .select("*")
        .order("fecha", { ascending: false });
      setApartados(data ?? []);
      setLoading(false);
    }
    load();
  }, []);

  const grupos = agrupar(apartados);

  const filtrados = grupos.filter(g => {
    if (g.estado !== filtroEstado) return false;
    if (busqueda) {
      const q = busqueda.toLowerCase();
      return (
        g.clienteNombre.toLowerCase().includes(q) ||
        (g.clienteTelefono ?? "").includes(q) ||
        g.items.some(i => i.referencia.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const counts = {
    pendiente: grupos.filter(g => g.estado === "pendiente").length,
    entregado: grupos.filter(g => g.estado === "entregado").length,
    cancelado: grupos.filter(g => g.estado === "cancelado").length,
  };

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-8 pt-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Bookmark className="w-6 h-6 text-brand-gold" /> Apartados
        </h1>
        {isAdmin && (
          <Link href="/apartados/nuevo" className="btn-gold py-2 px-4 text-sm rounded-xl flex items-center gap-1">
            <Plus className="w-4 h-4" /> Nuevo
          </Link>
        )}
      </div>

      {/* Buscador */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
        <input
          type="text"
          placeholder="Buscar cliente o referencia..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="input pl-10"
        />
      </div>

      {/* Filtros de estado */}
      <div className="flex gap-2 mb-4">
        {(["pendiente", "entregado", "cancelado"] as const).map(estado => (
          <button
            key={estado}
            onClick={() => setFiltroEstado(estado)}
            className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
              filtroEstado === estado
                ? estado === "pendiente" ? "bg-brand-gold text-white"
                  : estado === "entregado" ? "bg-green-600 text-white"
                  : "bg-gray-500 text-white"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            {estado.charAt(0).toUpperCase() + estado.slice(1)}
            <span className="ml-1 opacity-75">({counts[estado]})</span>
          </button>
        ))}
      </div>

      {loading ? (
        <Spinner className="py-16" />
      ) : filtrados.length === 0 ? (
        <EmptyState
          icon={<Bookmark className="w-8 h-8" />}
          title="Sin apartados"
          description={filtroEstado === "pendiente" ? "No hay apartados pendientes" : `No hay apartados ${filtroEstado}s`}
          action={
            filtroEstado === "pendiente" && isAdmin ? (
              <Link href="/apartados/nuevo" className="btn-gold py-2 px-4 text-sm">
                Crear apartado
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {filtrados.map(g => (
            <Link
              key={g.grupoId}
              href={`/apartados/${g.grupoId}`}
              className="card hover:shadow-md active:scale-95 transition-all flex items-center gap-3"
            >
              <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center shrink-0 relative">
                <Bookmark className="w-6 h-6 text-amber-600" />
                {g.items.length > 1 && (
                  <span className="absolute -top-1 -right-1 bg-brand-blue text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                    {g.items.length}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900 truncate">{g.clienteNombre}</p>
                <p className="text-xs text-gray-500 truncate">
                  {g.items.length === 1
                    ? `${g.items[0].referencia} — Talla ${g.items[0].talla}`
                    : g.items.map(i => i.referencia).join(", ")}
                </p>
                <p className="text-xs text-gray-400">{formatDate(g.fecha)}</p>
              </div>
              <div className="text-right shrink-0">
                {g.estado === "pendiente" && (
                  <>
                    <p className="text-sm font-bold text-red-600">{formatCurrency(g.totalSaldo)}</p>
                    <p className="text-xs text-gray-400">Saldo</p>
                  </>
                )}
                {g.estado === "entregado" && <Badge variant="success">Entregado</Badge>}
                {g.estado === "cancelado" && <Badge variant="danger">Cancelado</Badge>}
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
            </Link>
          ))}
        </div>
      )}
      <div className="h-4" />
    </div>
  );
}
