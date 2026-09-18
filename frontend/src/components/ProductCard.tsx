import { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowUpRightFromSquare, faCircleNotch, faPaste, faPencil, faTrashCan } from '@fortawesome/free-solid-svg-icons'
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
import { ManualContentDialog } from '@/components/ManualContentDialog'
import { StarRatingDisplay } from '@/components/StarRating'
import { useJourneyData } from '@/lib/journey-data-context'
import { parseSpecsString, iconForSpecKey } from '@/lib/spec-icons'
import { statusBadgeClass } from '@/lib/status-style'
import { parseRating, translateStatus, type JourneyItem } from '@/lib/types'
import { cn } from '@/lib/utils'

interface ProductCardProps {
  item: JourneyItem
  onEdit: () => void
  onDelete: () => void
}

export function ProductCard({ item, onEdit, onDelete }: ProductCardProps) {
  const specs = parseSpecsString(item.specs)
  const [pasteOpen, setPasteOpen] = useState(false)
  const { jobs } = useJourneyData()
  // Laufende/fehlgeschlagene Text-Auswertung zu diesem Platzhalter (Ergebnis
  // übernimmt der Job-Flow automatisch, Fehler bieten erneutes Einfügen an).
  const parseJob =
    item.needsContent && item.link ? jobs.find((j) => j.kind === 'parse-text' && j.link === item.link) : undefined
  const showPaste = Boolean(item.needsContent)

  return (
    <div className="flex flex-col rounded-xl border border-border bg-card">
      <div className="flex items-start justify-between gap-3 border-b border-border p-4">
        <div>
          <h3 className="font-heading font-semibold">{item.name}</h3>
          <p className="font-mono text-sm text-celeste">{item.price || 'k.A.'}</p>
        </div>
        <Badge className={cn('shrink-0', statusBadgeClass(item.status))}>{translateStatus(item.status)}</Badge>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <StarRatingDisplay rating={parseRating(item.rating)} />

        {specs.length > 0 && (
          <div className="grid grid-cols-1 gap-x-3 gap-y-1.5 sm:grid-cols-2">
            {specs.map((part, i) => {
              const Icon = part.key ? iconForSpecKey(part.key) : null
              return (
                <div key={i} className="flex items-start gap-1.5 text-xs text-foreground/80">
                  {Icon && <FontAwesomeIcon icon={Icon} className="mt-0.5 size-3.5 shrink-0 text-steel" />}
                  <span>
                    {part.key && <strong className="font-medium text-foreground">{part.key}: </strong>}
                    {part.value}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        <p className="line-clamp-3 text-sm text-muted-foreground">{item.notes || 'Keine Notizen vorhanden.'}</p>

        {showPaste && (
          <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border bg-muted/40 p-3">
            {parseJob?.status === 'in progress' ? (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <FontAwesomeIcon icon={faCircleNotch} className="size-3.5" spin />
                {parseJob.position > 0 ? `Wartet — Position ${parseJob.position}` : 'Wird ausgewertet…'}
              </p>
            ) : parseJob?.status === 'errored' ? (
              <>
                <p className="text-xs text-muted-foreground">
                  Auswertung fehlgeschlagen: {parseJob.error || 'Unbekannter Fehler.'}
                </p>
                <Button variant="outline" size="sm" className="self-start" onClick={() => setPasteOpen(true)}>
                  <FontAwesomeIcon icon={faPaste} className="size-3.5" />
                  Erneut einfügen
                </Button>
              </>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  Automatischer Import blockiert — Seiteninhalt manuell einfügen.
                </p>
                <Button variant="outline" size="sm" className="self-start" onClick={() => setPasteOpen(true)}>
                  <FontAwesomeIcon icon={faPaste} className="size-3.5" />
                  Inhalt einfügen
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border p-3">
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
          <Button variant="outline" size="icon-sm" title="Bearbeiten" onClick={onEdit}>
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
                <AlertDialogAction variant="destructive" onClick={onDelete}>
                  Löschen
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
      {showPaste && (
        <ManualContentDialog open={pasteOpen} onOpenChange={setPasteOpen} itemName={item.name} link={item.link} />
      )}
    </div>
  )
}
