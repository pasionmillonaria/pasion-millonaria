import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ProfileProvider } from "@/lib/context/ProfileContext";

export const metadata: Metadata = {
  title: "Pasión Millonaria",
  description: "Sistema de inventario y punto de venta",
  manifest: "/manifest.json",
  icons: {
    icon: "/logo.webp",
    apple: "/logo.webp",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#003BC4",
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
