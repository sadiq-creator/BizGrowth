import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

const readJwtRole = (token) => {
  try {
    const [, payload] = String(token || '').split('.')

    if (!payload || !globalThis.atob) {
      return ''
    }

    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')

    return JSON.parse(globalThis.atob(padded))?.role || ''
  } catch {
    return ''
  }
}

const keyRole = readJwtRole(supabaseAnonKey)
const hasServiceRoleKey = keyRole === 'service_role'

export const supabaseConfigError = hasServiceRoleKey
  ? 'Remove the Supabase service_role key from .env. Use the anon key only.'
  : ''

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey && !hasServiceRoleKey)

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null
