import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'VITE_SUPABASE_SERVICE_ROLE_KEY must not be set. The service role key is server-only.',
  )
}

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    'Missing Supabase env vars. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env',
  )
}

/** Browser + staff client: HTTPS Data API (already pooled). Not a Postgres TCP URL. */
export const supabase = createClient<Database>(supabaseUrl, supabasePublishableKey)
