import { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faLink, faCircleNotch } from '@fortawesome/free-solid-svg-icons'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { importItemFromLink } from '@/lib/api'
import { useJourneyData } from '@/lib/journey-data-context'

export function ImportLinkForm() {
  const { journey, mutate } = useJourneyData()
  const [link, setLink] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = link.trim()
    if (!trimmed || loading) return

    setLoading(true)
    try {
      const { item } = await importItemFromLink(journey, trimmed)
      mutate((prev) => ({ ...prev, items: [...prev.items, item] }))
      setLink('')
      toast.success(`„${item.name}" per Link importiert`)
    } catch (error) {
      toast.error('Import fehlgeschlagen', { description: (error as Error).message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mb-4 flex gap-2">
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
    </form>
  )
}
