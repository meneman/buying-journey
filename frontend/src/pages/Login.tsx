import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/lib/auth-context'
import { useRouter } from '@/lib/router'

export function Login() {
  const { user, loading, configured, signIn, signUp, signOut } = useAuth()
  const { navigate } = useRouter()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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

  return (
    <div className="mx-auto max-w-md py-16">
      <Card>
        <CardHeader>
          <CardTitle>{mode === 'signin' ? 'Anmelden' : 'Registrieren'}</CardTitle>
          <CardDescription>
            {mode === 'signin'
              ? 'Melde dich mit E-Mail und Passwort an.'
              : 'Lege ein neues Konto mit E-Mail und Passwort an.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
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
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={busy}>
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
