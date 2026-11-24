import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronDown, faChevronUp } from '@fortawesome/free-solid-svg-icons'
import { cn } from '@/lib/utils'

interface ExpandableTextProps {
  text: string
  className?: string
  maxLines?: number
}

export function ExpandableText({ text, className, maxLines = 3 }: ExpandableTextProps) {
  const [expanded, setExpanded] = useState(false)
  const [isOverflowing, setIsOverflowing] = useState(false)
  const textRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    setExpanded(false)
  }, [text])

  useLayoutEffect(() => {
    const el = textRef.current
    if (!el) return

    const check = () => {
      if (!expanded) {
        // When clamped with line-clamp, scrollHeight > clientHeight indicates it overflows
        const overflows = el.scrollHeight > el.clientHeight + 1
        setIsOverflowing(overflows)
      } else {
        // When expanded, check if height exceeds maxLines
        const lh = parseFloat(window.getComputedStyle(el).lineHeight) || 20
        const overflows = el.scrollHeight > lh * maxLines + 2
        setIsOverflowing(overflows)
      }
    }

    check()

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(check) : null
    if (ro) ro.observe(el)
    window.addEventListener('resize', check)

    return () => {
      if (ro) ro.disconnect()
      window.removeEventListener('resize', check)
    }
  }, [text, expanded, maxLines])

  if (!text || text === '—') {
    return <span className={cn('text-sm text-muted-foreground', className)}>—</span>
  }

  return (
    <div className="flex flex-col items-start gap-1 max-w-[300px]">
      <p
        ref={textRef}
        className={cn(
          'text-sm whitespace-pre-line break-words max-w-[300px]',
          !expanded && 'line-clamp-3',
          className,
        )}
      >
        {text}
      </p>
      {isOverflowing && (
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="inline-flex items-center gap-1 font-mono text-xs text-celeste hover:underline cursor-pointer"
          title={expanded ? 'Weniger anzeigen' : 'Gesamten Text anzeigen'}
        >
          {expanded ? (
            <>
              <span>Schließen</span>
              <FontAwesomeIcon icon={faChevronUp} className="size-2.5" />
            </>
          ) : (
            <>
              <span>.. Öffnen</span>
              <FontAwesomeIcon icon={faChevronDown} className="size-2.5" />
            </>
          )}
        </button>
      )}
    </div>
  )
}
