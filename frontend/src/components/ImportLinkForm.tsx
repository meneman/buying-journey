import { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faLink, faCircleNotch } from '@fortawesome/free-solid-svg-icons'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CrawlProviderSelect } from '@/components/CrawlProviderSelect'
import { useJourneyData } from '@/lib/journey-data-context'

export function ImportLinkForm() {
  const { startLinkJob } = useJourneyData()
  const [link, setLink] = useState('')
  const [provider, setProvider] = useState('auto')
  const [fetcher, setFetcher] = useState('auto')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = link.trim()
    if (!trimmed || submitting) return

    // Nur der Auftrag wird angelegt (Antwort sofort 202) — Fortschritt,
    // Übernahme und Fehler zeigt die Job-Karte unter dem Formular.
    setSubmitting(true)
    try {
      await startLinkJob(trimmed, provider, fetcher)
      setLink('')
    } catch (error) {
      console.error(error)
      toast.error('Import fehlgeschlagen', { description: (error as Error).message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mb-4 flex flex-col gap-2">
      <div className="flex gap-2">
        <Input
          type="url"
          inputMode="url"
          placeholder="Produkt-Link einfügen, um ihn automatisch zu importieren…"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          disabled={submitting}
        />
        <Button type="submit" variant="outline" className="shrink-0" disabled={submitting || !link.trim()}>
          {submitting ? <FontAwesomeIcon icon={faCircleNotch} className="size-4" spin /> : <FontAwesomeIcon icon={faLink} className="size-4" />}
          Importieren
        </Button>
      </div>
      <div className="grid max-w-lg grid-cols-2 gap-2">
        <CrawlProviderSelect stage="fetch" value={fetcher} onChange={setFetcher} id="import-fetcher" />
        <CrawlProviderSelect stage="extract" value={provider} onChange={setProvider} id="import-provider" />
      </div>
    </form>
  )
}
