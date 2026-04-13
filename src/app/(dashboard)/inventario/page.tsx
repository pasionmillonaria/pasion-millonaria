"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Search, Package, ChevronDown, ChevronUp, SlidersHorizontal, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { VStockTotal, Linea, Categoria } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import Spinner from "@/components/ui/Spinner";
import EmptyState from "@/components/ui/EmptyState";
import Badge from "@/components/ui/Badge";

interface GrupoProducto {
  producto_id: number;
  referencia: string;
  categoria: string;
  linea: string;
  linea_id: number;
  precio_base: number;
  tallas: VStockTotal[];
  totalGeneral: number;
  totalTienda: number;
  totalBodega: number;
}

interface TallaOpcion {
  id: number;
  nombre: string;
}

export default function InventarioPage() {
  const supabase = createClient();
  const [stock, setStock] = useState<VStockTotal[]>([]);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [tallasDisponibles, setTallasDisponibles] = useState<TallaOpcion[]>([]);
  const [tallaOrden, setTallaOrden] = useState<Map<number, number>>(new Map());
  const [precios, setPrecios] = useState<Map<number, number>>(new Map());
  const [loading, setLoading] = useState(true);

  const [busqueda, setBusqueda] = useState("");
  const [lineaFiltro, setLineaFiltro] = useState<number | null>(null);
  const [categoriaFiltro, setCategoriaFiltro] = useState<string | null>(null);
  const [tallaFiltro, setTallaFiltro] = useState<number | null>(null);

  const [expandidos, setExpandidos] = useState<Set<number>>(new Set());
  const [modalFiltros, setModalFiltros] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: st }, { data: li }, { data: ca }, { data: tallas }, { data: prods }] = await Promise.all([
      supabase.from("v_stock_total").select("*").order("referencia"),
      supabase.from("lineas").select("*").order("orden"),
      supabase.from("categorias").select("*").order("orden"),
      supabase.from("tallas").select("id, nombre, orden").order("orden"),
      supabase.from("productos").select("id, precio_base").eq("activo", true),
    ]);
    const precioMap = new Map<number, number>();
    (prods ?? []).forEach((p: any) => precioMap.set(p.id, p.precio_base ?? 0));
    setPrecios(precioMap);
    setStock(st ?? []);
    setLineas(li ?? []);
    setCategorias(ca ?? []);
    const map = new Map<number, number>();
    (tallas ?? []).forEach((t: any) => map.set(t.id, t.orden ?? 999));
    setTallaOrden(map);
    // Solo tallas que tienen stock en algún producto
    const tallasEnStock = new Set((st ?? []).map(r => r.talla_id));
    setTallasDisponibles((tallas ?? []).filter((t: any) => tallasEnStock.has(t.id)).map((t: any) => ({ id: t.id, nombre: t.nombre })));
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

  const grupos: GrupoProducto[] = useMemo(() => {
    const mapa = new Map<number, GrupoProducto>();
    for (const row of stock) {
      if (lineaFiltro && Number(row.linea_id) !== lineaFiltro) continue;
      if (categoriaFiltro && row.categoria !== categoriaFiltro) continue;
      if (tallaFiltro && row.talla_id !== tallaFiltro) {
        // Si hay filtro de talla, solo incluir productos que tengan esa talla
        // (se agrega la fila solo si coincide, pero el producto completo se muestra después)
      }
      if (busqueda) {
        const q = busqueda.toLowerCase();
        if (!row.referencia.toLowerCase().includes(q) &&
            !row.categoria.toLowerCase().includes(q)) continue;
      }
      if (!mapa.has(row.producto_id)) {
        mapa.set(row.producto_id, {
          producto_id: row.producto_id, referencia: row.referencia,
          categoria: row.categoria, linea: row.linea,
          linea_id: Number(row.linea_id),
          precio_base: precios.get(row.producto_id) ?? 0,
          tallas: [], totalGeneral: 0, totalTienda: 0, totalBodega: 0,
        });
      }
      const g = mapa.get(row.producto_id)!;
      g.tallas.push(row);
      g.totalGeneral += row.stock_total;
      g.totalTienda  += row.stock_tienda;
      g.totalBodega  += row.stock_bodega;
    }
    const result = Array.from(mapa.values());
    result.forEach(g => {
      g.tallas.sort((a: VStockTotal, b: VStockTotal) =>
        (tallaOrden.get(a.talla_id) ?? 999) - (tallaOrden.get(b.talla_id) ?? 999)
      );
    });
    // Filtrar por talla: solo productos que tengan esa talla
    if (tallaFiltro) {
      return result.filter(g => g.tallas.some(t => t.talla_id === tallaFiltro));
    }
    return result;
  }, [stock, lineaFiltro, categoriaFiltro, tallaFiltro, busqueda, tallaOrden, precios]);

  // Categorías visibles según línea seleccionada
  const categoriasVisibles = useMemo(() =>
    lineaFiltro
      ? categorias.filter(c => stock.some(r => Number(r.linea_id) === lineaFiltro && r.categoria === c.nombre))
      : categorias
  , [lineaFiltro, categorias, stock]);

  // Tallas disponibles en la línea seleccionada (ordenadas)
  const tallasDeLinea = useMemo(() => {
    if (!lineaFiltro) return [];
    const ids = new Set(
      stock.filter(r => Number(r.linea_id) === lineaFiltro).map(r => r.talla_id)
    );
    return tallasDisponibles.filter(t => ids.has(t.id));
  }, [lineaFiltro, stock, tallasDisponibles]);

  const filtrosActivos = [lineaFiltro, categoriaFiltro, tallaFiltro].filter(Boolean).length;

  function limpiarFiltros() {
    setLineaFiltro(null);
    setCategoriaFiltro(null);
    setTallaFiltro(null);
    setBusqueda("");
  }

  const tallaFiltroNombre = tallasDisponibles.find(t => t.id === tallaFiltro)?.nombre;
  const lineaFiltroNombre = lineas.find(l => l.id === lineaFiltro)?.nombre;

  return (
    <div className="px-4 md:px-8 pt-6 max-w-7xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-4">Inventario</h1>

      {/* ── BUSCADOR + BOTÓN FILTROS (mobile) ── */}
      <div className="flex gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Buscar referencia o categoría..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="input pl-10 w-full"
          />
        </div>
        {/* Botón filtros — solo mobile */}
        <button
          onClick={() => setModalFiltros(true)}
          className={`md:hidden flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm border transition-colors ${
            filtrosActivos > 0 ? "bg-brand-blue text-white border-brand-blue" : "bg-white border-gray-200 text-gray-600"
          }`}
        >
          <SlidersHorizontal className="w-4 h-4" />
          {filtrosActivos > 0 ? `${filtrosActivos} filtro${filtrosActivos > 1 ? "s" : ""}` : "Filtrar"}
        </button>
      </div>

      {/* ── FILTROS DESKTOP — dropdowns ── */}
      <div className="hidden md:flex gap-3 mb-4">
        <select
          value={lineaFiltro ?? ""}
          onChange={e => { setLineaFiltro(e.target.value ? Number(e.target.value) : null); setCategoriaFiltro(null); setTallaFiltro(null); }}
          className="input flex-1"
        >
          <option value="">Todas las líneas</option>
          {lineas.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
        </select>

        <select
          value={categoriaFiltro ?? ""}
          onChange={e => setCategoriaFiltro(e.target.value || null)}
          className="input flex-1"
        >
          <option value="">Todas las categorías</option>
          {categoriasVisibles.map(c => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
        </select>

        <select
          value={tallaFiltro ?? ""}
          onChange={e => setTallaFiltro(e.target.value ? Number(e.target.value) : null)}
          disabled={!lineaFiltro}
          className="input flex-1 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <option value="">{lineaFiltro ? "Todas las tallas" : "Selecciona una línea"}</option>
          {tallasDeLinea.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
        </select>

        {filtrosActivos > 0 && (
          <button onClick={limpiarFiltros} className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-500 hover:text-red-500 hover:border-red-200 transition-colors shrink-0">
            Limpiar
          </button>
        )}
      </div>

      {/* Chips de filtros activos (mobile) */}
      {filtrosActivos > 0 && (
        <div className="md:hidden flex gap-2 flex-wrap mb-3">
          {lineaFiltroNombre && (
            <span className="flex items-center gap-1 bg-brand-blue text-white text-xs px-3 py-1 rounded-full font-medium">
              {lineaFiltroNombre}
              <button onClick={() => setLineaFiltro(null)}><X className="w-3 h-3" /></button>
            </span>
          )}
          {categoriaFiltro && (
            <span className="flex items-center gap-1 bg-brand-gold text-white text-xs px-3 py-1 rounded-full font-medium">
              {categoriaFiltro}
              <button onClick={() => setCategoriaFiltro(null)}><X className="w-3 h-3" /></button>
            </span>
          )}
          {tallaFiltroNombre && (
            <span className="flex items-center gap-1 bg-purple-600 text-white text-xs px-3 py-1 rounded-full font-medium">
              Talla {tallaFiltroNombre}
              <button onClick={() => setTallaFiltro(null)}><X className="w-3 h-3" /></button>
            </span>
          )}
          <button onClick={limpiarFiltros} className="text-xs text-red-500 font-medium px-2">Limpiar todo</button>
        </div>
      )}

      {!loading && (
        <p className="text-sm text-gray-400 mb-4">
          {grupos.length} producto{grupos.length !== 1 ? "s" : ""}
          {tallaFiltro && <span className="ml-1 text-purple-600 font-medium">· talla {tallaFiltroNombre}</span>}
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
          {/* DESKTOP: tabla estilo Excel */}
          <div className="hidden md:block card overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Referencia</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Línea / Categoría</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600">Precio</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Tallas</th>
                    <th className="text-center px-4 py-3 font-semibold text-gray-600">Tienda</th>
                    <th className="text-center px-4 py-3 font-semibold text-gray-600">Bodega</th>
                    <th className="text-center px-4 py-3 font-semibold text-gray-600">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {grupos.map(g => (
                    <tr key={g.producto_id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-900">{g.referencia}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        <p>{g.linea}</p>
                        <p className="text-xs text-gray-400">{g.categoria}</p>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-semibold text-brand-blue">{formatCurrency(g.precio_base)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          {g.tallas.map((t, i) => (
                            <div key={i} className={`flex flex-col items-center min-w-[3rem] px-3 py-1.5 rounded-lg border ${
                              tallaFiltro === t.talla_id
                                ? "ring-2 ring-purple-400 ring-offset-1"
                                : ""
                            } ${
                              t.stock_total === 0
                                ? "bg-red-50 border-red-200 text-red-600"
                                : t.stock_total <= 2
                                ? "bg-amber-50 border-amber-200 text-amber-700"
                                : "bg-green-50 border-green-200 text-green-700"
                            }`}>
                              <span className="text-[10px] font-semibold uppercase tracking-wide leading-none mb-0.5">{t.talla}</span>
                              <span className="text-base font-black leading-none">{t.stock_total}</span>
                            </div>
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

          {/* MOBILE: cards colapsables */}
          <div className="md:hidden space-y-3">
            {grupos.map(g => {
              const expanded = expandidos.has(g.producto_id);
              return (
                <div key={g.producto_id} className="card">
                  <button onClick={() => toggleExpand(g.producto_id)} className="w-full flex items-start gap-3 text-left">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-900">{g.referencia}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-xs text-gray-500">{g.linea} · {g.categoria}</p>
                        <span className="text-xs font-semibold text-brand-blue">{formatCurrency(g.precio_base)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={g.totalGeneral === 0 ? "danger" : g.totalGeneral <= 4 ? "warning" : "success"}>
                        {g.totalGeneral} uds
                      </Badge>
                      {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                    </div>
                  </button>
                  {expanded && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <div className="grid grid-cols-4 gap-1.5 mb-3">
                        {g.tallas.map((t, i) => (
                          <div key={i} className={`text-center p-2 rounded-lg border ${
                            tallaFiltro === t.talla_id ? "ring-2 ring-purple-400" : ""
                          } ${
                            t.stock_total === 0 ? "bg-red-50 border-red-100 text-red-400" :
                            t.stock_total <= 2 ? "bg-amber-50 border-amber-100 text-amber-600" :
                            "bg-green-50 border-green-100 text-green-700"
                          }`}>
                            <p className="font-bold text-xs">{t.talla}</p>
                            <p className="font-black text-base leading-tight">{t.stock_total}</p>
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

      {/* ── MODAL FILTROS MOBILE ── */}
      {modalFiltros && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setModalFiltros(false)} />
          <div className="relative bg-white rounded-t-3xl p-6 space-y-5 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg text-gray-900">Filtros</h3>
              <button onClick={() => setModalFiltros(false)} className="p-2 rounded-xl hover:bg-gray-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Línea */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Línea</p>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => { setLineaFiltro(null); setCategoriaFiltro(null); setTallaFiltro(null); }}
                  className={`px-3 py-2 rounded-xl text-sm font-medium ${!lineaFiltro ? "bg-brand-blue text-white" : "bg-gray-100 text-gray-600"}`}>
                  Todas
                </button>
                {lineas.map(l => (
                  <button key={l.id}
                    onClick={() => { setLineaFiltro(lineaFiltro === l.id ? null : l.id); setCategoriaFiltro(null); setTallaFiltro(null); }}
                    className={`px-3 py-2 rounded-xl text-sm font-medium ${lineaFiltro === l.id ? "bg-brand-blue text-white" : "bg-gray-100 text-gray-600"}`}>
                    {l.nombre}
                  </button>
                ))}
              </div>
            </div>

            {/* Categoría */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Categoría</p>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setCategoriaFiltro(null)}
                  className={`px-3 py-2 rounded-xl text-sm font-medium ${!categoriaFiltro ? "bg-brand-gold text-white" : "bg-gray-100 text-gray-600"}`}>
                  Todas
                </button>
                {categoriasVisibles.map(c => (
                  <button key={c.id}
                    onClick={() => setCategoriaFiltro(categoriaFiltro === c.nombre ? null : c.nombre)}
                    className={`px-3 py-2 rounded-xl text-sm font-medium ${categoriaFiltro === c.nombre ? "bg-brand-gold text-white" : "bg-gray-100 text-gray-600"}`}>
                    {c.nombre}
                  </button>
                ))}
              </div>
            </div>

            {/* Talla — solo si hay línea seleccionada */}
            {lineaFiltro && tallasDeLinea.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Talla</p>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setTallaFiltro(null)}
                    className={`px-3 py-2 rounded-xl text-sm font-medium ${!tallaFiltro ? "bg-purple-600 text-white" : "bg-gray-100 text-gray-600"}`}>
                    Todas
                  </button>
                  {tallasDeLinea.map(t => (
                    <button key={t.id}
                      onClick={() => setTallaFiltro(tallaFiltro === t.id ? null : t.id)}
                      className={`px-3 py-2 rounded-xl text-sm font-medium ${tallaFiltro === t.id ? "bg-purple-600 text-white" : "bg-gray-100 text-gray-600"}`}>
                      {t.nombre}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button onClick={limpiarFiltros} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 font-medium text-sm">
                Limpiar
              </button>
              <button onClick={() => setModalFiltros(false)} className="flex-1 py-3 rounded-xl bg-brand-blue text-white font-medium text-sm">
                Ver {grupos.length} resultado{grupos.length !== 1 ? "s" : ""}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="h-4" />
    </div>
  );
}
