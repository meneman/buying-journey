import { ThemeProvider } from 'next-themes'
import { AppShell } from '@/components/layout/AppShell'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { JourneyDataProvider } from '@/lib/journey-data-context'
import { PageSyncProvider } from '@/lib/page-sync-context'
import { RouterProvider, useJourney, useRouter } from '@/lib/router'
import { Compare } from '@/pages/Compare'
import { Dashboard } from '@/pages/Dashboard'
import { Feedback } from '@/pages/Feedback'
import { Specs } from '@/pages/Specs'

function Routes() {
  const { pathname } = useRouter()
  const journey = useJourney()

  if (pathname === '/feedback') {
    return <Feedback />
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
        <PageSyncProvider>
          <TooltipProvider>
            <AppShell>
              <Routes />
            </AppShell>
            <Toaster position="bottom-right" />
          </TooltipProvider>
        </PageSyncProvider>
      </RouterProvider>
    </ThemeProvider>
  )
}

export default App
