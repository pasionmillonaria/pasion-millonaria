"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, Loader2, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { prepararImagenEnNavegador } from "@/lib/product-images/client";
import ProductoImagen from "@/components/productos/ProductoImagen";

interface SelectorImagenProductoProps {
  referencia: string;
  imagenPath?: string | null;
  archivo: File | null;
  onArchivoChange: (archivo: File | null) => void;
  onEliminarActual?: () => Promise<void>;
  eliminando?: boolean;
  disabled?: boolean;
}

const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";

export default function SelectorImagenProducto({
  referencia,
  imagenPath,
  archivo,
  onArchivoChange,
  onEliminarActual,
  eliminando = false,
  disabled = false,
}: SelectorImagenProductoProps) {
  const galeriaRef = useRef<HTMLInputElement>(null);
  const camaraRef = useRef<HTMLInputElement>(null);
  const [procesando, setProcesando] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!archivo) { setPreview(null); return; }
    const url = URL.createObjectURL(archivo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [archivo]);

  async function seleccionar(file?: File) {
    if (!file) return;
    setProcesando(true);
    try {
      const optimizada = await prepararImagenEnNavegador(file);
      onArchivoChange(optimizada);
      toast.success(`Foto preparada (${Math.ceil(optimizada.size / 1024)} KB)`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo preparar la foto");
    } finally {
      setProcesando(false);
      if (galeriaRef.current) galeriaRef.current.value = "";
      if (camaraRef.current) camaraRef.current.value = "";
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4" data-testid="selector-imagen-producto">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="font-bold text-gray-900">Foto del producto</p>
          <p className="text-xs text-gray-400">Opcional · se optimiza antes de subir</p>
        </div>
        {archivo && <span className="rounded-full bg-green-50 px-2 py-1 text-xs font-semibold text-green-700">{Math.ceil(archivo.size / 1024)} KB</span>}
      </div>

      <div className="mx-auto mb-3 aspect-square w-full max-w-[18rem] overflow-hidden rounded-2xl bg-gray-100">
        {preview ? (
          <img src={preview} alt={`Vista previa de ${referencia || "producto"}`} className="h-full w-full object-contain" />
        ) : (
          <ProductoImagen imagenPath={imagenPath} referencia={referencia || "Producto"} variante="detail" ampliable className="h-full w-full" />
        )}
      </div>

      {procesando ? (
        <div className="flex items-center justify-center gap-2 py-3 text-sm font-medium text-brand-blue">
          <Loader2 className="h-4 w-4 animate-spin" /> Optimizando foto…
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" disabled={disabled} onClick={() => camaraRef.current?.click()} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-blue px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
            <Camera className="h-4 w-4" /> Tomar foto
          </button>
          <button type="button" disabled={disabled} onClick={() => galeriaRef.current?.click()} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 disabled:opacity-50">
            <ImagePlus className="h-4 w-4" /> Elegir foto
          </button>
        </div>
      )}

      {(archivo || (imagenPath && onEliminarActual)) && (
        <button
          type="button"
          disabled={disabled || eliminando}
          onClick={() => archivo ? onArchivoChange(null) : void onEliminarActual?.()}
          className="mt-2 flex w-full min-h-10 items-center justify-center gap-2 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          {eliminando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          {archivo ? "Descartar selección" : "Quitar foto actual"}
        </button>
      )}

      <input ref={camaraRef} data-testid="input-camara-producto" type="file" accept={ACCEPT} capture="environment" className="hidden" onChange={e => void seleccionar(e.target.files?.[0])} />
      <input ref={galeriaRef} data-testid="input-galeria-producto" type="file" accept={ACCEPT} className="hidden" onChange={e => void seleccionar(e.target.files?.[0])} />
    </div>
  );
}
