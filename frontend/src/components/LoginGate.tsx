import { useEffect, type ReactNode } from 'react'
import { useLoggedIn } from '@/lib/auth-context'
import { useRouter } from '@/lib/router'

/**
 * Wiederverwendbares Login-Gate für geschützte Routen und Bereiche.
 *
 * Eingeloggt rendert es `children` unverändert. Ausgeloggt leitet es direkt
 * auf `/login` weiter, statt geschützte Inhalte anzudeuten und im Hintergrund
 * 401er zu produzieren. Während die Session noch geprüft wird, steht „Lädt…".
 */
export function LoginGate({ children }: { children: ReactNode }) {
  const { loggedIn, loading } = useLoggedIn()
  const { navigate } = useRouter()

  useEffect(() => {
    if (!loading && !loggedIn) navigate('/login')
  }, [loading, loggedIn, navigate])

  if (loading) {
    return <p className="py-16 text-center text-sm text-muted-foreground">Lädt…</p>
  }

  if (!loggedIn) {
    return (
      <p className="py-16 text-center text-sm text-muted-foreground">
        Weiterleitung zur Anmeldung…
      </p>
    )
  }

  return <>{children}</>
}
