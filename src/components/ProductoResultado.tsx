import ProductoImagen from "@/components/productos/ProductoImagen";
import type { Producto } from "@/lib/types";

export interface ProductoConInfo extends Producto {
  categoria_nombre: string;
  linea_nombre: string;
}

export default function ProductoResultado({ producto, onSelect }: {
  producto: ProductoConInfo;
  onSelect: (producto: ProductoConInfo) => void;
}) {
  return (
    <button type="button" onClick={() => onSelect(producto)}
      aria-label={`Seleccionar ${producto.referencia}, código ${producto.codigo}`}
      className="flex min-h-[76px] w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-blue-50/60 active:bg-blue-100/70">
      <ProductoImagen imagenPath={producto.imagen_path} referencia={producto.referencia}
        className="h-16 w-16 shrink-0 border border-gray-100 bg-white shadow-sm" />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-bold leading-snug text-gray-900">{producto.referencia}</p>
        <p className="mt-0.5 truncate text-[11px] font-semibold uppercase tracking-wide text-gray-400">{producto.codigo}</p>
        <div className="mt-1 flex flex-wrap gap-1">
          {producto.categoria_nombre && <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">{producto.categoria_nombre}</span>}
          {producto.linea_nombre && <span className="rounded-md bg-brand-blue/10 px-1.5 py-0.5 text-[10px] font-bold text-brand-blue">{producto.linea_nombre}</span>}
        </div>
      </div>
    </button>
  );
}
