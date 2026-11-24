import type { JourneyItem, SpecComparison } from './types.ts'

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

export interface GroupedSpecKeys {
  /** True when >= 2 items exist so Compare splits into common vs. unique sections. */
  split: boolean
  commonKeys: string[]
  uniqueKeys: string[]
  allKeys: string[]
}

/**
 * Gruppiert Spec-Keys in gemeinsame (bei allen Items befüllt) vs. Einzel-Eigenschaften.
 * Nutzt `specComparison` vom Backend, falls vorhanden, und fällt deterministisch
 * (case-insensitiv) auf die tatsächlichen Item-Specs zurück, wenn sie fehlt oder
 * unvollständig ist.
 */
export function groupSpecKeys(items: JourneyItem[], specComparison?: SpecComparison): GroupedSpecKeys {
  const keyOrder: string[] = []
  const displayByLower = new Map<string, string>()
  const filledItemsByLower = new Map<string, Set<number>>()

  items.forEach((item, index) => {
    for (const part of parseSpecsString(item.specs)) {
      if (!part.key) continue
      const lower = part.key.toLowerCase()
      if (!displayByLower.has(lower)) {
        displayByLower.set(lower, part.key)
        filledItemsByLower.set(lower, new Set())
        keyOrder.push(lower)
      }
      if (part.value.trim() !== '') {
        filledItemsByLower.get(lower)!.add(index)
      }
    }
  })

  const allKeys = keyOrder.map((lower) => displayByLower.get(lower)!)
  if (items.length < 2) {
    return { split: false, commonKeys: [], uniqueKeys: [], allKeys }
  }

  const total = items.length
  const commonKeys: string[] = []
  const uniqueKeys: string[] = []
  const assigned = new Set<string>()

  if (specComparison && Array.isArray(specComparison.commonKeys) && Array.isArray(specComparison.uniqueKeys)) {
    for (const raw of specComparison.commonKeys) {
      const lower = raw.toLowerCase()
      if (displayByLower.has(lower) && !assigned.has(lower)) {
        commonKeys.push(displayByLower.get(lower)!)
        assigned.add(lower)
      }
    }
    for (const raw of specComparison.uniqueKeys) {
      const lower = raw.toLowerCase()
      if (displayByLower.has(lower) && !assigned.has(lower)) {
        uniqueKeys.push(displayByLower.get(lower)!)
        assigned.add(lower)
      }
    }
  }

  for (const lower of keyOrder) {
    if (assigned.has(lower)) continue
    const label = displayByLower.get(lower)!
    if (filledItemsByLower.get(lower)!.size === total) {
      commonKeys.push(label)
    } else {
      uniqueKeys.push(label)
    }
    assigned.add(lower)
  }

  return { split: true, commonKeys, uniqueKeys, allKeys }
}
