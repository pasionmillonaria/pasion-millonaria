"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Package, ChevronLeft, CheckCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Linea, Categoria, SistemaTalla } from "@/lib/types";
import Button from "@/components/ui/Button";
import toast from "react-hot-toast";

const SISTEMAS: { value: SistemaTalla; label: string }[] = [
  { value: "ropa_adulto", label: "Ropa Adulto (XS-2XL)" },
  { value: "ropa_nino", label: "Ropa Niño (0-16)" },
  { value: "calzado", label: "Calzado (34-42)" },
  { value: "unica", label: "Talla Única" },
];

export default function NuevoProductoPage() {
  const supabase = createClient();
  const router = useRouter();

  const [lineas, setLineas] = useState<Linea[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [lineaId, setLineaId] = useState<number | null>(null);

  const [codigo, setCodigo] = useState("");
  const [referencia, setReferencia] = useState("");
  const [categoriaId, setCategoriaId] = useState<number | null>(null);
  const [sistemaTalla, setSistemaTalla] = useState<SistemaTalla>("ropa_adulto");
  const [precioBase, setPrecioBase] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmado, setConfirmado] = useState(false);

  useEffect(() => {
    async function load() {
      const [{ data: li }, { data: ca }] = await Promise.all([
        supabase.from("lineas").select("*").order("orden"),
        supabase.from("categorias").select("*").order("orden"),
      ]);
      setLineas(li ?? []);
      setCategorias(ca ?? []);
    }
    load();
  }, []);

  const categoriasFiltradas = lineaId
    ? categorias.filter(c => c.linea_id === lineaId)
    : categorias;

  async function guardar() {
    if (!codigo.trim() || !referencia.trim() || !categoriaId || !precioBase) {
      toast.error("Completa todos los campos obligatorios");
      return;
    }

    setLoading(true);
    const { error } = await supabase.from("productos").insert({
      codigo: codigo.trim().toUpperCase(),
      referencia: referencia.trim(),
      categoria_id: categoriaId,
      sistema_talla: sistemaTalla,
      precio_base: parseFloat(precioBase),
      activo: true,
    });

    if (error) {
      toast.error(error.message.includes("duplicate") ? "Ya existe un producto con ese código" : "Error: " + error.message);
      setLoading(false);
      return;
    }

    toast.success("Producto creado");
    setConfirmado(true);
    setLoading(false);
  }

  if (confirmado) {
    return (
      <div className="max-w-2xl mx-auto px-4 md:px-8 pt-16 text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-10 h-10 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">¡Producto creado!</h2>
        <p className="text-gray-500 mb-8">{referencia}</p>
        <div className="space-y-3">
          <Button className="w-full" onClick={() => { setCodigo(""); setReferencia(""); setCategoriaId(null); setPrecioBase(""); setConfirmado(false); }}>Crear otro</Button>
          <Button variant="secondary" className="w-full" onClick={() => router.push("/productos")}>Ver todos</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-8 pt-6">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="p-2 rounded-xl hover:bg-gray-100"><ChevronLeft className="w-6 h-6 text-gray-600" /></button>
        <Package className="w-6 h-6 text-brand-blue" />
        <h1 className="text-xl font-bold text-gray-900">Nuevo Producto</h1>
      </div>

      <div className="card space-y-4">
        <div>
          <label className="label">Código <span className="text-red-500">*</span></label>
          <input type="text" value={codigo} onChange={e => setCodigo(e.target.value)} className="input" placeholder="REF-001" />
        </div>

        <div>
          <label className="label">Referencia / Nombre <span className="text-red-500">*</span></label>
          <input type="text" value={referencia} onChange={e => setReferencia(e.target.value)} className="input" placeholder="Ej: Camiseta Retro Millonarios" />
        </div>

        <div>
          <label className="label">Línea</label>
          <div className="flex flex-wrap gap-2">
            {lineas.map(l => (
              <button key={l.id} onClick={() => { setLineaId(l.id); setCategoriaId(null); }}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${lineaId === l.id ? "bg-brand-blue text-white" : "bg-gray-100 text-gray-600"}`}>
                {l.nombre}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Categoría <span className="text-red-500">*</span></label>
          <select
            value={categoriaId ?? ""}
            onChange={e => setCategoriaId(Number(e.target.value) || null)}
            className="input"
          >
            <option value="">Seleccionar...</option>
            {categoriasFiltradas.map(c => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Sistema de talla <span className="text-red-500">*</span></label>
          <div className="grid grid-cols-2 gap-2">
            {SISTEMAS.map(s => (
              <button key={s.value} onClick={() => setSistemaTalla(s.value)}
                className={`py-2 px-3 rounded-xl text-sm font-medium text-left transition-colors ${sistemaTalla === s.value ? "bg-brand-blue text-white" : "bg-gray-100 text-gray-600"}`}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Precio base <span className="text-red-500">*</span></label>
          <input type="number" value={precioBase} onChange={e => setPrecioBase(e.target.value)} className="input" placeholder="0" />
        </div>

        <Button className="w-full" size="lg" onClick={guardar} loading={loading}>
          Crear Producto
        </Button>
      </div>

      <div className="h-6" />
    </div>
  );
}
