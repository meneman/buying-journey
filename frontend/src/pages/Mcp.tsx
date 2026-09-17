import { useCallback, useEffect, useMemo, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faArrowsRotate,
  faCheck,
  faCopy,
  faMagnifyingGlass,
  faPlug,
} from '@fortawesome/free-solid-svg-icons'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { fetchJourneyData, fetchJourneys, fetchMcpStatus, type McpStatus } from '@/lib/api'
import { cn } from '@/lib/utils'

/** Fallback-Snippet, wenn die API `serverFile`/`baseUrl` (noch) nicht liefert. */
const MCP_SNIPPET_FALLBACK = `{
  "mcpServers": {
    "bike-buying-journey": {
      "type": "stdio",
      "command": "node",
      "args": ["<PFAD-ZUM-REPO>/src/mcp/server.js"],
      "env": { "MCP_BASE_URL": "http://localhost:3000" },
      "mode": "optional"
    }
  }
}`

/** Setup-Snippet aus den API-Feldern bauen (fertig einfügbar, kein Platzhalter). */
function buildMcpSnippet(serverFile: string, baseUrl: string): string {
  return `{
  "mcpServers": {
    "bike-buying-journey": {
      "type": "stdio",
      "command": "node",
      "args": [${JSON.stringify(serverFile)}],
      "env": { "MCP_BASE_URL": ${JSON.stringify(baseUrl)} },
      "mode": "optional"
    }
  }
}`
}

type Status = 'loading' | 'ok' | 'error'
type ReadCheck = { state: 'idle' | 'running'; result: string | null }

/**
 * MCP-Integration (hinter dem `LoginGate`, app-weit ohne `?journey=`-Param):
 * Verbindungsstatus aus `GET /api/mcp-status`, kopierbares Setup-Snippet und
 * Kurzanleitung. Bleibt auch bei gestopptem Backend lesbar (dann ist nur der
 * Status rot). Der Status prüft nur die Backend-Erreichbarkeit — ob
 * `npm run mcp` separat läuft, kann diese Seite nicht erkennen.
 */
export function Mcp() {
  const [status, setStatus] = useState<Status>('loading')
  const [info, setInfo] = useState<McpStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [readCheck, setReadCheck] = useState<ReadCheck>({ state: 'idle', result: null })

  const load = useCallback(() => {
    setStatus('loading')
    setError(null)
    fetchMcpStatus()
      .then((result) => {
        setInfo(result)
        setError(null)
        setStatus('ok')
      })
      .catch((err: Error) => {
        setInfo(null)
        setError(err.message)
        setStatus('error')
      })
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchMcpStatus()
      .then((result) => {
        if (cancelled) return
        setInfo(result)
        setError(null)
        setStatus('ok')
      })
      .catch((err: Error) => {
        if (cancelled) return
        setInfo(null)
        setError(err.message)
        setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const snippetReady = Boolean(info?.serverFile && info?.baseUrl)
  const snippet = useMemo(
    () =>
      info?.serverFile && info?.baseUrl
        ? buildMcpSnippet(info.serverFile, info.baseUrl)
        : MCP_SNIPPET_FALLBACK,
    [info],
  )

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(snippet)
    } catch {
      const area = document.createElement('textarea')
      area.value = snippet
      document.body.appendChild(area)
      area.select()
      document.execCommand('copy')
      area.remove()
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  async function handleReadCheck() {
    setReadCheck({ state: 'running', result: null })
    try {
      const journeys = await fetchJourneys()
      const data = await fetchJourneyData('bike')
      const items = Array.isArray(data.items) ? data.items.length : 0
      setReadCheck({
        state: 'idle',
        result: `Lesepfad ok — ${journeys.length} Journey(s) (${journeys.slice(0, 5).join(', ') || 'keine'})${journeys.length > 5 ? ' …' : ''}; "bike" gelesen mit ${items} Item(s).`,
      })
    } catch (err) {
      setReadCheck({
        state: 'idle',
        result: `Lesepfad fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`,
      })
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <FontAwesomeIcon icon={faPlug} className="size-5 text-celeste" />
        <h2 className="font-heading text-lg font-semibold">MCP-Integration</h2>
      </div>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Verbindungsstatus</CardTitle>
          <CardDescription>
            Das Backend meldet Name, Version und Tool-Liste des MCP-Servers
            (`GET /api/mcp-status`). Erfolg heißt nur „Backend erreichbar“ — ob `npm run mcp`
            separat läuft, kann diese Seite nicht erkennen.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <p className="flex items-center gap-2 text-sm">
            <span
              className={cn(
                'size-2 rounded-full',
                status === 'ok' ? 'bg-celeste' : status === 'error' ? 'bg-rust' : 'bg-hiviz',
              )}
            />
            {status === 'loading' && 'Prüfe Backend…'}
            {status === 'ok' && info && (
              <>
                Backend erreichbar — {info.server.name} v{info.server.version} (Protokoll{' '}
                {info.protocolVersion}). Ob `npm run mcp` läuft, kann diese Seite nicht erkennen.
              </>
            )}
            {status === 'error' && `Backend nicht erreichbar${error ? `: ${error}` : ''}`}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={load} disabled={status === 'loading'}>
              <FontAwesomeIcon icon={faArrowsRotate} className="size-4" />
              {status === 'error' ? 'Erneut prüfen' : 'Status aktualisieren'}
            </Button>
          </div>
          {status === 'ok' && info && (
            <ul className="flex flex-col gap-1.5">
              {info.tools.map((tool) => (
                <li key={tool.name} className="text-sm">
                  <span className="font-mono text-[13px] font-medium">{tool.name}</span>
                  <span className="text-muted-foreground"> — {tool.description}</span>
                  {tool.inputSchema?.required && tool.inputSchema.required.length > 0 && (
                    <span className="text-muted-foreground">
                      {' '}
                      (Pflicht: {tool.inputSchema.required.join(', ')})
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Setup für Muse</CardTitle>
          <CardDescription>
            In <span className="font-mono text-[13px]">~/.config/muse/settings.json</span> unter{' '}
            <span className="font-mono text-[13px]">mcpServers</span> eintragen (wirkt ab dem
            nächsten Start von Muse).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs leading-relaxed">
            {snippet}
          </pre>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => void handleCopy()}>
              <FontAwesomeIcon icon={copied ? faCheck : faCopy} className="size-4" />
              {copied ? 'Kopiert!' : 'Snippet kopieren'}
            </Button>
            <span className="text-xs text-muted-foreground">
              {snippetReady ? (
                <>
                  Pfad und URL stammen aus `GET /api/mcp-status` — direkt einfügbar.
                </>
              ) : (
                <>
                  Das Backend liefert aktuell keinen Pfad/keine URL —{' '}
                  <span className="font-mono text-[11px]">&lt;PFAD-ZUM-REPO&gt;</span> durch den
                  absoluten Pfad dieses Checkouts ersetzen.
                </>
              )}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Lesepfad prüfen</CardTitle>
          <CardDescription>
            Selbsttest: liest die Journey-Liste und das Dokument `bike` über dieselbe REST-API,
            die auch der MCP-Server nutzt.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handleReadCheck()}
              disabled={readCheck.state === 'running'}
            >
              <FontAwesomeIcon icon={faMagnifyingGlass} className="size-4" />
              {readCheck.state === 'running' ? 'Prüfe…' : 'Lesepfad prüfen'}
            </Button>
          </div>
          {readCheck.result && <p className="text-sm text-muted-foreground">{readCheck.result}</p>}
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Kurzanleitung</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm">
            <li>
              Backend starten (<span className="font-mono text-[13px]">npm run dev:server</span>,
              Default <span className="font-mono text-[13px]">http://localhost:3000</span>, via{' '}
              <span className="font-mono text-[13px]">MCP_BASE_URL</span> bzw.{' '}
              <span className="font-mono text-[13px]">PORT</span> konfigurierbar) — ohne laufendes
              Backend antwortet kein Tool.
            </li>
            <li>
              MCP-Server separat starten (<span className="font-mono text-[13px]">npm run mcp</span>)
              — der Server spricht ausschließlich die REST-API an (kein Direkt-DB-Zugriff). Diese
              Seite zeigt nur die Backend-Erreichbarkeit und kann nicht erkennen, ob der
              MCP-Server läuft.
            </li>
            <li>Snippet oben in die Muse-Settings eintragen und Muse neu starten.</li>
            <li>
              Tools nutzen: <span className="font-mono text-[13px]">journey.get</span> liest ein
              komplettes Journey-Dokument (legt nichts an, unbekannter Slug gibt einen definierten
              Fehler), <span className="font-mono text-[13px]">journey.add_item</span> legt Produkte
              an bzw. aktualisiert sie,{' '}
              <span className="font-mono text-[13px]">journey.crawl_link</span> lädt eine
              Produktseite zum Extrahieren (speichert nichts).
            </li>
          </ol>
        </CardContent>
      </Card>
    </div>
  )
}
