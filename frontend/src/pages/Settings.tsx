import { useCallback, useEffect, useMemo, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faGear, faRotateLeft, faFloppyDisk } from '@fortawesome/free-solid-svg-icons'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { fetchJourneyConfig, saveJourneyConfig } from '@/lib/api'
import { iconForJourney } from '@/lib/journey-category'
import { usePageSync } from '@/lib/page-sync-context'
import { useJourney } from '@/lib/router'
import { JOURNEY_CATEGORIES, type JourneyConfig, type JourneyConfigPatch } from '@/lib/types'

type Status = 'loading' | 'synced' | 'error' | 'saving'

const EDITABLE_KEYS = ['name', 'description', 'category', 'currency', 'sectionTitle', 'listTitle'] as const
type EditableKey = (typeof EDITABLE_KEYS)[number]

/** Select-Sentinel für „keine Kategorie" (Radix-Items brauchen nicht-leere Values). */
const CATEGORY_EMPTY = '__empty__'

function toForm(config: JourneyConfig): Record<EditableKey, string> {
  return {
    name: config.name,
    description: config.description,
    category: config.category,
    currency: config.currency,
    sectionTitle: config.sectionTitle,
    listTitle: config.listTitle,
  }
}

function diffPatch(base: JourneyConfig, form: Record<EditableKey, string>): JourneyConfigPatch | null {
  const patch: JourneyConfigPatch = {}
  for (const key of EDITABLE_KEYS) {
    const next = key === 'category' ? form[key].trim().toLowerCase() : form[key].trim()
    const current = base[key]
    if (next !== current) patch[key] = form[key]
  }
  return Object.keys(patch).length > 0 ? patch : null
}

/**
 * Einstellungen & Konfiguration einer Kaufreise: Basis-Eigenschaften (Name,
 * Beschreibung, Kategorie, Währung) plus Anzeige-Settings (Titel der
 * Vergleichs- und Eigenschaften-Listen). Eigene Ressource (`/api/journey-config`),
 * daher ohne JourneyDataProvider — wie die Feedback-Seite.
 */
export function Settings() {
  const journey = useJourney()
  const { publish } = usePageSync()
  const [config, setConfig] = useState<JourneyConfig | null>(null)
  const [form, setForm] = useState<Record<EditableKey, string> | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setStatus('loading')
    setError(null)
    fetchJourneyConfig(journey)
      .then((result) => {
        setConfig(result)
        setForm(toForm(result))
        setStatus('synced')
      })
      .catch((err: Error) => {
        console.error(err)
        setError(err.message)
        setStatus('error')
        toast.error('Fehler beim Laden der Einstellungen', { description: err.message })
      })
  }, [journey])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    publish(status === 'saving' ? 'saving' : status === 'loading' ? 'loading' : status === 'error' ? 'error' : 'synced', load)
  }, [status, load, publish])

  const patch = useMemo(
    () => (config && form ? diffPatch(config, form) : null),
    [config, form],
  )

  function set<K extends EditableKey>(key: K, value: string) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  function handleReset() {
    if (config) setForm(toForm(config))
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!config || !patch) return
    setStatus('saving')
    saveJourneyConfig(journey, patch)
      .then(({ config: next }) => {
        setConfig(next)
        setForm(toForm(next))
        setStatus('synced')
        toast.success('Einstellungen gespeichert')
      })
      .catch((err: Error) => {
        console.error(err)
        setStatus('synced')
        toast.error('Speichern fehlgeschlagen', { description: err.message })
      })
  }

  if (!config || !form) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
        <FontAwesomeIcon icon={faGear} className="size-8 text-muted-foreground" />
        <h3 className="font-heading font-medium">
          {status === 'error' ? 'Einstellungen konnten nicht geladen werden' : 'Lädt…'}
        </h3>
        {error && <p className="max-w-sm text-sm text-muted-foreground">{error}</p>}
        {status === 'error' && <Button onClick={load}>Erneut versuchen</Button>}
      </div>
    )
  }

  const PreviewIcon = iconForJourney(journey, form.category || config.category)
  const categoryOptions = config.category &&
    !JOURNEY_CATEGORIES.some((c) => c.value === config.category) &&
    !JOURNEY_CATEGORIES.some((c) => c.value === form.category)
    ? [{ value: config.category, label: `${config.category} (bisher)` }]
    : []

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="font-heading text-lg font-semibold">Einstellungen</h2>
          <span className="font-mono text-xs text-muted-foreground">{journey}</span>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" disabled={!patch || status === 'saving'} onClick={handleReset}>
            <FontAwesomeIcon icon={faRotateLeft} className="size-4" />
            Zurücksetzen
          </Button>
          <Button type="submit" size="sm" disabled={!patch || status === 'saving'}>
            <FontAwesomeIcon icon={faFloppyDisk} className="size-4" />
            {status === 'saving' ? 'Speichert…' : 'Speichern'}
          </Button>
        </div>
      </div>

      <Card size="sm">
        <CardHeader>
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-full bg-muted">
              <FontAwesomeIcon icon={PreviewIcon} className="size-5 text-celeste" />
            </span>
            <div>
              <CardTitle>Basis-Eigenschaften</CardTitle>
              <CardDescription>
                Name, Kategorie und Währung erscheinen auf der Startseite und in der Kopfzeile.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cfg-name">Anzeigename</Label>
            <Input
              id="cfg-name"
              required
              maxLength={80}
              placeholder={journey}
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cfg-category">Kategorie</Label>
              <Select
                value={form.category || CATEGORY_EMPTY}
                onValueChange={(v) => set('category', v === CATEGORY_EMPTY ? '' : v)}
              >
                <SelectTrigger id="cfg-category" className="w-full">
                  <SelectValue placeholder="Kategorie wählen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={CATEGORY_EMPTY}>— Keine —</SelectItem>
                  {[...JOURNEY_CATEGORIES, ...categoryOptions].map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cfg-currency">Währung</Label>
              <Input
                id="cfg-currency"
                maxLength={10}
                placeholder="€"
                value={form.currency}
                onChange={(e) => set('currency', e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="cfg-description">Beschreibung</Label>
            <Textarea
              id="cfg-description"
              className="min-h-20"
              maxLength={500}
              placeholder="Worum geht es bei dieser Kaufreise? z.B. Pendler-Bike bis 2500 €…"
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Anzeige &amp; Listen</CardTitle>
          <CardDescription>
            Titel der Produktliste (Dashboard &amp; Vergleich) und der Eigenschaften-Seite.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cfg-sectionTitle">Titel Produktliste</Label>
            <Input
              id="cfg-sectionTitle"
              maxLength={120}
              placeholder="z.B. Bikes Under Consideration"
              value={form.sectionTitle}
              onChange={(e) => set('sectionTitle', e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cfg-listTitle">Titel Eigenschaften</Label>
            <Input
              id="cfg-listTitle"
              maxLength={120}
              placeholder="z.B. Rahmengrößen"
              value={form.listTitle}
              onChange={(e) => set('listTitle', e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <p className="font-mono text-xs text-muted-foreground">
        Kürzel: {config.slug}
        {config.createdAt && ` · angelegt: ${config.createdAt}`}
        {config.updatedAt && ` · geändert: ${config.updatedAt}`}
      </p>
    </form>
  )
}
