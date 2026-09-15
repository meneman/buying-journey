import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { faBicycle, faCar, faLaptop, faHouse, faBox, faCouch } from '@fortawesome/free-solid-svg-icons'

function iconForKeyword(value: string): IconDefinition | null {
  const j = value.toLowerCase()
  if (/bike|fahrrad|rad|rennrad|gravel/.test(j)) return faBicycle
  if (/ev|e-auto|car|auto|tesla|vehicle|kfz/.test(j)) return faCar
  if (/laptop|computer|pc|notebook|macbook/.test(j)) return faLaptop
  if (/wohnung|haus|apartment|house|miete|immobilie/.test(j)) return faHouse
  if (/haushalt|küche|kueche|fernseher|tv|sofa|couch|möbel|moebel/.test(j)) return faCouch
  return null
}

/**
 * Passendes Icon für eine Kaufreise: die explizite Kategorie (Basis-Eigenschaft
 * aus den Einstellungen) gewinnt, sonst wird vom Slug abgeleitet.
 */
export function iconForJourney(journey: string, category?: string): IconDefinition {
  if (category) {
    const byCategory = iconForKeyword(category)
    if (byCategory) return byCategory
  }
  return iconForKeyword(journey) ?? faBox
}
