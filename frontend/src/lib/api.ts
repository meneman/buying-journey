import type { JourneyData, JourneyItem } from './types'

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options)
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error || `Anfrage fehlgeschlagen (${response.status})`)
  }
  return response.json() as Promise<T>
}

export function fetchJourneys(): Promise<string[]> {
  return request<string[]>('/api/journeys')
}

export function fetchJourneyData(journey: string): Promise<JourneyData> {
  return request<JourneyData>(`/api/data?journey=${encodeURIComponent(journey)}`)
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
