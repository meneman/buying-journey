import { useEffect, useState } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { fetchCrawlProviders, type CrawlProviderInfo } from '@/lib/api'

let cachedProviders: Promise<CrawlProviderInfo[]> | null = null
function getProviders(): Promise<CrawlProviderInfo[]> {
  if (!cachedProviders) {
    cachedProviders = fetchCrawlProviders().catch(() => {
      cachedProviders = null
      return []
    })
  }
  return cachedProviders
}

const STAGE_LABEL: Record<CrawlProviderInfo['stage'], string> = {
  extract: 'LLM-Auswertung',
  fetch: 'Parse-Tool',
}

/**
 * Stufen-Auswahl für den Zwei-Stufen-Crawl (`stage="fetch"`: Inhalt parsen,
 * `stage="extract"`: Inhalt mit LLM auswerten). "auto" nutzt den jeweiligen
 * Backend-Standard. Bleibt unsichtbar, solange die Liste nicht lädt.
 */
export function CrawlProviderSelect({
  value,
  onChange,
  id,
  stage,
}: {
  value: string
  onChange: (value: string) => void
  id?: string
  stage: CrawlProviderInfo['stage']
}) {
  const [providers, setProviders] = useState<CrawlProviderInfo[] | null>(null)

  useEffect(() => {
    let cancelled = false
    getProviders().then((list) => {
      const staged = list.filter((p) => p.stage === stage)
      if (!cancelled && staged.length > 0) setProviders(staged)
    })
    return () => {
      cancelled = true
    }
  }, [stage])

  if (!providers) return null

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} size="sm" className="w-full" aria-label={STAGE_LABEL[stage]}>
        <SelectValue placeholder="Auto" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="auto">Auto (Standard)</SelectItem>
        {providers.map((p) => (
          <SelectItem key={p.name} value={p.name} disabled={!p.configured}>
            {p.name}
            {p.configured ? '' : ' (nicht konfiguriert)'}
            {p.active ? ' ✓' : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
