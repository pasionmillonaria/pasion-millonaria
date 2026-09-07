import sharp from "sharp";
import {
  MAX_DETAIL_BYTES,
  MAX_PIXELES_IMAGEN,
  MAX_THUMB_BYTES,
} from "@/lib/product-images/shared";

interface VarianteConfig {
  dimension: number;
  calidadInicial: number;
  maxBytes: number;
}

export class ImagenProductoInvalidaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImagenProductoInvalidaError";
  }
}

async function generarVariante(input: Buffer, config: VarianteConfig): Promise<Buffer> {
  for (let calidad = config.calidadInicial; calidad >= 35; calidad -= 5) {
    const salida = await sharp(input, { failOn: "error", limitInputPixels: MAX_PIXELES_IMAGEN })
      .rotate()
      .resize(config.dimension, config.dimension, {
        fit: "contain",
        background: { r: 243, g: 244, b: 246, alpha: 1 },
      })
      .flatten({ background: { r: 243, g: 244, b: 246 } })
      .webp({ quality: calidad, effort: 4, smartSubsample: true })
      .toBuffer();

    if (salida.byteLength <= config.maxBytes) return salida;
  }
  throw new Error("No fue posible optimizar la imagen dentro del limite permitido");
}

export async function procesarImagenProducto(input: Buffer) {
  try {
    const metadata = await sharp(input, { failOn: "error", limitInputPixels: MAX_PIXELES_IMAGEN }).metadata();
    if (!metadata.width || !metadata.height) throw new Error("La imagen no tiene dimensiones validas");
    if (metadata.width * metadata.height > MAX_PIXELES_IMAGEN) {
      throw new Error("La imagen supera 40 megapixeles");
    }

    const [thumb, detail] = await Promise.all([
      generarVariante(input, { dimension: 256, calidadInicial: 70, maxBytes: MAX_THUMB_BYTES }),
      generarVariante(input, { dimension: 800, calidadInicial: 78, maxBytes: MAX_DETAIL_BYTES }),
    ]);

    return { thumb, detail };
  } catch (error) {
    throw new ImagenProductoInvalidaError(
      error instanceof Error && error.message.includes("40 megapixeles")
        ? error.message
        : "El archivo no contiene una imagen valida o no se pudo optimizar",
    );
  }
}
