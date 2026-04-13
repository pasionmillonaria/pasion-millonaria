"use client";

import { createContext, useContext, useState } from "react";

export type Rol = "admin" | "empleado";

export interface Profile {
  key: string;        // "admin" | "emp1" | "emp2" | "emp3"
  nombre: string;
  rol: Rol;
  color: string;      // color de fondo del avatar
  emoji: string;
}

export const PERFILES: Profile[] = [
  { key: "admin",  nombre: "Admin",      rol: "admin",    color: "#001E6E", emoji: "🏆" },
  { key: "emp1",   nombre: "Empleados", rol: "empleado", color: "#001E6E", emoji: "⚽" }
];

interface ProfileContextType {
  profile: Profile | null;
  setProfile: (p: Profile | null) => void;
  isAdmin: boolean;
}

const ProfileContext = createContext<ProfileContextType>({
  profile: null,
  setProfile: () => {},
  isAdmin: false,
});

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);

  return (
    <ProfileContext.Provider value={{
      profile,
      setProfile,
      isAdmin: profile?.rol === "admin",
    }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  return useContext(ProfileContext);
}
