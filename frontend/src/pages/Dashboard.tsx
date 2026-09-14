import { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPlus, faShieldHalved, faPaperPlane, faTrashCan } from '@fortawesome/free-solid-svg-icons'
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { AscentTracker } from '@/components/AscentTracker'
import { ImportLinkForm } from '@/components/ImportLinkForm'
import { ProductCard } from '@/components/ProductCard'
import { ProductDialog } from '@/components/ProductDialog'
import { useJourneyData } from '@/lib/journey-data-context'
import type { JourneyItem } from '@/lib/types'

function todayISO() {
  return new Date().toISOString().split('T')[0]
}

function formatDate(dateStr: string) {
  const parts = dateStr.split('-')
  if (parts.length !== 3) return dateStr
  return `${parts[2]}.${parts[1]}.${parts[0]}`
}

export function Dashboard() {
  const { data, mutate, mutateDebounced } = useJourneyData()
  const [dialog, setDialog] = useState<{ open: boolean; index: number | null }>({ open: false, index: null })
  const [newEvent, setNewEvent] = useState('')
  const [newDate, setNewDate] = useState(todayISO)

  const editingItem: JourneyItem | null = dialog.index !== null ? data.items[dialog.index] : null

  function handleSaveProduct(item: JourneyItem) {
    mutate((prev) => {
      const items = [...prev.items]
      if (dialog.index !== null) {
        items[dialog.index] = item
      } else {
        items.push(item)
      }
      return { ...prev, items }
    }, dialog.index !== null ? 'Eintrag aktualisiert' : 'Neuer Eintrag hinzugefügt')
    setDialog({ open: false, index: null })
  }

  function handleDeleteProduct(index: number) {
    const name = data.items[index].name
    mutate((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }), `„${name}" gelöscht`)
  }

  function handleAddLogEntry(e: React.FormEvent) {
    e.preventDefault()
    const event = newEvent.trim()
    if (!event) return
    mutate((prev) => ({
      ...prev,
      journey: [...prev.journey, { date: newDate, event }].sort((a, b) => b.date.localeCompare(a.date)),
    }), 'Tagebuch aktualisiert')
    setNewEvent('')
  }

  function handleDeleteLogEntry(index: number) {
    mutate((prev) => ({ ...prev, journey: prev.journey.filter((_, i) => i !== index) }), 'Eintrag gelöscht')
  }

  return (
    <div className="flex flex-col gap-6">
      <AscentTracker
        phase={data.status.phase}
        budget={data.status.budget}
        targetDate={data.status.targetDate}
        onPhaseChange={(phase) => mutateDebounced((prev) => ({ ...prev, status: { ...prev.status, phase } }))}
        onBudgetChange={(budget) => mutateDebounced((prev) => ({ ...prev, status: { ...prev.status, budget } }))}
        onTargetDateChange={(targetDate) =>
          mutateDebounced((prev) => ({ ...prev, status: { ...prev.status, targetDate } }))
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <Card size="sm" className="order-2 lg:order-1 lg:col-span-3">
          <CardHeader>
            <CardTitle>Notizen</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              className="h-48"
              placeholder="Hier allgemeine Kriterien, Notizen oder To-Dos eintragen…"
              value={data.generalNotes}
              onChange={(e) => mutateDebounced((prev) => ({ ...prev, generalNotes: e.target.value }))}
            />
          </CardContent>
        </Card>

        <section className="order-1 lg:order-2 lg:col-span-6">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h2 className="font-heading text-lg font-semibold">{data.sectionTitle || 'Produkte im Vergleich'}</h2>
              <Badge variant="secondary">{data.items.length}</Badge>
            </div>
            <Button size="sm" onClick={() => setDialog({ open: true, index: null })}>
              <FontAwesomeIcon icon={faPlus} className="size-4" />
              Eintrag hinzufügen
            </Button>
          </div>

          <ImportLinkForm />

          {data.items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
              <FontAwesomeIcon icon={faShieldHalved} className="size-8 text-muted-foreground" />
              <h3 className="font-heading font-medium">Noch keine Einträge hinzugefügt</h3>
              <p className="max-w-xs text-sm text-muted-foreground">
                Füge dein erstes Produkt hinzu, um technische Daten, Preise und Bewertungen zu vergleichen.
              </p>
              <Button onClick={() => setDialog({ open: true, index: null })}>Jetzt hinzufügen</Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {data.items.map((item, index) => (
                <ProductCard
                  key={index}
                  item={item}
                  onEdit={() => setDialog({ open: true, index })}
                  onDelete={() => handleDeleteProduct(index)}
                />
              ))}
            </div>
          )}
        </section>

        <Card size="sm" className="order-3 lg:col-span-3">
          <CardHeader>
            <CardTitle>Reisetagebuch</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {data.journey.length === 0 ? (
              <p className="text-sm text-muted-foreground">Noch keine Einträge vorhanden.</p>
            ) : (
              <ol className="flex flex-col gap-3">
                {data.journey.map((entry, index) => (
                  <li key={index} className="flex gap-2.5 text-sm">
                    <span className="pt-0.5 font-mono text-xs text-celeste">{String(index + 1).padStart(2, '0')}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                        {formatDate(entry.date)}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <button className="text-muted-foreground hover:text-rust" title="Eintrag löschen">
                              <FontAwesomeIcon icon={faTrashCan} className="size-3" />
                            </button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Eintrag löschen?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Dieser Eintrag wird aus dem Reisetagebuch entfernt.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                              <AlertDialogAction variant="destructive" onClick={() => handleDeleteLogEntry(index)}>
                                Löschen
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                      <p>{entry.event}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}

            <form onSubmit={handleAddLogEntry} className="flex flex-col gap-2 border-t border-border pt-4">
              <Input
                placeholder="Neues Ereignis eintragen…"
                value={newEvent}
                onChange={(e) => setNewEvent(e.target.value)}
                required
              />
              <div className="flex gap-2">
                <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} required />
                <Button type="submit" variant="outline" size="icon" className="shrink-0">
                  <FontAwesomeIcon icon={faPaperPlane} className="size-4" />
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <ProductDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        item={editingItem}
        onSubmit={handleSaveProduct}
      />
    </div>
  )
}
