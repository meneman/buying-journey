import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { getOAuthRedirectUrl, getSupabase, isSupabaseConfigured, type OAuthProvider } from './supabase'

interface AuthContextValue {
  user: User | null
  session: Session | null
  loading: boolean
  configured: boolean
  /** Meldet an, gibt bei Fehler die Nachricht zurück (sonst null). */
  signIn: (email: string, password: string) => Promise<string | null>
  /** Registriert, gibt bei Fehler die Nachricht zurück (sonst null). */
  signUp: (email: string, password: string) => Promise<string | null>
  /**
   * Startet den OAuth-Flow (Google/Apple): leitet zum Anbieter weiter.
   * Gibt bei Fehler die Nachricht zurück (sonst null) — im Erfolg verlässt
   * die Seite die App; nach dem Redirect liest supabase-js die Session aus
   * der URL (`detectSessionInUrl`) und `onAuthStateChange` setzt den Nutzer.
   */
  signInWithProvider: (provider: OAuthProvider) => Promise<string | null>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const NOT_CONFIGURED = 'Supabase ist nicht konfiguriert (VITE_SUPABASE_ANON_KEY fehlt).'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = getSupabase()
    if (!supabase) {
      setLoading(false)
      return
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setUser(data.session?.user ?? null)
      setLoading(false)
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setUser(nextSession?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (email: string, password: string): Promise<string | null> => {
    const supabase = getSupabase()
    if (!supabase) return NOT_CONFIGURED
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error ? error.message : null
  }

  const signUp = async (email: string, password: string): Promise<string | null> => {
    const supabase = getSupabase()
    if (!supabase) return NOT_CONFIGURED
    const { error } = await supabase.auth.signUp({ email, password })
    return error ? error.message : null
  }

  const signInWithProvider = async (provider: OAuthProvider): Promise<string | null> => {
    const supabase = getSupabase()
    if (!supabase) return NOT_CONFIGURED
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: getOAuthRedirectUrl() },
    })
    return error ? error.message : null
  }

  const signOut = async (): Promise<void> => {
    await getSupabase()?.auth.signOut()
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        configured: isSupabaseConfigured,
        signIn,
        signUp,
        signInWithProvider,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}

/**
 * Globaler Login/Logout-Schalter: einzige Quelle dafür, ob die volle
 * Navigation sichtbar ist. Ohne konfiguriertes Supabase gibt es kein Auth —
 * dann ist alles sichtbar (wie eingeloggt), damit nichts ausgesperrt wird.
 */
export function useLoggedIn(): { loggedIn: boolean; loading: boolean } {
  const { user, loading, configured } = useAuth()
  return { loggedIn: !configured || user !== null, loading }
}
