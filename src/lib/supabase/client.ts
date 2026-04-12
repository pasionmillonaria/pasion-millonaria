import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Fallback para build estático cuando las vars aún no están configuradas
  if (!url || !url.startsWith("http")) {
    return createSupabaseClient<Database>(
      "https://placeholder.supabase.co",
      "placeholder-key"
    );
  }

  return createSupabaseClient<Database>(url, key!);
}
