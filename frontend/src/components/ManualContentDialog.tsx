import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { CrawlProviderSelect } from '@/components/CrawlProviderSelect'
import { parseItemFromText } from '@/lib/api'
import { useJourneyData } from '@/lib/journey-data-context'
import { trimPastedForUpload } from '@/lib/manual-content'
import type { JourneyItem } from '@/lib/types'

interface ManualContentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  itemName: string
  link?: string
  onParsed: (parsed: JourneyItem) => void
}

/**
 * Manueller Content-Fallback: Die Seite war per Auto-Crawl nicht lesbar
 * (Bot-Schutz). Der Nutzer kopiert den gesamten Seiteninhalt hierher —
 * Trimmen und LLM-Auswertung laufen danach automatisch.
 */
export function ManualContentDialog({ open, onOpenChange, itemName, link, onParsed }: ManualContentDialogProps) {
  const { journey } = useJourneyData()
  /** Der eingefügte Inhalt bleibt im State und wird nie als Text gerendert — angezeigt wird nur die Zeichenzahl. */
  const [text, setText] = useState('')
  const [provider, setProvider] = useState('auto')
  const [parsing, setParsing] = useState(false)
  const pasteBoxRef = useRef<HTMLDivElement>(null)

  const pastedChars = trimPastedForUpload(text).length

  function handleOpenChange(next: boolean) {
    if (!next) {
      setText('')
      setParsing(false)
    }
    onOpenChange(next)
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault()
    const pasted = e.clipboardData?.getData('text') ?? ''
    if (pasted) setText(pasted)
  }

  async function handleParse(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = trimPastedForUpload(text)
    if (!trimmed || parsing) return
    setParsing(true)
    try {
      const { item } = await parseItemFromText(journey, trimmed, link, provider)
      onParsed(item)
      handleOpenChange(false)
    } catch (error) {
      console.error(error)
      setParsing(false)
      toast.error('Auswertung fehlgeschlagen', { description: (error as Error).message })
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Inhalt einfügen — {itemName}</DialogTitle>
          <DialogDescription>
            Die Seite lässt sich nicht automatisch lesen. Öffne die Produktseite im Browser, markiere alles
            (Strg+A bzw. Cmd+A), kopiere es und füge es unten ein. Der eingefügte Text wird nicht angezeigt —
            nur die Zeichenzahl. Unnötiges (Skripte, Layout) wird automatisch entfernt, der Rest per LLM
            ausgewertet.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleParse} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="manualContentText">Seiteninhalt</Label>
            <div
              id="manualContentText"
              ref={pasteBoxRef}
              tabIndex={parsing ? -1 : 0}
              autoFocus
              onPaste={parsing ? undefined : handlePaste}
              onClick={() => pasteBoxRef.current?.focus()}
              className="flex min-h-40 cursor-text flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/40 p-6 text-center focus-visible:outline-2 focus-visible:outline-ring"
            >
              {pastedChars === 0 ? (
                <p className="max-w-xs text-sm text-muted-foreground">
                  Feld anklicken und den kopierten Seiteninhalt mit Strg+V (bzw. Cmd+V) einfügen.
                </p>
              ) : (
                <>
                  <p className="font-heading text-2xl font-semibold tabular-nums">
                    {pastedChars.toLocaleString('de-DE')} Zeichen
                  </p>
                  <p className="max-w-xs text-xs text-muted-foreground">
                    Inhalt übernommen — Text wird nicht angezeigt. Erneutes Einfügen ersetzt ihn.
                  </p>
                  {!parsing && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setText('')}>
                      Leeren
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
          <CrawlProviderSelect stage="extract" value={provider} onChange={setProvider} id="manualContentProvider" />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={parsing}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={parsing || pastedChars === 0}>
              {parsing ? 'Wird ausgewertet…' : 'Auswerten & übernehmen'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
