import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/src/types/database";

let browserClient: SupabaseClient<Database, "public"> | null = null;

export const getBrowserSupabaseClient = (): SupabaseClient<Database, "public"> | null => {
  if (typeof window === "undefined") return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;

  if (!browserClient) {
    browserClient = createClient<Database, "public">(url, anonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
      },
      global: {
        headers: {
          "x-client-info": "prediction-market-ru-web",
        },
      },
    });
  }

  return browserClient;
};
