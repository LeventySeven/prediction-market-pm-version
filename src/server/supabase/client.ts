import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  console.warn("SUPABASE_URL is not set; Supabase client will not be usable.");
}

if (!SUPABASE_ANON_KEY) {
  console.warn("SUPABASE_ANON_KEY is not set; Supabase user client will fail.");
}

if (!SUPABASE_SERVICE_KEY) {
  console.warn(
    "SUPABASE_SERVICE_ROLE_KEY is not set; Supabase service client will not be usable."
  );
}

export const createSupabaseUserClient = (accessToken?: string) => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Supabase environment variables are missing.");
  }

  const headers =
    accessToken && accessToken.length > 0
      ? {
          Authorization: `Bearer ${accessToken}`,
        }
      : undefined;

  return createClient<Database, "public">(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers,
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
};

let serviceClient: SupabaseClient<Database, "public"> | null = null;

export const getSupabaseServiceClient = () => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error("Supabase environment variables are missing.");
  }

  if (!serviceClient) {
    serviceClient = createClient<Database, "public">(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return serviceClient;
};

