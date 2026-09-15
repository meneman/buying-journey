import { useEffect } from 'react'
import { ThemeProvider } from 'next-themes'
import { AppShell } from '@/components/layout/AppShell'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider, useLoggedIn } from '@/lib/auth-context'
import { JourneyDataProvider } from '@/lib/journey-data-context'
import { PageSyncProvider } from '@/lib/page-sync-context'
import { RouterProvider, useJourney, useRouter } from '@/lib/router'
import { Compare } from '@/pages/Compare'
import { Dashboard } from '@/pages/Dashboard'
import { Feedback } from '@/pages/Feedback'
import { JourneysOverview } from '@/pages/JourneysOverview'
import { Login } from '@/pages/Login'
import { Settings } from '@/pages/Settings'
import { Specs } from '@/pages/Specs'

function Routes() {
  const { pathname, search, navigate } = useRouter()
  const journey = useJourney()
  const { loggedIn, loading } = useLoggedIn()

  // Ausgeloggt ist nur die Übersicht (`/` ohne `?journey=`) und `/login` erlaubt.
  const allowedLoggedOut = pathname === '/login' || (pathname === '/' && !search.get('journey'))

  useEffect(() => {
    if (!loading && !loggedIn && !allowedLoggedOut) navigate('/')
  }, [loading, loggedIn, allowedLoggedOut, navigate])

  if (pathname === '/login') {
    return <Login />
  }

  if (loading) {
    return <p className="py-16 text-center text-sm text-muted-foreground">Lädt…</p>
  }

  if (!loggedIn && !allowedLoggedOut) {
    return null
  }

  if (pathname === '/feedback') {
    return <Feedback />
  }

  if (pathname === '/einstellungen') {
    return <Settings />
  }

  // `/` ohne `?journey=`-Param ist die Übersicht, mit Param das Detail-Dashboard.
  if (pathname === '/' && !search.get('journey')) {
    return <JourneysOverview />
  }

  return (
    <JourneyDataProvider journey={journey} key={journey}>
      {pathname === '/vergleich' ? <Compare /> : pathname === '/eigenschaften' ? <Specs /> : <Dashboard />}
    </JourneyDataProvider>
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
