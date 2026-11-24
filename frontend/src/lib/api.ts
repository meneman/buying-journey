import type { JourneyConfig, JourneyConfigPatch, JourneyData } from './types'
import { getAccessToken } from './supabase'

/** Authorization-Header der Supabase-Session (leer, wenn abgemeldet/nicht konfiguriert). */
async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export interface ApiError extends Error {
  status: number
  code?: string
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: { ...(await authHeaders()), ...((options?.headers as Record<string, string>) || {}) },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const error = new Error(body?.error || `Anfrage fehlgeschlagen (${response.status})`) as ApiError
    error.status = response.status
    if (body?.code) error.code = body.code
    throw error
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

export interface McpToolInputSchema {
  type: string
  properties?: Record<string, { type?: string; description?: string }>
  required?: string[]
}

export interface McpToolInfo {
  name: string
  description: string
  inputSchema?: McpToolInputSchema
}

export interface McpStatus {
  server: { name: string; version: string }
  protocolVersion: string
  tools: McpToolInfo[]
  serverFile?: string
  packageName?: string
  port?: number
  baseUrl?: string
}

/**
 * MCP-Status (Name/Version/Tool-Liste aus `GET /api/mcp-status`). Wirft bei
 * gestopptem Backend — die `/mcp`-Seite bleibt dann trotzdem lesbar und zeigt
 * nur den Status rot.
 */
export function fetchMcpStatus(): Promise<McpStatus> {
  return request<McpStatus>('/api/mcp-status')
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

export interface ApiKey {
  id: number
  name: string
  createdAt: string
}

interface RawApiKey {
  id: number
  name: string
  created_at?: string
  createdAt?: string
}

/** API-Keys des angemeldeten Nutzers auflisten (`GET /api/api-keys`). */
export async function fetchApiKeys(): Promise<ApiKey[]> {
  const rawList = await request<RawApiKey[]>('/api/api-keys')
  return (rawList || []).map((k) => ({
    id: k.id,
    name: k.name || '',
    createdAt: k.created_at || k.createdAt || '',
  }))
}

/** Neuen langlebigen API-Key für MCP erstellen (`POST /api/api-keys`). */
export function createApiKey(name?: string): Promise<{ success: boolean; id: number; key: string; name: string }> {
  return request<{ success: boolean; id: number; key: string; name: string }>('/api/api-keys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name ? name.trim() : '' }),
  })
}

/** API-Key widerrufen (`DELETE /api/api-keys/:id`). */
export function revokeApiKey(id: number | string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/api/api-keys/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export function fetchFeedback(journey: string): Promise<{ content: string }> {
  return request(`/api/feedback?journey=${encodeURIComponent(journey)}`)
}
