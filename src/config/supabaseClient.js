import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "[supabaseClient] VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY no definidas. " +
      "Social login y funciones de Supabase Auth no estarán disponibles."
  );
}

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        // AM: El callback OAuth se resuelve manualmente en /auth/callback
        // para evitar lecturas repetitivas y loops de exchange.
        detectSessionInUrl: false,
      },
    })
  : null;
