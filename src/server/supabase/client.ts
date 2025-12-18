import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  console.warn("SUPABASE_URL is not set; Supabase client will not be usable.");
}

if (!SUPABASE_SERVICE_KEY) {
  console.warn(
    "SUPABASE_SERVICE_ROLE_KEY is not set; Supabase client will not be usable."
  );
}

export const supabaseServerClient = () => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error("Supabase environment variables are missing.");
  }
  return createClient<Database, "public">(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
};

