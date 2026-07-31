/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL. Optional – without it the app runs offline-only. */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase anon key (safe for the browser – protected by row level security). */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
