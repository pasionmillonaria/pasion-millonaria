export type ResultadoGuardarArchivo = "compartido" | "descargado" | "cancelado";

export function canvasAArchivoPng(canvas: HTMLCanvasElement, nombre: string): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) {
        reject(new Error("No se pudo convertir el reporte a PNG"));
        return;
      }

      resolve(new File([blob], nombre, { type: "image/png" }));
    }, "image/png");
  });
}

function puedeCompartirArchivo(archivo: File) {
  return typeof navigator !== "undefined"
    && typeof navigator.share === "function"
    && typeof navigator.canShare === "function"
    && navigator.canShare({ files: [archivo] });
}

function descargarArchivo(archivo: File) {
  const url = URL.createObjectURL(archivo);
  const link = document.createElement("a");

  link.href = url;
  link.download = archivo.name;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();

  // Se deja tiempo para que el navegador empiece a leer el Blob.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function guardarArchivo(archivo: File): Promise<ResultadoGuardarArchivo> {
  if (puedeCompartirArchivo(archivo)) {
    try {
      await navigator.share({
        files: [archivo],
        title: "Cierre de caja",
      });
      return "compartido";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return "cancelado";
      }
      throw error;
    }
  }

  descargarArchivo(archivo);
  return "descargado";
}

export function requiereNuevaInteraccion(error: unknown) {
  return error instanceof DOMException
    && (error.name === "NotAllowedError" || error.name === "InvalidStateError");
}
