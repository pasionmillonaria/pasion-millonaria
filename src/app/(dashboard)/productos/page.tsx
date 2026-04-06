"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Package, Plus, Search, ChevronRight, ToggleLeft, ToggleRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/lib/context/UserContext";
import type { Producto, Categoria, Linea } from "@/lib/types";
import Spinner from "@/components/ui/Spinner";
import Badge from "@/components/ui/Badge";
import toast from "react-hot-toast";

interface ProductoConInfo extends Producto {
  categoria_nombre: string;
  linea_nombre: string;
}

export default function ProductosPage() {
  const supabase = createClient();
  const { isAdmin } = useUser();
  const router = useRouter();

  const [productos, setProductos] = useState<ProductoConInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState("");

  async function cargarProductos() {
    setLoading(true);
    const { data } = await supabase
      .from("productos")
      .select(`*, categorias(nombre, lineas(nombre))`)
      .order("id", { ascending: false });

    if (data) {
      setProductos(data.map((p: any) => ({
        ...p,
        categoria_nombre: p.categorias?.nombre ?? "",
        linea_nombre: p.categorias?.lineas?.nombre ?? "",
        categorias: undefined,
      })));
    }
    setLoading(false);
  }

  useEffect(() => { cargarProductos(); }, []);

  async function toggleActivo(producto: ProductoConInfo) {
    const { error } = await supabase.from("productos").update({ activo: !producto.activo }).eq("id", producto.id);
    if (error) { toast.error("Error"); return; }
    toast.success(producto.activo ? "Producto desactivado" : "Producto activado");
    cargarProductos();
  }

  const filtrados = productos.filter(p => {
    if (!busqueda) return true;
    const q = busqueda.toLowerCase();
    return (
      p.referencia.toLowerCase().includes(q) ||
      p.codigo.toLowerCase().includes(q) ||
      p.categoria_nombre.toLowerCase().includes(q)
    );
  });

  if (!isAdmin) {
    return (
      <div className="max-w-lg mx-auto px-4 pt-20 text-center">
        <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-gray-700">Solo administradores</h2>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Package className="w-6 h-6 text-brand-blue" /> Productos
        </h1>
        <Link href="/productos/nuevo" className="btn-primary py-2 px-4 text-sm rounded-xl flex items-center gap-1">
          <Plus className="w-4 h-4" /> Nuevo
        </Link>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
        <input
          type="text"
          placeholder="Buscar por referencia, código..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="input pl-10"
        />
      </div>

      {loading ? (
        <Spinner className="py-16" />
      ) : (
        <div className="space-y-2">
          {filtrados.map(p => (
            <div key={p.id} className="card flex items-center gap-3">
              <div className="flex-1 min-w-0" onClick={() => router.push(`/productos/${p.id}`)}>
                <div className="flex items-center gap-2">
                  <p className="font-bold text-gray-900 truncate">{p.referencia}</p>
                  {!p.activo && <Badge variant="danger">Inactivo</Badge>}
                </div>
                <p className="text-xs text-gray-500">{p.codigo} · {p.linea_nombre} · {p.categoria_nombre}</p>
                <p className="text-xs text-gray-400">{p.sistema_talla}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => toggleActivo(p)}
                  className={`text-2xl ${p.activo ? "text-green-500" : "text-gray-300"}`}
                >
                  {p.activo ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8" />}
                </button>
                <Link href={`/productos/${p.id}`} className="p-2 hover:bg-gray-50 rounded-xl">
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="h-4" />
    </div>
  );
}
