import { useState, type ReactNode } from 'react'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faCompass,
  faEuroSign,
  faArrowUpRightFromSquare,
  faCodeCompare,
  faCircleInfo,
  faPencil,
  faStar,
  faNoteSticky,
  faTrashCan,
} from '@fortawesome/free-solid-svg-icons'
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
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'
import { ImportLinkForm } from '@/components/ImportLinkForm'
import { ProductDialog } from '@/components/ProductDialog'
import { StarRatingDisplay } from '@/components/StarRating'
import { useJourneyData } from '@/lib/journey-data-context'
import { iconForSpecKey, parseSpecsString } from '@/lib/spec-icons'
import { statusBadgeClass } from '@/lib/status-style'
import { parseRating, translateStatus, type JourneyItem } from '@/lib/types'

interface Attribute {
  label: string
  icon: IconDefinition
  render: (item: JourneyItem, index: number) => ReactNode
}

export function Compare() {
  const { data, mutate } = useJourneyData()
  const [dialog, setDialog] = useState<{ open: boolean; index: number | null }>({ open: false, index: null })
  const items = data.items
  const editingItem: JourneyItem | null = dialog.index !== null ? items[dialog.index] : null

  function handleSaveProduct(item: JourneyItem) {
    mutate((prev) => {
      const next = [...prev.items]
      if (dialog.index !== null) next[dialog.index] = item
      else next.push(item)
      return { ...prev, items: next }
    }, dialog.index !== null ? 'Eintrag aktualisiert' : 'Neuer Eintrag hinzugefügt')
    setDialog({ open: false, index: null })
  }

  function handleDeleteProduct(index: number) {
    const name = items[index].name
    mutate((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }), `„${name}" gelöscht`)
  }

  const specKeys: string[] = []
  for (const item of items) {
    for (const part of parseSpecsString(item.specs)) {
      if (part.key && !specKeys.includes(part.key)) specKeys.push(part.key)
    }
  }

  function findSpecValue(item: JourneyItem, key: string): string {
    const match = parseSpecsString(item.specs).find((p) => p.key?.toLowerCase() === key.toLowerCase())
    return match?.value ?? '—'
  }

  const attributes: Attribute[] = [
    { label: 'Name', icon: faCompass, render: (item) => <span className="font-medium">{item.name}</span> },
    { label: 'Preis', icon: faEuroSign, render: (item) => <span className="font-mono text-celeste">{item.price || 'k.A.'}</span> },
    { label: 'Rating', icon: faStar, render: (item) => <StarRatingDisplay rating={parseRating(item.rating)} /> },
    {
      label: 'Status',
      icon: faCircleInfo,
      render: (item) => <Badge className={statusBadgeClass(item.status)}>{translateStatus(item.status)}</Badge>,
    },
    ...specKeys.map((key) => ({
      label: key,
      icon: iconForSpecKey(key),
      render: (item: JourneyItem) => <span className="text-sm">{findSpecValue(item, key)}</span>,
    })),
    {
      label: 'Erfahrungen',
      icon: faNoteSticky,
      render: (item) => (
        <p className="max-w-52 text-sm text-muted-foreground">{item.notes || 'Keine Notizen vorhanden.'}</p>
      ),
    },
  ]

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="font-heading text-lg font-semibold">{data.sectionTitle || 'Eigenschaften-Vergleich'}</h2>
          <Badge variant="secondary">{items.length}</Badge>
        </div>
        <Button size="sm" onClick={() => setDialog({ open: true, index: null })}>
          Eintrag hinzufügen
        </Button>
      </div>

      <ImportLinkForm />

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
          <FontAwesomeIcon icon={faCodeCompare} className="size-8 text-muted-foreground" />
          <h3 className="font-heading font-medium">Noch keine Einträge hinzugefügt</h3>
          <p className="max-w-xs text-sm text-muted-foreground">
            Füge Produkte auf dem Dashboard oder direkt hier hinzu, um sie im Detail zu vergleichen.
          </p>
          <Button onClick={() => setDialog({ open: true, index: null })}>Eintrag hinzufügen</Button>
        </div>
      ) : (
        <div className="rounded-xl border border-border">
          <Table>
            <TableBody>
              {attributes.map((attr) => (
                <TableRow key={attr.label}>
                  <TableCell className="sticky left-0 z-10 w-40 min-w-40 whitespace-nowrap bg-muted/60 align-top font-medium">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <FontAwesomeIcon icon={attr.icon} className="size-3.5" />
                      {attr.label}
                    </div>
                  </TableCell>
                  {items.map((item, index) => (
                    <TableCell key={index} className="min-w-48 align-top whitespace-normal">
                      {attr.render(item, index)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
              <TableRow>
                <TableCell className="sticky left-0 z-10 w-40 min-w-40 bg-muted/60 align-top font-medium">
                  <span className="text-muted-foreground">Aktionen</span>
                </TableCell>
                {items.map((item, index) => (
                  <TableCell key={index} className="min-w-48 align-top">
                    <div className="flex flex-col items-start gap-2">
                      {item.link && (
                        <Button variant="link" size="sm" className="px-0" asChild>
                          <a href={item.link} target="_blank" rel="noreferrer">
                            <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="size-3.5" />
                            Details
                          </a>
                        </Button>
                      )}
                      <div className="flex gap-1.5">
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
                              <AlertDialogDescription>
                                „{item.name}" wird endgültig aus dieser Kaufreise entfernt.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                              <AlertDialogAction variant="destructive" onClick={() => handleDeleteProduct(index)}>
                                Löschen
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </TableCell>
                ))}
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}

      <ProductDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        item={editingItem}
        onSubmit={handleSaveProduct}
      />
    </div>
  )
}
