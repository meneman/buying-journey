import { useEffect, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronDown, faPlus } from '@fortawesome/free-solid-svg-icons'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { fetchJourneys } from '@/lib/api'
import { iconForJourney } from '@/lib/journey-category'
import { readRecentJourneys, rememberRecentJourney } from '@/lib/journey-id'
import { useJourney, useRouter } from '@/lib/router'
import { CreateJourneyDialog } from './CreateJourneyDialog'

export function JourneySwitcher() {
  const journey = useJourney()
  const { pathname, navigate } = useRouter()
  const [journeys, setJourneys] = useState<string[]>(['bike'])
  const [createOpen, setCreateOpen] = useState(false)

  useEffect(() => {
    rememberRecentJourney(journey)
  }, [journey])

  useEffect(() => {
    let cancelled = false
    fetchJourneys()
      .then((list) => {
        if (!cancelled) setJourneys(list.includes(journey) ? list : [...list, journey])
      })
      .catch(() => {
        const recent = readRecentJourneys()
        if (!recent.includes('bike')) recent.push('bike')
        if (!recent.includes(journey)) recent.push(journey)
        if (!cancelled) setJourneys(recent)
      })
    return () => {
      cancelled = true
    }
  }, [journey])

  const Icon = iconForJourney(journey)

  function switchTo(next: string) {
    navigate(`${pathname}?journey=${encodeURIComponent(next)}`)
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5">
            <FontAwesomeIcon icon={Icon} className="size-3.5 text-celeste" />
            {journey}
            <FontAwesomeIcon icon={faChevronDown} className="size-3 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>Meine Kaufreisen</DropdownMenuLabel>
          {journeys.map((j) => {
            const JIcon = iconForJourney(j)
            return (
              <DropdownMenuItem key={j} onSelect={() => switchTo(j)} className={j === journey ? 'bg-accent' : ''}>
                <FontAwesomeIcon icon={JIcon} className="size-3.5" />
                {j}
              </DropdownMenuItem>
            )
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setCreateOpen(true)}>
            <FontAwesomeIcon icon={faPlus} className="size-3.5" />
            Neue Kaufreise…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateJourneyDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  )
}
