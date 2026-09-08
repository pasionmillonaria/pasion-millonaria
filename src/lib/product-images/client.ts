"use client";

import {
  MAX_IMAGEN_CLIENTE_BYTES,
  MAX_IMAGEN_ORIGINAL_BYTES,
  MAX_PIXELES_IMAGEN,
} from "@/lib/product-images/shared";

const FORMATOS_NATIVOS = new Set(["image/jpeg", "image/png", "image/webp"]);

function esHeic(file: File) {
  return ["image/heic", "image/heif"].includes(file.type.toLowerCase()) || /\.(heic|heif)$/i.test(file.name);
}

async function convertirHeic(file: File): Promise<Blob> {
  const { default: heic2any } = await import("heic2any");
  const resultado = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
  return Array.isArray(resultado) ? resultado[0] : resultado;
}

function cargarImagen(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("No se pudo leer la imagen")); };
    img.src = url;
  });
}

function canvasABlob(canvas: HTMLCanvasElement, tipo: "image/webp" | "image/jpeg", calidad: number) {
  return new Promise<Blob | null>(resolve => {
    canvas.toBlob(resolve, tipo, calidad);
  });
}

export async function prepararImagenEnNavegador(file: File): Promise<File> {
  if (file.size > MAX_IMAGEN_ORIGINAL_BYTES) throw new Error("La foto supera el maximo de 15 MB");
  if (!FORMATOS_NATIVOS.has(file.type.toLowerCase()) && !esHeic(file)) {
    throw new Error("Usa una imagen JPG, PNG, WebP, HEIC o HEIF");
  }

  const legible = esHeic(file) ? await convertirHeic(file) : file;
  const img = await cargarImagen(legible);
  if (img.naturalWidth * img.naturalHeight > MAX_PIXELES_IMAGEN) {
    throw new Error("La foto supera 40 megapixeles");
  }

  const escala = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * escala));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * escala));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo preparar la imagen");
  ctx.fillStyle = "#f3f4f6";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  let tipoSalida: "image/webp" | "image/jpeg" = "image/webp";
  for (let calidad = 0.82; calidad >= 0.4; calidad -= 0.07) {
    let blob = await canvasABlob(canvas, tipoSalida, calidad);
    if (tipoSalida === "image/webp" && (!blob || blob.type !== "image/webp")) {
      tipoSalida = "image/jpeg";
      blob = await canvasABlob(canvas, tipoSalida, calidad);
    }
    if (!blob || blob.type !== tipoSalida) continue;
    if (blob.size <= MAX_IMAGEN_CLIENTE_BYTES) {
      const extension = tipoSalida === "image/webp" ? "webp" : "jpg";
      return new File([blob], `imagen-producto.${extension}`, { type: tipoSalida });
    }
  }
  throw new Error("No fue posible reducir la foto por debajo de 1 MB");
}
