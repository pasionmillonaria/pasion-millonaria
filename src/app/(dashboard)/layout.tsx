"use client";

export const dynamic = "force-dynamic";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { Toaster } from "react-hot-toast";
import NavBar from "@/components/NavBar";
import { useProfile } from "@/lib/context/ProfileContext";
import Spinner from "@/components/ui/Spinner";

// Pantallas que escriben datos: solo admin. Es UX; la autorizacion real es de la base.
const RUTAS_SOLO_ADMIN = [
  /^\/venta\/?$/,
  /^\/(entrada|traslado|devolucion|cambio|retiro|productos)(\/|$)/,
  /^\/apartados\/nuevo(\/|$)/,
];

function DashboardGuard({ children }: { children: React.ReactNode }) {
  const { profile, isAdmin } = useProfile();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (profile === null) {
      router.replace("/");
    }
  }, [profile, router]);

  if (profile === null) return <Spinner className="h-screen" />;

  const bloqueada = !isAdmin && RUTAS_SOLO_ADMIN.some(ruta => ruta.test(pathname));

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* NavBar renderiza sidebar (md+) y bottom nav (mobile) */}
      <NavBar />

      {/* Contenido: margen izquierdo para sidebar en desktop, padding inferior para bottom nav en mobile */}
      <main className="flex-1 min-w-0 md:ml-60 pb-20 md:pb-8 overflow-x-hidden">
        {bloqueada ? (
          <div className="max-w-lg mx-auto px-4 pt-20 text-center">
            <Lock className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-700">Solo administradores</h2>
          </div>
        ) : children}
      </main>

      <Toaster
        position="top-center"
        toastOptions={{
          duration: 3000,
          style: { borderRadius: "12px", fontWeight: "500", fontSize: "14px" },
          success: { iconTheme: { primary: "#1C3A8C", secondary: "white" } },
        }}
      />
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <DashboardGuard>{children}</DashboardGuard>;
}
