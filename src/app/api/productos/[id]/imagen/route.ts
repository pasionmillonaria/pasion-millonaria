import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { origenPermitido, tieneSesionAdmin } from "@/lib/admin-session";
import { ImagenProductoInvalidaError, procesarImagenProducto } from "@/lib/product-images/server";
import {
  MAX_IMAGEN_CLIENTE_BYTES,
  PRODUCTOS_BUCKET,
  urlImagenProducto,
} from "@/lib/product-images/shared";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function uploadsHabilitados() {
  return process.env.PRODUCT_IMAGE_UPLOADS_ENABLED === "true";
}

function validarAcceso(request: NextRequest): NextResponse | null {
  if (!uploadsHabilitados()) {
    return NextResponse.json({ error: "La carga de imagenes esta deshabilitada" }, { status: 503 });
  }
  if (!origenPermitido(request)) {
    return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  }
  if (!tieneSesionAdmin(request)) {
    return NextResponse.json({ error: "Sesion de administrador requerida" }, { status: 401 });
  }
  return null;
}

function idValido(id: string) {
  const numero = Number(id);
  return Number.isInteger(numero) && numero > 0 ? numero : null;
}

function rutasVersion(path: string) {
  return [`${path}/thumb.webp`, `${path}/detail.webp`];
}

function pathPerteneceAlProducto(path: string, productoId: number) {
  return new RegExp(`^${productoId}/[0-9a-f-]{36}$`, "i").test(path);
}

async function registrarHuerfana(
  supabase: ReturnType<typeof createAdminClient>,
  productoId: number,
  path: string,
  motivo: string,
) {
  const { error } = await supabase.from("producto_imagenes_huerfanas").upsert(
    { producto_id: productoId, path, motivo, limpiado_en: null },
    { onConflict: "path" },
  );
  if (error) console.error("No se pudo registrar la imagen huerfana", error);
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const acceso = validarAcceso(request);
  if (acceso) return acceso;

  const productoId = idValido(params.id);
  if (!productoId) return NextResponse.json({ error: "ID de producto invalido" }, { status: 400 });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Formulario de imagen invalido" }, { status: 400 });
  }

  const archivo = formData.get("imagen");
  if (!(archivo instanceof File)) {
    return NextResponse.json({ error: "Falta el archivo imagen" }, { status: 400 });
  }
  if (!new Set(["image/webp", "image/jpeg"]).has(archivo.type)) {
    return NextResponse.json({ error: "La imagen procesada debe ser WebP o JPEG" }, { status: 400 });
  }
  if (archivo.size === 0 || archivo.size > MAX_IMAGEN_CLIENTE_BYTES) {
    return NextResponse.json({ error: "La imagen procesada supera 1 MB" }, { status: 413 });
  }

  try {
    const supabase = createAdminClient();
    const { data: producto, error: productoError } = await supabase
      .from("productos")
      .select("id, imagen_path")
      .eq("id", productoId)
      .maybeSingle();

    if (productoError) throw productoError;
    if (!producto) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });

    const { thumb, detail } = await procesarImagenProducto(Buffer.from(await archivo.arrayBuffer()));
    const nuevoPath = `${productoId}/${randomUUID()}`;
    const nuevasRutas = rutasVersion(nuevoPath);

    const thumbUpload = await supabase.storage.from(PRODUCTOS_BUCKET).upload(nuevasRutas[0], thumb, {
      contentType: "image/webp",
      cacheControl: "31536000",
      upsert: false,
    });
    if (thumbUpload.error) throw thumbUpload.error;

    const detailUpload = await supabase.storage.from(PRODUCTOS_BUCKET).upload(nuevasRutas[1], detail, {
      contentType: "image/webp",
      cacheControl: "31536000",
      upsert: false,
    });
    if (detailUpload.error) {
      const limpiezaParcial = await supabase.storage.from(PRODUCTOS_BUCKET).remove([nuevasRutas[0]]);
      if (limpiezaParcial.error) {
        await registrarHuerfana(supabase, productoId, nuevoPath, "Fallo al limpiar una carga parcial");
      }
      throw detailUpload.error;
    }

    const { error: updateError } = await supabase
      .from("productos")
      .update({ imagen_path: nuevoPath })
      .eq("id", productoId);
    if (updateError) {
      const limpiezaNueva = await supabase.storage.from(PRODUCTOS_BUCKET).remove(nuevasRutas);
      if (limpiezaNueva.error) {
        await registrarHuerfana(supabase, productoId, nuevoPath, "Fallo al limpiar tras error al actualizar productos");
      }
      throw updateError;
    }

    if (producto.imagen_path && pathPerteneceAlProducto(producto.imagen_path, productoId)) {
      const limpieza = await supabase.storage.from(PRODUCTOS_BUCKET).remove(rutasVersion(producto.imagen_path));
      if (limpieza.error) {
        await registrarHuerfana(supabase, productoId, producto.imagen_path, "Fallo al limpiar la version reemplazada");
        console.error("No se pudo limpiar la version anterior", limpieza.error);
      }
    }

    return NextResponse.json({
      imagenPath: nuevoPath,
      thumbUrl: urlImagenProducto(nuevoPath, "thumb"),
      detailUrl: urlImagenProducto(nuevoPath, "detail"),
      bytes: { thumb: thumb.byteLength, detail: detail.byteLength },
    });
  } catch (error) {
    if (error instanceof ImagenProductoInvalidaError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Error al guardar imagen de producto", error);
    return NextResponse.json({ error: "No se pudo guardar la imagen" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const acceso = validarAcceso(request);
  if (acceso) return acceso;

  const productoId = idValido(params.id);
  if (!productoId) return NextResponse.json({ error: "ID de producto invalido" }, { status: 400 });

  try {
    const supabase = createAdminClient();
    const { data: producto, error: productoError } = await supabase
      .from("productos")
      .select("id, imagen_path")
      .eq("id", productoId)
      .maybeSingle();
    if (productoError) throw productoError;
    if (!producto) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    if (!producto.imagen_path) return NextResponse.json({ ok: true, cleanupPending: false });

    const anterior = producto.imagen_path;
    const { error: updateError } = await supabase
      .from("productos")
      .update({ imagen_path: null })
      .eq("id", productoId);
    if (updateError) throw updateError;

    let cleanupPending = false;
    if (pathPerteneceAlProducto(anterior, productoId)) {
      const limpieza = await supabase.storage.from(PRODUCTOS_BUCKET).remove(rutasVersion(anterior));
      cleanupPending = !!limpieza.error;
      if (limpieza.error) {
        await registrarHuerfana(supabase, productoId, anterior, "Fallo al limpiar una imagen eliminada");
        console.error("Imagen huerfana pendiente de limpieza", limpieza.error);
      }
    }

    return NextResponse.json({ ok: true, cleanupPending });
  } catch (error) {
    console.error("Error al eliminar imagen de producto", error);
    return NextResponse.json({ error: "No se pudo eliminar la imagen" }, { status: 500 });
  }
}
