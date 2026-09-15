import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { JOURNEY_UPDATED_EVENT, buildJourneyEventsUrl, fetchJourneyData, saveJourneyData } from './api'
import { usePageSync, type SyncStatus } from './page-sync-context'
import { getAccessToken } from './supabase'
import type { JourneyData } from './types'

const EMPTY_DATA: JourneyData = {
  status: { phase: 'Planning', budget: '', targetDate: '' },
  journey: [],
  items: [],
  specs: [],
  generalNotes: '',
  headers: ['Name', 'Price', 'Specs', 'Rating', 'Status', 'Notes', 'Link'],
  sectionTitle: 'Items Under Consideration',
  listTitle: 'Spezifikationen',
}

const AUTOSAVE_DELAY = 600

interface JourneyDataContextValue {
  data: JourneyData
  status: SyncStatus
  journey: string
  reload: () => void
  /** Immediately persists a change and shows a confirmation toast (add/edit/delete actions). */
  mutate: (updater: (prev: JourneyData) => JourneyData, message?: string) => void
  /** Debounces persistence without a toast, for continuous inputs like text fields. */
  mutateDebounced: (updater: (prev: JourneyData) => JourneyData) => void
}

const JourneyDataContext = createContext<JourneyDataContextValue | null>(null)

function useJourneyDataState(journey: string): JourneyDataContextValue {
  const [data, setData] = useState<JourneyData>(EMPTY_DATA)
  const [status, setStatus] = useState<SyncStatus>('loading')
  const dataRef = useRef(data)
  dataRef.current = data
  const saveTimeout = useRef<number | undefined>(undefined)

  const load = useCallback(() => {
    setStatus('loading')
    fetchJourneyData(journey)
      .then((result) => {
        setData(result)
        setStatus('synced')
      })
      .catch((error: Error) => {
        console.error(error)
        setStatus('error')
        toast.error('Fehler beim Laden der Daten', { description: error.message })
      })
  }, [journey])

  useEffect(() => {
    load()
  }, [load])

  // Live-Updates der aktiven Journey per SSE (kein Polling, kein stilles
  // Auto-Reload): Bei `journey-updated` nur ein Toast mit Reload-Button, der
  // das bestehende `load()` aufruft. Laufende Edits/Debounce-Saves werden nie
  // überschrieben, solange der Nutzer nicht bestätigt. Der Browser reconnectet
  // automatisch per `retry:` (auch nach Backend-Neustart); bei Journey-Wechsel
  // wird der alte Stream geschlossen und der Toast verworfen.
  useEffect(() => {
    let source: EventSource | null = null
    let cancelled = false
    const toastId = `journey-update-${journey}`

    getAccessToken()
      .then((token) => {
        if (cancelled) return
        try {
          source = new EventSource(buildJourneyEventsUrl(journey, token))
        } catch {
          return
        }
        const current = source
        current.addEventListener(JOURNEY_UPDATED_EVENT, (event) => {
          try {
            const payload = JSON.parse((event as MessageEvent).data) as { slug?: string }
            // Der Stream ist bereits pro Journey gefiltert — Fremd-Journeys
            // (z.B. MCP-Schreibzugriff auf eine andere Journey) ignorieren.
            if (payload.slug && payload.slug !== journey) return
          } catch {
            // Unparsbar: trotzdem Toast zeigen (lieber einmal zu viel).
          }
          toast.info('Neue Daten vom MCP-Server', {
            id: toastId,
            description: 'Die geöffnete Journey wurde extern geändert.',
            action: {
              label: 'Neu laden',
              onClick: () => {
                load()
                toast.dismiss(toastId)
              },
            },
            duration: 30000,
          })
        })
        // `onerror` bewusst ohne Toast: `EventSource` reconnectet von selbst.
      })
      .catch(() => {
        // Ohne Token/Stream bleibt der manuelle Reload — kein harter Fehler.
      })

    return () => {
      cancelled = true
      if (source) source.close()
      toast.dismiss(toastId)
    }
  }, [journey, load])

  const persist = useCallback(
    (next: JourneyData, message?: string) => {
      setStatus('saving')
      saveJourneyData(journey, next)
        .then(() => {
          setStatus('synced')
          if (message) toast.success(message)
        })
        .catch((error: Error) => {
          console.error(error)
          setStatus('error')
          toast.error('Speichern fehlgeschlagen', { description: error.message })
        })
    },
    [journey],
  )

  const mutate = useCallback(
    (updater: (prev: JourneyData) => JourneyData, message?: string) => {
      if (saveTimeout.current) window.clearTimeout(saveTimeout.current)
      const next = updater(dataRef.current)
      setData(next)
      persist(next, message)
    },
    [persist],
  )

  const mutateDebounced = useCallback(
    (updater: (prev: JourneyData) => JourneyData) => {
      const next = updater(dataRef.current)
      setData(next)
      if (saveTimeout.current) window.clearTimeout(saveTimeout.current)
      saveTimeout.current = window.setTimeout(() => persist(next), AUTOSAVE_DELAY)
    },
    [persist],
  )

  useEffect(() => {
    return () => {
      if (saveTimeout.current) {
        window.clearTimeout(saveTimeout.current)
        persist(dataRef.current)
      }
    }
  }, [persist])

  const { publish } = usePageSync()
  useEffect(() => {
    publish(status, load)
  }, [status, load, publish])

  return { data, status, journey, reload: load, mutate, mutateDebounced }
}

export function JourneyDataProvider({ journey, children }: { journey: string; children: ReactNode }) {
  const value = useJourneyDataState(journey)
  return <JourneyDataContext.Provider value={value}>{children}</JourneyDataContext.Provider>
}

export function useJourneyData() {
  const ctx = useContext(JourneyDataContext)
  if (!ctx) throw new Error('useJourneyData must be used within a JourneyDataProvider')
  return ctx
}
