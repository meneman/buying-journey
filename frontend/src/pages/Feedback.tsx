import { useCallback, useEffect, useState } from 'react'
import { MessageSquare, User } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { fetchFeedback } from '@/lib/api'
import { parseFeedbackUnits, renderMarkdownLite } from '@/lib/markdown-lite'
import { usePageSync } from '@/lib/page-sync-context'
import { useJourney } from '@/lib/router'

export function Feedback() {
  const journey = useJourney()
  const [content, setContent] = useState('')
  const [status, setStatus] = useState<'loading' | 'synced' | 'error'>('loading')
  const { publish } = usePageSync()

  const load = useCallback(() => {
    setStatus('loading')
    fetchFeedback(journey)
      .then((res) => {
        setContent(res.content || '')
        setStatus('synced')
      })
      .catch((error: Error) => {
        console.error(error)
        setStatus('error')
        toast.error('Fehler beim Laden des Feedbacks', { description: error.message })
      })
  }, [journey])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    publish(status, load)
  }, [status, load, publish])

  const units = parseFeedbackUnits(content)

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="font-heading text-lg font-semibold">Feedback &amp; Erfahrungsberichte</h2>
        <Badge variant="secondary">{units.length}</Badge>
      </div>

      {units.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
          <MessageSquare className="size-8 text-muted-foreground" />
          <h3 className="font-heading font-medium">Kein Feedback vorhanden</h3>
          <p className="max-w-sm text-sm text-muted-foreground">
            Trage Erfahrungsberichte direkt in SilverBullet in der Datei „{journey}.buying-journey-feedback.md" ein —
            sie erscheinen hier automatisch.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {units.map((unit, index) => (
            <div key={index} className="rounded-xl border border-border bg-card p-4">
              <div className="mb-3 flex items-center gap-2.5 border-b border-border pb-3">
                <div className="flex size-8 items-center justify-center rounded-full bg-muted">
                  <User className="size-4 text-muted-foreground" />
                </div>
                <h3 className="font-heading font-medium">{unit.name}</h3>
              </div>
              <div className="text-sm">{renderMarkdownLite(unit.content)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
