import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_KEY as string | undefined

/**
 * Null when the project is not configured, and every caller treats that as
 * "stay local". The app has to keep working as a plain offline stopwatch when
 * there is no server behind it.
 */
export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } }) : null

export const isConfigured = supabase !== null
