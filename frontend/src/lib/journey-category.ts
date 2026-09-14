import { Bike, Car, Laptop, Home, Package, type LucideIcon } from 'lucide-react'

/** Mirrors the backend's getJourneyEmoji category matching, for a fitting icon per journey type. */
export function iconForJourney(journey: string): LucideIcon {
  const j = journey.toLowerCase()
  if (/bike|fahrrad|rad|rennrad|gravel/.test(j)) return Bike
  if (/ev|car|auto|tesla|vehicle/.test(j)) return Car
  if (/laptop|computer|pc|notebook|macbook/.test(j)) return Laptop
  if (/wohnung|haus|apartment|house|miete/.test(j)) return Home
  return Package
}
