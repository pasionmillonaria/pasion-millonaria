import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(dateStr: string): string {
  // Forzar hora local: "2026-04-25" sin hora se interpreta como UTC medianoche,
  // lo que en Colombia (UTC-5) aparece como el día anterior.
  const d = dateStr.includes("T") ? new Date(dateStr) : new Date(dateStr + "T00:00:00");
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

export function formatDateTime(dateStr: string): string {
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateStr));
}

export function generateRef(prefix: string, num: number): string {
  return `${prefix}-${String(num).padStart(4, "0")}`;
}

export const LABELS_METODO_PAGO: Record<string, string> = {
  efectivo: "Efectivo",
  nequi: "Nequi",
  transferencia: "Transferencia",
  datafono: "Datáfono",
  mixto: "Mixto",
  sin_confirmar: "Sin confirmar",
};

export const LABELS_CANAL: Record<string, string> = {
  venta_tienda: "Venta Tienda",
  domicilio: "Domicilio",
  envio_nacional: "Envío Nacional",
  traslado: "Traslado",
  cambio: "Cambio",
  garantia: "Garantía",
  ajuste: "Ajuste",
  compra_proveedor: "Compra Proveedor",
  retiro_dueño: "Retiro Dueño",
};

export const LABELS_ESTADO_APARTADO: Record<string, string> = {
  pendiente: "Pendiente",
  entregado: "Entregado",
  cancelado: "Cancelado",
};
