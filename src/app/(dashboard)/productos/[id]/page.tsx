"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, Save, Plus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Producto, Categoria, Linea, SistemaTalla } from "@/lib/types";
import Button from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";
import toast from "react-hot-toast";

const SISTEMAS: { value: SistemaTalla; label: string }[] = [
  { value: "ropa_adulto", label: "Ropa Adulto (XS-2XL)" },
  { value: "ropa_nino", label: "Ropa Niño (0-16)" },
  { value: "calzado", label: "Calzado (34-42)" },
  { value: "unica", label: "Talla Única" },
];

export default function EditarProductoPage() {
  const { id } = useParams<{ id: string }>();
  const supabase = createClient();
  const router = useRouter();

  const [producto, setProducto] = useState<Producto | null>(null);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [referencia, setReferencia] = useState("");
  const [precioBase, setPrecioBase] = useState("");
  const [sistemaTalla, setSistemaTalla] = useState<SistemaTalla>("ropa_adulto");
  const [categoriaId, setCategoriaId] = useState<number | null>(null);
  const [lineaId, setLineaId] = useState<number | null>(null);

  // Nueva categoría inline
  const [nuevaCatVisible, setNuevaCatVisible] = useState(false);
  const [nuevaCatNombre, setNuevaCatNombre] = useState("");
  const [guardandoCat, setGuardandoCat] = useState(false);

  useEffect(() => {
    async function load() {
      const [{ data: p }, { data: li }, { data: ca }] = await Promise.all([
        supabase.from("productos").select("*").eq("id", Number(id)).single(),
        supabase.from("lineas").select("*").order("orden"),
        supabase.from("categorias").select("*").order("orden"),
      ]);
      if (p) {
        setProducto(p);
        setReferencia(p.referencia);
        setPrecioBase(String(p.precio_base));
        setSistemaTalla(p.sistema_talla);
        setCategoriaId(p.categoria_id);
        setLineaId(p.linea_id);
      }
      setLineas(li ?? []);
      setCategorias(ca ?? []);
      setLoading(false);
    }
    load();
  }, [id]);

  const categoriasFiltradas = categorias;

  async function crearCategoria() {
    const nombre = nuevaCatNombre.trim();
    if (!nombre) return;
    setGuardandoCat(true);
    const { data, error } = await supabase
      .from("categorias")
      .insert({ nombre })
      .select("*")
      .single();
    if (error) {
      toast.error(error.message.includes("duplicate") ? "Esa categoría ya existe" : "Error al crear categoría");
      setGuardandoCat(false);
      return;
    }
    setCategorias(prev => [...prev, data].sort((a, b) => a.nombre.localeCompare(b.nombre)));
    setCategoriaId(data.id);
    setNuevaCatNombre("");
    setNuevaCatVisible(false);
    setGuardandoCat(false);
    toast.success(`Categoría "${data.nombre}" creada`);
  }

  async function guardar() {
    if (!referencia.trim() || !precioBase || !categoriaId) {
      toast.error("Completa los campos obligatorios"); return;
    }
    setSaving(true);
    const { error } = await supabase.from("productos").update({
      referencia: referencia.trim(),
      precio_base: parseFloat(precioBase),
      sistema_talla: sistemaTalla,
      categoria_id: categoriaId,
      linea_id: lineaId ?? undefined,
    }).eq("id", Number(id));

    if (error) { toast.error("Error: " + error.message); setSaving(false); return; }
    toast.success("Producto actualizado");
    router.push("/productos");
  }

  if (loading) return <Spinner className="h-screen" />;
  if (!producto) return <div className="p-6 text-center text-gray-500">Producto no encontrado</div>;

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-8 pt-6">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="p-2 rounded-xl hover:bg-gray-100"><ChevronLeft className="w-6 h-6" /></button>
        <h1 className="text-xl font-bold text-gray-900">Editar Producto</h1>
      </div>

      <div className="card space-y-4">
        <div>
          <label className="label">Código</label>
          <input type="text" value={producto.codigo} disabled className="input bg-gray-50 text-gray-400" />
        </div>
        <div>
          <label className="label">Referencia *</label>
          <input type="text" value={referencia} onChange={e => setReferencia(e.target.value)} className="input" />
        </div>
        <div>
          <label className="label">Línea</label>
          <div className="flex flex-wrap gap-2">
            {lineas.map(l => (
              <button key={l.id} onClick={() => { setLineaId(l.id); setCategoriaId(null); }}
                className={`px-3 py-1.5 rounded-full text-sm font-medium ${lineaId === l.id ? "bg-brand-blue text-white" : "bg-gray-100 text-gray-600"}`}>
                {l.nombre}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="label mb-0">Categoría <span className="text-red-500">*</span></label>
            {!nuevaCatVisible && (
              <button
                onClick={() => setNuevaCatVisible(true)}
                className="flex items-center gap-1 text-xs text-brand-blue font-medium hover:underline"
              >
                <Plus className="w-3 h-3" /> Nueva
              </button>
            )}
          </div>
          {nuevaCatVisible ? (
            <div className="flex gap-2">
              <input
                type="text"
                value={nuevaCatNombre}
                onChange={e => setNuevaCatNombre(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") crearCategoria(); if (e.key === "Escape") setNuevaCatVisible(false); }}
                className="input flex-1"
                placeholder="Nombre de la categoría..."
                autoFocus
              />
              <Button size="sm" onClick={crearCategoria} loading={guardandoCat} disabled={!nuevaCatNombre.trim()}>
                Crear
              </Button>
              <button onClick={() => { setNuevaCatVisible(false); setNuevaCatNombre(""); }}
                className="p-2 rounded-xl hover:bg-gray-100 text-gray-400">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <select value={categoriaId ?? ""} onChange={e => setCategoriaId(Number(e.target.value) || null)} className="input">
              <option value="">Seleccionar...</option>
              {categoriasFiltradas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          )}
        </div>
        <div>
          <label className="label">Sistema de talla</label>
          <div className="grid grid-cols-2 gap-2">
            {SISTEMAS.map(s => (
              <button key={s.value} onClick={() => setSistemaTalla(s.value)}
                className={`py-2 px-3 rounded-xl text-sm font-medium text-left ${sistemaTalla === s.value ? "bg-brand-blue text-white" : "bg-gray-100 text-gray-600"}`}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="label">Precio base *</label>
          <input type="number" value={precioBase} onChange={e => setPrecioBase(e.target.value)} className="input" />
        </div>
        <Button className="w-full" size="lg" onClick={guardar} loading={saving}>
          <Save className="w-5 h-5" /> Guardar Cambios
        </Button>
      </div>
      <div className="h-6" />
    </div>
  );
}
