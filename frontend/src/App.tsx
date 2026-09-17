import { ThemeProvider } from 'next-themes'
import { AppShell } from '@/components/layout/AppShell'
import { LoginGate } from '@/components/LoginGate'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/lib/auth-context'
import { JourneyDataProvider } from '@/lib/journey-data-context'
import { PageSyncProvider } from '@/lib/page-sync-context'
import { RouterProvider, useJourney, useRouter } from '@/lib/router'
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

function App() {
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
