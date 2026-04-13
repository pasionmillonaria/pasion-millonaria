"use client";

import { useState, useEffect, useRef } from "react";
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

export default function BuscadorProducto({ onSelect, placeholder = "Buscar producto..." }: Props) {
  const supabase = createClient();
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState<ProductoConInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResultados([]);
      setOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("productos")
          .select(`*, categorias(nombre), lineas(nombre)`)
          .eq("activo", true)
          .or(`referencia.ilike.%${query}%,codigo.ilike.%${query}%`)
          .limit(8);

        if (error) {
          console.error("Error buscando productos:", error);
        } else if (data) {
          const mapped: ProductoConInfo[] = data.map((p: any) => ({
            ...p,
            categoria_nombre: p.categorias?.nombre ?? "",
            linea_nombre: p.lineas?.nombre ?? "",
            categorias: undefined,
            lineas: undefined,
          }));
          setResultados(mapped);
          setOpen(true);
        }
      } catch (err) {
        console.error("Error fatal en búsqueda:", err);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  function handleSelect(producto: ProductoConInfo) {
    onSelect(producto);
    setQuery(producto.referencia);
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => resultados.length > 0 && setOpen(true)}
          placeholder={placeholder}
          className="input pl-10 pr-10"
        />
        {query && (
          <button
            onClick={() => { setQuery(""); setResultados([]); setOpen(false); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute z-50 w-full mt-1 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="p-4 text-center text-sm text-gray-400">Buscando...</div>
          ) : resultados.length === 0 ? (
            <div className="p-4 text-center text-sm text-gray-400">Sin resultados</div>

          ) : (
            <div className="max-h-64 overflow-y-auto">
              {resultados.map(p => (
                <button
                  key={p.id}
                  onClick={() => handleSelect(p)}
                  className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-0 active:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="font-semibold text-sm text-gray-900">{p.referencia}</p>
                    {p.linea_nombre && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-brand-blue/10 text-brand-blue leading-none">
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
        </div>
      )}
    </div>
  );
}
