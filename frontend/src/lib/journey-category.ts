import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { faBicycle, faCar, faLaptop, faHouse, faBox } from '@fortawesome/free-solid-svg-icons'

/** Mirrors the backend's getJourneyEmoji category matching, for a fitting icon per journey type. */
export function iconForJourney(journey: string): IconDefinition {
  const j = journey.toLowerCase()
  if (/bike|fahrrad|rad|rennrad|gravel/.test(j)) return faBicycle
  if (/ev|car|auto|tesla|vehicle/.test(j)) return faCar
  if (/laptop|computer|pc|notebook|macbook/.test(j)) return faLaptop
  if (/wohnung|haus|apartment|house|miete/.test(j)) return faHouse
  return faBox
}
