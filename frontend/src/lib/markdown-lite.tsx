import type { ReactNode } from 'react'

interface ListLine {
  level: number
  text: string
}

function renderInline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
    const bold = part.match(/^\*\*([^*]+)\*\*$/)
    return bold ? <strong key={i}>{bold[1]}</strong> : <span key={i}>{part}</span>
  })
}

function buildList(lines: ListLine[], level: number, cursor: { i: number }): ReactNode {
  const items: ReactNode[] = []
  while (cursor.i < lines.length && lines[cursor.i].level >= level) {
    const line = lines[cursor.i]
    if (line.level > level) break
    cursor.i++
    const nested = cursor.i < lines.length && lines[cursor.i].level > level ? buildList(lines, level + 1, cursor) : null
    items.push(
      <li key={cursor.i}>
        {renderInline(line.text)}
        {nested}
      </li>,
    )
  }
  return (
    <ul className="list-disc space-y-1 pl-5 marker:text-celeste">
      {items}
    </ul>
  )
}

/** A minimal, injection-safe renderer for the small markdown subset used in feedback notes. */
export function renderMarkdownLite(markdown: string): ReactNode {
  if (!markdown.trim()) return <p className="text-muted-foreground">Kein Inhalt…</p>

  const rawLines = markdown.replace(/\r\n/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let i = 0

  while (i < rawLines.length) {
    const trimmed = rawLines[i].trim()
    if (!trimmed) {
      i++
      continue
    }

    const headerMatch = trimmed.match(/^###\s+(.*)$/)
    if (headerMatch) {
      blocks.push(
        <h4 key={i} className="font-heading font-medium">
          {renderInline(headerMatch[1])}
        </h4>,
      )
      i++
      continue
    }

    if (/^\s*[-*]\s+/.test(rawLines[i])) {
      const listLines: ListLine[] = []
      while (i < rawLines.length) {
        const m = rawLines[i].match(/^(\s*)[-*]\s+(.*)$/)
        if (!m) break
        listLines.push({ level: Math.floor(m[1].length / 2), text: m[2] })
        i++
      }
      blocks.push(<div key={i}>{buildList(listLines, 0, { i: 0 })}</div>)
      continue
    }

    blocks.push(<p key={i}>{renderInline(trimmed)}</p>)
    i++
  }

  return <div className="flex flex-col gap-2">{blocks}</div>
}

export interface FeedbackUnit {
  name: string
  content: string
}

/** Splits the feedback note into per-person sections, mirroring the "## Feedback von X" convention. */
export function parseFeedbackUnits(markdown: string): FeedbackUnit[] {
  if (!markdown) return []
  const sections = markdown.replace(/\r\n/g, '\n').split(/\n## /)
  const units: FeedbackUnit[] = []

  sections.forEach((section, index) => {
    if (index === 0) return
    const lines = section.split('\n')
    const name = lines[0].trim().replace(/^Feedback von\s+/i, '').trim()
    const content = lines.slice(1).join('\n').trim()
    if (name) units.push({ name, content })
  })

  return units
}
