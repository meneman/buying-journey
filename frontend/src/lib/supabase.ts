import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Supabase-Projekt dieses Workspaces (siehe OAuth-/OIDC-Endpoints:
// epknwdxauctkdcwpsslh.supabase.co). Der publishable/anon key kommt aus
// VITE_SUPABASE_ANON_KEY und wird nie ins Repo committet (.gitignore: .env).
const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://epknwdxauctkdcwpsslh.supabase.co'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export const isSupabaseConfigured = SUPABASE_ANON_KEY.length > 0

let client: SupabaseClient | null = null

/** Supabase-Client — oder null, wenn VITE_SUPABASE_ANON_KEY fehlt. */
export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  }
  return client
}

/** OAuth-Anbieter, die die App per Supabase anbietet (Dashboard → Authentication → Providers). */
export type OAuthProvider = 'google' | 'apple'

export const OAUTH_PROVIDERS: readonly OAuthProvider[] = ['google', 'apple']

export const OAUTH_PROVIDER_LABEL: Record<OAuthProvider, string> = {
  google: 'Google',
  apple: 'Apple',
}

/** Rücksprung-Ziel nach dem OAuth-Flow: die Login-Seite (fängt Provider-Fehler ab). */
export function getOAuthRedirectUrl(): string {
  return `${window.location.origin}/login`
}

/** Access-Token der aktuellen Session für `Authorization: Bearer <token>`. */
export async function getAccessToken(): Promise<string | null> {
  const supabase = getSupabase()
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}
