"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, Save, Plus, X, SlidersHorizontal, Trash2, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Producto, Categoria, Linea, SistemaTalla } from "@/lib/types";
import Button from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";
import InputDinero from "@/components/ui/InputDinero";
import toast from "react-hot-toast";

const SISTEMAS: { value: SistemaTalla; label: string }[] = [
  { value: "ropa_adulto", label: "Ropa Adulto (XS-2XL)" },
  { value: "ropa_nino",   label: "Ropa Niño (0-16)" },
  { value: "calzado",     label: "Calzado (34-42)" },
  { value: "unica",       label: "Talla Única" },
];

interface StockRow {
  talla_id:     number;
  talla_nombre: string;
  tienda:       number;
  bodega:       number;
}

export default function EditarProductoPage() {
  const { id } = useParams<{ id: string }>();
  const supabase  = createClient();
  const router    = useRouter();

  const [producto,   setProducto]   = useState<Producto | null>(null);
  const [lineas,     setLineas]     = useState<Linea[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);

  const [referencia,   setReferencia]   = useState("");
  const [precioBase,   setPrecioBase]   = useState("");
  const [sistemaTalla, setSistemaTalla] = useState<SistemaTalla>("ropa_adulto");
  const [categoriaId,  setCategoriaId]  = useState<number | null>(null);
  const [lineaId,      setLineaId]      = useState<number | null>(null);

  // Nueva categoría inline
  const [nuevaCatVisible, setNuevaCatVisible] = useState(false);
  const [nuevaCatNombre,  setNuevaCatNombre]  = useState("");
  const [guardandoCat,    setGuardandoCat]    = useState(false);

  // ── Ajuste de stock ──────────────────────────────────────────
  const [stockRows,    setStockRows]    = useState<StockRow[]>([]);
  const [stockEditado, setStockEditado] = useState<Record<string, { tienda: number; bodega: number }>>({});
  const [savingStock,  setSavingStock]  = useState(false);
  const [ajusteOpen,   setAjusteOpen]   = useState(false);

  // ── Eliminar producto ────────────────────────────────────────
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting,      setDeleting]      = useState(false);

  // ── Carga inicial ────────────────────────────────────────────
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
        await cargarStock(p.id, p.sistema_talla);
      }
      setLineas(li ?? []);
      setCategorias(ca ?? []);
      setLoading(false);
    }
    load();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function cargarStock(prodId: number, sis: SistemaTalla) {
    const [{ data: tallas }, { data: stockData }] = await Promise.all([
      supabase.from("tallas").select("id, nombre").eq("sistema", sis).order("orden"),
      supabase.from("stock").select("talla_id, ubicacion_id, cantidad").eq("producto_id", prodId),
    ]);

    const rows: StockRow[] = (tallas ?? []).map((t: any) => {
      const tiendaRow = stockData?.find((s: any) => s.talla_id === t.id && s.ubicacion_id === 1);
      const bodegaRow = stockData?.find((s: any) => s.talla_id === t.id && s.ubicacion_id === 2);
      return {
        talla_id:     t.id,
        talla_nombre: t.nombre,
        tienda:       tiendaRow?.cantidad ?? 0,
        bodega:       bodegaRow?.cantidad ?? 0,
      };
    });
    setStockRows(rows);

    const edited: Record<string, { tienda: number; bodega: number }> = {};
    for (const r of rows) edited[r.talla_id] = { tienda: r.tienda, bodega: r.bodega };
    setStockEditado(edited);
  }

  // ── Nueva categoría inline ───────────────────────────────────
  async function crearCategoria() {
    const nombre = nuevaCatNombre.trim();
    if (!nombre) return;
    setGuardandoCat(true);
    const { data, error } = await supabase
      .from("categorias").insert({ nombre }).select("*").single();
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

  // ── Guardar datos del producto ───────────────────────────────
  async function guardar() {
    if (!referencia.trim() || !precioBase || !categoriaId) {
      toast.error("Completa los campos obligatorios"); return;
    }
    setSaving(true);
    const { error } = await supabase.from("productos").update({
      referencia:   referencia.trim(),
      precio_base:  parseFloat(precioBase),
      sistema_talla: sistemaTalla,
      categoria_id: categoriaId,
      linea_id:     lineaId ?? undefined,
    }).eq("id", Number(id));

    if (error) { toast.error("Error: " + error.message); setSaving(false); return; }
    toast.success("Producto actualizado");
    router.push("/productos");
  }

  // ── Guardar ajuste de stock ──────────────────────────────────
  async function guardarAjusteStock() {
    if (!producto) return;
    setSavingStock(true);

    const inserts: object[] = [];

    for (const row of stockRows) {
      const editado = stockEditado[row.talla_id];
      if (!editado) continue;

      // Tienda
      const deltaTienda = editado.tienda - row.tienda;
      if (deltaTienda !== 0) {
        inserts.push({
          producto_id:  producto.id,
          talla_id:     row.talla_id,
          ubicacion_id: 1,
          cantidad:     Math.abs(deltaTienda),
          tipo:         deltaTienda > 0 ? "entrada" : "salida",
          canal:        "ajuste",
          nota:         "Ajuste manual de stock",
        });
      }

      // Bodega
      const deltaBodega = editado.bodega - row.bodega;
      if (deltaBodega !== 0) {
        inserts.push({
          producto_id:  producto.id,
          talla_id:     row.talla_id,
          ubicacion_id: 2,
          cantidad:     Math.abs(deltaBodega),
          tipo:         deltaBodega > 0 ? "entrada" : "salida",
          canal:        "ajuste",
          nota:         "Ajuste manual de stock",
        });
      }
    }

    if (inserts.length === 0) {
      toast.success("Sin cambios de stock");
      setSavingStock(false);
      return;
    }

    const { error } = await supabase.from("movimientos").insert(inserts);
    if (error) {
      toast.error("Error al ajustar stock: " + error.message);
      setSavingStock(false);
      return;
    }

    toast.success(`Stock ajustado (${inserts.length} cambio${inserts.length !== 1 ? "s" : ""})`);
    await cargarStock(producto.id, producto.sistema_talla);
    setAjusteOpen(false);
    setSavingStock(false);
  }

  // ── Eliminar producto ────────────────────────────────────────
  async function eliminarProducto() {
    if (!producto) return;
    setDeleting(true);

    // Verificar si tiene movimientos
    const { count } = await supabase
      .from("movimientos")
      .select("id", { count: "exact", head: true })
      .eq("producto_id", producto.id);

    if (count && count > 0) {
      toast.error("Tiene historial de movimientos. Desactívalo en lugar de eliminarlo.");
      setDeleting(false);
      setConfirmDelete(false);
      return;
    }

    // Sin movimientos → eliminar stock y producto
    await supabase.from("stock").delete().eq("producto_id", producto.id);
    const { error } = await supabase.from("productos").delete().eq("id", producto.id);

    if (error) {
      toast.error("Error al eliminar: " + error.message);
      setDeleting(false);
      return;
    }

    toast.success("Producto eliminado");
    router.push("/productos");
  }

  if (loading) return <Spinner className="h-screen" />;
  if (!producto) return <div className="p-6 text-center text-gray-500">Producto no encontrado</div>;

  const totalStock = stockRows.reduce((s, r) => s + r.tienda + r.bodega, 0);

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-8 pt-6 pb-24">

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="p-2 rounded-xl hover:bg-gray-100">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="text-xl font-bold text-gray-900">Editar Producto</h1>
      </div>

      {/* ── Formulario principal ── */}
      <div className="card space-y-4 mb-4">
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
              <button onClick={() => setNuevaCatVisible(true)} className="flex items-center gap-1 text-xs text-brand-blue font-medium hover:underline">
                <Plus className="w-3 h-3" /> Nueva
              </button>
            )}
          </div>
          {nuevaCatVisible ? (
            <div className="flex gap-2">
              <input type="text" value={nuevaCatNombre} onChange={e => setNuevaCatNombre(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") crearCategoria(); if (e.key === "Escape") setNuevaCatVisible(false); }}
                className="input flex-1" placeholder="Nombre de la categoría..." autoFocus />
              <Button size="sm" onClick={crearCategoria} loading={guardandoCat} disabled={!nuevaCatNombre.trim()}>Crear</Button>
              <button onClick={() => { setNuevaCatVisible(false); setNuevaCatNombre(""); }} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <select value={categoriaId ?? ""} onChange={e => setCategoriaId(Number(e.target.value) || null)} className="input">
              <option value="">Seleccionar...</option>
              {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
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
          <InputDinero value={precioBase} onChange={raw => setPrecioBase(raw)} className="input" />
        </div>
        <Button className="w-full" size="lg" onClick={guardar} loading={saving}>
          <Save className="w-5 h-5" /> Guardar Cambios
        </Button>
      </div>

      {/* ── Ajuste de stock ── */}
      <div className="card mb-4">
        <button
          onClick={() => setAjusteOpen(v => !v)}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-5 h-5 text-brand-blue" />
            <div className="text-left">
              <p className="font-bold text-gray-800">Ajuste de stock</p>
              <p className="text-xs text-gray-400">{totalStock} unidades en total</p>
            </div>
          </div>
          <span className="text-brand-blue text-sm font-medium">{ajusteOpen ? "Cerrar" : "Editar"}</span>
        </button>

        {ajusteOpen && (
          <div className="mt-4 space-y-2">
            {stockRows.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-2">
                No hay tallas para este sistema. Verifica que existan en la tabla de tallas.
              </p>
            ) : (
              <>
                {/* Cabecera */}
                <div className="grid grid-cols-[1fr_5rem_5rem] gap-2 px-1 mb-1">
                  <span className="text-xs font-bold text-gray-400 uppercase">Talla</span>
                  <span className="text-xs font-bold text-gray-400 uppercase text-center">🏪 Tienda</span>
                  <span className="text-xs font-bold text-gray-400 uppercase text-center">📦 Bodega</span>
                </div>

                {stockRows.map(row => {
                  const ed = stockEditado[row.talla_id] ?? { tienda: row.tienda, bodega: row.bodega };
                  const deltaTienda = ed.tienda - row.tienda;
                  const deltaBodega = ed.bodega - row.bodega;
                  return (
                    <div key={row.talla_id} className="grid grid-cols-[1fr_5rem_5rem] gap-2 items-center bg-gray-50 rounded-xl px-3 py-2">
                      <span className="font-semibold text-sm text-gray-900">{row.talla_nombre}</span>

                      {/* Tienda */}
                      <div className="relative">
                        <input
                          type="number"
                          min={0}
                          value={ed.tienda}
                          onChange={e => setStockEditado(prev => ({
                            ...prev,
                            [row.talla_id]: { ...ed, tienda: Math.max(0, parseInt(e.target.value) || 0) },
                          }))}
                          className={`input text-center text-sm py-1.5 px-2 w-full ${deltaTienda !== 0 ? "border-brand-blue bg-blue-50" : ""}`}
                        />
                        {deltaTienda !== 0 && (
                          <span className={`absolute -top-1.5 -right-1.5 text-[9px] font-bold px-1 rounded-full ${deltaTienda > 0 ? "bg-green-500 text-white" : "bg-red-500 text-white"}`}>
                            {deltaTienda > 0 ? `+${deltaTienda}` : deltaTienda}
                          </span>
                        )}
                      </div>

                      {/* Bodega */}
                      <div className="relative">
                        <input
                          type="number"
                          min={0}
                          value={ed.bodega}
                          onChange={e => setStockEditado(prev => ({
                            ...prev,
                            [row.talla_id]: { ...ed, bodega: Math.max(0, parseInt(e.target.value) || 0) },
                          }))}
                          className={`input text-center text-sm py-1.5 px-2 w-full ${deltaBodega !== 0 ? "border-brand-blue bg-blue-50" : ""}`}
                        />
                        {deltaBodega !== 0 && (
                          <span className={`absolute -top-1.5 -right-1.5 text-[9px] font-bold px-1 rounded-full ${deltaBodega > 0 ? "bg-green-500 text-white" : "bg-red-500 text-white"}`}>
                            {deltaBodega > 0 ? `+${deltaBodega}` : deltaBodega}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}

                <p className="text-xs text-gray-400 pt-1 px-1">
                  Modifica los números directamente. Los campos resaltados tienen cambios pendientes.
                </p>

                <Button className="w-full mt-2" onClick={guardarAjusteStock} loading={savingStock}>
                  Guardar ajuste de stock
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Zona peligrosa ── */}
      <div className="border border-red-200 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="w-4 h-4 text-red-500" />
          <h3 className="font-bold text-red-700 text-sm">Zona peligrosa</h3>
        </div>

        {!confirmDelete ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700">Eliminar producto</p>
              <p className="text-xs text-gray-400">Solo si no tiene historial de ventas o movimientos</p>
            </div>
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 text-sm font-medium transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Eliminar
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-red-700 font-medium">
              ¿Seguro que quieres eliminar <span className="font-bold">{producto.referencia}</span>?
              Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-2">
              <Button
                className="flex-1 !bg-red-600 hover:!bg-red-700"
                onClick={eliminarProducto}
                loading={deleting}
              >
                Sí, eliminar
              </Button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 py-2 rounded-xl bg-gray-100 text-gray-700 font-medium text-sm"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
