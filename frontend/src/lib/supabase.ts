import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Supabase-Projekt dieses Workspaces (siehe OAuth-/OIDC-Endpoints:
// epknwdxauctkdcwpsslh.supabase.co). Der publishable/anon key kommt aus
// VITE_SUPABASE_ANON_KEY und wird nie ins Repo committet (.gitignore: .env).
const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://epknwdxauctkdcwpsslh.supabase.co'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export const isSupabaseConfigured = Boolean(
  SUPABASE_ANON_KEY && SUPABASE_ANON_KEY.trim().length > 0,
)

let client: SupabaseClient | null = null

/** Supabase-Client (wirft Fehler, wenn VITE_SUPABASE_ANON_KEY fehlt). */
export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase ist nicht konfiguriert (VITE_SUPABASE_ANON_KEY fehlt in .env).')
  }
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

/** Rücksprung-Ziel nach dem OAuth-/Auth-Flow: die Login-Seite auf localhost oder Produktions-Origin. */
export function getOAuthRedirectUrl(): string {
  if (import.meta.env.VITE_REDIRECT_URL) {
    return import.meta.env.VITE_REDIRECT_URL
  }
  if (typeof window !== 'undefined') {
    // Falls lokal aufgerufen (localhost oder 127.0.0.1), immer explizit http://localhost:<port>/login nutzen
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      const port = window.location.port ? `:${window.location.port}` : ':1337'
      return `http://localhost${port}/login`
    }
    return `${window.location.origin}/login`
  }
  return 'http://localhost:1337/login'
}

/** Access-Token der aktuellen Session für `Authorization: Bearer <token>`. */
export async function getAccessToken(): Promise<string | null> {
  if (!isSupabaseConfigured) return null
  const { data } = await getSupabase().auth.getSession()
  return data.session?.access_token ?? null
}
