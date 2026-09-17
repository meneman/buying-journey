import { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronDown, faChevronUp } from '@fortawesome/free-solid-svg-icons'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { CrawlProviderSelect } from '@/components/CrawlProviderSelect'
import { createJourney, fetchJourneyData, importItemFromLink, saveJourneyData } from '@/lib/api'
import { normalizeJourneyId } from '@/lib/journey-id'
import { MANUAL_CONTENT_NOTE, fallbackItemName, placeholderForBlockedLink, shouldCreatePlaceholder } from '@/lib/manual-content'
import { useRouter } from '@/lib/router'
import { JOURNEY_CATEGORIES } from '@/lib/types'
import type { JourneyItem } from '@/lib/types'

interface CreateJourneyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Kürzel-Vorschlag aus einem Produktnamen (Leerzeichen → Bindestrich, Rest wie normalizeJourneyId). */
function suggestSlugFromName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9.-]/g, '')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 60)
}

/** Fallback-Kürzel aus einer URL (Host + erstes Pfadsegment), wenn der Crawl keinen Namen liefert. */
function suggestSlugFromUrl(link: string): string {
  try {
    const url = new URL(link)
    const host = (url.hostname.replace(/^www\./, '').split('.')[0] || '').toLowerCase()
    const firstPath = (url.pathname.split('/').filter(Boolean)[0] || '').toLowerCase()
    return normalizeJourneyId(host + (firstPath ? `-${firstPath}` : '')).slice(0, 60)
  } catch {
    return ''
  }
}

/**
 * "Neue Kaufreise"-Dialog im URL-first-Flow: Standard ist nur die
 * Produkt-URL — Kürzel/Name werden automatisch aus dem gecrawlten Produkt
 * übernommen. Die manuellen Felder (Kürzel, Anzeigename, Kategorie,
 * Beschreibung) sind optional aufklappbar.
 */
export function CreateJourneyDialog({ open, onOpenChange }: CreateJourneyDialogProps) {
  const { navigate } = useRouter()
  const [slug, setSlug] = useState('')
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [initialLink, setInitialLink] = useState('')
  const [crawlProvider, setCrawlProvider] = useState('auto')
  const [crawlFetcher, setCrawlFetcher] = useState('auto')
  const [showManual, setShowManual] = useState(false)
  const [saving, setSaving] = useState(false)

  const linkTrimmed = initialLink.trim()

  function reset() {
    setSlug('')
    setName('')
    setCategory('')
    setDescription('')
    setInitialLink('')
    setShowManual(false)
    setSaving(false)
  }

  function finish(created: string, itemName?: string) {
    onOpenChange(false)
    reset()
    navigate(`/?journey=${encodeURIComponent(created)}`)
    if (itemName) {
      toast.success(`Kaufreise „${created}" angelegt`, {
        description: `„${itemName}" per Link importiert`,
      })
    } else {
      toast.success(`Kaufreise „${created}" angelegt`)
    }
  }

  async function persistFirstItem(created: string, item: JourneyItem) {
    const data = await fetchJourneyData(created)
    await saveJourneyData(created, { ...data, items: [...data.items, item] })
  }

  /** Legt die Journey an; bei 409 (Kürzel vergeben) mit Suffix erneut versuchen. */
  async function createUnique(baseSlug: string, fields: { name?: string; category?: string; description?: string }) {
    let lastError: unknown = null
    for (let attempt = 0; attempt < 6; attempt++) {
      const candidate = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`
      try {
        const { slug: created } = await createJourney({ slug: candidate, ...fields })
        return created
      } catch (error) {
        lastError = error
        if ((error as Error).message.includes('existiert bereits')) continue
        throw error
      }
    }
    throw lastError
  }

  /**
   * Journey anlegen. Mit URL, aber ohne manuelles Kürzel: erst crawlen, dann
   * Kürzel aus dem Produktnamen ableiten und anlegen. Mit Kürzel (manuell
   * oder ohne URL): direkt anlegen, URL danach wie bisher importieren.
   */
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    const link = linkTrimmed
    const manualId = normalizeJourneyId(slug)
    if (!link && !manualId) {
      toast.error('Bitte eine Produkt-URL oder ein Kürzel angeben.')
      return
    }
    setSaving(true)
    const manualFields = {
      ...(name.trim() ? { name: name.trim() } : {}),
      ...(category ? { category } : {}),
      ...(description.trim() ? { description: description.trim() } : {}),
    }
    try {
      if (link && !manualId) {
        // URL-only: crawlen (provisorischer Journey-Kontext, speichert nichts),
        // Kürzel aus dem Produktnamen ableiten, dann anlegen + Eintrag speichern.
        const provisional = suggestSlugFromUrl(link) || 'new'
        let item: JourneyItem
        try {
          ;({ item } = await importItemFromLink(provisional, link, crawlProvider, crawlFetcher))
        } catch (crawlError) {
          // Eingabefehler (400) korrigieren statt Platzhalter anzulegen.
          if (!shouldCreatePlaceholder(crawlError)) {
            console.error(crawlError)
            setSaving(false)
            toast.error('Link konnte nicht importiert werden', { description: (crawlError as Error).message })
            return
          }
          // Seite blockiert den Auto-Crawl (oder Extraktion blieb leer):
          // Journey trotzdem anlegen und einen markierten Platzhalter
          // eintragen — Inhalt wird manuell nachgereicht.
          console.error(crawlError)
          const placeholderName = name.trim() || fallbackItemName(link)
          const created = await createUnique(suggestSlugFromUrl(link) || 'journey', {
            ...manualFields,
            name: placeholderName,
          })
          await persistFirstItem(created, {
            name: placeholderName,
            price: '',
            specs: '',
            rating: '',
            status: 'Thinking',
            notes: MANUAL_CONTENT_NOTE,
            link,
            needsContent: true,
          })
          onOpenChange(false)
          reset()
          navigate(`/?journey=${encodeURIComponent(created)}`)
          toast.warning(`Kaufreise „${created}" angelegt`, {
            description: 'Seite war blockiert — Inhalt über „Inhalt einfügen" manuell nachreichen.',
          })
          return
        }
        const baseSlug = suggestSlugFromName(item.name) || provisional || 'journey'
        // Ohne manuellen Anzeigenamen übernimmt die Journey den Produktnamen.
        const created = await createUnique(baseSlug, {
          ...manualFields,
          name: name.trim() || item.name,
        })
        console.info(`[journey] aus URL angelegt: slug=${created} (Vorschlag war ${baseSlug}) name="${item.name}"`)
        await persistFirstItem(created, item)
        finish(created, item.name)
      } else {
        // Manueller Flow (mit oder ohne URL): erst anlegen, dann ggf. importieren.
        const { slug: created } = await createJourney({ slug: manualId, ...manualFields })
        if (link) {
          try {
            const { item } = await importItemFromLink(created, link, crawlProvider, crawlFetcher)
            await persistFirstItem(created, item)
            finish(created, item.name)
          } catch (crawlError) {
            console.error(crawlError)
            // Seite blockiert den Auto-Crawl (z.B. CONTENT_BLOCKED): markierten
            // Platzhalter eintragen — Inhalt wird manuell nachgereicht.
            // Eingabefehler (400) nur melden, nichts anlegen.
            const placeholder = placeholderForBlockedLink(link, crawlError)
            if (placeholder) {
              await persistFirstItem(created, placeholder)
              onOpenChange(false)
              reset()
              navigate(`/?journey=${encodeURIComponent(created)}`)
              toast.warning(`Kaufreise „${created}" angelegt`, {
                description: 'Seite war blockiert — Inhalt über „Inhalt einfügen" manuell nachreichen.',
              })
              return
            }
            onOpenChange(false)
            reset()
            navigate(`/?journey=${encodeURIComponent(created)}`)
            toast.warning(`Kaufreise „${created}" angelegt`, {
              description: `Link-Import fehlgeschlagen: ${(crawlError as Error).message}`,
            })
          }
        } else {
          finish(created)
        }
      }
    } catch (error) {
      console.error(error)
      setSaving(false)
      toast.error('Kaufreise konnte nicht angelegt werden', { description: (error as Error).message })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Neue Kaufreise anlegen</DialogTitle>
          <DialogDescription>
            URL einfügen und starten — Kürzel und Name werden automatisch übernommen.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleCreate} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-muted/40 p-3">
            <Label htmlFor="newJourneyLink">Produkt-URL</Label>
            <Input
              id="newJourneyLink"
              type="url"
              inputMode="url"
              autoFocus
              placeholder="https://… — wird gecrawlt und als erster Eintrag gespeichert"
              value={initialLink}
              onChange={(e) => setInitialLink(e.target.value)}
              disabled={saving}
            />
            <div className="grid grid-cols-2 gap-2">
              <CrawlProviderSelect stage="fetch" value={crawlFetcher} onChange={setCrawlFetcher} id="newJourneyFetcher" />
              <CrawlProviderSelect stage="extract" value={crawlProvider} onChange={setCrawlProvider} id="newJourneyProvider" />
            </div>
          </div>
          <div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowManual((v) => !v)}
              aria-expanded={showManual}
              aria-controls="newJourneyManual"
            >
              <FontAwesomeIcon icon={showManual ? faChevronUp : faChevronDown} className="text-muted-foreground" />
              {showManual ? 'Manuelle Angaben ausblenden' : 'Manuell anlegen (Kürzel, Name, Kategorie …)'}
            </Button>
          </div>
          {showManual && (
            <div id="newJourneyManual" className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="newJourneyId">Kürzel / Name</Label>
                <Input
                  id="newJourneyId"
                  required={!linkTrimmed}
                  pattern="[a-z0-9.-]+"
                  placeholder="z.B. laptop, fernseher"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {linkTrimmed
                    ? 'Optional — leer lassen, um das Kürzel aus dem Produkt zu übernehmen.'
                    : 'Wird als Kürzel für die Kaufreise verwendet (z.B. laptop)'}
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="newJourneyName">Anzeigename (optional)</Label>
                <Input
                  id="newJourneyName"
                  maxLength={80}
                  placeholder="z.B. Notebook fürs Homeoffice"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="newJourneyCategory">Kategorie (optional)</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger id="newJourneyCategory" className="w-full">
                    <SelectValue placeholder="Kategorie wählen…" />
                  </SelectTrigger>
                  <SelectContent>
                    {JOURNEY_CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="newJourneyDescription">Beschreibung (optional)</Label>
                <Textarea
                  id="newJourneyDescription"
                  className="min-h-16"
                  maxLength={500}
                  placeholder="Worum geht es bei dieser Kaufreise?"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onOpenChange(false)
                reset()
              }}
            >
              Abbrechen
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Wird angelegt…' : linkTrimmed ? 'Importieren & Starten' : 'Starten'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
