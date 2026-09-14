import { useEffect, useState } from 'react'
import { Pencil, Plus, SlidersHorizontal, Trash2 } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useJourneyData } from '@/lib/journey-data-context'
import { useJourney } from '@/lib/router'
import type { JourneySpec } from '@/lib/types'

export function Specs() {
  const { data, mutate } = useJourneyData()
  const journey = useJourney()
  const isBike = journey === 'bike'
  const [dialog, setDialog] = useState<{ open: boolean; index: number | null }>({ open: false, index: null })
  const [label, setLabel] = useState('')
  const [value, setValue] = useState('')

  useEffect(() => {
    if (!dialog.open) return
    if (dialog.index !== null) {
      const spec = data.specs[dialog.index]
      setLabel(spec.label)
      setValue(spec.value)
    } else {
      setLabel('')
      setValue('')
    }
  }, [dialog, data.specs])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const spec: JourneySpec = { label: label.trim(), value: value.trim() }
    mutate((prev) => {
      const specs = [...prev.specs]
      if (dialog.index !== null) specs[dialog.index] = spec
      else specs.push(spec)
      return { ...prev, specs }
    }, dialog.index !== null ? 'Eintrag aktualisiert' : 'Neuer Eintrag hinzugefügt')
    setDialog({ open: false, index: null })
  }

  function handleDelete(index: number) {
    const removedLabel = data.specs[index].label
    mutate((prev) => ({ ...prev, specs: prev.specs.filter((_, i) => i !== index) }), `Eintrag „${removedLabel}" gelöscht`)
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="font-heading text-lg font-semibold">{data.listTitle || 'Spezifikationen'}</h2>
          <Badge variant="secondary">{data.specs.length}</Badge>
        </div>
        <Button size="sm" onClick={() => setDialog({ open: true, index: null })}>
          <Plus className="size-4" />
          Eintrag hinzufügen
        </Button>
      </div>

      {data.specs.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
          <SlidersHorizontal className="size-8 text-muted-foreground" />
          <h3 className="font-heading font-medium">Noch keine Einträge hinterlegt</h3>
          <p className="max-w-xs text-sm text-muted-foreground">
            Hinterlege wichtige Eigenschaften für diese Kaufreise, um sie schnell parat zu haben.
          </p>
          <Button onClick={() => setDialog({ open: true, index: null })}>Eintrag erstellen</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.specs.map((spec, index) => (
            <div key={index} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
              <div>
                <h3 className="font-heading font-medium">{spec.label}</h3>
                <span className="font-mono text-sm text-celeste">{spec.value}</span>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <Button variant="outline" size="icon-sm" title="Bearbeiten" onClick={() => setDialog({ open: true, index })}>
                  <Pencil className="size-3.5" />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="icon-sm" title="Löschen">
                      <Trash2 className="size-3.5" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Eintrag löschen?</AlertDialogTitle>
                      <AlertDialogDescription>„{spec.label}" wird endgültig entfernt.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                      <AlertDialogAction variant="destructive" onClick={() => handleDelete(index)}>
                        Löschen
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialog.open} onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog.index !== null ? 'Eintrag bearbeiten' : 'Eintrag hinzufügen'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="s-label">{isBike ? 'Hersteller / Marke' : 'Eigenschaft'}</Label>
              <Input
                id="s-label"
                required
                autoFocus
                placeholder={isBike ? 'z.B. Bianchi, Canyon, Orbea' : 'z.B. Reichweite, Ladezeit'}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="s-value">{isBike ? 'Rahmengröße' : 'Wert'}</Label>
              <Input
                id="s-value"
                required
                placeholder={isBike ? 'z.B. 57, L, 55' : 'z.B. 450 km, 20 Min'}
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialog({ open: false, index: null })}>
                Abbrechen
              </Button>
              <Button type="submit">Speichern</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
