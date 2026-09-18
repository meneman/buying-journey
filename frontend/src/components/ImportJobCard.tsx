import { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCircleNotch, faRotateRight, faTriangleExclamation, faXmark } from '@fortawesome/free-solid-svg-icons'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useJourneyData, type TrackedImportJob } from '@/lib/journey-data-context'

function hostOf(link: string): string {
  try {
    return new URL(link).hostname.replace(/^www\./, '')
  } catch {
    return link.slice(0, 60)
  }
}

/**
 * Statuskarte für einen Link-Import-Job (Queue statt Spinner): laufend mit
 * Warteposition, fehlgeschlagen mit Fehlertext + Retry (neuer Auftrag) und
 * Verwerfen. Fertige Jobs werden sofort übernommen und erscheinen nicht hier.
 */
export function ImportJobCard({ job }: { job: TrackedImportJob }) {
  const { retryJob, dismissJob } = useJourneyData()
  const [retrying, setRetrying] = useState(false)

  async function handleRetry() {
    if (retrying) return
    setRetrying(true)
    try {
      await retryJob(job.jobId)
    } catch (error) {
      console.error(error)
      toast.error('Erneuter Import fehlgeschlagen', { description: (error as Error).message })
    } finally {
      setRetrying(false)
    }
  }

  if (job.status === 'in progress') {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-muted/40 p-3">
        <FontAwesomeIcon icon={faCircleNotch} className="size-4 shrink-0 text-celeste" spin />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {job.position > 0 ? `Wartet — Position ${job.position}` : 'Wird importiert…'}
          </p>
          <p className="truncate text-xs text-muted-foreground">{hostOf(job.link)}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => dismissJob(job.jobId)} title="Job aus der Liste entfernen">
          <FontAwesomeIcon icon={faXmark} className="size-3.5" />
          Verwerfen
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3">
      <div className="flex items-start gap-2.5">
        <FontAwesomeIcon icon={faTriangleExclamation} className="mt-0.5 size-4 shrink-0 text-rust" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Import fehlgeschlagen</p>
          <p className="text-xs text-muted-foreground">{job.error || 'Unbekannter Fehler.'}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{hostOf(job.link)}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={handleRetry} disabled={retrying}>
          <FontAwesomeIcon icon={retrying ? faCircleNotch : faRotateRight} className="size-3.5" spin={retrying} />
          Erneut versuchen
        </Button>
        <Button variant="ghost" size="sm" onClick={() => dismissJob(job.jobId)}>
          <FontAwesomeIcon icon={faXmark} className="size-3.5" />
          Verwerfen
        </Button>
      </div>
    </div>
  )
}
