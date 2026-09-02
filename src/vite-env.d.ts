/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string
  readonly VITE_SITE_URL?: string
  readonly VITE_VAPID_PUBLIC_KEY?: string
  readonly VITE_SENTRY_DSN?: string
  /** Must never be set — service role is server-only. */
  readonly VITE_SUPABASE_SERVICE_ROLE_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
