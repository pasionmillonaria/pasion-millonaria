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

export default function ApartadosPage() {
  const supabase = createClient();
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

  const filtrados = apartados.filter(a => {
    if (a.estado !== filtroEstado) return false;
    if (busqueda) {
      const q = busqueda.toLowerCase();
      return (
        a.cliente_nombre?.toLowerCase().includes(q) ||
        a.referencia?.toLowerCase().includes(q) ||
        (a.cliente_telefono ?? "").includes(q)
      );
    }
    return true;
  });

  const counts = {
    pendiente: apartados.filter(a => a.estado === "pendiente").length,
    entregado: apartados.filter(a => a.estado === "entregado").length,
    cancelado: apartados.filter(a => a.estado === "cancelado").length,
  };

  return (
    <div className="max-w-lg mx-auto px-4 pt-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Bookmark className="w-6 h-6 text-brand-gold" /> Apartados
        </h1>
        <Link href="/apartados/nuevo" className="btn-gold py-2 px-4 text-sm rounded-xl flex items-center gap-1">
          <Plus className="w-4 h-4" /> Nuevo
        </Link>
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
            filtroEstado === "pendiente" ? (
              <Link href="/apartados/nuevo" className="btn-gold py-2 px-4 text-sm">
                Crear apartado
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {filtrados.map(a => (
            <Link
              key={a.id}
              href={`/apartados/${a.id}`}
              className="card hover:shadow-md active:scale-95 transition-all flex items-center gap-3"
            >
              <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center shrink-0">
                <Bookmark className="w-6 h-6 text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900 truncate">{a.cliente_nombre}</p>
                <p className="text-xs text-gray-500 truncate">{a.referencia} — Talla {a.talla}</p>
                <p className="text-xs text-gray-400">{formatDate(a.fecha)}</p>
              </div>
              <div className="text-right shrink-0">
                {a.estado === "pendiente" && (
                  <>
                    <p className="text-sm font-bold text-red-600">{formatCurrency(a.saldo)}</p>
                    <p className="text-xs text-gray-400">saldo</p>
                  </>
                )}
                {a.estado === "entregado" && <Badge variant="success">Entregado</Badge>}
                {a.estado === "cancelado" && <Badge variant="danger">Cancelado</Badge>}
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
