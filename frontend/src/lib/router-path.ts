/**
 * Bestimmt das Ziel für einen Journey-Wechsel aus dem Dropdown:
 * Dashboard, Vergleich, Feedback, Eigenschaften bleiben auf der jeweiligen
 * Unterseite erhalten. Einstellungen (und nicht-journey-gebundene Pfade wie
 * /mcp) leiten bei einem Journey-Wechsel immer auf das Dashboard (`/`) weiter.
 */
export function targetPathForJourneySwitch(pathname: string): string {
  const normalized = pathname.replace(/\/+$/, '') || '/'
  if (normalized === '/einstellungen' || normalized === '/mcp' || normalized === '/login') {
    return '/'
  }
  return normalized
}
