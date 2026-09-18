import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import {
  JOURNEY_UPDATED_EVENT,
  buildJourneyEventsUrl,
  fetchImportJob,
  fetchJourneyData,
  saveJourneyData,
  submitImportLink,
  submitParseText,
  type ApiError,
  type ImportJob,
} from './api'
import { usePageSync, type SyncStatus } from './page-sync-context'
import { getAccessToken } from './supabase'
import { mergeParsedContent, placeholderForBlockedLink } from './manual-content'
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

/**
 * Ein Crawl-Job aus Sicht der UI: `done`-Jobs werden sofort übernommen und
 * aus der Liste entfernt — sichtbar bleiben laufende (`in progress` inkl.
 * Warteposition) und fehlgeschlagene (`errored` mit Retry) Jobs.
 */
export interface TrackedImportJob {
  jobId: string
  kind: 'import-link' | 'parse-text'
  /** import-link: die URL; parse-text: der Link des Platzhalters (kann leer sein). */
  link: string
  provider?: string
  fetcher?: string
  status: 'in progress' | 'errored'
  position: number
  queueLength: number
  error?: string
  code?: string
}

interface StoredImportJob {
  jobId: string
  kind: 'import-link' | 'parse-text'
  link: string
  provider?: string
  fetcher?: string
}

function pendingJobsKey(journey: string): string {
  return `journeypath:import-jobs:${journey}`
}

/** Wartende Jobs für Reload-Resume (nur lesend; Schreiben via writeStoredJobs). */
function readStoredJobs(journey: string): StoredImportJob[] {
  try {
    const raw = localStorage.getItem(pendingJobsKey(journey))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (entry): entry is StoredImportJob =>
        !!entry &&
        typeof entry === 'object' &&
        typeof (entry as StoredImportJob).jobId === 'string' &&
        ((entry as StoredImportJob).kind === 'import-link' || (entry as StoredImportJob).kind === 'parse-text') &&
        typeof (entry as StoredImportJob).link === 'string',
    )
  } catch {
    return []
  }
}

function writeStoredJobs(journey: string, jobs: StoredImportJob[]): void {
  try {
    if (jobs.length === 0) localStorage.removeItem(pendingJobsKey(journey))
    else localStorage.setItem(pendingJobsKey(journey), JSON.stringify(jobs))
  } catch {
    // Privater Modus o.ä. — Jobs laufen ohne Reload-Resume weiter.
  }
}

interface JourneyDataContextValue {
  data: JourneyData
  status: SyncStatus
  journey: string
  reload: () => void
  /** Immediately persists a change and shows a confirmation toast (add/edit/delete actions). */
  mutate: (updater: (prev: JourneyData) => JourneyData, message?: string) => void
  /** Debounces persistence without a toast, for continuous inputs like text fields. */
  mutateDebounced: (updater: (prev: JourneyData) => JourneyData) => void
  /** Laufende/fehlgeschlagene Crawl-Jobs dieser Journey (Job-Liste statt Spinner). */
  jobs: TrackedImportJob[]
  /** Legt einen Link-Import als Queue-Job an (Antwort sofort 202, kein Blockieren). */
  startLinkJob: (link: string, provider?: string, fetcher?: string) => Promise<void>
  /** Legt eine Text-Auswertung als Queue-Job an (Ergebnis landet im Platzhalter). */
  startTextJob: (text: string, link?: string, provider?: string) => Promise<void>
  /** Legt einen fehlgeschlagenen Link-Job erneut an (neuer Auftrag via POST). */
  retryJob: (jobId: string) => Promise<void>
  /** Entfernt einen Job aus der Liste (verwirft die Anzeige, nicht das Item). */
  dismissJob: (jobId: string) => void
}

const JourneyDataContext = createContext<JourneyDataContextValue | null>(null)

function useJourneyDataState(journey: string): JourneyDataContextValue {
  const [data, setData] = useState<JourneyData>(EMPTY_DATA)
  const [status, setStatus] = useState<SyncStatus>('loading')
  const dataRef = useRef(data)
  dataRef.current = data
  const saveTimeout = useRef<number | undefined>(undefined)

  const [jobs, setJobs] = useState<TrackedImportJob[]>([])
  const jobsRef = useRef<TrackedImportJob[]>([])
  jobsRef.current = jobs
  const resumedRef = useRef(false)
  /** Fernsteuerung für den SSE-Handler (weiter unten): Job-Sofort-Refresh per GET. */
  const refreshJobsRef = useRef((): void => {})

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
            const payload = JSON.parse((event as MessageEvent).data) as { slug?: string; jobId?: string }
            // Der Stream ist bereits pro Journey gefiltert — Fremd-Journeys
            // (z.B. MCP-Schreibzugriff auf eine andere Journey) ignorieren.
            if (payload.slug && payload.slug !== journey) return
            // Job-Fertigstellung (gleicher Event-Typ, mit Job-Feldern): kein
            // generischer Reload-Toast — der Job-Flow übernimmt das Item per
            // GET selbst und toastet gezielt.
            if (payload.jobId) {
              refreshJobsRef.current()
              return
            }
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

  // --- Crawl-Job-Flow (Queue statt Blockieren) ---

  const setTracked = useCallback(
    (next: TrackedImportJob[]) => {
      jobsRef.current = next
      setJobs(next)
      writeStoredJobs(
        journey,
        next
          .filter((t) => t.status === 'in progress')
          .map((t) => ({ jobId: t.jobId, kind: t.kind, link: t.link, provider: t.provider, fetcher: t.fetcher })),
      )
    },
    [journey],
  )

  /**
   * Übernimmt einen fertigen Job: `done` legt das Item an (doppelt geschützt
   * gegen Reload-Resume nach bereits Gespeichertem) + Toast, `errored` bleibt
   * als Karte mit Retry sichtbar. Verworfene (nicht mehr getrackte) Jobs
   * werden ignoriert — z.B. späte Antworten nach Verwerfen oder Retry.
   */
  const applySettledJob = useCallback(
    (job: ImportJob) => {
      const tracked = jobsRef.current.find((t) => t.jobId === job.jobId)
      if (!tracked || job.status === 'in progress') return
      const untrack = () => setTracked(jobsRef.current.filter((t) => t.jobId !== job.jobId))

      if (job.status === 'done' && job.item) {
        if (job.kind === 'import-link') {
          const item = job.item
          untrack()
          mutate((prev) => {
            if (item.link && prev.items.some((e) => e.link && e.link === item.link)) return prev
            return { ...prev, items: [...prev.items, item] }
          }, `„${item.name}" per Link importiert`)
          return
        }
        // parse-text: Ergebnis in den wartenden Platzhalter mergen.
        const target = tracked.link || job.item.link || ''
        untrack()
        if (!target || !dataRef.current.items.some((e) => e.needsContent && e.link === target)) return
        const parsed = job.item
        mutate((prev) => {
          const at = prev.items.findIndex((e) => e.needsContent && e.link === target)
          if (at === -1) return prev
          const next = [...prev.items]
          next[at] = mergeParsedContent(prev.items[at], parsed)
          return { ...prev, items: next }
        }, 'Inhalt übernommen')
        return
      }

      // errored: Karte mit Fehlertext + Retry behalten; blockierte Links legen
      // zusätzlich den markierten Platzhalter zum manuellen Nachreichen an.
      if (job.kind === 'import-link' && tracked.link) {
        const link = tracked.link
        const placeholder = placeholderForBlockedLink(link, { status: job.statusCode })
        if (placeholder && !dataRef.current.items.some((e) => e.needsContent && e.link === link)) {
          mutate((prev) => {
            if (prev.items.some((e) => e.needsContent && e.link === link)) return prev
            return { ...prev, items: [...prev.items, placeholder] }
          })
          toast.warning('Crawl blockiert — Platzhalter angelegt', {
            description: 'Inhalt über „Inhalt einfügen" manuell nachreichen.',
          })
        }
      }
      setTracked(
        jobsRef.current.map((t) =>
          t.jobId === job.jobId
            ? { ...t, status: 'errored' as const, error: job.error || 'Import fehlgeschlagen', code: job.code }
            : t,
        ),
      )
    },
    [mutate, setTracked],
  )

  /**
   * Eine Poll-Runde über alle wartenden Jobs (SSE-Event und 1,5s-Takt rufen
   * auf): Positionen auffrischen, fertige übernehmen, 404 nach Neustart mit
   * Erneut-anfragen-Hinweis verwerfen, transiente Fehler später wiederholen.
   */
  const refreshJobs = useCallback(async () => {
    const pending = jobsRef.current.filter((t) => t.status === 'in progress')
    if (pending.length === 0) return
    const seen = new Set(pending.map((t) => t.jobId))
    const live = new Map<string, TrackedImportJob>()
    const settled: ImportJob[] = []
    await Promise.all(
      pending.map(async (t) => {
        try {
          const job = await fetchImportJob(t.jobId)
          if (job.status === 'in progress') {
            live.set(t.jobId, { ...t, position: job.position, queueLength: job.queueLength })
          } else {
            settled.push(job)
          }
        } catch (error) {
          if ((error as ApiError)?.status === 404) {
            toast.info('Import-Job verworfen', {
              description: 'Das Backend wurde neu gestartet — bitte erneut anfragen.',
            })
          } else {
            live.set(t.jobId, t)
          }
        }
      }),
    )
    setTracked(
      jobsRef.current
        .filter((t) => !seen.has(t.jobId) || t.status === 'errored' || live.has(t.jobId))
        .map((t) => live.get(t.jobId) ?? t),
    )
    for (const job of settled) applySettledJob(job)
  }, [applySettledJob, setTracked])
  refreshJobsRef.current = refreshJobs

  /** Lädt wartende Jobs nach Reload per GET nach (einmalig nach erstem Laden). */
  const resumeStoredJobs = useCallback(async () => {
    const fresh = readStoredJobs(journey).filter((s) => !jobsRef.current.some((t) => t.jobId === s.jobId))
    if (fresh.length === 0) return
    setTracked([
      ...jobsRef.current,
      ...fresh.map((s) => ({
        jobId: s.jobId,
        kind: s.kind,
        link: s.link,
        provider: s.provider,
        fetcher: s.fetcher,
        status: 'in progress' as const,
        position: 0,
        queueLength: 0,
      })),
    ])
    await refreshJobs()
  }, [journey, refreshJobs, setTracked])

  const startLinkJob = useCallback(
    async (link: string, provider?: string, fetcher?: string) => {
      const job = await submitImportLink(journey, link, provider, fetcher)
      setTracked([
        ...jobsRef.current,
        {
          jobId: job.jobId,
          kind: 'import-link',
          link,
          provider,
          fetcher,
          status: 'in progress' as const,
          position: job.position,
          queueLength: job.queueLength,
        },
      ])
    },
    [journey, setTracked],
  )

  const startTextJob = useCallback(
    async (text: string, link?: string, provider?: string) => {
      const job = await submitParseText(journey, text, link, provider)
      setTracked([
        ...jobsRef.current,
        {
          jobId: job.jobId,
          kind: 'parse-text',
          link: link ?? '',
          provider,
          status: 'in progress' as const,
          position: job.position,
          queueLength: job.queueLength,
        },
      ])
    },
    [journey, setTracked],
  )

  const retryJob = useCallback(
    async (jobId: string) => {
      const tracked = jobsRef.current.find((t) => t.jobId === jobId)
      if (!tracked || tracked.kind !== 'import-link') return
      const job = await submitImportLink(journey, tracked.link, tracked.provider, tracked.fetcher)
      setTracked(
        jobsRef.current.map((t) =>
          t.jobId === jobId
            ? {
                jobId: job.jobId,
                kind: tracked.kind,
                link: tracked.link,
                provider: tracked.provider,
                fetcher: tracked.fetcher,
                status: 'in progress' as const,
                position: job.position,
                queueLength: job.queueLength,
              }
            : t,
        ),
      )
    },
    [journey, setTracked],
  )

  const dismissJob = useCallback(
    (jobId: string) => {
      setTracked(jobsRef.current.filter((t) => t.jobId !== jobId))
    },
    [setTracked],
  )

  // Takt für wartende Jobs (+ Resume nach erstem Laden für Reload/Reconnect).
  useEffect(() => {
    const timer = window.setInterval(() => {
      void refreshJobs()
    }, 1500)
    return () => window.clearInterval(timer)
  }, [refreshJobs])

  useEffect(() => {
    if (status === 'synced' && !resumedRef.current) {
      resumedRef.current = true
      void resumeStoredJobs()
    }
  }, [status, resumeStoredJobs])

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

  return { data, status, journey, reload: load, mutate, mutateDebounced, jobs, startLinkJob, startTextJob, retryJob, dismissJob }
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
