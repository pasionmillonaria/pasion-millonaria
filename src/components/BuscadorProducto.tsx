"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { buscarProductos } from "@/lib/product-search";
import ProductoResultado, { type ProductoConInfo } from "@/components/ProductoResultado";

interface Props {
  onSelect: (producto: ProductoConInfo) => void;
  placeholder?: string;
}

export default function BuscadorProducto({ onSelect, placeholder = "Buscar producto..." }: Props) {
  const supabase = createClient();
  const [query, setQuery] = useState("");
  const [productos, setProductos] = useState<ProductoConInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function cargar() {
      const { data } = await supabase.from("productos")
        .select("*, categorias(nombre), lineas(nombre)")
        .eq("activo", true).order("referencia");
      if (data) setProductos(data.map((p: any) => ({
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

  useEffect(() => {
    const cerrar = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", cerrar);
    return () => document.removeEventListener("mousedown", cerrar);
  }, []);

  const resultados = useMemo(
    () => query.trim() ? buscarProductos(productos, query, 12) : [],
    [productos, query],
  );

  function seleccionar(producto: ProductoConInfo) {
    onSelect(producto);
    setQuery(producto.referencia);
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
        <input type="search" value={query}
          onChange={event => { setQuery(event.target.value); setOpen(!!event.target.value.trim()); }}
          onFocus={() => query.trim() && setOpen(true)} placeholder={placeholder} autoComplete="off"
          className="input min-h-12 pl-10 pr-10 text-base md:text-sm" />
        {query && <button type="button" aria-label="Limpiar búsqueda"
          onClick={() => { setQuery(""); setOpen(false); }}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-2 text-gray-400 hover:bg-gray-100">
          <X className="h-4 w-4" />
        </button>}
      </div>

      {open && <div className="absolute z-50 mt-1 max-h-[70dvh] w-full divide-y divide-gray-100 overflow-y-auto rounded-2xl border border-gray-100 bg-white shadow-2xl">
        {loading ? <div className="p-5 text-center text-sm text-gray-400">Cargando productos...</div>
          : resultados.length === 0 ? <div className="p-5 text-center">
            <p className="text-sm font-semibold text-gray-600">No encontramos “{query}”</p>
            <p className="mt-1 text-xs text-gray-400">Busca por cualquier palabra, código, categoría o línea.</p>
          </div>
          : resultados.map(producto => <ProductoResultado key={producto.id} producto={producto} onSelect={seleccionar} />)}
      </div>}
    </div>
  );
}
