export const PRODUCTOS_BUCKET = "productos";
export const MAX_IMAGEN_ORIGINAL_BYTES = 15 * 1024 * 1024;
export const MAX_IMAGEN_CLIENTE_BYTES = 1024 * 1024;
export const MAX_PIXELES_IMAGEN = 40_000_000;
export const MAX_THUMB_BYTES = 60 * 1024;
export const MAX_DETAIL_BYTES = 220 * 1024;

export type VarianteImagenProducto = "thumb" | "detail";

export function urlImagenProducto(
  imagenPath: string | null | undefined,
  variante: VarianteImagenProducto = "thumb",
): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base || !imagenPath) return null;
  const path = imagenPath.split("/").map(encodeURIComponent).join("/");
  return `${base}/storage/v1/object/public/${PRODUCTOS_BUCKET}/${path}/${variante}.webp`;
}
