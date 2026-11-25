import { useState, type ReactNode } from 'react'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faCompass,
  faEuroSign,
  faArrowUpRightFromSquare,
  faCodeCompare,
  faPencil,
  faStar,
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
import { ExpandableText } from '@/components/ExpandableText'
import { ProductDialog } from '@/components/ProductDialog'
import { RatingDialog } from '@/components/RatingDialog'
import { StarRatingDisplay } from '@/components/StarRating'
import { useJourneyData } from '@/lib/journey-data-context'
import { groupSpecKeys, iconForSpecKey, parseSpecsString } from '@/lib/spec-icons'
import { statusBadgeClass } from '@/lib/status-style'
import { parseRating, translateStatus, type JourneyItem } from '@/lib/types'

interface Attribute {
  label: string
  icon: IconDefinition
  render: (item: JourneyItem, index: number) => ReactNode
}

export function Compare() {
  const { data, mutate } = useJourneyData()
  const items = data.items
  const [dialog, setDialog] = useState<{ open: boolean; index: number | null }>({ open: false, index: null })
  const [ratingDialog, setRatingDialog] = useState<{ open: boolean; index: number | null }>({
    open: false,
    index: null,
  })

  const editingItem: JourneyItem | null = dialog.index !== null ? items[dialog.index] : null
  const ratingItem: JourneyItem | null = ratingDialog.index !== null ? items[ratingDialog.index] : null

  function handleSaveProduct(item: JourneyItem) {
    mutate((prev) => {
      const next = [...prev.items]
      if (dialog.index !== null) {
        next[dialog.index] = item
      } else {
        next.push(item)
      }
      return { ...prev, items: next }
    }, dialog.index !== null ? 'Eintrag aktualisiert' : 'Neuer Eintrag hinzugefügt')
    setDialog({ open: false, index: null })
  }

  function handleSaveRating(item: JourneyItem) {
    if (ratingDialog.index === null) return
    const index = ratingDialog.index
    mutate((prev) => {
      const next = [...prev.items]
      next[index] = item
      return { ...prev, items: next }
    }, 'Bewertung gespeichert')
  }

  function handleDeleteProduct(index: number) {
    const name = items[index].name
    mutate((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }), `„${name}" gelöscht`)
  }

  const { split, commonKeys, uniqueKeys, allKeys } = groupSpecKeys(items, data.specComparison)

  function findSpecValue(item: JourneyItem, key: string): string {
    const match = parseSpecsString(item.specs).find((p) => p.key?.toLowerCase() === key.toLowerCase())
    return match?.value ?? '—'
  }

  function specAttribute(key: string): Attribute {
    return {
      label: key,
      icon: iconForSpecKey(key),
      render: (item: JourneyItem) => <ExpandableText text={findSpecValue(item, key)} className="text-sm" />,
    }
  }

  const baseAttributes: Attribute[] = [
    { label: 'Name', icon: faCompass, render: (item) => <ExpandableText text={item.name} className="font-medium" /> },
    {
      label: 'Preis',
      icon: faEuroSign,
      render: (item) => (
        <span className="font-mono text-celeste">
          {item.price || 'k.A.'}
          {item.priceQualifier ? <Badge variant="secondary" className="ml-2">{item.priceQualifier}</Badge> : null}
        </span>
      ),
    },
    {
      label: 'Pro / Contra',
      icon: faStar,
      render: (item) => (
        <div className="flex flex-col gap-1 text-sm">
          {(item.pros || []).map((p, i) => (
            <span key={`p-${i}`}>+ {p}</span>
          ))}
          {(item.cons || []).map((c, i) => (
            <span key={`c-${i}`} className="text-muted-foreground">− {c}</span>
          ))}
          {(item.pros || []).length === 0 && (item.cons || []).length === 0 ? <span>—</span> : null}
        </div>
      ),
    },
    {
      label: 'Bewertung & Status',
      icon: faStar,
      render: (item, index) => (
        <button
          type="button"
          aria-label={`Bewertung für ${item.name} bearbeiten`}
          title="Bewertung bearbeiten"
          onClick={() => setRatingDialog({ open: true, index })}
          className="flex w-full cursor-pointer flex-col items-start gap-1.5 rounded p-1 text-left transition-colors hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <StarRatingDisplay rating={parseRating(item.rating)} />
          <Badge className={statusBadgeClass(item.status)}>{translateStatus(item.status)}</Badge>
        </button>
      ),
    },
  ]

  function renderAttributeRows(attrs: Attribute[], keyPrefix: string) {
    return attrs.map((attr) => (
      <TableRow key={`${keyPrefix}-${attr.label}`}>
        <TableCell className="w-48 bg-muted/50 font-medium text-foreground">
          <div className="flex items-center gap-2">
            <FontAwesomeIcon icon={attr.icon} className="size-4 text-steel" />
            {attr.label}
          </div>
        </TableCell>
        {items.map((item, index) => (
          <TableCell key={index} className="min-w-48 max-w-[300px] w-[300px] align-top whitespace-normal">
            <div className="max-w-[300px]">
              {attr.render(item, index)}
            </div>
          </TableCell>
        ))}
      </TableRow>
    ))
  }

  function renderSectionHeader(title: string, count: number) {
    return (
      <TableRow className="hover:bg-transparent">
        <TableCell
          colSpan={items.length + 1}
          className="bg-muted/70 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        >
          <div className="flex items-center gap-2">
            <span>{title}</span>
            <Badge variant="secondary" className="text-[11px] font-normal">
              {count}
            </Badge>
          </div>
        </TableCell>
      </TableRow>
    )
  }

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

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
          <FontAwesomeIcon icon={faCodeCompare} className="size-8 text-muted-foreground" />
          <h3 className="font-heading font-medium">Noch keine Einträge hinzugefügt</h3>
          <p className="max-w-xs text-sm text-muted-foreground">
            Füge dein erstes Produkt manuell hinzu oder lass deinen KI-Assistenten per MCP Produkte recherchieren.
          </p>
          <Button onClick={() => setDialog({ open: true, index: null })}>Jetzt hinzufügen</Button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <Table>
            <TableBody>
              {renderAttributeRows(baseAttributes, 'base')}
              {split ? (
                <>
                  {commonKeys.length > 0 && (
                    <>
                      {renderSectionHeader('Gemeinsame Eigenschaften', commonKeys.length)}
                      {renderAttributeRows(commonKeys.map(specAttribute), 'common')}
                    </>
                  )}
                  {uniqueKeys.length > 0 && (
                    <>
                      {renderSectionHeader('Weitere / Einzel-Eigenschaften', uniqueKeys.length)}
                      {renderAttributeRows(uniqueKeys.map(specAttribute), 'unique')}
                    </>
                  )}
                </>
              ) : (
                renderAttributeRows(allKeys.map(specAttribute), 'spec')
              )}

              <TableRow>
                <TableCell className="bg-muted/50 font-medium text-foreground">Aktionen</TableCell>
                {items.map((item, index) => (
                  <TableCell key={index} className="min-w-48 max-w-[300px] w-[300px]">
                    <div className="flex items-center justify-between gap-2 max-w-[300px]">
                      {item.link ? (
                        <Button variant="link" size="sm" className="px-0" asChild>
                          <a href={item.link} target="_blank" rel="noreferrer">
                            <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="size-3.5" />
                            Details
                          </a>
                        </Button>
                      ) : (
                        <span />
                      )}
                      <div className="flex gap-1.5">
                        <Button
                          variant="outline"
                          size="icon-sm"
                          title="Bearbeiten"
                          onClick={() => setDialog({ open: true, index })}
                        >
                          <FontAwesomeIcon icon={faPencil} className="size-3.5" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="icon-sm"
                              title="Löschen"
                              className="hover:border-rust hover:text-rust"
                            >
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
      <RatingDialog
        open={ratingDialog.open}
        onOpenChange={(open) => setRatingDialog((d) => ({ ...d, open }))}
        item={ratingItem}
        onSubmit={handleSaveRating}
      />
    </div>
  )
}
