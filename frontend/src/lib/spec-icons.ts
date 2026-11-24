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

export { groupSpecKeys, parseSpecsString, type GroupedSpecKeys, type ParsedSpecPart } from './spec-grouping'

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
