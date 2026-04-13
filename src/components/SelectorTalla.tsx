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
  permitirSinStock?: boolean; // true cuando la prenda se va a pedir al proveedor
}

export default function SelectorTalla({ tallas, seleccionada, onSelect, ubicacionId, permitirSinStock }: Props) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {tallas.map(t => {
        const stockTotal = t.stock_tienda + t.stock_bodega;
        const activo = seleccionada === t.talla_id;
        const sinStock = stockTotal === 0;
        const bloqueado = sinStock && !permitirSinStock;

        return (
          <button
            key={t.talla_id}
            onClick={() => !bloqueado && onSelect(t.talla_id)}
            disabled={bloqueado}
            className={cn(
              "relative flex flex-col items-center p-3 rounded-xl border-2 transition-all duration-150",
              bloqueado
                ? "border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed"
                : activo
                ? "border-brand-blue bg-brand-blue text-white shadow-md scale-105"
                : "border-gray-200 bg-white hover:border-brand-blue active:scale-95"
            )}
          >
            <span className={cn("font-bold text-sm", activo ? "text-white" : "text-gray-900")}>
              {t.talla_nombre}
            </span>
            <span className={cn("text-xs mt-0.5", activo ? "text-blue-100" : sinStock ? "text-orange-400" : "text-gray-400")}>
              {sinStock && permitirSinStock ? "pedir" : `${stockTotal} uds`}
            </span>
          </button>
        );
      })}
    </div>
  );
}
