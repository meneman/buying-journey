import { useEffect, useState } from 'react'
import { ChevronDown, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { fetchJourneys } from '@/lib/api'
import { iconForJourney } from '@/lib/journey-category'
import { useJourney, useRouter } from '@/lib/router'

const RECENT_KEY = 'recent_journeys'

function readRecent(): string[] {
  try {
    return JSON.parse(window.localStorage.getItem(RECENT_KEY) || '[]')
  } catch {
    return []
  }
}

function rememberRecent(journey: string) {
  const recent = readRecent()
  if (!recent.includes(journey)) {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify([...recent, journey]))
  }
}

export function JourneySwitcher() {
  const journey = useJourney()
  const { pathname, navigate } = useRouter()
  const [journeys, setJourneys] = useState<string[]>(['bike'])
  const [createOpen, setCreateOpen] = useState(false)
  const [newId, setNewId] = useState('')

  useEffect(() => {
    rememberRecent(journey)
  }, [journey])

  useEffect(() => {
    let cancelled = false
    fetchJourneys()
      .then((list) => {
        if (!cancelled) setJourneys(list.includes(journey) ? list : [...list, journey])
      })
      .catch(() => {
        const recent = readRecent()
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

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const id = newId.trim().toLowerCase().replace(/[^a-z0-9.-]/g, '')
    if (!id) return
    setCreateOpen(false)
    setNewId('')
    navigate(`/?journey=${encodeURIComponent(id)}`)
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5">
            <Icon className="size-3.5 text-celeste" />
            {journey}
            <ChevronDown className="size-3 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>Meine Kaufreisen</DropdownMenuLabel>
          {journeys.map((j) => {
            const JIcon = iconForJourney(j)
            return (
              <DropdownMenuItem key={j} onSelect={() => switchTo(j)} className={j === journey ? 'bg-accent' : ''}>
                <JIcon className="size-3.5" />
                {j}
              </DropdownMenuItem>
            )
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setCreateOpen(true)}>
            <Plus className="size-3.5" />
            Neue Kaufreise…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Neue Kaufreise anlegen</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="newJourneyId">Kürzel / Name</Label>
              <Input
                id="newJourneyId"
                autoFocus
                required
                pattern="[a-z0-9.-]+"
                placeholder="z.B. laptop, fernseher"
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Wird für den Dateinamen verwendet (z.B. laptop.buying-journey.md)
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Abbrechen
              </Button>
              <Button type="submit">Starten</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
