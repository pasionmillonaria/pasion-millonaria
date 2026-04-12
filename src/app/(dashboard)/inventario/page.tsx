"use client";

import { useEffect, useState, useCallback } from "react";
import { Search, Package, ChevronDown, ChevronUp } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { VStockTotal, Linea, Categoria } from "@/lib/types";
import Spinner from "@/components/ui/Spinner";
import EmptyState from "@/components/ui/EmptyState";
import Badge from "@/components/ui/Badge";

interface GrupoProducto {
  producto_id: number;
  referencia: string;
  codigo: string;
  categoria: string;
  linea: string;
  tallas: VStockTotal[];
  totalGeneral: number;
  totalTienda: number;
  totalBodega: number;
}

export default function InventarioPage() {
  const supabase = createClient();
  const [stock, setStock] = useState<VStockTotal[]>([]);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [lineaFiltro, setLineaFiltro] = useState<number | null>(null);
  const [categoriaFiltro, setCategoriaFiltro] = useState<number | null>(null);
  const [expandidos, setExpandidos] = useState<Set<number>>(new Set());

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: st }, { data: li }, { data: ca }] = await Promise.all([
      supabase.from("v_stock_total").select("*").order("referencia"),
      supabase.from("lineas").select("*").order("orden"),
      supabase.from("categorias").select("*").order("orden"),
    ]);
    setStock(st ?? []);
    setLineas(li ?? []);
    setCategorias(ca ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  function toggleExpand(id: number) {
    setExpandidos(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  }

  const grupos: GrupoProducto[] = (() => {
    const mapa = new Map<number, GrupoProducto>();
    for (const row of stock) {
      if (lineaFiltro && Number(row.linea_id) !== lineaFiltro) continue;
      if (categoriaFiltro) {
        const cat = categorias.find(c => c.id === categoriaFiltro);
        if (!cat || cat.nombre !== row.categoria) continue;
      }
      if (busqueda) {
        const q = busqueda.toLowerCase();
        if (!row.referencia.toLowerCase().includes(q) &&
            !row.codigo.toLowerCase().includes(q) &&
            !row.categoria.toLowerCase().includes(q)) continue;
      }
      if (!mapa.has(row.producto_id)) {
        mapa.set(row.producto_id, {
          producto_id: row.producto_id, referencia: row.referencia,
          codigo: row.codigo, categoria: row.categoria, linea: row.linea,
          tallas: [], totalGeneral: 0, totalTienda: 0, totalBodega: 0,
        });
      }
      const g = mapa.get(row.producto_id)!;
      g.tallas.push(row);
      g.totalGeneral += row.stock_total;
      g.totalTienda  += row.stock_tienda;
      g.totalBodega  += row.stock_bodega;
    }
    return Array.from(mapa.values());
  })();

  // Categorías que tienen productos en la línea seleccionada (o todas si no hay filtro)
  const categoriasFiltradas = lineaFiltro
    ? categorias.filter(c =>
        stock.some(r => Number(r.linea_id) === lineaFiltro && r.categoria === c.nombre)
      )
    : categorias;

  return (
    <div className="px-4 md:px-8 pt-6 max-w-7xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-4">Inventario</h1>

      {/* Filtros: columna en mobile, fila en desktop */}
      <div className="flex flex-col md:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Buscar referencia, código o categoría..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="input pl-10 w-full"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 shrink-0">
          <button
            onClick={() => { setLineaFiltro(null); setCategoriaFiltro(null); }}
            className={`shrink-0 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${!lineaFiltro ? "bg-brand-blue text-white" : "bg-white border border-gray-200 text-gray-600"}`}
          >
            Todos
          </button>
          {lineas.map(l => (
            <button key={l.id}
              onClick={() => { setLineaFiltro(lineaFiltro === l.id ? null : l.id); setCategoriaFiltro(null); }}
              className={`shrink-0 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${lineaFiltro === l.id ? "bg-brand-blue text-white" : "bg-white border border-gray-200 text-gray-600"}`}
            >
              {l.nombre}
            </button>
          ))}
        </div>
      </div>

      {lineaFiltro && categoriasFiltradas.length > 0 && (
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {categoriasFiltradas.map(c => (
            <button key={c.id}
              onClick={() => setCategoriaFiltro(categoriaFiltro === c.id ? null : c.id)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${categoriaFiltro === c.id ? "bg-brand-gold text-white" : "bg-amber-50 text-amber-700"}`}
            >
              {c.nombre}
            </button>
          ))}
        </div>
      )}

      {!loading && (
        <p className="text-sm text-gray-400 mb-4">
          {grupos.length} producto{grupos.length !== 1 ? "s" : ""}
        </p>
      )}

      {loading ? (
        <Spinner className="py-16" />
      ) : grupos.length === 0 ? (
        <EmptyState
          icon={<Package className="w-8 h-8" />}
          title="Sin resultados"
          description="No se encontraron productos con ese criterio"
        />
      ) : (
        <>
          {/* TABLA para desktop */}
          <div className="hidden md:block card overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Referencia</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Línea / Categoría</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Tallas</th>
                    <th className="text-center px-4 py-3 font-semibold text-gray-600">Tienda</th>
                    <th className="text-center px-4 py-3 font-semibold text-gray-600">Bodega</th>
                    <th className="text-center px-4 py-3 font-semibold text-gray-600">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {grupos.map(g => (
                    <tr key={g.producto_id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-900">{g.referencia}</p>
                        <p className="text-xs text-gray-400">{g.codigo}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        <p>{g.linea}</p>
                        <p className="text-xs text-gray-400">{g.categoria}</p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {g.tallas.map((t, i) => (
                            <span key={i}
                              className={`px-2 py-0.5 rounded text-xs font-medium ${
                                t.stock_total === 0 ? "bg-red-100 text-red-600" :
                                t.stock_total <= 2 ? "bg-amber-100 text-amber-700" :
                                "bg-green-100 text-green-700"
                              }`}>
                              {t.talla}: {t.stock_total}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center font-semibold text-gray-700">{g.totalTienda}</td>
                      <td className="px-4 py-3 text-center font-semibold text-gray-700">{g.totalBodega}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={g.totalGeneral === 0 ? "danger" : g.totalGeneral <= 4 ? "warning" : "success"}>
                          {g.totalGeneral}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* CARDS para mobile */}
          <div className="md:hidden space-y-3">
            {grupos.map(g => {
              const expanded = expandidos.has(g.producto_id);
              return (
                <div key={g.producto_id} className="card">
                  <button onClick={() => toggleExpand(g.producto_id)} className="w-full flex items-start gap-3 text-left">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-900">{g.referencia}</p>
                      <p className="text-xs text-gray-500">{g.linea} · {g.categoria} · {g.codigo}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={g.totalGeneral === 0 ? "danger" : g.totalGeneral <= 4 ? "warning" : "success"}>
                        {g.totalGeneral} uds
                      </Badge>
                      {expanded
                        ? <ChevronUp className="w-4 h-4 text-gray-400" />
                        : <ChevronDown className="w-4 h-4 text-gray-400" />}
                    </div>
                  </button>
                  {expanded && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <div className="grid grid-cols-4 gap-1.5 mb-3">
                        {g.tallas.map((t, i) => (
                          <div key={i}
                            className={`text-center p-2 rounded-lg text-xs ${
                              t.stock_total === 0 ? "bg-red-50 text-red-400" :
                              t.stock_total <= 2 ? "bg-amber-50 text-amber-600" :
                              "bg-green-50 text-green-700"
                            }`}>
                            <p className="font-bold">{t.talla}</p>
                            <p>{t.stock_total}</p>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-4 text-xs text-gray-500">
                        <span>🏪 Tienda: <b className="text-gray-700">{g.totalTienda}</b></span>
                        <span>📦 Bodega: <b className="text-gray-700">{g.totalBodega}</b></span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
      <div className="h-4" />
    </div>
  );
}
