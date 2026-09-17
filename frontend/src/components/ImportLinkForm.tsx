import { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faLink, faCircleNotch } from '@fortawesome/free-solid-svg-icons'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CrawlProviderSelect } from '@/components/CrawlProviderSelect'
import { importItemFromLink } from '@/lib/api'
import { useJourneyData } from '@/lib/journey-data-context'
import { placeholderForBlockedLink } from '@/lib/manual-content'

export function ImportLinkForm() {
  const { journey, mutate } = useJourneyData()
  const [link, setLink] = useState('')
  const [provider, setProvider] = useState('auto')
  const [fetcher, setFetcher] = useState('auto')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = link.trim()
    if (!trimmed || loading) return

    setLoading(true)
    try {
      const { item } = await importItemFromLink(journey, trimmed, provider, fetcher)
      mutate((prev) => ({ ...prev, items: [...prev.items, item] }))
      setLink('')
      toast.success(`„${item.name}" per Link importiert`)
    } catch (error) {
      // Seite blockiert den Auto-Crawl: markierten Platzhalter anhängen —
      // der Inhalt wird danach über „Inhalt einfügen" manuell nachgereicht.
      const placeholder = placeholderForBlockedLink(trimmed, error)
      if (!placeholder) {
        toast.error('Import fehlgeschlagen', { description: (error as Error).message })
        return
      }
      console.error(error)
      mutate((prev) => ({
        ...prev,
        items: [...prev.items, placeholder],
      }))
      setLink('')
      toast.warning('Crawl blockiert — Platzhalter angelegt', {
        description: 'Inhalt über „Inhalt einfügen" manuell nachreichen.',
      })
    } finally {
      setLoading(false)
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
          disabled={loading}
        />
        <Button type="submit" variant="outline" className="shrink-0" disabled={loading || !link.trim()}>
          {loading ? <FontAwesomeIcon icon={faCircleNotch} className="size-4" spin /> : <FontAwesomeIcon icon={faLink} className="size-4" />}
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
