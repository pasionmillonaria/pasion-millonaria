"use client";

import { useEffect, useState } from "react";
import { ImageOff, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { urlImagenProducto, type VarianteImagenProducto } from "@/lib/product-images/shared";

interface ProductoImagenProps {
  imagenPath?: string | null;
  referencia: string;
  variante?: VarianteImagenProducto;
  className?: string;
  ampliable?: boolean;
}

export default function ProductoImagen({
  imagenPath,
  referencia,
  variante = "thumb",
  className,
  ampliable = false,
}: ProductoImagenProps) {
  const [error, setError] = useState(false);
  const [abierta, setAbierta] = useState(false);
  const src = urlImagenProducto(imagenPath, variante);
  const detailSrc = urlImagenProducto(imagenPath, "detail");

  useEffect(() => setError(false), [src]);

  const contenido = src && !error ? (
    <img
      src={src}
      alt={referencia}
      loading="lazy"
      decoding="async"
      onError={() => setError(true)}
      className="h-full w-full object-contain"
    />
  ) : (
    <span className="flex h-full w-full items-center justify-center bg-gray-100 text-gray-300" aria-label={`Sin foto para ${referencia}`}>
      <ImageOff className="h-1/3 w-1/3 min-h-5 min-w-5" />
    </span>
  );

  return (
    <>
      {ampliable && detailSrc && !error ? (
        <button
          type="button"
          onClick={event => { event.stopPropagation(); setAbierta(true); }}
          className={cn("overflow-hidden rounded-xl bg-gray-100", className)}
          aria-label={`Ampliar foto de ${referencia}`}
        >
          {contenido}
        </button>
      ) : (
        <div className={cn("overflow-hidden rounded-xl bg-gray-100", className)}>{contenido}</div>
      )}

      {abierta && detailSrc && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-label={`Foto de ${referencia}`}>
          <button
            type="button"
            onClick={() => setAbierta(false)}
            className="absolute right-4 top-4 rounded-full bg-white/90 p-2 text-gray-700 shadow"
            aria-label="Cerrar foto"
          >
            <X className="h-6 w-6" />
          </button>
          <img src={detailSrc} alt={referencia} className="max-h-[85vh] max-w-full rounded-2xl bg-gray-100 object-contain shadow-2xl" />
        </div>
      )}
    </>
  );
}
