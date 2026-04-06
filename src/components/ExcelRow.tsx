"use client";

import { useState, useEffect } from "react";
import { Search, Trash2, Save, AlertCircle } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import Button from "@/components/ui/Button";

interface Producto {
  id: number;
  referencia: string;
  codigo: string;
  precio_base: number;
  sistema_talla: string;
}

interface Talla {
  id: number;
  nombre: string;
  sistema: string;
}

interface ExcelRowProps {
  onSave: (data: any) => Promise<void>;
  onRemove?: () => void;
  productos: Producto[];
  tallas: Talla[];
  loading?: boolean;
}

export default function ExcelRow({ onSave, onRemove, productos, tallas, loading }: ExcelRowProps) {
  const [query, setQuery] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [selectedProd, setSelectedProd] = useState<Producto | null>(null);
  
  const [tallaId, setTallaId] = useState<string>("");
  const [cantidad, setCantidad] = useState(1);
  const [total, setTotal] = useState(0);
  const [efectivo, setEfectivo] = useState(0);
  const [transferencia, setTransferencia] = useState(0);

  const filtered = productos.filter(p => 
    p.referencia.toLowerCase().includes(query.toLowerCase()) || 
    p.codigo.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 5);

  const tallasFiltradas = selectedProd 
    ? tallas.filter(t => t.sistema === selectedProd.sistema_talla)
    : [];

  useEffect(() => {
    if (selectedProd) {
      setTotal(selectedProd.precio_base * cantidad);
      setEfectivo(selectedProd.precio_base * cantidad);
      setTransferencia(0);
    }
  }, [selectedProd, cantidad]);

  const handleSave = () => {
    if (!selectedProd || !tallaId || total <= 0) return;
    if (efectivo + transferencia !== total) return;

    onSave({
      producto_id: selectedProd.id,
      talla_id: parseInt(tallaId),
      cantidad,
      precio_venta: selectedProd.precio_base,
      total,
      monto_efectivo: efectivo,
      monto_transferencia: transferencia,
      metodo_pago: efectivo > 0 && transferencia > 0 ? "mixto" : (efectivo > 0 ? "efectivo" : "transferencia")
    });
  };

  const isInvalid = efectivo + transferencia !== total;

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
      <td className="p-2 w-10 text-center">
        <input 
          type="number" 
          value={cantidad} 
          onChange={e => setCantidad(Math.max(1, parseInt(e.target.value) || 1))}
          className="w-full text-center bg-transparent border-none focus:ring-0 font-medium"
        />
      </td>
      <td className="p-2 relative min-w-[200px]">
        {selectedProd ? (
          <div className="flex items-center justify-between group">
            <span className="font-semibold text-gray-900">{selectedProd.referencia}</span>
            <button onClick={() => { setSelectedProd(null); setQuery(""); }} className="text-xs text-brand-blue opacity-0 group-hover:opacity-100 transition-opacity">Cambiar</button>
          </div>
        ) : (
          <div className="relative">
            <input
              type="text"
              value={query}
              onChange={e => { setQuery(e.target.value); setShowResults(true); }}
              onFocus={() => setShowResults(true)}
              placeholder="Buscar producto..."
              className="w-full text-sm py-1 bg-transparent border-none focus:ring-0"
            />
            {showResults && query.length > 0 && (
              <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-white shadow-xl border border-gray-100 rounded-lg overflow-hidden">
                {filtered.map(p => (
                  <button
                    key={p.id}
                    onClick={() => { setSelectedProd(p); setShowResults(false); }}
                    className="w-full text-left px-3 py-2 hover:bg-brand-blue/5 text-sm flex justify-between"
                  >
                    <span>{p.referencia}</span>
                    <span className="text-gray-400 text-xs">{p.codigo}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </td>
      <td className="p-2 w-24">
        <select 
          value={tallaId} 
          onChange={e => setTallaId(e.target.value)}
          disabled={!selectedProd}
          className="w-full text-sm bg-transparent border-none focus:ring-0 cursor-pointer disabled:opacity-30"
        >
          <option value="">Talla</option>
          {tallasFiltradas.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
        </select>
      </td>
      <td className="p-2 w-32">
        <input 
          type="number" 
          value={total} 
          onChange={e => {
            const val = parseInt(e.target.value) || 0;
            setTotal(val);
            setEfectivo(val);
            setTransferencia(0);
          }}
          className="w-full text-right bg-transparent border-none focus:ring-0 font-bold text-gray-900"
        />
      </td>
      <td className="p-2 w-32">
        <input 
          type="number" 
          value={transferencia} 
          onChange={e => {
            const val = parseInt(e.target.value) || 0;
            setTransferencia(val);
            setEfectivo(total - val);
          }}
          className={`w-full text-right bg-transparent border-none focus:ring-0 font-medium ${transferencia > 0 ? "text-blue-600" : "text-gray-400"}`}
        />
      </td>
      <td className="p-2 w-32">
        <input 
          type="number" 
          value={efectivo} 
          onChange={e => {
            const val = parseInt(e.target.value) || 0;
            setEfectivo(val);
            setTransferencia(total - val);
          }}
          className={`w-full text-right bg-transparent border-none focus:ring-0 font-medium ${efectivo > 0 ? "text-green-600" : "text-gray-400"}`}
        />
      </td>
      <td className="p-2 w-16 text-center">
        <div className="flex items-center justify-center gap-1">
          {isInvalid && <div title="La suma no coincide"><AlertCircle className="w-4 h-4 text-red-500" /></div>}
          <button 
            disabled={!selectedProd || !tallaId || isInvalid || loading}
            onClick={handleSave}
            className={`p-1.5 rounded-lg transition-colors ${!selectedProd || !tallaId || isInvalid || loading ? "text-gray-200" : "text-brand-blue hover:bg-brand-blue/10"}`}
          >
            <Save className="w-5 h-5" />
          </button>
          {onRemove && (
            <button onClick={onRemove} className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
