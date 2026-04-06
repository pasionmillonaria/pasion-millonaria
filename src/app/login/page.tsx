"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import toast, { Toaster } from "react-hot-toast";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error("Auth error:", error.message);
      let msg = "Error al iniciar sesión. Intenta de nuevo.";
      if (error.message === "Invalid login credentials") {
        msg = "Correo o contraseña incorrectos";
      } else if (error.message.toLowerCase().includes("email not confirmed")) {
        msg = "Debes confirmar tu email. Revisa tu bandeja de entrada.";
      } else {
        msg = `Error: ${error.message}`;
      }
      toast.error(msg, { duration: 6000 });
      setLoading(false);
      return;
    }

    toast.success("¡Bienvenido!");
    router.push("/");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-brand-blue flex flex-col items-center justify-center p-6">
      <Toaster position="top-center" />

      {/* Logo / Header */}
      <div className="text-center mb-10">
        <div className="w-20 h-20 bg-brand-gold rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
          <span className="text-white font-bold text-2xl">PM</span>
        </div>
        <h1 className="text-3xl font-bold text-white">Pasión Millonaria</h1>
        <p className="text-blue-200 mt-1 text-sm">Sistema de Inventario y POS</p>
      </div>

      {/* Card de login */}
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-8">
        <h2 className="text-xl font-bold text-gray-900 mb-6">Iniciar Sesión</h2>

        <form onSubmit={handleLogin} className="space-y-5">
          {/* Email */}
          <div>
            <label className="label">Correo electrónico</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@correo.com"
                className="input pl-10"
                required
                autoComplete="email"
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="label">Contraseña</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="input pl-10 pr-10"
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Botón */}
          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full mt-2"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Ingresando...
              </span>
            ) : (
              "Ingresar"
            )}
          </button>
        </form>
      </div>

      <p className="text-blue-300 text-xs mt-8">v1.0 — Pasión Millonaria © 2025</p>
    </div>
  );
}
