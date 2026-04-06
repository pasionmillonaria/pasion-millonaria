import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ProfileProvider } from "@/lib/context/ProfileContext";

export const metadata: Metadata = {
  title: "Pasión Millonaria",
  description: "Sistema de inventario y punto de venta",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#003366",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <ProfileProvider>
          {children}
        </ProfileProvider>
      </body>
    </html>
  );
}
