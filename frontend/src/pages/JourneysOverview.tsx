import { useEffect, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowRight, faPlus } from '@fortawesome/free-solid-svg-icons'
import { Link } from '@/components/Link'
import { CreateJourneyDialog } from '@/components/layout/CreateJourneyDialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { fetchJourneys } from '@/lib/api'
import { iconForJourney } from '@/lib/journey-category'
import { readRecentJourneys } from '@/lib/journey-id'

/**
 * Startseite ohne `?journey=`-Param: listet alle Journeys 1:1 aus
 * `GET /api/journeys` (backend-seitig slug-sortiert, mind. `bike`).
 * Kein Backend-Umbau, keine Detail-Calls — nur Name/Icon + Öffnen-Link.
 */
export function JourneysOverview() {
  const [journeys, setJourneys] = useState<string[] | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchJourneys()
      .then((list) => {
        if (!cancelled) setJourneys(list)
      })
      .catch(() => {
        const recent = readRecentJourneys()
        if (!recent.includes('bike')) recent.push('bike')
        if (!cancelled) setJourneys(recent)
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

      {journeys === null ? (
        <p className="text-sm text-muted-foreground">Lädt…</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {journeys.map((j) => {
            const JIcon = iconForJourney(j)
            return (
              <Link key={j} to={`/?journey=${encodeURIComponent(j)}`}>
                <Card size="sm" className="transition-colors hover:border-celeste">
                  <CardContent className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-full bg-muted">
                      <FontAwesomeIcon icon={JIcon} className="size-5 text-celeste" />
                    </span>
                    <span className="flex-1 truncate font-heading font-medium">{j}</span>
                    <span className="flex items-center gap-1 text-sm text-muted-foreground">
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
