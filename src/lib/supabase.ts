import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase client, created only when the project is configured.
 * Without configuration the app still works fully in local (offline) mode,
 * so a missing backend is never a hard failure.
 */

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isCloudConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = isCloudConfigured
  ? createClient(url!, anonKey!, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null;

/** Narrowing helper for the places that require a configured backend. */
export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      'Supabase ist nicht konfiguriert (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY fehlen).',
    );
  }
  return supabase;
}
