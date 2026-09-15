import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/lib/auth-context'
import { useRouter } from '@/lib/router'
import { OAUTH_PROVIDERS, OAUTH_PROVIDER_LABEL, type OAuthProvider } from '@/lib/supabase'

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  )
}

function AppleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 384 512" aria-hidden="true" fill="currentColor">
      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
    </svg>
  )
}

const PROVIDER_ICON: Record<OAuthProvider, () => React.JSX.Element> = {
  google: GoogleIcon,
  apple: AppleIcon,
}

export function Login() {
  const { user, loading, configured, signIn, signUp, signInWithProvider, signOut } = useAuth()
  const { navigate, search } = useRouter()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [oauthBusy, setOauthBusy] = useState<OAuthProvider | null>(null)
  // Fehler aus dem OAuth-Rücksprung (?error_description=… / ?error=…).
  const callbackError = search.get('error_description') || search.get('error')

  if (loading) {
    return (
      <div className="mx-auto max-w-md py-16">
        <Card>
          <CardContent>Lädt…</CardContent>
        </Card>
      </div>
    )
  }

  if (!configured) {
    return (
      <div className="mx-auto max-w-md py-16">
        <Card>
          <CardHeader>
            <CardTitle>Anmeldung nicht verfügbar</CardTitle>
            <CardDescription>
              Es ist kein Supabase-Key hinterlegt. Lege `VITE_SUPABASE_ANON_KEY` in `frontend/.env`
              an (siehe `.env.example` im Projekt-Root) und starte den Dev-Server neu.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  if (user) {
    return (
      <div className="mx-auto max-w-md py-16">
        <Card>
          <CardHeader>
            <CardTitle>Angemeldet</CardTitle>
            <CardDescription>{user.email}</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Button onClick={() => navigate('/')}>Zur Übersicht</Button>
            <Button variant="outline" onClick={() => void signOut()}>
              Abmelden
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const message =
      mode === 'signin' ? await signIn(email.trim(), password) : await signUp(email.trim(), password)
    setBusy(false)
    if (message) {
      setError(message)
    } else {
      navigate('/')
    }
  }

  const oauth = async (provider: OAuthProvider) => {
    setOauthBusy(provider)
    setError(null)
    const message = await signInWithProvider(provider)
    setOauthBusy(null)
    // Im Erfolg hat der Browser die App bereits zum Anbieter verlassen;
    // nur bei Fehler bleiben wir hier und zeigen die Nachricht.
    if (message) setError(message)
  }

  return (
    <div className="mx-auto max-w-md py-16">
      <Card>
        <CardHeader>
          <CardTitle>{mode === 'signin' ? 'Anmelden' : 'Registrieren'}</CardTitle>
          <CardDescription>
            {mode === 'signin'
              ? 'Melde dich mit deinem Konto an.'
              : 'Lege ein neues Konto an.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {(callbackError || error) && (
            <p className="text-sm text-destructive">{error ?? callbackError}</p>
          )}
          <div className="flex flex-col gap-2">
            {OAUTH_PROVIDERS.map((provider) => {
              const Icon = PROVIDER_ICON[provider]
              return (
                <Button
                  key={provider}
                  type="button"
                  variant="outline"
                  disabled={busy || oauthBusy !== null}
                  onClick={() => void oauth(provider)}
                >
                  <Icon />
                  {oauthBusy === provider
                    ? 'Weiterleitung…'
                    : `Weiter mit ${OAUTH_PROVIDER_LABEL[provider]}`}
                </Button>
              )
            })}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" aria-hidden="true" />
            oder mit E-Mail
            <span className="h-px flex-1 bg-border" aria-hidden="true" />
          </div>
          <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="login-email">E-Mail</Label>
              <Input
                id="login-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="login-password">Passwort</Label>
              <Input
                id="login-password"
                type="password"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                required
                minLength={6}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            <Button type="submit" disabled={busy || oauthBusy !== null}>
              {busy ? 'Einen Moment…' : mode === 'signin' ? 'Anmelden' : 'Registrieren'}
            </Button>
            <Button
              type="button"
              variant="link"
              onClick={() => {
                setMode(mode === 'signin' ? 'signup' : 'signin')
                setError(null)
              }}
            >
              {mode === 'signin' ? 'Noch kein Konto? Jetzt registrieren' : 'Schon registriert? Anmelden'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
