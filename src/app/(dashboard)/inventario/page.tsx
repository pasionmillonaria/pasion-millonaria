"use client";

import { useEffect, useState, useCallback } from "react";
import { Search, Filter, Package } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { VStockTotal, Linea, Categoria } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import Spinner from "@/components/ui/Spinner";
import EmptyState from "@/components/ui/EmptyState";
import Badge from "@/components/ui/Badge";

export default function InventarioPage() {
  const supabase = createClient();
  const [stock, setStock] = useState<VStockTotal[]>([]);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);

  const [busqueda, setBusqueda] = useState("");
  const [lineaFiltro, setLineaFiltro] = useState<number | null>(null);
  const [categoriaFiltro, setCategoriaFiltro] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: st }, { data: li }, { data: ca }] = await Promise.all([
      supabase.from("v_stock_total").select("*").order("linea").order("referencia"),
      supabase.from("lineas").select("*").order("orden"),
      supabase.from("categorias").select("*").order("orden"),
    ]);
    setStock(st ?? []);
    setLineas(li ?? []);
    setCategorias(ca ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Agrupar por producto
  const productosFiltrados = (() => {
    const mapa = new Map<number, { info: VStockTotal; tallas: VStockTotal[] }>();

    for (const row of stock) {
      if (busqueda) {
        const q = busqueda.toLowerCase();
        if (
          !row.referencia.toLowerCase().includes(q) &&
          !row.codigo.toLowerCase().includes(q) &&
          !row.categoria.toLowerCase().includes(q)
        ) continue;
      }
      if (lineaFiltro && row.producto_id) {
        // filtrar por linea
        const cat = categorias.find(c => c.nombre === row.categoria);
        if (!cat || cat.linea_id !== lineaFiltro) continue;
      }
      if (categoriaFiltro) {
        const cat = categorias.find(c => c.nombre === row.categoria);
        if (!cat || cat.id !== categoriaFiltro) continue;
      }

      if (!mapa.has(row.producto_id)) {
        mapa.set(row.producto_id, { info: row, tallas: [] });
      }
      mapa.get(row.producto_id)!.tallas.push(row);
    }

    return Array.from(mapa.values());
  })();

  const categoriasFiltradas = lineaFiltro
    ? categorias.filter(c => c.linea_id === lineaFiltro)
    : categorias;

  return (
    <div className="max-w-lg mx-auto px-4 pt-6">
      <h1 className="text-xl font-bold text-gray-900 mb-4">Inventario</h1>

      {/* Búsqueda */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
        <input
          type="text"
          placeholder="Buscar por referencia, código o categoría..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="input pl-10"
        />
      </div>

      {/* Filtros */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        <button
          onClick={() => { setLineaFiltro(null); setCategoriaFiltro(null); }}
          className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            !lineaFiltro ? "bg-brand-blue text-white" : "bg-gray-100 text-gray-600"
          }`}
        >
          Todos
        </button>
        {lineas.map(l => (
          <button
            key={l.id}
            onClick={() => {
              setLineaFiltro(lineaFiltro === l.id ? null : l.id);
              setCategoriaFiltro(null);
            }}
            className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              lineaFiltro === l.id ? "bg-brand-blue text-white" : "bg-gray-100 text-gray-600"
            }`}
          >
            {l.nombre}
          </button>
        ))}
      </div>

      {/* Filtro categoría */}
      {lineaFiltro && categoriasFiltradas.length > 0 && (
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {categoriasFiltradas.map(c => (
            <button
              key={c.id}
              onClick={() => setCategoriaFiltro(categoriaFiltro === c.id ? null : c.id)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                categoriaFiltro === c.id ? "bg-brand-gold text-white" : "bg-amber-50 text-amber-700"
              }`}
            >
              {c.nombre}
            </button>
          ))}
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <Spinner className="py-16" />
      ) : productosFiltrados.length === 0 ? (
        <EmptyState
          icon={<Package className="w-8 h-8" />}
          title="Sin resultados"
          description="No se encontraron productos con ese criterio"
        />
      ) : (
        <div className="space-y-3">
          {productosFiltrados.map(({ info, tallas }) => {
            const totalGeneral = tallas.reduce((s, t) => s + t.stock_total, 0);
            const totalTienda = tallas.reduce((s, t) => s + t.stock_tienda, 0);
            const totalBodega = tallas.reduce((s, t) => s + t.stock_bodega, 0);

            return (
              <div key={info.producto_id} className="card">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900 truncate">{info.referencia}</p>
                    <p className="text-xs text-gray-500">
                      {info.linea} · {info.categoria} · {info.codigo}
                    </p>
                  </div>
                  <Badge variant={totalGeneral <= 2 ? "danger" : totalGeneral <= 5 ? "warning" : "success"}>
                    {totalGeneral} uds
                  </Badge>
                </div>

                {/* Tallas */}
                <div className="grid grid-cols-3 gap-1.5 mb-3">
                  {tallas.map((t, i) => (
                    <div
                      key={i}
                      className={`text-center p-2 rounded-lg text-xs ${
                        t.stock_total === 0
                          ? "bg-red-50 text-red-400"
                          : t.stock_total <= 2
                          ? "bg-amber-50 text-amber-600"
                          : "bg-green-50 text-green-700"
                      }`}
                    >
                      <p className="font-bold">{t.talla}</p>
                      <p>{t.stock_total}</p>
                    </div>
                  ))}
                </div>

                {/* Desglose tienda/bodega */}
                <div className="flex gap-3 text-xs text-gray-500 pt-2 border-t border-gray-100">
                  <span>🏪 Tienda: <b className="text-gray-700">{totalTienda}</b></span>
                  <span>📦 Bodega: <b className="text-gray-700">{totalBodega}</b></span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="h-4" />
    </div>
  );
}
