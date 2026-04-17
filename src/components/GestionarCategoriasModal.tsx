"use client";

import { useState } from "react";
import { Pencil, Trash2, Check, X, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Categoria } from "@/lib/types";
import Modal from "@/components/ui/Modal";
import toast from "react-hot-toast";

interface Props {
  open: boolean;
  onClose: () => void;
  categorias: Categoria[];
  onChange: (categorias: Categoria[]) => void;
  onDeleted?: (id: number) => void;
}

export default function GestionarCategoriasModal({
  open,
  onClose,
  categorias,
  onChange,
  onDeleted,
}: Props) {
  const supabase = createClient();

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingNombre, setEditingNombre] = useState("");
  const [saving, setSaving] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  function empezarEditar(c: Categoria) {
    setEditingId(c.id);
    setEditingNombre(c.nombre);
    setConfirmDeleteId(null);
  }

  function cancelarEditar() {
    setEditingId(null);
    setEditingNombre("");
  }

  async function guardarEdicion(c: Categoria) {
    const nombre = editingNombre.trim();
    if (!nombre) return;
    if (nombre === c.nombre) { cancelarEditar(); return; }

    setSaving(true);
    const { data, error } = await supabase
      .from("categorias")
      .update({ nombre })
      .eq("id", c.id)
      .select("*")
      .single();

    if (error) {
      toast.error(
        error.message.includes("duplicate")
          ? "Ya existe una categoría con ese nombre"
          : "Error al actualizar categoría"
      );
      setSaving(false);
      return;
    }

    onChange(
      categorias
        .map(x => (x.id === c.id ? data : x))
        .sort((a, b) => a.nombre.localeCompare(b.nombre))
    );
    cancelarEditar();
    setSaving(false);
    toast.success("Categoría actualizada");
  }

  async function eliminar(c: Categoria) {
    setDeleting(true);

    // Preflight: no permitir eliminar si hay productos usándola
    const { count, error: countError } = await supabase
      .from("productos")
      .select("id", { count: "exact", head: true })
      .eq("categoria_id", c.id);

    if (countError) {
      toast.error("Error verificando uso: " + countError.message);
      setDeleting(false);
      return;
    }

    if (count && count > 0) {
      toast.error(
        `No se puede eliminar: ${count} producto${count > 1 ? "s usan" : " usa"} esta categoría`
      );
      setDeleting(false);
      setConfirmDeleteId(null);
      return;
    }

    const { error } = await supabase.from("categorias").delete().eq("id", c.id);
    if (error) {
      toast.error("Error al eliminar: " + error.message);
      setDeleting(false);
      return;
    }

    onChange(categorias.filter(x => x.id !== c.id));
    onDeleted?.(c.id);
    setConfirmDeleteId(null);
    setDeleting(false);
    toast.success(`Categoría "${c.nombre}" eliminada`);
  }

  return (
    <Modal open={open} onClose={onClose} title="Gestionar categorías" size="md">
      {categorias.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">No hay categorías</p>
      ) : (
        <ul className="space-y-2">
          {categorias.map(c => {
            const editing = editingId === c.id;
            const confirming = confirmDeleteId === c.id;

            return (
              <li key={c.id} className="bg-gray-50 rounded-xl px-3 py-2">
                {editing ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={editingNombre}
                      onChange={e => setEditingNombre(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") guardarEdicion(c);
                        if (e.key === "Escape") cancelarEditar();
                      }}
                      className="input flex-1"
                      autoFocus
                    />
                    <button
                      onClick={() => guardarEdicion(c)}
                      disabled={saving || !editingNombre.trim()}
                      className="p-2 rounded-xl bg-brand-blue text-white disabled:opacity-50"
                      title="Guardar"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      onClick={cancelarEditar}
                      className="p-2 rounded-xl hover:bg-gray-200 text-gray-500"
                      title="Cancelar"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : confirming ? (
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                    <span className="text-sm text-red-700 flex-1">
                      ¿Eliminar <span className="font-semibold">{c.nombre}</span>?
                    </span>
                    <button
                      onClick={() => eliminar(c)}
                      disabled={deleting}
                      className="px-3 py-1.5 rounded-xl bg-red-600 text-white text-sm font-medium disabled:opacity-50"
                    >
                      Sí
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      className="px-3 py-1.5 rounded-xl bg-gray-200 text-gray-700 text-sm font-medium"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-gray-900 flex-1">
                      {c.nombre}
                    </span>
                    <button
                      onClick={() => empezarEditar(c)}
                      className="p-2 rounded-xl hover:bg-gray-200 text-gray-500"
                      title="Editar"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(c.id)}
                      className="p-2 rounded-xl hover:bg-red-50 text-red-500"
                      title="Eliminar"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs text-gray-400 mt-4">
        No se pueden eliminar categorías que estén en uso por productos.
      </p>
    </Modal>
  );
}
