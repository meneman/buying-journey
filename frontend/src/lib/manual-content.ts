import type { JourneyItem } from './types'

/** Hinweis für Einträge, deren Seite nicht automatisch geladen werden konnte. */
export const MANUAL_CONTENT_NOTE =
  'Der Seiteninhalt konnte nicht automatisch geladen werden (Zugriff blockiert). Bitte über „Inhalt einfügen" manuell nachreichen.'

/** Lesbarer Platzhalter-Name aus einer URL, z.B. "model3 · tesla.com". */
export function fallbackItemName(link: string): string {
  try {
    const url = new URL(link)
    const host = url.hostname.replace(/^www\./, '')
    const segments = url.pathname.split('/').filter(Boolean)
    const last = segments.length > 0 ? segments[segments.length - 1].replace(/[-_]+/g, ' ') : ''
    const name = last ? `${last} · ${host}` : host
    return name.slice(0, 80) || link.slice(0, 80)
  } catch {
    return link.slice(0, 80)
  }
}

/**
 * Kürzt eingefügten Inhalt clientseitig auf eine versendbare Größe (das
 * Backend trimmt danach per cleanPastedContent auf das LLM-Limit).
 */
export function trimPastedForUpload(raw: string, maxChars = 300000): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, maxChars)
}

/**
 * Platzhalter nur bei Server-Fehlern (Fetch/Extraktion blockiert, Timeout,
 * CONTENT_BLOCKED): Der Eintrag landet markiert in der Liste. Bei 400
 * (ungültige URL, unbekannte Stufe) muss der Nutzer die Eingabe korrigieren —
 * kein Platzhalter. Ohne Status (z.B. Backend offline) ebenfalls nicht, da
 * das Speichern dann ohnehin scheitert.
 */
export function shouldCreatePlaceholder(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status
  return typeof status === 'number' && status !== 400
}

/**
 * Baut den markierten Platzhalter für einen blockierten Auto-Crawl
 * (CONTENT_BLOCKED, Fetch-/Extraktionsfehler, Timeout): Der Eintrag landet
 * mit `needsContent` in der Liste, der Inhalt wird später über
 * „Inhalt einfügen" manuell nachgereicht. Gibt `null` zurück, wenn kein
 * Platzhalter angelegt werden darf (400: Eingabefehler korrigieren;
 * fehlender Status: z.B. Backend offline).
 */
export function placeholderForBlockedLink(link: string, error: unknown, status = 'Thinking'): JourneyItem | null {
  if (!shouldCreatePlaceholder(error)) return null
  return {
    name: fallbackItemName(link),
    price: '',
    specs: '',
    rating: '',
    status,
    notes: MANUAL_CONTENT_NOTE,
    link,
    needsContent: true,
  }
}

/**
 * Führt ein per LLM geparstes Item mit dem Platzhalter zusammen: geparste
 * Felder gewinnen (leere fallen auf den Platzhalter zurück), der
 * Original-Link bleibt, das Flag wird gelöscht.
 */
export function mergeParsedContent(current: JourneyItem, parsed: JourneyItem): JourneyItem {
  const merged: JourneyItem = {
    ...current,
    name: parsed.name || current.name,
    price: parsed.price || '',
    specs: parsed.specs || '',
    rating: parsed.rating || '',
    notes: parsed.notes || '',
    link: current.link || parsed.link,
  }
  delete merged.needsContent
  return merged
}
