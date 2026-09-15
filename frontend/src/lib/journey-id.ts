const RECENT_KEY = 'recent_journeys'

/** Normalizes a user-entered journey id the same way everywhere (lowercase, safe chars only). */
export function normalizeJourneyId(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9.-]/g, '')
}

export function readRecentJourneys(): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(RECENT_KEY) || '[]')
    return Array.isArray(parsed) ? parsed.filter((j): j is string => typeof j === 'string') : []
  } catch {
    return []
  }
}

export function rememberRecentJourney(journey: string) {
  const recent = readRecentJourneys()
  if (!recent.includes(journey)) {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify([...recent, journey]))
  }
}
