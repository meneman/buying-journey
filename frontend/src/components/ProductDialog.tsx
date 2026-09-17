import { useEffect, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronDown, faChevronUp, faCircleNotch, faLink } from '@fortawesome/free-solid-svg-icons'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { CrawlProviderSelect } from '@/components/CrawlProviderSelect'
import { StarRatingInput } from '@/components/StarRating'
import { importItemFromLink } from '@/lib/api'
import { useJourneyData } from '@/lib/journey-data-context'
import { placeholderForBlockedLink } from '@/lib/manual-content'
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
  const [crawlUrl, setCrawlUrl] = useState('')
  const [crawlProvider, setCrawlProvider] = useState('auto')
  const [crawlFetcher, setCrawlFetcher] = useState('auto')
  const [crawling, setCrawling] = useState(false)
  /** Manuelle Eingabe steht beim Hinzufügen hinter dem URL-Import (zugeklappt). */
  const [showManualForm, setShowManualForm] = useState(false)
  const { journey } = useJourneyData()
  const adding = !item

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
    setCrawlUrl('')
    setCrawling(false)
    setShowManualForm(false)
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

  /** URL-Crawl zuerst: gecrawltes Item wird direkt gespeichert (ohne Kontrolle). */
  async function handleCrawl() {
    const trimmed = crawlUrl.trim()
    if (!trimmed || crawling) return
    setCrawling(true)
    try {
      const { item: crawled } = await importItemFromLink(journey, trimmed, crawlProvider, crawlFetcher)
      onSubmit(crawled)
    } catch (error) {
      // Seite blockiert den Auto-Crawl: markierten Platzhalter speichern —
      // der Inhalt wird danach über „Inhalt einfügen" manuell nachgereicht.
      const placeholder = placeholderForBlockedLink(trimmed, error, form.status)
      if (!placeholder) {
        toast.error('Crawl fehlgeschlagen', { description: (error as Error).message })
        return
      }
      console.error(error)
      onSubmit(placeholder)
      toast.warning('Crawl blockiert — Platzhalter angelegt', {
        description: 'Inhalt über „Inhalt einfügen" manuell nachreichen.',
      })
    } finally {
      setCrawling(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{item ? 'Eintrag bearbeiten' : 'Eintrag hinzufügen'}</DialogTitle>
        </DialogHeader>
        {adding && (
          <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-muted/40 p-3">
            <Label htmlFor="p-crawl-url">Per URL hinzufügen</Label>
            <div className="flex gap-2">
              <Input
                id="p-crawl-url"
                type="url"
                inputMode="url"
                autoFocus
                placeholder="https://… — wird gecrawlt und direkt gespeichert"
                value={crawlUrl}
                onChange={(e) => setCrawlUrl(e.target.value)}
                disabled={crawling}
              />
              <Button
                type="button"
                variant="outline"
                className="shrink-0"
                disabled={crawling || !crawlUrl.trim()}
                onClick={handleCrawl}
              >
                {crawling ? (
                  <FontAwesomeIcon icon={faCircleNotch} className="size-4" spin />
                ) : (
                  <FontAwesomeIcon icon={faLink} className="size-4" />
                )}
                Crawlen
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <CrawlProviderSelect stage="fetch" value={crawlFetcher} onChange={setCrawlFetcher} id="p-crawl-fetcher" />
              <CrawlProviderSelect stage="extract" value={crawlProvider} onChange={setCrawlProvider} id="p-crawl-provider" />
            </div>
          </div>
        )}
        {adding && (
          <div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowManualForm((v) => !v)}
              aria-expanded={showManualForm}
              aria-controls="p-manual-form"
            >
              <FontAwesomeIcon icon={showManualForm ? faChevronUp : faChevronDown} className="text-muted-foreground" />
              {showManualForm ? 'Manuelle Eingabe ausblenden' : 'Manuell eingeben (Name, Preis, Details …)'}
            </Button>
          </div>
        )}
        {(!adding || showManualForm) && (
        <form
          id={adding ? 'p-manual-form' : undefined}
          onSubmit={handleSubmit}
          className="flex max-h-[70svh] flex-col gap-4 overflow-x-hidden overflow-y-auto pr-1"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="p-name">Modell / Name</Label>
            <Input
              id="p-name"
              required
              autoFocus={!adding}
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
        )}
        {adding && !showManualForm && (
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
