export const dynamic = "force-dynamic";

import { Toaster } from "react-hot-toast";
import NavBar from "@/components/NavBar";
import { UserProvider } from "@/lib/context/UserContext";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <UserProvider>
      <div className="min-h-screen bg-gray-50 pb-20">
        {children}
      </div>
      <NavBar />
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 3000,
          style: {
            borderRadius: "12px",
            fontWeight: "500",
            fontSize: "14px",
          },
          success: {
            iconTheme: { primary: "#003366", secondary: "white" },
          },
        }}
      />
    </UserProvider>
  );
}
