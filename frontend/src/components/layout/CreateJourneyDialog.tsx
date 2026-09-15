import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { createJourney } from '@/lib/api'
import { normalizeJourneyId } from '@/lib/journey-id'
import { useRouter } from '@/lib/router'
import { JOURNEY_CATEGORIES } from '@/lib/types'

interface CreateJourneyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Shared "Neue Kaufreise" dialog: Kürzel (Pflicht) plus Basis-Eigenschaften
 * (Anzeigename, Kategorie, Beschreibung), gleiche Slug-Normalisierung überall.
 * Legt per `POST /api/journeys` explizit an und navigiert bei Erfolg ins
 * Dashboard — kein Lazy-Create über Navigation mehr.
 */
export function CreateJourneyDialog({ open, onOpenChange }: CreateJourneyDialogProps) {
  const { navigate } = useRouter()
  const [slug, setSlug] = useState('')
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  function reset() {
    setSlug('')
    setName('')
    setCategory('')
    setDescription('')
    setSaving(false)
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const id = normalizeJourneyId(slug)
    if (!id || saving) return
    setSaving(true)
    createJourney({
      slug: id,
      ...(name.trim() ? { name: name.trim() } : {}),
      ...(category ? { category } : {}),
      ...(description.trim() ? { description: description.trim() } : {}),
    })
      .then(({ slug: created }) => {
        onOpenChange(false)
        reset()
        navigate(`/?journey=${encodeURIComponent(created)}`)
        toast.success(`Kaufreise „${created}" angelegt`)
      })
      .catch((error: Error) => {
        console.error(error)
        setSaving(false)
        toast.error('Kaufreise konnte nicht angelegt werden', { description: error.message })
      })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Wird als Kürzel für die Kaufreise verwendet (z.B. laptop)
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="newJourneyName">Anzeigename (optional)</Label>
            <Input
              id="newJourneyName"
              maxLength={80}
              placeholder="z.B. Notebook fürs Homeoffice"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="newJourneyCategory">Kategorie (optional)</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="newJourneyCategory" className="w-full">
                <SelectValue placeholder="Kategorie wählen…" />
              </SelectTrigger>
              <SelectContent>
                {JOURNEY_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="newJourneyDescription">Beschreibung (optional)</Label>
            <Textarea
              id="newJourneyDescription"
              className="min-h-16"
              maxLength={500}
              placeholder="Worum geht es bei dieser Kaufreise?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onOpenChange(false)
                reset()
              }}
            >
              Abbrechen
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Wird angelegt…' : 'Starten'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
