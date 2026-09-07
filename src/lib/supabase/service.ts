import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

// Bypasses RLS with the service role key. Only for trusted server-side
// contexts with no user session: inbound webhooks, background jobs. Never
// import this from code reachable by a request that carries user input
// without its own authorization check.
export function createServiceClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
