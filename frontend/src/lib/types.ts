export interface JourneyStatus {
  phase: string
  budget: string
  targetDate: string
}

export interface JourneyLogEntry {
  date: string
  event: string
}

export interface JourneyItem {
  name: string
  price?: string
  specs?: string
  rating?: string
  status?: string
  notes?: string
  link?: string
}

export interface JourneySpec {
  label: string
  value: string
}

export interface JourneyData {
  status: JourneyStatus
  journey: JourneyLogEntry[]
  items: JourneyItem[]
  specs: JourneySpec[]
  generalNotes: string
  headers: string[]
  sectionTitle: string
  listTitle: string
}

export const ITEM_STATUSES = [
  { value: 'Thinking', label: 'In Erwägung' },
  { value: 'Shortlisted', label: 'Engere Auswahl' },
  { value: 'Test Ridden', label: 'Erprobt/Besichtigt' },
  { value: 'Rejected', label: 'Ausgeschieden' },
  { value: 'Bought', label: 'Gekauft! 🏆' },
] as const

export const PHASES = [
  { value: 'Planning', label: 'Planung' },
  { value: 'Researching', label: 'Recherche' },
  { value: 'Test Riding', label: 'Erprobung/Besichtigung' },
  { value: 'Comparing', label: 'Vergleich' },
  { value: 'Decision', label: 'Entscheidung' },
  { value: 'Purchased', label: 'Gekauft! 🎉' },
] as const

export function translateStatus(status?: string): string {
  return ITEM_STATUSES.find((s) => s.value === status)?.label ?? status ?? ''
}

export function parseRating(rating?: string): number {
  if (!rating) return 0
  const stars = (rating.match(/⭐/g) || []).length
  if (stars > 0) return stars
  const n = parseInt(rating, 10)
  return Number.isNaN(n) ? 0 : n
}
