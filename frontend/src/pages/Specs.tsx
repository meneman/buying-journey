import { useEffect, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPencil, faPlus, faSliders, faTrashCan } from '@fortawesome/free-solid-svg-icons'
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
import { deleteCriteria, fetchCriteria, setCriteria } from '@/lib/api'
import type { JourneyCriteria, JourneySpec } from '@/lib/types'

export function Specs() {
  const { data, mutate } = useJourneyData()
  const journey = useJourney()
  const isBike = journey === 'bike'
  const [dialog, setDialog] = useState<{ open: boolean; index: number | null }>({ open: false, index: null })
  const [label, setLabel] = useState('')
  const [value, setValue] = useState('')
  const [criteria, setCriteriaList] = useState<JourneyCriteria[]>([])
  const [critKey, setCritKey] = useState('')
  const [critWeight, setCritWeight] = useState('3')

  useEffect(() => {
    fetchCriteria(journey).then((r) => setCriteriaList(r.criteria || [])).catch(() => {})
  }, [journey])

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
          <FontAwesomeIcon icon={faPlus} className="size-4" />
          Eintrag hinzufügen
        </Button>
      </div>

      {data.specs.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
          <FontAwesomeIcon icon={faSliders} className="size-8 text-muted-foreground" />
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
                  <FontAwesomeIcon icon={faPencil} className="size-3.5" />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="icon-sm" title="Löschen">
                      <FontAwesomeIcon icon={faTrashCan} className="size-3.5" />
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

      <div className="mt-8">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="font-heading text-lg font-semibold">Kriterien-Gewichte</h2>
          <Badge variant="secondary">{criteria.length}</Badge>
        </div>
        <form
          className="mb-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const w = Number(critWeight)
            if (!critKey.trim() || !Number.isInteger(w) || w < 1 || w > 5) return
            setCriteria(journey, critKey.trim(), w)
              .then(() => fetchCriteria(journey))
              .then((r) => {
                setCriteriaList(r.criteria || [])
                setCritKey('')
                setCritWeight('3')
              })
              .catch(() => {})
          }}
        >
          <Input placeholder="Key, z.B. Gewicht oder price" value={critKey} onChange={(e) => setCritKey(e.target.value)} />
          <Input
            type="number"
            min={1}
            max={5}
            className="w-20"
            value={critWeight}
            onChange={(e) => setCritWeight(e.target.value)}
          />
          <Button type="submit" size="sm">Speichern</Button>
        </form>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {criteria.map((c) => (
            <div key={c.key} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
              <div>
                <h3 className="font-heading font-medium">{c.key}</h3>
                <span className="font-mono text-sm text-celeste">Gewicht {c.weight}</span>
              </div>
              <Button
                variant="outline"
                size="icon-sm"
                title="Löschen"
                onClick={() => {
                  deleteCriteria(journey, c.key)
                    .then(() => fetchCriteria(journey))
                    .then((r) => setCriteriaList(r.criteria || []))
                    .catch(() => {})
                }}
              >
                <FontAwesomeIcon icon={faTrashCan} className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </div>

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
