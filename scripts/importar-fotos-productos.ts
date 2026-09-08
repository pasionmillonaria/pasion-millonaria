import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { procesarImagenProducto } from "../src/lib/product-images/server";
import { PRODUCTOS_BUCKET } from "../src/lib/product-images/shared";

const LOCAL_URL = "http://127.0.0.1:55321";
const STAGING_REF = "ubwtkjgvabycymwopmvl";
const PRODUCTION_REF = "egnfwkrkptkundfdhcyc";
const EXTENSIONES = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"]);

type Destino = "local" | "staging" | "production";
type Producto = { id: number; codigo: string | null; referencia: string; imagen_path: string | null };
type Resultado = {
  archivo: string;
  estado: string;
  criterio: string;
  producto_id: number | "";
  codigo: string;
  referencia: string;
  peso_original_bytes: number | "";
  peso_thumb_bytes: number | "";
  peso_detail_bytes: number | "";
  mensaje: string;
};

function argumentos() {
  const args = process.argv.slice(2);
  const carpeta = args.find(arg => !arg.startsWith("--"));
  const valor = (nombre: string) => {
    const prefijo = `${nombre}=`;
    return args.find(arg => arg.startsWith(prefijo))?.slice(prefijo.length);
  };
  const destino = (valor("--target") ?? "local") as Destino;
  if (!(["local", "staging", "production"] as string[]).includes(destino)) {
    throw new Error("--target debe ser local, staging o production");
  }
  return {
    carpeta,
    destino,
    aplicar: args.includes("--apply"),
    projectRef: valor("--project-ref"),
    confirmProjectRef: valor("--confirm-project-ref"),
  };
}

function cargarEnvLocal() {
  const ruta = resolve(process.cwd(), ".env.local");
  if (!existsSync(ruta)) throw new Error("No existe .env.local para el laboratorio Docker");
  for (const linea of readFileSync(ruta, "utf8").split(/\r?\n/)) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith("#")) continue;
    const indice = limpia.indexOf("=");
    if (indice < 1) continue;
    const clave = limpia.slice(0, indice).trim();
    const valor = limpia.slice(indice + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[clave]) process.env[clave] = valor;
  }
}

function conexion(destino: Destino, projectRef?: string, confirmProjectRef?: string) {
  if (destino === "local") {
    cargarEnvLocal();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (url !== LOCAL_URL) {
      throw new Error(`Seguridad: .env.local debe apuntar exactamente a ${LOCAL_URL}`);
    }
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en .env.local");
    return { url, key };
  }

  const refEsperada = destino === "staging" ? STAGING_REF : PRODUCTION_REF;
  if (projectRef !== refEsperada) {
    throw new Error(`Seguridad: para ${destino} debes pasar --project-ref=${refEsperada}`);
  }
  if (destino === "production" && confirmProjectRef !== PRODUCTION_REF) {
    throw new Error(`Produccion exige ademas --confirm-project-ref=${PRODUCTION_REF}`);
  }

  const url = process.env.SUPABASE_IMPORT_URL;
  const key = process.env.SUPABASE_IMPORT_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Para un destino remoto define SUPABASE_IMPORT_URL y SUPABASE_IMPORT_SERVICE_ROLE_KEY solo en la terminal actual");
  }
  const host = new URL(url).hostname;
  if (host !== `${refEsperada}.supabase.co`) {
    throw new Error(`Seguridad: la URL no corresponde al proyecto ${refEsperada}`);
  }
  return { url, key };
}

function normalizar(valor: string) {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

async function obtenerProductos(supabase: SupabaseClient): Promise<Producto[]> {
  const todos: Producto[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase
      .from("productos")
      .select("id, codigo, referencia, imagen_path")
      .range(desde, desde + 999);
    if (error) throw error;
    todos.push(...((data ?? []) as Producto[]));
    if ((data?.length ?? 0) < 1000) break;
  }
  return todos;
}

function escaparCsv(valor: unknown) {
  const texto = String(valor ?? "");
  return /[",\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

function escribirReporte(resultados: Resultado[], destino: Destino, aplicar: boolean) {
  const carpeta = resolve(process.cwd(), "reportes-importacion");
  mkdirSync(carpeta, { recursive: true });
  const columnas = Object.keys(resultados[0] ?? {
    archivo: "", estado: "", criterio: "", producto_id: "", codigo: "", referencia: "",
    peso_original_bytes: "", peso_thumb_bytes: "", peso_detail_bytes: "", mensaje: "",
  }) as (keyof Resultado)[];
  const csv = [columnas.join(","), ...resultados.map(fila => columnas.map(columna => escaparCsv(fila[columna])).join(","))].join("\r\n");
  const marca = new Date().toISOString().replace(/[:.]/g, "-");
  const ruta = join(carpeta, `${marca}-${destino}-${aplicar ? "apply" : "dry-run"}.csv`);
  writeFileSync(ruta, `\uFEFF${csv}`, "utf8");
  return ruta;
}

function rutasVersion(path: string) {
  return [`${path}/thumb.webp`, `${path}/detail.webp`];
}

async function registrarHuerfana(supabase: SupabaseClient, productoId: number, path: string, motivo: string) {
  const { error } = await supabase.from("producto_imagenes_huerfanas").upsert(
    { producto_id: productoId, path, motivo, limpiado_en: null },
    { onConflict: "path" },
  );
  if (error) console.error(`No se pudo registrar la imagen huerfana ${path}: ${error.message}`);
}

async function aplicarImagen(supabase: SupabaseClient, producto: Producto, thumb: Buffer, detail: Buffer) {
  const nuevoPath = `${producto.id}/${randomUUID()}`;
  const rutas = rutasVersion(nuevoPath);
  const thumbUpload = await supabase.storage.from(PRODUCTOS_BUCKET).upload(rutas[0], thumb, {
    contentType: "image/webp", cacheControl: "31536000", upsert: false,
  });
  if (thumbUpload.error) throw thumbUpload.error;
  const detailUpload = await supabase.storage.from(PRODUCTOS_BUCKET).upload(rutas[1], detail, {
    contentType: "image/webp", cacheControl: "31536000", upsert: false,
  });
  if (detailUpload.error) {
    const limpieza = await supabase.storage.from(PRODUCTOS_BUCKET).remove([rutas[0]]);
    if (limpieza.error) await registrarHuerfana(supabase, producto.id, nuevoPath, "Fallo al limpiar una carga parcial del importador");
    throw detailUpload.error;
  }
  const { error } = await supabase.from("productos").update({ imagen_path: nuevoPath }).eq("id", producto.id);
  if (error) {
    const limpieza = await supabase.storage.from(PRODUCTOS_BUCKET).remove(rutas);
    if (limpieza.error) await registrarHuerfana(supabase, producto.id, nuevoPath, "Fallo al limpiar tras error de base en el importador");
    throw error;
  }
  if (producto.imagen_path?.startsWith(`${producto.id}/`)) {
    const limpieza = await supabase.storage.from(PRODUCTOS_BUCKET).remove(rutasVersion(producto.imagen_path));
    if (limpieza.error) await registrarHuerfana(supabase, producto.id, producto.imagen_path, "Fallo al limpiar la version reemplazada por el importador");
  }
}

async function main() {
  const config = argumentos();
  if (!config.carpeta) {
    throw new Error("Uso: npm run importar:fotos -- <carpeta> [--apply] [--target=local]");
  }
  const carpeta = resolve(config.carpeta);
  if (!existsSync(carpeta)) throw new Error(`No existe la carpeta: ${carpeta}`);
  const { url, key } = conexion(config.destino, config.projectRef, config.confirmProjectRef);
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const productos = await obtenerProductos(supabase);
  const porCodigo = new Map<string, Producto[]>();
  const porReferencia = new Map<string, Producto[]>();
  for (const producto of productos) {
    if (producto.codigo) {
      const keyCodigo = normalizar(producto.codigo);
      porCodigo.set(keyCodigo, [...(porCodigo.get(keyCodigo) ?? []), producto]);
    }
    const keyReferencia = normalizar(producto.referencia);
    porReferencia.set(keyReferencia, [...(porReferencia.get(keyReferencia) ?? []), producto]);
  }

  const archivos = readdirSync(carpeta, { withFileTypes: true })
    .filter(entry => entry.isFile() && EXTENSIONES.has(extname(entry.name).toLowerCase()))
    .map(entry => entry.name)
    .sort((a, b) => a.localeCompare(b, "es"));
  const nombresRepetidos = new Map<string, number>();
  for (const archivo of archivos) {
    const nombre = normalizar(basename(archivo, extname(archivo)));
    nombresRepetidos.set(nombre, (nombresRepetidos.get(nombre) ?? 0) + 1);
  }

  const resultados: Resultado[] = [];
  for (const archivo of archivos) {
    const ruta = join(carpeta, archivo);
    const input = readFileSync(ruta);
    const clave = normalizar(basename(archivo, extname(archivo)));
    let candidatos = porCodigo.get(clave) ?? [];
    let criterio = candidatos.length ? "codigo" : "";
    if (!candidatos.length) {
      candidatos = porReferencia.get(clave) ?? [];
      criterio = candidatos.length ? "referencia" : "";
    }
    const base: Resultado = {
      archivo, estado: "", criterio, producto_id: "", codigo: "", referencia: "",
      peso_original_bytes: input.byteLength, peso_thumb_bytes: "", peso_detail_bytes: "", mensaje: "",
    };
    if ((nombresRepetidos.get(clave) ?? 0) > 1) {
      resultados.push({ ...base, estado: "duplicado", mensaje: "Hay mas de un archivo con el mismo nombre normalizado" });
      continue;
    }
    if (!candidatos.length) {
      resultados.push({ ...base, estado: "sin_coincidencia", mensaje: "No coincide exactamente con codigo ni referencia" });
      continue;
    }
    if (candidatos.length !== 1) {
      resultados.push({ ...base, estado: "ambiguo", mensaje: `${candidatos.length} productos coinciden; no se aplico automaticamente` });
      continue;
    }
    const producto = candidatos[0];
    Object.assign(base, { producto_id: producto.id, codigo: producto.codigo ?? "", referencia: producto.referencia });
    try {
      const { thumb, detail } = await procesarImagenProducto(input);
      base.peso_thumb_bytes = thumb.byteLength;
      base.peso_detail_bytes = detail.byteLength;
      if (config.aplicar) await aplicarImagen(supabase, producto, thumb, detail);
      base.estado = config.aplicar ? "cargado" : "coincidencia";
      base.mensaje = config.aplicar ? "Imagen optimizada y cargada" : "Dry-run: no se modifico la base ni el bucket";
    } catch (error) {
      base.estado = "error";
      base.mensaje = error instanceof Error ? error.message : "No se pudo procesar";
    }
    resultados.push(base);
  }

  const reporte = escribirReporte(resultados, config.destino, config.aplicar);
  const resumen = resultados.reduce<Record<string, number>>((acc, fila) => {
    acc[fila.estado] = (acc[fila.estado] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`${config.aplicar ? "IMPORTACION" : "DRY-RUN"} ${config.destino}: ${archivos.length} archivo(s)`);
  console.log(JSON.stringify(resumen));
  console.log(`Reporte: ${reporte}`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
