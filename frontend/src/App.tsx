import { ThemeProvider } from 'next-themes'
import { AppShell } from '@/components/layout/AppShell'
import { LoginGate } from '@/components/LoginGate'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/lib/auth-context'
import { JourneyDataProvider } from '@/lib/journey-data-context'
import { PageSyncProvider } from '@/lib/page-sync-context'
import { RouterProvider, useJourney, useRouter } from '@/lib/router'
import { isSupabaseConfigured } from '@/lib/supabase'
import { Compare } from '@/pages/Compare'
import { Dashboard } from '@/pages/Dashboard'
import { Feedback } from '@/pages/Feedback'
import { JourneysOverview } from '@/pages/JourneysOverview'
import { Login } from '@/pages/Login'
import { Mcp } from '@/pages/Mcp'
import { Settings } from '@/pages/Settings'
import { Specs } from '@/pages/Specs'

function Routes() {
  const { pathname, search } = useRouter()
  const journey = useJourney()

  // Öffentlich ohne Login: `/login` sowie die Übersicht (`/` ohne
  // `?journey=` — die zeigt ausgeloggt allgemeine Infos mit Login-CTA).
  if (pathname === '/login') {
    return <Login />
  }

  // `/` ohne `?journey=`-Param ist die Übersicht, mit Param das Detail-Dashboard.
  if (pathname === '/' && !search.get('journey')) {
    return <JourneysOverview />
  }

  // Alles andere braucht einen Login — das Gate leitet ausgeloggt direkt auf
  // `/login` weiter (der MCP-Button im Header bleibt dabei immer sichtbar).
  return (
    <LoginGate>
      {pathname === '/mcp' ? (
        <Mcp />
      ) : pathname === '/feedback' ? (
        <Feedback />
      ) : pathname === '/einstellungen' ? (
        <Settings />
      ) : (
        <JourneyDataProvider journey={journey} key={journey}>
          {pathname === '/vergleich' ? (
            <Compare />
          ) : pathname === '/eigenschaften' ? (
            <Specs />
          ) : (
            <Dashboard />
          )}
        </JourneyDataProvider>
      )}
    </LoginGate>
  )
}

function MissingConfigScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-background text-foreground">
      <div className="w-full max-w-md rounded-xl border border-destructive/40 bg-card p-6 shadow-xl">
        <h1 className="font-heading text-xl font-bold text-destructive mb-2">
          Supabase nicht konfiguriert
        </h1>
        <p className="text-sm text-muted-foreground mb-4">
          Die App kann ohne Supabase-Anbindung nicht betrieben werden. Hinterlege den Anon-Key in deiner{' '}
          <code className="font-mono font-semibold text-foreground">.env</code>-Datei:
        </p>
        <div className="rounded-md bg-muted p-3 font-mono text-xs text-foreground border border-border overflow-x-auto space-y-1">
          <div>VITE_SUPABASE_ANON_KEY=dein_anon_key</div>
          <div className="text-muted-foreground"># VITE_SUPABASE_URL=https://epknwdxauctkdcwpsslh.supabase.co</div>
        </div>
        <p className="text-xs text-muted-foreground mt-4">
          Starte den Dev-Server nach dem Eintragen neu.
        </p>
      </div>
    </div>
  )
}

function App() {
  if (!isSupabaseConfigured) {
    return (
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <MissingConfigScreen />
      </ThemeProvider>
    )
  }

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <RouterProvider>
        <AuthProvider>
        <PageSyncProvider>
          <TooltipProvider>
            <AppShell>
              <Routes />
            </AppShell>
            <Toaster position="bottom-right" />
          </TooltipProvider>
        </PageSyncProvider>
        </AuthProvider>
      </RouterProvider>
    </ThemeProvider>
  )
}

export default App
