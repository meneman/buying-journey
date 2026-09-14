import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import {
  faScaleBalanced,
  faLayerGroup,
  faGear,
  faLifeRing,
  faCircleDot,
  faBolt,
  faBatteryFull,
  faGauge,
  faCircleInfo,
} from '@fortawesome/free-solid-svg-icons'

const ICON_BY_KEY: Record<string, IconDefinition> = {
  gewicht: faScaleBalanced,
  weight: faScaleBalanced,
  rahmen: faLayerGroup,
  frame: faLayerGroup,
  antrieb: faGear,
  schaltung: faGear,
  groupset: faGear,
  bremsen: faLifeRing,
  brakes: faLifeRing,
  laufräder: faCircleDot,
  laufraeder: faCircleDot,
  wheels: faCircleDot,
  reifen: faCircleDot,
  tires: faCircleDot,
  reichweite: faBolt,
  range: faBolt,
  batterie: faBatteryFull,
  battery: faBatteryFull,
  leistung: faGauge,
  power: faGauge,
}

export function iconForSpecKey(key: string): IconDefinition {
  return ICON_BY_KEY[key.toLowerCase()] ?? faCircleInfo
}

export interface ParsedSpecPart {
  key: string | null
  value: string
}

/** Splits the `<br>`-joined "Key: Value" spec string into individual parts. */
export function parseSpecsString(specs: string | undefined): ParsedSpecPart[] {
  if (!specs) return []
  return specs
    .split(/<br\s*\/?>/i)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const colonIndex = part.indexOf(':')
      if (colonIndex > 0) {
        return { key: part.substring(0, colonIndex).trim(), value: part.substring(colonIndex + 1).trim() }
      }
      return { key: null, value: part }
    })
}

/** Joins textarea lines (one "Key: Value" per line) back into the `<br>`-joined storage format. */
export function serializeSpecsLines(text: string): string {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join(' <br> ')
}

/** Converts the stored `<br>`-joined format back into newline-separated lines for editing. */
export function specsStringToLines(specs: string | undefined): string {
  return (specs ?? '').replace(/<br\s*\/?>/gi, '\n')
}
