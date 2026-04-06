"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Package, Bookmark, LayoutDashboard, Box } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUser } from "@/lib/context/UserContext";

const navItems = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/inventario", label: "Inventario", icon: Package },
  { href: "/apartados", label: "Apartados", icon: Bookmark },
];

const adminItems = [
  { href: "/caja", label: "Caja", icon: LayoutDashboard },
  { href: "/productos", label: "Productos", icon: Box },
];

export default function NavBar() {
  const pathname = usePathname();
  const { isAdmin } = useUser();

  const items = isAdmin ? [...navItems, ...adminItems] : navItems;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200">
      <div className="flex items-stretch max-w-lg mx-auto">
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== "/" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex-1 flex flex-col items-center justify-center py-3 gap-0.5 text-xs font-medium transition-colors relative",
                active ? "text-brand-blue" : "text-gray-400 hover:text-gray-600"
              )}
            >
              <Icon
                className="w-5 h-5 transition-transform"
                strokeWidth={active ? 2.5 : 2}
              />
              <span className="text-[10px]">{label}</span>
              {active && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-brand-blue rounded-b-full" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
