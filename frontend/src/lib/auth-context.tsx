import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { getOAuthRedirectUrl, getSupabase, type OAuthProvider } from './supabase'

interface AuthContextValue {
  user: User | null
  session: Session | null
  loading: boolean
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = getSupabase()
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
    const { error } = await getSupabase().auth.signInWithPassword({ email, password })
    return error ? error.message : null
  }

  const signUp = async (email: string, password: string): Promise<string | null> => {
    const { error } = await getSupabase().auth.signUp({
      email,
      password,
      options: { emailRedirectTo: getOAuthRedirectUrl() },
    })
    return error ? error.message : null
  }

  const signInWithProvider = async (provider: OAuthProvider): Promise<string | null> => {
    const { error } = await getSupabase().auth.signInWithOAuth({
      provider,
      options: { redirectTo: getOAuthRedirectUrl() },
    })
    return error ? error.message : null
  }

  const signOut = async (): Promise<void> => {
    await getSupabase().auth.signOut()
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
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
 * Globaler Login-Status: eingeloggt, wenn eine gültige Supabase-Identität
 * vorliegt. Ohne Identität greift der ausgeloggte Pfad.
 */
export function useLoggedIn(): { loggedIn: boolean; loading: boolean } {
  const { user, loading } = useAuth()
  return { loggedIn: user !== null, loading }
}
