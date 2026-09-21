"use client";

import { useMemo, useState, useEffect } from "react";
import { Search, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { buscarProductos } from "@/lib/product-search";
import ProductoResultado, { type ProductoConInfo } from "@/components/ProductoResultado";

interface Props {
  onSelect: (producto: ProductoConInfo) => void;
  placeholder?: string;
}

export default function ListaProductos({ onSelect, placeholder = "Buscar por nombre, código o categoría..." }: Props) {
  const supabase = createClient();
  const [todos, setTodos] = useState<ProductoConInfo[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function cargar() {
      const { data } = await supabase.from("productos")
        .select("*, categorias(nombre), lineas(nombre)")
        .eq("activo", true).order("referencia");
      if (data) setTodos(data.map((p: any) => ({
        ...p,
        categoria_nombre: p.categorias?.nombre ?? "",
        linea_nombre: p.lineas?.nombre ?? "",
        categorias: undefined,
        lineas: undefined,
      })));
      setLoading(false);
    }
    cargar();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtrados = useMemo(
    () => buscarProductos(todos, query, query.trim() ? 30 : undefined),
    [todos, query],
  );

  return (
    <div>
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
        <input type="search" value={query} onChange={event => setQuery(event.target.value)}
          placeholder={placeholder} autoFocus autoComplete="off"
          className="input min-h-12 pl-10 pr-10 text-base md:text-sm" />
        {query && <button type="button" onClick={() => setQuery("")} aria-label="Limpiar búsqueda"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
          <X className="h-4 w-4" />
        </button>}
      </div>

      {loading ? (
        <div className="py-10 text-center text-sm text-gray-400">Cargando productos...</div>
      ) : filtrados.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 px-5 py-8 text-center">
          <p className="text-sm font-semibold text-gray-600">No encontramos “{query}”</p>
          <p className="mt-1 text-xs leading-relaxed text-gray-400">Prueba con cualquier palabra del nombre, el código, la categoría o la línea.</p>
        </div>
      ) : (
        <div className="max-h-[22rem] divide-y divide-gray-100 overflow-y-auto rounded-2xl border border-gray-100 bg-white shadow-sm md:max-h-[calc(100vh-280px)]">
          {filtrados.map(producto => <ProductoResultado key={producto.id} producto={producto} onSelect={onSelect} />)}
        </div>
      )}

      {!loading && filtrados.length > 0 && <p className="mt-2 text-right text-xs text-gray-300">
        {filtrados.length}{query ? ` de ${todos.length}` : ""} producto{filtrados.length !== 1 ? "s" : ""}
      </p>}
    </div>
  );
}
