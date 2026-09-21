"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, CheckCircle, ChevronLeft, PackagePlus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";
import InputDinero from "@/components/ui/InputDinero";
import ListaProductos from "@/components/ListaProductos";
import SelectorTalla from "@/components/SelectorTalla";
import Button from "@/components/ui/Button";
import toast from "react-hot-toast";
import type { MetodoPago, SistemaTalla } from "@/lib/types";

interface ProductoSel { id: number; referencia: string; codigo: string; precio_base: number; categoria_nombre: string; linea_nombre: string; sistema_talla: string; }
interface TallaStock { talla_id: number; talla_nombre: string; stock_tienda: number; stock_bodega: number; }
interface ItemCambio { key: number; modo: "inventario" | "libre"; producto: ProductoSel; descripcion?: string; tallaId: number; tallaNombre: string; tallas: TallaStock[]; ubicacionId: number; cantidad: number; precio: string; }

const METODOS: { value: MetodoPago; label: string }[] = [
  { value: "efectivo", label: "Efectivo" }, { value: "nequi", label: "Nequi" },
  { value: "transferencia", label: "Transferencia" }, { value: "datafono", label: "Datáfono" },
];
let siguienteKey = 1;

export default function CambioPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [entradas, setEntradas] = useState<ItemCambio[]>([]);
  const [salidas, setSalidas] = useState<ItemCambio[]>([]);
  const [ladoAgregando, setLadoAgregando] = useState<"entrada" | "salida" | null>("entrada");
  const [modoSalida, setModoSalida] = useState<"inventario" | "libre">("inventario");
  const [productoTemp, setProductoTemp] = useState<ProductoSel | null>(null);
  const [tallasTemp, setTallasTemp] = useState<TallaStock[]>([]);
  const [tallaTempId, setTallaTempId] = useState<number | null>(null);
  const [ubicacionTempId, setUbicacionTempId] = useState(1);
  const [cantidadTemp, setCantidadTemp] = useState(1);
  const [precioTemp, setPrecioTemp] = useState("");
  const [descripcionLibre, setDescripcionLibre] = useState("");
  const [sistemaLibre, setSistemaLibre] = useState<string | null>(null);
  const [todasTallas, setTodasTallas] = useState<{ id: number; nombre: string; sistema: string }[]>([]);
  const [productoLibreId, setProductoLibreId] = useState<number | null>(null);
  const [metodoPago, setMetodoPago] = useState<MetodoPago>("efectivo");
  const [loading, setLoading] = useState(false);
  const [confirmado, setConfirmado] = useState(false);
  const [referencia, setReferencia] = useState("");

  useEffect(() => { void (async () => {
    const [{ data: tallas }, { data: libre }] = await Promise.all([
      supabase.from("tallas").select("id, nombre, sistema").order("orden"),
      supabase.from("productos").select("id").eq("codigo", "LIBRE").single(),
    ]);
    setTodasTallas(tallas ?? []); setProductoLibreId(libre?.id ?? null);
  })(); }, [supabase]);

  const totalEntrada = total(entradas), totalSalida = total(salidas), diferencia = totalSalida - totalEntrada;
  const unidadesEntrada = entradas.reduce((n, i) => n + i.cantidad, 0);
  const unidadesSalida = salidas.reduce((n, i) => n + i.cantidad, 0);

  async function cargarTallas(producto: ProductoSel, entrada: boolean): Promise<TallaStock[]> {
    if (entrada) {
      const { data, error } = await supabase.from("tallas").select("id, nombre").eq("sistema", producto.sistema_talla as SistemaTalla).order("orden");
      if (error) { toast.error("No se pudieron cargar las tallas"); return []; }
      return (data ?? []).map(t => ({ talla_id: t.id, talla_nombre: t.nombre, stock_tienda: 0, stock_bodega: 0 }));
    }
    const { data, error } = await supabase.from("v_stock_total").select("talla, talla_id, stock_tienda, stock_bodega").eq("producto_id", producto.id);
    if (error) { toast.error("No se pudo cargar el stock"); return []; }
    return (data ?? []).map(t => ({ talla_id: t.talla_id, talla_nombre: t.talla, stock_tienda: t.stock_tienda ?? 0, stock_bodega: t.stock_bodega ?? 0 }));
  }

  async function seleccionarProducto(producto: ProductoSel) {
    if (producto.codigo === "LIBRE") { toast.error("Usa la opción Artículo libre"); return; }
    const tallas = await cargarTallas(producto, ladoAgregando === "entrada");
    setProductoTemp(producto); setTallasTemp(tallas); setTallaTempId(null); setPrecioTemp(String(producto.precio_base)); setCantidadTemp(1); setUbicacionTempId(1);
  }
  function resetTemporal() { setProductoTemp(null); setTallasTemp([]); setTallaTempId(null); setCantidadTemp(1); setPrecioTemp(""); setDescripcionLibre(""); setSistemaLibre(null); setModoSalida("inventario"); }
  function abrirAgregar(lado: "entrada" | "salida") { resetTemporal(); setLadoAgregando(lado); }
  function reservado(productoId: number, tallaId: number, ubicacionId: number) { return salidas.reduce((n, i) => n + (i.modo === "inventario" && i.producto.id === productoId && i.tallaId === tallaId && i.ubicacionId === ubicacionId ? i.cantidad : 0), 0); }
  function disponible(tallaId = tallaTempId) { if (!productoTemp || !tallaId) return 0; const t = tallasTemp.find(x => x.talla_id === tallaId); return Math.max(0, (ubicacionTempId === 1 ? t?.stock_tienda ?? 0 : t?.stock_bodega ?? 0) - reservado(productoTemp.id, tallaId, ubicacionTempId)); }

  function agregarItem() {
    if (!ladoAgregando || cantidadTemp <= 0 || Number(precioTemp) <= 0) { toast.error("Cantidad y precio deben ser mayores a cero"); return; }
    let item: ItemCambio;
    if (ladoAgregando === "salida" && modoSalida === "libre") {
      if (!descripcionLibre.trim() || !tallaTempId || !productoLibreId) { toast.error("Completa descripción y talla del artículo libre"); return; }
      item = { key: siguienteKey++, modo: "libre", descripcion: descripcionLibre.trim(), producto: { id: productoLibreId, codigo: "LIBRE", referencia: "Artículo libre", precio_base: 0, categoria_nombre: "Otro", linea_nombre: "Accesorio", sistema_talla: sistemaLibre ?? "unica" }, tallaId: tallaTempId, tallaNombre: todasTallas.find(t => t.id === tallaTempId)?.nombre ?? "-", tallas: [], ubicacionId: 1, cantidad: cantidadTemp, precio: precioTemp };
    } else {
      if (!productoTemp || !tallaTempId) { toast.error("Selecciona producto y talla"); return; }
      if (ladoAgregando === "salida" && cantidadTemp > disponible()) { toast.error(`Solo hay ${disponible()} unidad(es) disponibles`); return; }
      item = { key: siguienteKey++, modo: "inventario", producto: productoTemp, tallaId: tallaTempId, tallaNombre: tallasTemp.find(t => t.talla_id === tallaTempId)?.talla_nombre ?? "-", tallas: tallasTemp, ubicacionId: ladoAgregando === "entrada" ? 1 : ubicacionTempId, cantidad: cantidadTemp, precio: precioTemp };
    }
    ladoAgregando === "entrada" ? setEntradas(x => [...x, item]) : setSalidas(x => [...x, item]);
    resetTemporal(); setLadoAgregando(null);
  }

  function cambiarCantidad(lado: "entrada" | "salida", key: number, delta: number) {
    const setter = lado === "entrada" ? setEntradas : setSalidas;
    setter(items => items.map(item => {
      if (item.key !== key) return item;
      let cantidad = Math.max(1, item.cantidad + delta);
      if (lado === "salida" && item.modo === "inventario") {
        const t = item.tallas.find(x => x.talla_id === item.tallaId);
        const base = item.ubicacionId === 1 ? t?.stock_tienda ?? 0 : t?.stock_bodega ?? 0;
        const otros = items.reduce((n, o) => n + (o.key !== key && o.modo === "inventario" && o.producto.id === item.producto.id && o.tallaId === item.tallaId && o.ubicacionId === item.ubicacionId ? o.cantidad : 0), 0);
        cantidad = Math.min(cantidad, Math.max(1, base - otros));
      }
      return { ...item, cantidad };
    }));
  }

  async function confirmar() {
    if (loading) return;
    if (!entradas.length || !salidas.length) { toast.error("Agrega al menos una prenda en cada lado"); return; }
    setLoading(true); const ref = `CAM-${Date.now()}`;
    const { data, error } = await supabase.rpc("registrar_cambio", {
      p_entradas: entradas.map(i => ({ producto_id: i.producto.id, talla_id: i.tallaId, cantidad: i.cantidad, precio_unitario: Number(i.precio) })),
      p_salidas: salidas.map(i => ({ producto_id: i.producto.id, talla_id: i.tallaId, ubicacion_id: i.ubicacionId, cantidad: i.cantidad, precio_unitario: Number(i.precio), descripcion: i.descripcion ?? null })),
      p_metodo_pago: metodoPago, p_referencia: ref,
    });
    if (error) { toast.error(error.message); setLoading(false); return; }
    setReferencia(data.referencia ?? ref); setConfirmado(true); setLoading(false); toast.success("¡Cambio registrado!");
  }
  function nuevoCambio() { setEntradas([]); setSalidas([]); resetTemporal(); setLadoAgregando("entrada"); setConfirmado(false); setReferencia(""); setMetodoPago("efectivo"); }

  if (confirmado) return <div className="max-w-md mx-auto px-4 pt-16 pb-24 text-center"><div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4"><CheckCircle className="w-10 h-10 text-blue-600" /></div><h2 className="text-2xl font-bold mb-2">¡Cambio registrado!</h2><p className="text-gray-500 mb-4">{referencia} · {unidadesEntrada} entran / {unidadesSalida} salen</p><Resumen diferencia={diferencia} confirmado /><div className="space-y-3 mt-4"><Button className="w-full" onClick={nuevoCambio}>Nuevo cambio</Button><Button variant="secondary" className="w-full" onClick={() => router.push("/inicio")}>Ir al inicio</Button></div></div>;

  return <div className="max-w-6xl mx-auto px-4 md:px-8 pt-6 pb-24"><div className="flex items-center gap-3 mb-6"><button onClick={() => router.back()} className="p-2 rounded-xl hover:bg-gray-100"><ChevronLeft className="w-6 h-6" /></button><ArrowLeftRight className="w-6 h-6 text-blue-600" /><h1 className="text-xl font-bold">Cambio de productos</h1></div><div className="grid md:grid-cols-2 gap-6 items-start">
    <Panel titulo="Producto(s) que devuelve el cliente" ayuda="Todo entra a Tienda" naranja items={entradas} total={totalEntrada} unidades={unidadesEntrada} agregando={ladoAgregando === "entrada"} onAgregar={() => abrirAgregar("entrada")} onCancelar={() => { resetTemporal(); setLadoAgregando(null); }} onEliminar={(key: number) => setEntradas(x => x.filter(i => i.key !== key))} onCantidad={(key: number, d: number) => cambiarCantidad("entrada", key, d)}>{ladoAgregando === "entrada" && <EditorInventario entrada producto={productoTemp} tallas={tallasTemp} tallaId={tallaTempId} ubicacionId={ubicacionTempId} cantidad={cantidadTemp} precio={precioTemp} stock={disponible()} onProducto={seleccionarProducto} onTalla={setTallaTempId} onUbicacion={setUbicacionTempId} onCantidad={setCantidadTemp} onPrecio={setPrecioTemp} onAgregar={agregarItem} />}</Panel>
    <Panel titulo="Producto(s) que se lleva el cliente" ayuda="Sale de Tienda o Bodega" items={salidas} total={totalSalida} unidades={unidadesSalida} agregando={ladoAgregando === "salida"} onAgregar={() => abrirAgregar("salida")} onCancelar={() => { resetTemporal(); setLadoAgregando(null); }} onEliminar={(key: number) => setSalidas(x => x.filter(i => i.key !== key))} onCantidad={(key: number, d: number) => cambiarCantidad("salida", key, d)}>{ladoAgregando === "salida" && <div className="space-y-4"><div className="grid grid-cols-2 gap-2"><Opcion activo={modoSalida === "inventario"} onClick={() => { resetTemporal(); setModoSalida("inventario"); }}>Del inventario</Opcion><Opcion activo={modoSalida === "libre"} onClick={() => { resetTemporal(); setModoSalida("libre"); }}>Artículo libre</Opcion></div>{modoSalida === "inventario" ? <EditorInventario producto={productoTemp} tallas={tallasTemp} tallaId={tallaTempId} ubicacionId={ubicacionTempId} cantidad={cantidadTemp} precio={precioTemp} stock={disponible()} onProducto={seleccionarProducto} onTalla={setTallaTempId} onUbicacion={setUbicacionTempId} onCantidad={setCantidadTemp} onPrecio={setPrecioTemp} onAgregar={agregarItem} /> : <EditorLibre descripcion={descripcionLibre} sistema={sistemaLibre} tallaId={tallaTempId} cantidad={cantidadTemp} precio={precioTemp} tallas={todasTallas} onDescripcion={setDescripcionLibre} onSistema={(s: string) => { setSistemaLibre(s); setTallaTempId(null); }} onTalla={setTallaTempId} onCantidad={setCantidadTemp} onPrecio={setPrecioTemp} onAgregar={agregarItem} />}</div>}</Panel>
  </div>{entradas.length > 0 && salidas.length > 0 && <div className="mt-6 space-y-4"><Resumen diferencia={diferencia} />{diferencia !== 0 && <div className="card"><label className="label">Método de {diferencia > 0 ? "pago" : "reembolso"}</label><div className="grid grid-cols-2 md:grid-cols-4 gap-2">{METODOS.map(m => <Opcion key={m.value} activo={metodoPago === m.value} onClick={() => setMetodoPago(m.value)}>{m.label}</Opcion>)}</div><p className="text-xs text-gray-400 mt-2">Si hay diferencia, debe existir una caja abierta.</p></div>}<Button className="w-full" size="lg" onClick={confirmar} loading={loading}>Confirmar cambio</Button></div>}</div>;
}

function total(items: ItemCambio[]) { return items.reduce((n, i) => n + Number(i.precio || 0) * i.cantidad, 0); }
function Panel({ titulo, ayuda, naranja, items, total: valor, unidades, agregando, onAgregar, onCancelar, onEliminar, onCantidad, children }: any) { return <section className={`card border-l-4 ${naranja ? "border-orange-400" : "border-green-400"}`}><div className="flex justify-between gap-3 mb-3"><div><h2 className="font-bold">{titulo}</h2><p className="text-xs text-gray-400">{ayuda}</p></div>{!agregando && <button onClick={onAgregar} className="flex items-center gap-1 text-brand-blue text-sm font-medium"><PackagePlus className="w-4 h-4" />Agregar</button>}</div><div className="space-y-3">{items.map((i: ItemCambio) => <div key={i.key} className="rounded-xl bg-gray-50 p-3"><div className="flex justify-between"><div><p className="font-semibold text-sm">{i.descripcion ?? i.producto.referencia}</p><p className="text-xs text-gray-500">Talla {i.tallaNombre}{i.modo === "inventario" && ` · ${i.ubicacionId === 1 ? "Tienda" : "Bodega"}`}</p></div><button onClick={() => onEliminar(i.key)} className="text-red-400"><Trash2 className="w-4 h-4" /></button></div><div className="flex justify-between items-center mt-3"><div className="flex items-center gap-2"><button onClick={() => onCantidad(i.key, -1)} className="w-7 h-7 rounded-lg bg-white border">−</button><b>{i.cantidad}</b><button onClick={() => onCantidad(i.key, 1)} className="w-7 h-7 rounded-lg bg-white border">+</button></div><b>{formatCurrency(Number(i.precio) * i.cantidad)}</b></div></div>)}</div>{agregando && <div className="border border-dashed border-brand-blue rounded-2xl p-4 mt-4">{children}<Button variant="secondary" className="w-full mt-2" onClick={onCancelar}>Cancelar</Button></div>}<div className="flex justify-between border-t mt-4 pt-3"><span className="text-sm text-gray-500">{unidades} unidad(es)</span><b>{formatCurrency(valor)}</b></div></section>; }
function EditorInventario({ entrada = false, producto, tallas, tallaId, ubicacionId, cantidad, precio, stock, onProducto, onTalla, onUbicacion, onCantidad, onPrecio, onAgregar }: any) { if (!producto) return <ListaProductos onSelect={onProducto} placeholder={entrada ? "Buscar producto devuelto..." : "Buscar producto de salida..."} />; return <div className="space-y-4"><p className="font-semibold">{producto.referencia}</p>{!entrada && <div className="grid grid-cols-2 gap-2"><Opcion activo={ubicacionId === 1} onClick={() => onUbicacion(1)}>Tienda</Opcion><Opcion activo={ubicacionId === 2} onClick={() => onUbicacion(2)}>Bodega</Opcion></div>}<div><label className="label">Talla</label>{entrada ? <div className="grid grid-cols-4 gap-2">{tallas.map((t: TallaStock) => <button key={t.talla_id} onClick={() => onTalla(t.talla_id)} className={`p-3 rounded-xl border-2 font-bold text-sm ${tallaId === t.talla_id ? "border-brand-blue bg-brand-blue text-white" : "border-gray-200"}`}>{t.talla_nombre}</button>)}</div> : <SelectorTalla tallas={tallas} seleccionada={tallaId} onSelect={onTalla} ubicacionId={ubicacionId} />}</div><CantidadPrecio cantidad={cantidad} precio={precio} max={entrada ? undefined : stock} onCantidad={onCantidad} onPrecio={onPrecio} /><Button className="w-full" onClick={onAgregar}>Agregar prenda</Button></div>; }
function EditorLibre({ descripcion, sistema, tallaId, cantidad, precio, tallas, onDescripcion, onSistema, onTalla, onCantidad, onPrecio, onAgregar }: any) { const sistemas = { ropa_adulto: "Ropa adulto", ropa_nino: "Ropa niño", calzado: "Calzado", unica: "Única" }; return <div className="space-y-4"><div><label className="label">Descripción</label><input className="input" value={descripcion} onChange={e => onDescripcion(e.target.value)} /></div><div className="grid grid-cols-2 gap-2">{Object.entries(sistemas).map(([k, v]) => <Opcion key={k} activo={sistema === k} onClick={() => onSistema(k)}>{v}</Opcion>)}</div>{sistema && <div className="flex flex-wrap gap-2">{tallas.filter((t: any) => t.sistema === sistema).map((t: any) => <Opcion key={t.id} activo={tallaId === t.id} onClick={() => onTalla(t.id)}>{t.nombre}</Opcion>)}</div>}<CantidadPrecio cantidad={cantidad} precio={precio} onCantidad={onCantidad} onPrecio={onPrecio} /><Button className="w-full" onClick={onAgregar}>Agregar artículo libre</Button></div>; }
function CantidadPrecio({ cantidad, precio, max, onCantidad, onPrecio }: any) { return <div className="grid grid-cols-2 gap-3"><div><label className="label">Cantidad{max !== undefined ? ` (máx. ${max})` : ""}</label><div className="flex items-center gap-3"><button onClick={() => onCantidad(Math.max(1, cantidad - 1))} className="w-10 h-10 rounded-xl bg-gray-100 font-bold">−</button><b>{cantidad}</b><button onClick={() => onCantidad(max === undefined ? cantidad + 1 : Math.min(max, cantidad + 1))} className="w-10 h-10 rounded-xl bg-gray-100 font-bold">+</button></div></div><div><label className="label">Precio unitario</label><InputDinero value={precio} onChange={onPrecio} className="input" /></div></div>; }
function Opcion({ activo, onClick, children }: any) { return <button onClick={onClick} className={`py-2 px-3 rounded-xl text-sm font-medium ${activo ? "bg-brand-blue text-white" : "bg-gray-100 text-gray-600"}`}>{children}</button>; }
function Resumen({ diferencia, confirmado = false }: { diferencia: number; confirmado?: boolean }) { const clase = diferencia > 0 ? "bg-green-50 text-green-700 border-green-200" : diferencia < 0 ? "bg-red-50 text-red-700 border-red-200" : "bg-gray-50 text-gray-600 border-gray-200"; return <div className={`rounded-2xl border p-4 ${clase}`}><div className="flex justify-between"><b>Diferencia</b><span className="text-xl font-bold">{formatCurrency(Math.abs(diferencia))}</span></div><p className="text-sm mt-1">{diferencia > 0 ? `${confirmado ? "Cobrado" : "El cliente paga"} ${formatCurrency(diferencia)}` : diferencia < 0 ? `${confirmado ? "Reembolsado" : "Se devuelve al cliente"} ${formatCurrency(Math.abs(diferencia))}` : "Cambio sin diferencia de precio"}</p></div>; }
