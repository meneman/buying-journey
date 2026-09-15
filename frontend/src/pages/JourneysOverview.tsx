import { useEffect, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowRight, faPlus } from '@fortawesome/free-solid-svg-icons'
import { Link } from '@/components/Link'
import { CreateJourneyDialog } from '@/components/layout/CreateJourneyDialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { fetchJourneyConfigs, fetchJourneys } from '@/lib/api'
import { iconForJourney } from '@/lib/journey-category'
import { readRecentJourneys } from '@/lib/journey-id'
import type { JourneyConfig } from '@/lib/types'

function fallbackConfigs(slugs: string[]): JourneyConfig[] {
  return slugs.map((slug) => ({
    slug,
    name: slug,
    description: '',
    category: '',
    currency: '',
    sectionTitle: '',
    listTitle: '',
    createdAt: '',
    updatedAt: '',
  }))
}

/**
 * Startseite ohne `?journey=`-Param: listet alle Journey-Configs 1:1 aus
 * `GET /api/journey-configs` (backend-seitig slug-sortiert, mind. `bike`) —
 * mit Anzeigename, Kategorie-Icon und Beschreibung je Karte. Fällt bei
 * Backend-Fehler auf die reine Slug-Liste (`GET /api/journeys`) bzw. lokale
 * `recent_journeys` zurück.
 */
export function JourneysOverview() {
  const [configs, setConfigs] = useState<JourneyConfig[] | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchJourneyConfigs()
      .then((list) => {
        if (!cancelled) setConfigs(list)
      })
      .catch(() => {
        fetchJourneys()
          .then((slugs) => {
            if (!cancelled) setConfigs(fallbackConfigs(slugs))
          })
          .catch(() => {
            const recent = readRecentJourneys()
            if (!recent.includes('bike')) recent.push('bike')
            if (!cancelled) setConfigs(fallbackConfigs(recent))
          })
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-heading text-lg font-semibold">Meine Kaufreisen</h2>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <FontAwesomeIcon icon={faPlus} className="size-4" />
          Neue Kaufreise
        </Button>
      </div>

      {configs === null ? (
        <p className="text-sm text-muted-foreground">Lädt…</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {configs.map((c) => {
            const JIcon = iconForJourney(c.slug, c.category)
            return (
              <Link key={c.slug} to={`/?journey=${encodeURIComponent(c.slug)}`}>
                <Card size="sm" className="transition-colors hover:border-celeste">
                  <CardContent className="flex items-center gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
                      <FontAwesomeIcon icon={JIcon} className="size-5 text-celeste" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-heading font-medium">{c.name || c.slug}</span>
                      {c.slug !== c.name && (
                        <span className="block truncate font-mono text-xs text-muted-foreground">{c.slug}</span>
                      )}
                      {c.description && (
                        <span className="block truncate text-sm text-muted-foreground">{c.description}</span>
                      )}
                    </span>
                    <span className="flex shrink-0 items-center gap-1 text-sm text-muted-foreground">
                      Öffnen
                      <FontAwesomeIcon icon={faArrowRight} className="size-4" />
                    </span>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}

      <CreateJourneyDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}
