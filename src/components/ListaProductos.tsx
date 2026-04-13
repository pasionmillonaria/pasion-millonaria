"use client";

import { useState, useEffect } from "react";
import { Search, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Producto } from "@/lib/types";

interface ProductoConInfo extends Producto {
  categoria_nombre: string;
  linea_nombre: string;
}

interface Props {
  onSelect: (producto: ProductoConInfo) => void;
  placeholder?: string;
}

export default function ListaProductos({ onSelect, placeholder = "Filtrar productos..." }: Props) {
  const supabase = createClient();
  const [todos, setTodos] = useState<ProductoConInfo[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function cargar() {
      const { data } = await supabase
        .from("productos")
        .select("*, categorias(nombre), lineas(nombre)")
        .eq("activo", true)
        .order("referencia");
      if (data) {
        setTodos(data.map((p: any) => ({
          ...p,
          categoria_nombre: p.categorias?.nombre ?? "",
          linea_nombre: p.lineas?.nombre ?? "",
          categorias: undefined,
          lineas: undefined,
        })));
      }
      setLoading(false);
    }
    cargar();
  }, []);

  const filtrados = !query.trim()
    ? todos
    : todos.filter(p => {
        const q = query.toLowerCase();
        return (
          p.referencia.toLowerCase().includes(q) ||
          p.codigo.toLowerCase().includes(q) ||
          p.categoria_nombre.toLowerCase().includes(q) ||
          p.linea_nombre.toLowerCase().includes(q)
        );
      });

  return (
    <div>
      {/* Barra de filtro */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={placeholder}
          className="input pl-9 pr-9 text-sm"
          autoFocus
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Lista */}
      {loading ? (
        <div className="py-8 text-center text-sm text-gray-400">Cargando productos...</div>
      ) : filtrados.length === 0 ? (
        <div className="py-8 text-center text-sm text-gray-400">Sin resultados para "{query}"</div>
      ) : (
        <div className="max-h-72 md:max-h-[calc(100vh-280px)] overflow-y-auto rounded-xl border border-gray-100 divide-y divide-gray-50">
          {filtrados.map(p => (
            <button
              key={p.id}
              onClick={() => onSelect(p)}
              className="w-full text-left px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors"
            >
              <div className="flex items-center gap-2 mb-0.5">
                <span className="font-semibold text-sm text-gray-900">{p.referencia}</span>
                {p.linea_nombre && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-brand-blue/10 text-brand-blue leading-none shrink-0">
                    {p.linea_nombre}
                  </span>
                )}
              </div>
              {p.categoria_nombre && (
                <p className="text-xs text-gray-400">{p.categoria_nombre}</p>
              )}
            </button>
          ))}
        </div>
      )}

      {!loading && (
        <p className="text-xs text-gray-300 mt-2 text-right">
          {filtrados.length}{query ? ` de ${todos.length}` : ""} producto{filtrados.length !== 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}
