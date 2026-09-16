import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { StarRatingInput } from '@/components/StarRating'
import { ITEM_STATUSES, parseRating, type JourneyItem } from '@/lib/types'

interface RatingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: JourneyItem | null
  onSubmit: (item: JourneyItem) => void
}

export function RatingDialog({ open, onOpenChange, item, onSubmit }: RatingDialogProps) {
  const [form, setForm] = useState({ rating: 0, status: 'Thinking', notes: '' })
  const [lastOpened, setLastOpened] = useState<{ item: JourneyItem | null; open: boolean }>({
    item: null,
    open: false,
  })

  // Formular beim Öffnen (oder Produktwechsel) zurücksetzen — Render-Phase-Update
  // statt Effekt, damit kein set-state-in-effect nötig ist (anders als ProductDialog).
  if (open !== lastOpened.open || item !== lastOpened.item) {
    setLastOpened({ item, open })
    setForm({
      rating: parseRating(item?.rating),
      status: item?.status || 'Thinking',
      notes: item?.notes || '',
    })
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!item) return
    onSubmit({
      ...item,
      rating: '⭐'.repeat(form.rating),
      status: form.status,
      notes: form.notes.trim(),
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Bewertung{item ? ` – ${item.name}` : ''}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Bewertung</Label>
            <StarRatingInput value={form.rating} onChange={(rating) => setForm((f) => ({ ...f, rating }))} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="r-status">Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
              <SelectTrigger id="r-status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ITEM_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="r-notes">Kommentar</Label>
            <Textarea
              id="r-notes"
              className="h-20"
              placeholder="Eindrücke oder Notizen…"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button type="submit">Speichern</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
