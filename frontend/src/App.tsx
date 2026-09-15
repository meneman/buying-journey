import { ThemeProvider } from 'next-themes'
import { AppShell } from '@/components/layout/AppShell'
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
import { Settings } from '@/pages/Settings'
import { Specs } from '@/pages/Specs'

function Routes() {
  const { pathname, search } = useRouter()
  const journey = useJourney()

  if (pathname === '/login') {
    return <Login />
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
