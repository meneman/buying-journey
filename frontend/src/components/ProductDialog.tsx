import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { StarRatingInput } from '@/components/StarRating'
import { serializeSpecsLines, specsStringToLines } from '@/lib/spec-icons'
import { ITEM_STATUSES, parseRating, type JourneyItem } from '@/lib/types'

interface ProductDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: JourneyItem | null
  onSubmit: (item: JourneyItem) => void
}

const EMPTY_FORM = { name: '', price: '', status: 'Thinking', rating: 0, specsText: '', link: '', notes: '' }

export function ProductDialog({ open, onOpenChange, item, onSubmit }: ProductDialogProps) {
  const [form, setForm] = useState(EMPTY_FORM)

  useEffect(() => {
    if (!open) return
    if (item) {
      setForm({
        name: item.name || '',
        price: item.price || '',
        status: item.status || 'Thinking',
        rating: parseRating(item.rating),
        specsText: specsStringToLines(item.specs),
        link: item.link || '',
        notes: item.notes || '',
      })
    } else {
      setForm(EMPTY_FORM)
    }
  }, [open, item])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSubmit({
      name: form.name.trim() || 'Unbenannt',
      price: form.price.trim(),
      status: form.status,
      rating: '⭐'.repeat(form.rating),
      specs: serializeSpecsLines(form.specsText),
      link: form.link.trim(),
      notes: form.notes.trim(),
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{item ? 'Eintrag bearbeiten' : 'Eintrag hinzufügen'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex max-h-[70svh] flex-col gap-4 overflow-x-hidden overflow-y-auto pr-1">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="p-name">Modell / Name</Label>
            <Input
              id="p-name"
              required
              autoFocus
              placeholder="z.B. Canyon Ultimate CF 7"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="p-price">Preis</Label>
              <Input
                id="p-price"
                placeholder="z.B. 2799€"
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="p-status">Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                <SelectTrigger id="p-status" className="w-full">
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
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Bewertung</Label>
            <StarRatingInput value={form.rating} onChange={(rating) => setForm((f) => ({ ...f, rating }))} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="p-specs">Spezifikationen (eine Eigenschaft pro Zeile)</Label>
            <Textarea
              id="p-specs"
              className="h-28"
              placeholder={'z.B.\nGewicht: 8.1 kg\nRahmen: Carbon\nSchaltung: Shimano 105 2x12'}
              value={form.specsText}
              onChange={(e) => setForm((f) => ({ ...f, specsText: e.target.value }))}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="p-link">Produkt-Link / Webadresse</Label>
            <Input
              id="p-link"
              type="url"
              placeholder="https://…"
              value={form.link}
              onChange={(e) => setForm((f) => ({ ...f, link: e.target.value }))}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="p-notes">Erfahrungen / Vor- &amp; Nachteile</Label>
            <Textarea
              id="p-notes"
              className="h-20"
              placeholder="Erste Eindrücke oder Notizen…"
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
