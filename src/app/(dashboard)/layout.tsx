"use client";

export const dynamic = "force-dynamic";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Toaster } from "react-hot-toast";
import NavBar from "@/components/NavBar";
import { useProfile } from "@/lib/context/ProfileContext";
import Spinner from "@/components/ui/Spinner";

function DashboardGuard({ children }: { children: React.ReactNode }) {
  const { profile } = useProfile();
  const router = useRouter();

  useEffect(() => {
    if (profile === null) {
      router.replace("/");
    }
  }, [profile, router]);

  if (profile === null) return <Spinner className="h-screen" />;

  return (
    <>
      <div className="min-h-screen bg-gray-50 pb-20">{children}</div>
      <NavBar />
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 3000,
          style: { borderRadius: "12px", fontWeight: "500", fontSize: "14px" },
          success: { iconTheme: { primary: "#003366", secondary: "white" } },
        }}
      />
    </>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <DashboardGuard>{children}</DashboardGuard>;
}
