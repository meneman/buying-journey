import type { JourneyConfig, JourneyConfigPatch, JourneyData, JourneyItem } from './types'
import { getAccessToken } from './supabase'

/** Authorization-Header der Supabase-Session (leer, wenn abgemeldet/nicht konfiguriert). */
async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: { ...(await authHeaders()), ...((options?.headers as Record<string, string>) || {}) },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error || `Anfrage fehlgeschlagen (${response.status})`)
  }
  return response.json() as Promise<T>
}

export interface AuthUser {
  id: string
  email: string | null
  appMetadata: Record<string, unknown>
  userMetadata: Record<string, unknown>
  aud: string | null
}

/** Aktueller Nutzer laut Backend (verifiziertes Supabase-JWT). Wirft bei 401. */
export function fetchMe(): Promise<{ user: AuthUser }> {
  return request<{ user: AuthUser }>('/api/me')
}

export function fetchJourneys(): Promise<string[]> {
  return request<string[]>('/api/journeys')
}

export interface CreateJourneyInput {
  slug: string
  name?: string
  description?: string
  category?: string
  currency?: string
  phase?: string
  budget?: string
  targetDate?: string
  generalNotes?: string
  sectionTitle?: string
  listTitle?: string
}

export function createJourney(input: CreateJourneyInput): Promise<{ success: boolean; slug: string }> {
  return request('/api/journeys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

/** Alle Journey-Configs für die Startseite (slug-sortiert, ohne Items/Logs). */
export function fetchJourneyConfigs(): Promise<JourneyConfig[]> {
  return request<JourneyConfig[]>('/api/journey-configs')
}

/** Basis-Eigenschaften + Settings einer Journey lesen. */
export function fetchJourneyConfig(journey: string): Promise<JourneyConfig> {
  return request<JourneyConfig>(`/api/journey-config?journey=${encodeURIComponent(journey)}`)
}

/** Basis-Eigenschaften + Settings einer Journey partiell schreiben. */
export function saveJourneyConfig(
  journey: string,
  patch: JourneyConfigPatch,
): Promise<{ success: boolean; config: JourneyConfig }> {
  return request(`/api/journey-config?journey=${encodeURIComponent(journey)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
}

export function fetchJourneyData(journey: string): Promise<JourneyData> {
  return request<JourneyData>(`/api/data?journey=${encodeURIComponent(journey)}`)
}

/** SSE-Event-Name für externe Journey-Änderungen (z.B. MCP-`add_item`). */
export const JOURNEY_UPDATED_EVENT = 'journey-updated'

/**
 * URL für den SSE-Stream der aktiven Journey (`GET /api/data/events`).
 * `EventSource` kann keine Authorization-Header senden — das Backend akzeptiert
 * den Supabase-Bearer [REDACTED] auch als `?token=` (siehe `extractBearerToken`).
 */
export function buildJourneyEventsUrl(journey: string, token?: string | null): string {
  const query = `journey=${encodeURIComponent(journey)}${token ? `&token=${encodeURIComponent(token)}` : ''}`
  return `/api/data/events?${query}`
}

export function saveJourneyData(journey: string, data: JourneyData): Promise<{ success: boolean }> {
  return request(`/api/data?journey=${encodeURIComponent(journey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export function fetchFeedback(journey: string): Promise<{ content: string }> {
  return request(`/api/feedback?journey=${encodeURIComponent(journey)}`)
}

export function importItemFromLink(journey: string, link: string): Promise<{ item: JourneyItem }> {
  return request(`/api/import-link?journey=${encodeURIComponent(journey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ link }),
  })
}
