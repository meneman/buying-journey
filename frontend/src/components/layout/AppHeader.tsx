import { ExternalLink, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { JourneySwitcher } from './JourneySwitcher'
import { NavTabs } from './NavTabs'
import { ThemeToggle } from './ThemeToggle'
import { usePageSync } from '@/lib/page-sync-context'
import { useJourney } from '@/lib/router'
import { useSilverBulletUrl } from '@/lib/use-silverbullet-url'
import { cn } from '@/lib/utils'

const STATUS_COPY: Record<string, { label: string; dot: string }> = {
  loading: { label: 'Lädt…', dot: 'bg-hiviz' },
  saving: { label: 'Speichert…', dot: 'bg-hiviz' },
  synced: { label: 'Synchronisiert', dot: 'bg-celeste' },
  error: { label: 'Verbindungsfehler', dot: 'bg-rust' },
}

function RouteMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0">
      <path
        d="M3 19 L8 13 L13 15 L20 5"
        stroke="var(--celeste)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="3" cy="19" r="2.2" fill="var(--celeste)" />
      <circle cx="20" cy="5" r="2.2" fill="var(--rust)" />
    </svg>
  )
}

export function AppHeader() {
  const { status, reload } = usePageSync()
  const journey = useJourney()
  const silverBulletUrl = useSilverBulletUrl()
  const copy = STATUS_COPY[status]

  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2.5">
          <RouteMark />
          <span className="font-heading text-lg leading-none font-semibold tracking-tight">JourneyPath</span>
        </div>

        <JourneySwitcher />

        <div className="order-last w-full sm:order-none sm:w-auto">
          <NavTabs />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden items-center gap-1.5 rounded-full border border-border px-2.5 py-1 font-mono text-[11px] text-muted-foreground sm:flex">
            <span className={cn('size-1.5 rounded-full', copy.dot)} />
            {copy.label}
          </div>
          <Button variant="ghost" size="icon-sm" title="Daten neu laden" onClick={reload}>
            <RefreshCw className="size-4" />
          </Button>
          <ThemeToggle />
          {silverBulletUrl && (
            <Button variant="outline" size="sm" asChild>
              <a href={`${silverBulletUrl}/${encodeURIComponent(journey)}.buying-journey`} target="_blank" rel="noreferrer">
                <ExternalLink className="size-3.5" />
                SilverBullet
              </a>
            </Button>
          )}
        </div>
      </div>
    </header>
  )
}
