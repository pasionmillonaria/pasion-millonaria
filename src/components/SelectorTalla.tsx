"use client";

import { cn } from "@/lib/utils";

interface TallaStock {
  talla_id: number;
  talla_nombre: string;
  stock_tienda: number;
  stock_bodega: number;
}

interface Props {
  tallas: TallaStock[];
  seleccionada: number | null;
  onSelect: (tallaId: number) => void;
  ubicacionId?: number; // 1=tienda, 2=bodega
}

export default function SelectorTalla({ tallas, seleccionada, onSelect, ubicacionId }: Props) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {tallas.map(t => {
        const stock = ubicacionId === 2 ? t.stock_bodega : t.stock_tienda;
        const stockTotal = t.stock_tienda + t.stock_bodega;
        const activo = seleccionada === t.talla_id;
        const sinStock = stockTotal === 0;

        return (
          <button
            key={t.talla_id}
            onClick={() => !sinStock && onSelect(t.talla_id)}
            disabled={sinStock}
            className={cn(
              "relative flex flex-col items-center p-3 rounded-xl border-2 transition-all duration-150",
              sinStock
                ? "border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed"
                : activo
                ? "border-brand-blue bg-brand-blue text-white shadow-md scale-105"
                : "border-gray-200 bg-white hover:border-brand-blue active:scale-95"
            )}
          >
            <span className={cn("font-bold text-sm", activo ? "text-white" : "text-gray-900")}>
              {t.talla_nombre}
            </span>
            <span className={cn("text-xs mt-0.5", activo ? "text-blue-100" : "text-gray-400")}>
              {stockTotal} uds
            </span>
          </button>
        );
      })}
    </div>
  );
}
