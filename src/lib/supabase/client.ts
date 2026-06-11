import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";

// Singleton: una sola instancia del cliente de navegador por contexto.
// Crear un cliente nuevo en cada render instancia múltiples GoTrueClient
// sobre la misma storage key ("Multiple GoTrueClient instances detected").
let browserClient: SupabaseClient<Database> | undefined;

export function createClient() {
  if (browserClient) return browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Fallback para build estático cuando las vars aún no están configuradas
  if (!url || !url.startsWith("http")) {
    browserClient = createSupabaseClient<Database>(
      "https://placeholder.supabase.co",
      "placeholder-key"
    );
    return browserClient;
  }

  browserClient = createSupabaseClient<Database>(url, key!);
  return browserClient;
}
