"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Lock, Delete } from "lucide-react";
import { useProfile, PERFILES, type Profile } from "@/lib/context/ProfileContext";
import { Toaster } from "react-hot-toast";
import toast from "react-hot-toast";

function ProfileSelectScreen() {
  const router = useRouter();
  const { setProfile } = useProfile();

  const [pinModal, setPinModal] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);

  function handleSelectPerfil(p: Profile) {
    if (p.rol === "admin") {
      setPin("");
      setPinError(false);
      setPinModal(true);
    } else {
      setProfile(p);
      router.push("/inicio");
    }
  }

  function handleDigit(d: string) {
    if (pin.length < 4) {
      const next = pin + d;
      setPin(next);
      if (next.length === 4) verificarPin(next);
    }
  }

  function handleBorrar() {
    setPin(prev => prev.slice(0, -1));
    setPinError(false);
  }

  async function verificarPin(p: string) {
    setLoading(true);
    try {
      const res = await fetch("/api/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: p }),
      });
      if (res.ok) {
        const adminProfile = PERFILES.find(pr => pr.key === "admin")!;
        setProfile(adminProfile);
        setPinModal(false);
        router.push("/inicio");
      } else {
        setPinError(true);
        setShake(true);
        setTimeout(() => { setShake(false); setPin(""); setPinError(false); }, 700);
      }
    } catch {
      toast.error("Error de red");
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-[#0F2260] flex flex-col items-center justify-center p-6 select-none">
      <Toaster position="top-center" />

      {/* Logo */}
      <div className="text-center mb-12">
        <img
          src="/logo.webp"
          alt="Pasión Millonaria"
          className="w-24 h-24 rounded-2xl object-contain mx-auto mb-4 shadow-2xl bg-white p-1"
        />
        <h1 className="text-white font-bold text-2xl tracking-wide">Pasión Millonaria</h1>
        <p className="text-white text-sm mt-1">¿Quién está usando la app?</p>
      </div>

      {/* Grid de perfiles */}
      <div className="grid grid-cols-2 gap-5 w-full max-w-sm">
        {PERFILES.map(p => (
          <button
            key={p.key}
            onClick={() => handleSelectPerfil(p)}
            className="group flex flex-col items-center gap-3 p-5 rounded-2xl
                       bg-white border border-gray-200 hover:bg-gray-50
                       active:scale-95 transition-all duration-150"
          >
            {/* Avatar */}
            <div
              className="w-20 h-20 rounded-2xl flex items-center justify-center text-3xl
                         shadow-lg group-hover:scale-105 transition-transform duration-150 relative"
              style={{ backgroundColor: p.color }}
            >
              {p.emoji}
              {p.rol === "admin" && (
                <div className="absolute -top-1.5 -right-1.5 w-6 h-6 bg-brand-gold rounded-full
                                flex items-center justify-center shadow">
                  <Lock className="w-3 h-3 text-white" strokeWidth={2.5} />
                </div>
              )}
            </div>
            <span className="text-gray-800 font-semibold text-sm">{p.nombre}</span>
            {p.rol === "admin" && (
              <span className="text-brand-gold text-xs font-medium">PIN requerido</span>
            )}
          </button>
        ))}
      </div>

      {/* Modal PIN */}
      {pinModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className={`w-full max-w-xs bg-[#0F2260] border border-white/20 rounded-t-3xl sm:rounded-3xl p-6
                          ${shake ? "animate-[shake_0.4s_ease-in-out]" : ""}`}>

            {/* Drag handle */}
            <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-6 sm:hidden" />

            <div className="text-center mb-6">
              <div className="w-14 h-14 bg-brand-gold rounded-2xl flex items-center justify-center mx-auto mb-3 text-2xl">
                🏆
              </div>
              <h3 className="text-white font-bold text-lg">Admin</h3>
              <p className="text-blue-300 text-sm">Ingresa tu PIN de 4 dígitos</p>
            </div>

            {/* Puntos del PIN */}
            <div className="flex justify-center gap-4 mb-8">
              {[0, 1, 2, 3].map(i => (
                <div
                  key={i}
                  className={`w-4 h-4 rounded-full transition-all duration-150 ${
                    i < pin.length
                      ? pinError ? "bg-red-500" : "bg-brand-gold"
                      : "bg-white/20"
                  }`}
                />
              ))}
            </div>

            {/* Teclado numérico */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              {["1","2","3","4","5","6","7","8","9"].map(d => (
                <button
                  key={d}
                  onClick={() => handleDigit(d)}
                  disabled={loading || pin.length >= 4}
                  className="h-14 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95
                             text-white font-bold text-xl transition-all duration-100
                             disabled:opacity-40"
                >
                  {d}
                </button>
              ))}
              <button
                onClick={() => { setPinModal(false); setPin(""); }}
                className="h-14 rounded-xl bg-red-500/20 hover:bg-red-500/30 active:scale-95
                           text-red-400 font-medium text-sm transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDigit("0")}
                disabled={loading || pin.length >= 4}
                className="h-14 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95
                           text-white font-bold text-xl transition-all duration-100
                           disabled:opacity-40"
              >
                0
              </button>
              <button
                onClick={handleBorrar}
                disabled={loading || pin.length === 0}
                className="h-14 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95
                           text-white transition-all disabled:opacity-40 flex items-center justify-center"
              >
                <Delete className="w-5 h-5" />
              </button>
            </div>

            {pinError && (
              <p className="text-red-400 text-center text-sm font-medium">
                PIN incorrecto. Intenta de nuevo.
              </p>
            )}
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-5px); }
          80% { transform: translateX(5px); }
        }
      `}</style>
    </div>
  );
}

export default function RootPage() {
  return <ProfileSelectScreen />;
}
