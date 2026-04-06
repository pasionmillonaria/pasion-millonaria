"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Home, Package, Bookmark, LayoutDashboard,
  Box, LogOut, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useProfile } from "@/lib/context/ProfileContext";

const navBase = [
  { href: "/inicio",     label: "Inicio",     icon: Home },
  { href: "/inventario", label: "Inventario",  icon: Package },
  { href: "/apartados",  label: "Apartados",   icon: Bookmark },
];
const navAdmin = [
  { href: "/caja",      label: "Caja",      icon: LayoutDashboard },
  { href: "/productos", label: "Productos", icon: Box },
];

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { isAdmin, profile, setProfile } = useProfile();

  const items = isAdmin ? [...navBase, ...navAdmin] : navBase;

  function handleSalir() {
    setProfile(null);
    router.push("/");
  }

  function isActive(href: string) {
    return href === "/inicio"
      ? pathname === "/inicio"
      : pathname.startsWith(href);
  }

  /* ─── SIDEBAR (md+) ─── */
  const Sidebar = (
    <aside className="hidden md:flex flex-col fixed inset-y-0 left-0 w-60 bg-brand-blue z-40 shadow-xl">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
        <div className="w-10 h-10 bg-brand-gold rounded-xl flex items-center justify-center shrink-0 shadow">
          <span className="text-white font-black text-base">PM</span>
        </div>
        <div>
          <p className="text-white font-bold text-sm leading-tight">Pasión Millonaria</p>
          <p className="text-blue-300 text-xs">POS & Inventario</p>
        </div>
      </div>

      {/* Nav links */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {items.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150",
                active
                  ? "bg-white/15 text-white shadow-sm"
                  : "text-blue-200 hover:bg-white/10 hover:text-white"
              )}
            >
              <Icon className="w-5 h-5 shrink-0" strokeWidth={active ? 2.5 : 2} />
              <span>{label}</span>
              {active && <ChevronRight className="w-4 h-4 ml-auto opacity-60" />}
            </Link>
          );
        })}
      </nav>

      {/* Perfil + salir */}
      <div className="px-3 py-4 border-t border-white/10">
        <div className="flex items-center gap-3 px-3 py-2 mb-2">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0"
            style={{ backgroundColor: profile?.color ?? "#004488" }}
          >
            {profile?.emoji}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-semibold truncate">{profile?.nombre}</p>
            <p className="text-blue-300 text-xs capitalize">{profile?.rol}</p>
          </div>
        </div>
        <button
          onClick={handleSalir}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
                     text-blue-200 hover:bg-red-500/20 hover:text-red-300 transition-all"
        >
          <LogOut className="w-5 h-5 shrink-0" />
          <span>Cambiar perfil</span>
        </button>
      </div>
    </aside>
  );

  /* ─── BOTTOM NAV (mobile) ─── */
  const BottomNav = (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200">
      <div className="flex items-stretch">
        {items.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 relative transition-colors",
                active ? "text-brand-blue" : "text-gray-400"
              )}
            >
              <Icon className="w-5 h-5" strokeWidth={active ? 2.5 : 2} />
              <span className="text-[10px] font-medium">{label}</span>
              {active && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-brand-blue rounded-b-full" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );

  return (
    <>
      {Sidebar}
      {BottomNav}
    </>
  );
}
