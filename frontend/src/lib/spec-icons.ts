import {
  Scale,
  Layers,
  Cog,
  Disc,
  CircleDot,
  Zap,
  BatteryFull,
  Gauge,
  Info,
  type LucideIcon,
} from 'lucide-react'

const ICON_BY_KEY: Record<string, LucideIcon> = {
  gewicht: Scale,
  weight: Scale,
  rahmen: Layers,
  frame: Layers,
  antrieb: Cog,
  schaltung: Cog,
  groupset: Cog,
  bremsen: Disc,
  brakes: Disc,
  laufräder: CircleDot,
  laufraeder: CircleDot,
  wheels: CircleDot,
  reifen: CircleDot,
  tires: CircleDot,
  reichweite: Zap,
  range: Zap,
  batterie: BatteryFull,
  battery: BatteryFull,
  leistung: Gauge,
  power: Gauge,
}

export function iconForSpecKey(key: string): LucideIcon {
  return ICON_BY_KEY[key.toLowerCase()] ?? Info
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
