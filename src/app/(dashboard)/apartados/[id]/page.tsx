"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, Plus, CheckCircle, XCircle, Phone } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/lib/context/ProfileContext";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import type { Abono, MetodoPago } from "@/lib/types";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";
import Spinner from "@/components/ui/Spinner";
import toast from "react-hot-toast";

interface ApartadoDetalle {
  id: number; fecha: string; estado: string;
  precio: number; total_abonado: number; saldo: number;
  en_tienda: boolean; observacion: string | null;
  cliente_nombre: string; cliente_telefono: string | null;
  referencia: string; talla: string;
}

const METODOS: { value: MetodoPago; label: string }[] = [
  { value: "efectivo", label: "Efectivo" },
  { value: "nequi", label: "Nequi" },
  { value: "transferencia", label: "Transferencia" },
  { value: "datafono", label: "Datáfono" },
];

export default function ApartadoDetallePage() {
  const { id } = useParams<{ id: string }>();
  const supabase = createClient();
  const { profile } = useProfile();
  const router = useRouter();

  const [apartado, setApartado] = useState<ApartadoDetalle | null>(null);
  const [abonos, setAbonos] = useState<Abono[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalAbono, setModalAbono] = useState(false);
  const [montoAbono, setMontoAbono] = useState("");
  const [metodoPagoAbono, setMetodoPagoAbono] = useState<MetodoPago>("efectivo");
  const [loadingAbono, setLoadingAbono] = useState(false);

  async function cargarDatos() {
    const [{ data: ap }, { data: ab }] = await Promise.all([
      supabase.from("v_apartados_pendientes").select("*").eq("id", Number(id)).single(),
      supabase.from("abonos").select("*").eq("apartado_id", Number(id)).order("fecha", { ascending: false }),
    ]);
    setApartado(ap ?? null);
    setAbonos(ab ?? []);
    setLoading(false);
  }

  useEffect(() => { cargarDatos(); }, [id]);

  async function registrarAbono() {
    const monto = parseFloat(montoAbono);
    if (!monto || monto <= 0) { toast.error("Ingresa un monto válido"); return; }
    if (apartado && monto > apartado.saldo) { toast.error("El abono supera el saldo pendiente"); return; }

    setLoadingAbono(true);
    const { error } = await supabase.from("abonos").insert({
      apartado_id: Number(id),
      monto,
      metodo_pago: metodoPagoAbono,
      registrado_por: null,
    });

    if (error) { toast.error("Error: " + error.message); setLoadingAbono(false); return; }
    toast.success("¡Abono registrado!");
    setModalAbono(false);
    setMontoAbono("");
    await cargarDatos();
    setLoadingAbono(false);
  }

  async function marcarEntregado() {
    const { error } = await supabase.from("apartados").update({ estado: "entregado" }).eq("id", Number(id));
    if (error) { toast.error("Error: " + error.message); return; }
    toast.success("Apartado marcado como entregado");
    await cargarDatos();
  }

  async function cancelarApartado() {
    if (!confirm("¿Cancelar este apartado?")) return;
    const { error } = await supabase.from("apartados").update({ estado: "cancelado" }).eq("id", Number(id));
    if (error) { toast.error("Error: " + error.message); return; }
    toast.success("Apartado cancelado");
    router.push("/apartados");
  }

  if (loading) return <Spinner className="h-screen" />;
  if (!apartado) return <div className="p-6 text-center text-gray-500">Apartado no encontrado</div>;

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-8 pt-6">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="p-2 rounded-xl hover:bg-gray-100">
          <ChevronLeft className="w-6 h-6 text-gray-600" />
        </button>
        <h1 className="text-xl font-bold text-gray-900">Apartado #{apartado.id}</h1>
        <Badge variant={apartado.estado === "pendiente" ? "warning" : apartado.estado === "entregado" ? "success" : "danger"}>
          {apartado.estado}
        </Badge>
      </div>

      {/* Info cliente */}
      <div className="card mb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-bold text-lg text-gray-900">{apartado.cliente_nombre}</p>
            {apartado.cliente_telefono && (
              <a href={`tel:${apartado.cliente_telefono}`} className="flex items-center gap-1 text-brand-blue text-sm mt-1">
                <Phone className="w-4 h-4" /> {apartado.cliente_telefono}
              </a>
            )}
          </div>
          <p className="text-sm text-gray-400">{formatDate(apartado.fecha)}</p>
        </div>
      </div>

      {/* Info prenda */}
      <div className="card mb-4">
        <p className="text-sm text-gray-500 mb-1">Prenda apartada</p>
        <p className="font-bold text-gray-900 text-lg">{apartado.referencia}</p>
        <p className="text-sm text-gray-600">Talla: <b>{apartado.talla}</b></p>
        {apartado.en_tienda !== undefined && (
          <p className="text-sm text-gray-500 mt-1">
            {apartado.en_tienda ? "✅ Prenda en tienda" : "⚠️ Prenda no disponible en tienda"}
          </p>
        )}
        {apartado.observacion && <p className="text-sm text-gray-400 mt-1 italic">"{apartado.observacion}"</p>}
      </div>

      {/* Resumen financiero */}
      <div className="card mb-4">
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-gray-600">Precio total</span>
            <span className="font-semibold">{formatCurrency(apartado.precio)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Total abonado</span>
            <span className="font-semibold text-green-600">{formatCurrency(apartado.total_abonado)}</span>
          </div>
          <div className="flex justify-between text-xl font-bold border-t border-gray-100 pt-2 mt-2">
            <span>Saldo pendiente</span>
            <span className={apartado.saldo > 0 ? "text-red-600" : "text-green-600"}>
              {formatCurrency(apartado.saldo)}
            </span>
          </div>
        </div>
      </div>

      {/* Abonos */}
      <div className="card mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-gray-700">Abonos ({abonos.length})</h3>
        </div>
        {abonos.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-3">Sin abonos registrados</p>
        ) : (
          <div className="space-y-2">
            {abonos.map(ab => (
              <div key={ab.id} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
                <div>
                  <p className="font-semibold text-sm">{formatCurrency(ab.monto)}</p>
                  <p className="text-xs text-gray-400">{formatDateTime(ab.fecha)}</p>
                </div>
                <Badge variant="info">{ab.metodo_pago}</Badge>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Acciones */}
      {apartado.estado === "pendiente" && (
        <div className="space-y-3 mb-6">
          <Button
            variant="gold"
            className="w-full"
            onClick={() => { setMontoAbono(String(apartado.saldo)); setModalAbono(true); }}
          >
            <Plus className="w-5 h-5" /> Registrar Abono
          </Button>
          <Button
            variant="primary"
            className="w-full"
            onClick={marcarEntregado}
          >
            <CheckCircle className="w-5 h-5" /> Marcar como Entregado
          </Button>
          <Button
            variant="danger"
            className="w-full"
            onClick={cancelarApartado}
          >
            <XCircle className="w-5 h-5" /> Cancelar Apartado
          </Button>
        </div>
      )}

      {/* Modal abono */}
      <Modal open={modalAbono} onClose={() => setModalAbono(false)} title="Registrar Abono">
        <div className="space-y-4">
          <div>
            <label className="label">Monto del abono</label>
            <input
              type="number"
              value={montoAbono}
              onChange={e => setMontoAbono(e.target.value)}
              className="input text-2xl font-bold"
              placeholder="0"
              autoFocus
            />
            <p className="text-xs text-gray-400 mt-1">Saldo actual: {formatCurrency(apartado.saldo)}</p>
          </div>
          <div>
            <label className="label">Método de pago</label>
            <div className="grid grid-cols-2 gap-2">
              {METODOS.map(m => (
                <button
                  key={m.value}
                  onClick={() => setMetodoPagoAbono(m.value)}
                  className={`py-3 rounded-xl text-sm font-medium ${metodoPagoAbono === m.value ? "bg-brand-blue text-white" : "bg-gray-100 text-gray-600"}`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <Button className="w-full" onClick={registrarAbono} loading={loadingAbono}>
            Confirmar Abono
          </Button>
        </div>
      </Modal>
    </div>
  );
}
