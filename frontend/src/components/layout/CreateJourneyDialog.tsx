import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    const normalized = normalizeJourneyId(slug)
    if (!normalized) {
      toast.error('Bitte ein gültiges Kürzel angeben (z.B. bike, laptop).')
      return
    }
    setSaving(true)
    try {
      const { slug: created } = await createJourney({
        slug: normalized,
        ...(name.trim() ? { name: name.trim() } : {}),
        ...(category && category !== '__none__' ? { category } : {}),
        ...(description.trim() ? { description: description.trim() } : {}),
      })
      onOpenChange(false)
      reset()
      navigate(`/?journey=${encodeURIComponent(created)}`)
      toast.success(`Kaufreise „${created}" angelegt`)
    } catch (error) {
      console.error(error)
      setSaving(false)
      toast.error('Kaufreise konnte nicht angelegt werden', { description: (error as Error).message })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Neue Kaufreise anlegen</DialogTitle>
          <DialogDescription>
            Lege eine neue Kaufreise an, um Produkte zu sammeln, zu vergleichen und per MCP zu pflegen.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleCreate} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="newJourneyId">Kürzel (Slug) *</Label>
            <Input
              id="newJourneyId"
              required
              autoFocus
              pattern="[a-z0-9.-]+"
              placeholder="z.B. gravel-bike, laptop, couch"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              disabled={saving}
            />
            <p className="text-xs text-muted-foreground">
              Eindeutige Kennung in der URL und für den MCP-Server (nur Kleinbuchstaben, Ziffern, Bindestrich).
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="newJourneyName">Anzeigename (optional)</Label>
            <Input
              id="newJourneyName"
              maxLength={80}
              placeholder="z.B. Gravel Bike fürs Pendeln"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="newJourneyCategory">Kategorie (optional)</Label>
            <Select value={category} onValueChange={setCategory} disabled={saving}>
              <SelectTrigger id="newJourneyCategory">
                <SelectValue placeholder="Kategorie wählen…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Keine Kategorie</SelectItem>
                {JOURNEY_CATEGORIES.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="newJourneyDesc">Beschreibung (optional)</Label>
            <Textarea
              id="newJourneyDesc"
              rows={3}
              placeholder="Was suchst du genau? Kriterien, Einsatzzweck, Budgetrahmen…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={saving}
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={saving || !slug.trim()}>
              {saving ? 'Wird angelegt…' : 'Kaufreise anlegen'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
