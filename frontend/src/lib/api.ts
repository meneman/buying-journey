import type { JourneyConfig, JourneyConfigPatch, JourneyData, JourneyItem } from './types'
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

export function fetchFeedback(journey: string): Promise<{ content: string }> {
  return request(`/api/feedback?journey=${encodeURIComponent(journey)}`)
}

export interface CrawlProviderInfo {
  stage: 'extract' | 'fetch'
  name: string
  description: string
  configured: boolean
  active: boolean
}

/** Verfügbare Crawl-Provider mit Status (`GET /api/crawl-providers`). */
export function fetchCrawlProviders(): Promise<CrawlProviderInfo[]> {
  return request<CrawlProviderInfo[]>('/api/crawl-providers')
}

/**
 * Crawlt eine Produkt-URL in zwei Stufen (Inhalt parsen, dann mit LLM
 * auswerten) und gibt das Item zurück (speichert nichts — der Aufrufer
 * persistiert direkt, ohne Kontrolle). `provider` wählt die LLM-Auswertung,
 * `fetcher` das Parse-Tool; leer/Auto nutzt jeweils den Backend-Standard.
 */
export interface ImportLinkMeta {
  host: string
  fallbackFrom: string | null
  titleChars: number
  textChars: number
  fetchMs: number
  extractMs: number
}

/** Status eines Crawl-Jobs (`POST /api/import-link`, `POST /api/parse-text`). */
export type ImportJobStatus = 'in progress' | 'done' | 'errored'

/** Job-Ansicht des Backends (`202`-Antwort und `GET /api/import-jobs/:id`). */
export interface ImportJob {
  jobId: string
  kind: 'import-link' | 'parse-text'
  journey?: string
  status: ImportJobStatus
  /** Warteposition (0 = läuft oder fertig, N > 0 = wartet hinter N Jobs). */
  position: number
  queueLength: number
  createdAt?: string
  startedAt?: string | null
  finishedAt?: string | null
  item?: JourneyItem
  provider?: string
  fetcher?: string | null
  meta?: ImportLinkMeta | null
  error?: string
  code?: string
  statusCode?: number
}

/**
 * Legt einen Link-Import als Queue-Job an und antwortet sofort mit 202 —
 * blockiert nicht bis zur Fertigstellung. `provider`/`fetcher` wählen die
 * Stufen; leer/Auto nutzt jeweils den Backend-Standard. Prüffehler (400/501)
 * werfen wie bisher einen `ApiError`.
 */
export function submitImportLink(
  journey: string,
  link: string,
  provider?: string,
  fetcher?: string,
): Promise<ImportJob> {
  console.info(`[import] submit journey=${journey} provider=${provider || 'auto'} fetcher=${fetcher || 'auto'} link=${link}`)
  return request<ImportJob>(`/api/import-link?journey=${encodeURIComponent(journey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      link,
      ...(provider && provider !== 'auto' ? { provider } : {}),
      ...(fetcher && fetcher !== 'auto' ? { fetcher } : {}),
    }),
  })
}

/**
 * Legt eine Text-Auswertung als Queue-Job an (Antwort sofort 202).
 * Serverseitig getrimmt, speichert nichts.
 */
export function submitParseText(
  journey: string,
  text: string,
  link?: string,
  provider?: string,
): Promise<ImportJob> {
  console.info(`[import] parse-text submit journey=${journey} provider=${provider || 'auto'} roh=${text.length}ch`)
  return request<ImportJob>(`/api/parse-text?journey=${encodeURIComponent(journey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      ...(link ? { link } : {}),
      ...(provider && provider !== 'auto' ? { provider } : {}),
    }),
  })
}

/**
 * Liest einen Crawl-Job (für Reload/Reconnect nach 202). Wirft `ApiError`
 * mit 404, wenn der Job unbekannt, abgelaufen oder nach Backend-Neustart
 * verworfen ist.
 */
export function fetchImportJob(jobId: string): Promise<ImportJob> {
  return request<ImportJob>(`/api/import-jobs/${encodeURIComponent(jobId)}`)
}

/**
 * Wartet per `GET`-Polling auf einen fertigen Job (`done` → auflösen,
 * `errored` → `ApiError` mit Fehlertext/Code/Status werfen). Für Dialoge,
 * die das Item zum Weitermachen brauchen (Heim-Dialog, Produkt-Dialog).
 */
export async function pollImportJob(
  jobId: string,
  options?: { intervalMs?: number; timeoutMs?: number; onUpdate?: (job: ImportJob) => void },
): Promise<ImportJob> {
  const intervalMs = options?.intervalMs ?? 1500
  const timeoutMs = options?.timeoutMs ?? 10 * 60 * 1000
  const start = Date.now()
  for (;;) {
    const job = await fetchImportJob(jobId)
    options?.onUpdate?.(job)
    if (job.status === 'done') return job
    if (job.status === 'errored') {
      const error = new Error(job.error || 'Import fehlgeschlagen') as ApiError
      error.status = job.statusCode ?? 502
      if (job.code) error.code = job.code
      throw error
    }
    if (Date.now() - start > timeoutMs) {
      const error = new Error('Zeitüberschreitung beim Warten auf den Import-Job.') as ApiError
      error.status = 504
      throw error
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
}

/**
 * Crawlt eine Produkt-URL in zwei Stufen (Inhalt parsen, dann mit LLM
 * auswerten) und gibt das Item zurück (speichert nichts — der Aufrufer
 * persistiert direkt, ohne Kontrolle). `provider` wählt die LLM-Auswertung,
 * `fetcher` das Parse-Tool; leer/Auto nutzt jeweils den Backend-Standard.
 * Legt einen Queue-Job an und wartet per `GET`-Polling auf `done`
 * (für Dialoge, die das Item zum Weitermachen brauchen).
 * Schreibt Start- und Ergebniszeilen in die Browser-Konsole (Import nachvollziehen).
 */
export async function importItemFromLink(
  journey: string,
  link: string,
  provider?: string,
  fetcher?: string,
): Promise<{ item: JourneyItem; provider?: string; fetcher?: string | null; meta?: ImportLinkMeta | null }> {
  console.info(`[import] start journey=${journey} provider=${provider || 'auto'} fetcher=${fetcher || 'auto'} link=${link}`)
  const job = await pollImportJob((await submitImportLink(journey, link, provider, fetcher)).jobId)
  if (!job.item) {
    const error = new Error('Import-Job lieferte kein Item.') as ApiError
    error.status = 502
    throw error
  }
  const meta = job.meta
  console.info(
    `[import] ok "${job.item.name}" provider=${job.provider} fetcher=${job.fetcher}` +
      `${meta?.fallbackFrom ? ` fallback=${meta.fallbackFrom}->${job.fetcher}` : ''}` +
      ` text=${meta?.textChars ?? '?'}ch fetchMs=${meta?.fetchMs ?? '?'} extractMs=${meta?.extractMs ?? '?'}` +
      ` specs=${job.item.specs ? 'ja' : 'nein'} preis=${job.item.price ? 'ja' : 'nein'}`,
  )
  return { item: job.item, provider: job.provider, fetcher: job.fetcher, meta: job.meta }
}

/**
 * Wertet manuell eingefügten Seiteninhalt per LLM aus (Fallback, wenn der
 * Auto-Crawl blockiert war; serverseitig getrimmt, speichert nichts).
 * Legt einen Queue-Job an und wartet per `GET`-Polling auf `done`.
 */
export async function parseItemFromText(
  journey: string,
  text: string,
  link?: string,
  provider?: string,
): Promise<{ item: JourneyItem; provider?: string; meta?: ImportLinkMeta | null }> {
  console.info(`[import] parse-text start journey=${journey} provider=${provider || 'auto'} roh=${text.length}ch`)
  const job = await pollImportJob((await submitParseText(journey, text, link, provider)).jobId)
  if (!job.item) {
    const error = new Error('Import-Job lieferte kein Item.') as ApiError
    error.status = 502
    throw error
  }
  console.info(
    `[import] parse-text ok "${job.item.name}" provider=${job.provider}` +
      ` text=${job.meta?.textChars ?? '?'}ch extractMs=${job.meta?.extractMs ?? '?'}` +
      ` specs=${job.item.specs ? 'ja' : 'nein'} preis=${job.item.price ? 'ja' : 'nein'}`,
  )
  return { item: job.item, provider: job.provider, meta: job.meta }
}
