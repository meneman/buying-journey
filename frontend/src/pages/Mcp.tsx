import { useCallback, useEffect, useMemo, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faArrowsRotate,
  faCheck,
  faCircleCheck,
  faCopy,
  faKey,
  faLightbulb,
  faPlug,
  faPlus,
  faRobot,
  faTerminal,
  faTrashCan,
} from '@fortawesome/free-solid-svg-icons'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  createApiKey,
  fetchApiKeys,
  fetchMcpStatus,
  revokeApiKey,
  type ApiKey,
  type McpStatus,
} from '@/lib/api'
import { cn } from '@/lib/utils'

type Status = 'loading' | 'ok' | 'error'
type ClientTab = 'claude' | 'cursor' | 'muse' | 'env'

function formatDate(iso: string) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function Mcp() {
  const [status, setStatus] = useState<Status>('loading')
  const [info, setInfo] = useState<McpStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  // API Key management
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loadingKeys, setLoadingKeys] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [creatingKey, setCreatingKey] = useState(false)
  const [createdKeySecret, setCreatedKeySecret] = useState<string | null>(null)
  const [selectedKeyId, setSelectedKeyId] = useState<number | null>(null)

  // UI state
  const [clientTab, setClientTab] = useState<ClientTab>('claude')
  const [installMode, setInstallMode] = useState<'npx' | 'local'>('npx')
  const [snippetCopied, setSnippetCopied] = useState(false)
  const [keyCopied, setKeyCopied] = useState(false)
  const [promptCopiedIndex, setPromptCopiedIndex] = useState<number | null>(null)

  const loadStatus = useCallback(() => {
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

  const loadKeys = useCallback(() => {
    setLoadingKeys(true)
    fetchApiKeys()
      .then((list) => {
        setKeys(list)
        if (list.length > 0 && selectedKeyId === null) {
          setSelectedKeyId(list[0].id)
        }
      })
      .catch((err: Error) => {
        console.error('API Keys laden fehlgeschlagen:', err)
      })
      .finally(() => {
        setLoadingKeys(false)
      })
  }, [selectedKeyId])

  useEffect(() => {
    loadStatus()
    loadKeys()
  }, [loadStatus, loadKeys])

  async function handleCreateKey(e: React.FormEvent) {
    e.preventDefault()
    if (creatingKey) return
    setCreatingKey(true)
    try {
      const created = await createApiKey(newKeyName.trim() || 'MCP Client')
      setCreatedKeySecret(created.key)
      setSelectedKeyId(created.id)
      setNewKeyName('')
      toast.success('Neuer MCP-Schlüssel erstellt', {
        description: 'Kopiere den Schlüssel jetzt sicher.',
      })
      await loadKeys()
    } catch (err) {
      toast.error('Schlüssel konnte nicht erstellt werden', {
        description: (err as Error).message,
      })
    } finally {
      setCreatingKey(false)
    }
  }

  async function handleRevokeKey(id: number, name: string) {
    if (!window.confirm(`Möchtest du den MCP-Schlüssel „${name || id}" wirklich widerrufen? Clients mit diesem Schlüssel verlieren sofort den Zugriff.`)) {
      return
    }
    try {
      await revokeApiKey(id)
      toast.success('MCP-Schlüssel widerrufen')
      if (selectedKeyId === id) setSelectedKeyId(null)
      if (createdKeySecret) setCreatedKeySecret(null)
      await loadKeys()
    } catch (err) {
      toast.error('Schlüssel konnte nicht widerrufen werden', {
        description: (err as Error).message,
      })
    }
  }

  async function copyToClipboard(text: string, onCopied: () => void) {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const area = document.createElement('textarea')
      area.value = text
      document.body.appendChild(area)
      area.select()
      document.execCommand('copy')
      area.remove()
    }
    onCopied()
  }

  // Active token for snippet:
  // 1. If user just created a plaintext key, use it!
  // 2. Otherwise if user has keys, insert a placeholder or hint that a key is configured
  // 3. Otherwise hint to create a key
  const activeTokenForSnippet = useMemo(() => {
    if (createdKeySecret) return createdKeySecret
    if (keys.length > 0) return '<DEIN-MCP-KEY>'
    return '<BITTE-ERST-SCHLÜSSEL-ERSTELLEN>'
  }, [createdKeySecret, keys])

  const packageName = info?.packageName || '@journey-path/mcp'
  const serverFile = info?.serverFile || '<PFAD-ZUM-REPO>/src/mcp/server.js'
  const baseUrl = info?.baseUrl || 'http://localhost:3000'

  const snippets = useMemo(() => {
    const isNpx = installMode === 'npx'
    const command = isNpx ? 'npx' : 'node'
    const args = isNpx ? ['-y', packageName] : [serverFile]

    const claudeJson = JSON.stringify(
      {
        mcpServers: {
          'journey-path': {
            command,
            args,
            env: {
              MCP_BASE_URL: baseUrl,
              MCP_AUTH_TOKEN: activeTokenForSnippet,
            },
          },
        },
      },
      null,
      2,
    )

    const cursorJson = JSON.stringify(
      {
        mcpServers: {
          'journey-path': {
            command,
            args,
            env: {
              MCP_BASE_URL: baseUrl,
              MCP_AUTH_TOKEN: activeTokenForSnippet,
            },
          },
        },
      },
      null,
      2,
    )

    const museJson = JSON.stringify(
      {
        mcpServers: {
          'bike-buying-journey': {
            type: 'stdio',
            command,
            args,
            env: {
              MCP_BASE_URL: baseUrl,
              MCP_AUTH_TOKEN: activeTokenForSnippet,
            },
            mode: 'optional',
          },
        },
      },
      null,
      2,
    )

    const envBash = isNpx
      ? `# In Shell oder .env für MCP-Start via npx (empfohlen):
export MCP_BASE_URL="${baseUrl}"
export MCP_AUTH_TOKEN="${activeTokenForSnippet}"

npx -y ${packageName}`
      : `# In Shell oder .env für manuellen Stdio-Start mit Node:
export MCP_BASE_URL="${baseUrl}"
export MCP_AUTH_TOKEN="${activeTokenForSnippet}"

node "${serverFile}"`

    return { claude: claudeJson, cursor: cursorJson, muse: museJson, env: envBash }
  }, [installMode, packageName, serverFile, baseUrl, activeTokenForSnippet])

  const currentSnippet = snippets[clientTab]

  const promptExamples = [
    {
      title: 'Neue Kaufreise anlegen & Produkte eintragen',
      prompt: 'Rufe zuerst journey.help auf, lege eine neue Kaufreise "laptop" mit Budget "2.000 €" an, recherchiere 3 leichte Business-Notebooks und trage sie mit einheitlichen Specs ein.',
    },
    {
      title: 'Bestehende Kaufreise auswerten & vergleichen',
      prompt: 'Liste meine Kaufreisen auf, lies die Details der gewünschten Journey und erstelle eine Vergleichstabelle mit Vor- und Nachteilen aller Modelle.',
    },
    {
      title: 'Status, Tagebuch & Bewertung aktualisieren',
      prompt: 'Ich habe das "Canyon Grizl" probegefahren: setze den Status auf "Test Ridden", gib 5 Sterne, trage einen Tagebuch-Eintrag für heute ein und setze die Kauf-Phase auf "Comparing".',
    },
  ]

  return (
    <div className="flex flex-col gap-8 pb-12">
      {/* Page Title & Vision */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-celeste/20 text-celeste">
            <FontAwesomeIcon icon={faPlug} className="size-5" />
          </span>
          <div>
            <h1 className="font-heading text-2xl font-bold tracking-tight">MCP-Integration</h1>
            <p className="text-sm text-muted-foreground">
              Verbinde deinen KI-Assistenten (Claude Desktop, Cursor, Muse) direkt mit JourneyPath per Model Context Protocol.
            </p>
          </div>
        </div>

        <div className="mt-2 rounded-lg border border-celeste/30 bg-celeste/5 p-4 text-sm text-muted-foreground">
          <p className="flex items-center gap-2 font-medium text-foreground">
            <FontAwesomeIcon icon={faRobot} className="size-4 text-celeste" />
            MCP-First Architektur
          </p>
          <p className="mt-1">
            JourneyPath führt <strong>keine</strong> externen Web-Scraping- oder KI-API-Aufrufe mehr in der Web-App aus. Stattdessen übernimmt dein persönlicher KI-Assistent (Claude, Cursor etc.) die Web-Recherche mit seinen eigenen Werkzeugen und pflegt die Ergebnisse direkt über die MCP-Schnittstelle in deine Kaufreisen ein.
          </p>
        </div>
      </div>

      {/* Step 1: API Key Management */}
      <Card size="sm" className="border-border">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-full bg-primary/20 font-mono text-xs font-semibold text-primary">
                1
              </span>
              <CardTitle className="text-base font-semibold">Persönlicher MCP-Schlüssel (API-Key)</CardTitle>
            </div>
            <Badge variant="outline" className="gap-1 font-mono text-[11px]">
              <FontAwesomeIcon icon={faKey} className="size-3 text-celeste" />
              {keys.length} {keys.length === 1 ? 'Schlüssel' : 'Schlüssel'}
            </Badge>
          </div>
          <CardDescription>
            Jeder MCP-Schlüssel ist an dein Benutzerkonto gebunden. Der KI-Assistent greift ausschließlich auf deine eigenen Kaufreisen zu.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* Key creation form */}
          <form onSubmit={handleCreateKey} className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-muted/30 p-3">
            <div className="flex min-w-64 flex-1 flex-col gap-1.5">
              <Label htmlFor="keyName" className="text-xs font-medium">
                Bezeichnung (z.B. Name deines Clients)
              </Label>
              <Input
                id="keyName"
                placeholder="z.B. Claude Desktop MacBook, Cursor IDE"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                disabled={creatingKey}
                className="h-9"
              />
            </div>
            <Button type="submit" size="sm" disabled={creatingKey} className="gap-2">
              <FontAwesomeIcon icon={faPlus} className="size-3.5" />
              {creatingKey ? 'Erstelle…' : 'Neuen Schlüssel erstellen'}
            </Button>
          </form>

          {/* Newly created key banner */}
          {createdKeySecret && (
            <div className="flex flex-col gap-2 rounded-lg border border-celeste bg-celeste/10 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <FontAwesomeIcon icon={faCircleCheck} className="size-4 text-celeste" />
                  Dein neuer MCP-Schlüssel wurde generiert:
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void copyToClipboard(createdKeySecret, () => {
                      setKeyCopied(true)
                      setTimeout(() => setKeyCopied(false), 2000)
                    })
                  }
                  className="h-8 gap-1.5 bg-card"
                >
                  <FontAwesomeIcon icon={keyCopied ? faCheck : faCopy} className="size-3.5" />
                  {keyCopied ? 'Kopiert!' : 'Schlüssel kopieren'}
                </Button>
              </div>
              <pre className="overflow-x-auto rounded bg-card p-2.5 font-mono text-xs font-semibold text-celeste select-all">
                {createdKeySecret}
              </pre>
              <p className="text-xs text-muted-foreground">
                ⚠️ Bewahre diesen Schlüssel sicher auf — er wird aus Sicherheitsgründen nie wieder im Klartext angezeigt! Er wurde bereits automatisch in die Setup-Snippets unten eingefügt.
              </p>
            </div>
          )}

          {/* Existing Keys List */}
          {loadingKeys ? (
            <p className="text-xs text-muted-foreground">Lade Schlüssel…</p>
          ) : keys.length === 0 && !createdKeySecret ? (
            <p className="text-sm text-muted-foreground">
              Noch kein MCP-Schlüssel vorhanden. Erstelle oben deinen ersten Schlüssel, um Claude oder Cursor zu verbinden.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-muted-foreground">Vorhandene Schlüssel:</p>
              <div className="divide-y divide-border rounded-lg border border-border">
                {keys.map((k) => (
                  <div key={k.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium text-foreground">{k.name || 'Standard-Schlüssel'}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        ID: #{k.id} • Erstellt: {formatDate(k.createdAt)}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-rust"
                      title="Schlüssel widerrufen"
                      onClick={() => void handleRevokeKey(k.id, k.name)}
                    >
                      <FontAwesomeIcon icon={faTrashCan} className="size-3.5" />
                      <span className="hidden sm:inline">Widerrufen</span>
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 2: Client Setup Snippets */}
      <Card size="sm" className="border-border">
        <CardHeader>
          <div className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-full bg-primary/20 font-mono text-xs font-semibold text-primary">
              2
            </span>
            <CardTitle className="text-base font-semibold">KI-Client konfigurieren</CardTitle>
          </div>
          <CardDescription>
            Wähle deinen Client und kopiere die fertige Konfiguration in deine Einstellungsdatei.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* Client Selector Tabs & Mode Switcher */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={clientTab === 'claude' ? 'secondary' : 'ghost'}
                onClick={() => setClientTab('claude')}
                className="gap-2"
              >
                Claude Desktop
              </Button>
              <Button
                size="sm"
                variant={clientTab === 'cursor' ? 'secondary' : 'ghost'}
                onClick={() => setClientTab('cursor')}
                className="gap-2"
              >
                Cursor IDE
              </Button>
              <Button
                size="sm"
                variant={clientTab === 'muse' ? 'secondary' : 'ghost'}
                onClick={() => setClientTab('muse')}
                className="gap-2"
              >
                Muse
              </Button>
              <Button
                size="sm"
                variant={clientTab === 'env' ? 'secondary' : 'ghost'}
                onClick={() => setClientTab('env')}
                className="gap-2"
              >
                <FontAwesomeIcon icon={faTerminal} className="size-3.5" />
                Shell / CLI
              </Button>
            </div>

            {/* Mode Switcher */}
            <div className="flex items-center gap-1 rounded-md border border-border bg-card p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setInstallMode('npx')}
                className={`rounded px-2.5 py-1 font-medium transition-colors ${
                  installMode === 'npx'
                    ? 'bg-secondary text-secondary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                npx (Empfohlen)
              </button>
              <button
                type="button"
                onClick={() => setInstallMode('local')}
                className={`rounded px-2.5 py-1 font-medium transition-colors ${
                  installMode === 'local'
                    ? 'bg-secondary text-secondary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Lokal (Node)
              </button>
            </div>
          </div>

          {/* Snippet box */}
          <div className="relative">
            <pre className="max-h-96 overflow-x-auto rounded-lg bg-muted p-4 font-mono text-xs leading-relaxed select-all">
              {currentSnippet}
            </pre>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button
              size="sm"
              variant="default"
              className="gap-2 font-medium"
              onClick={() =>
                void copyToClipboard(currentSnippet, () => {
                  setSnippetCopied(true)
                  setTimeout(() => setSnippetCopied(false), 2000)
                })
              }
            >
              <FontAwesomeIcon icon={snippetCopied ? faCheck : faCopy} className="size-4" />
              {snippetCopied ? 'Konfiguration kopiert!' : 'Konfiguration kopieren'}
            </Button>

            {!createdKeySecret && keys.length === 0 && (
              <span className="text-xs text-rust">
                ⚠️ Erstelle oben in Schritt 1 zuerst einen MCP-Schlüssel, damit dein Token automatisch eingefügt wird.
              </span>
            )}
            {!createdKeySecret && keys.length > 0 && (
              <span className="text-xs text-muted-foreground">
                ℹ️ Ersetze <code className="rounded bg-muted px-1">&lt;DEIN-MCP-KEY&gt;</code> durch deinen Klartext-Schlüssel aus Schritt 1.
              </span>
            )}
          </div>

          {/* Client Path Hints */}
          <div className="rounded-lg border border-border bg-muted/40 p-3.5 text-xs text-muted-foreground">
            {clientTab === 'claude' && (
              <div className="flex flex-col gap-1.5">
                <p className="font-semibold text-foreground">Speicherort für Claude Desktop:</p>
                <ul className="flex list-disc flex-col gap-1 pl-4">
                  <li>
                    <strong>macOS:</strong>{' '}
                    <code className="rounded bg-muted px-1">
                      ~/Library/Application Support/Claude/claude_desktop_config.json
                    </code>
                  </li>
                  <li>
                    <strong>Windows:</strong>{' '}
                    <code className="rounded bg-muted px-1">
                      %APPDATA%\Claude\claude_desktop_config.json
                    </code>
                  </li>
                  <li>
                    <strong>Linux:</strong>{' '}
                    <code className="rounded bg-muted px-1">
                      ~/.config/Claude/claude_desktop_config.json
                    </code>
                  </li>
                </ul>
                <p className="pt-1 text-[11px]">Nach dem Speichern Claude Desktop neu starten.</p>
              </div>
            )}
            {clientTab === 'cursor' && (
              <div className="flex flex-col gap-1.5">
                <p className="font-semibold text-foreground">Speicherort für Cursor:</p>
                <p>
                  Trage die Konfiguration in deiner Projekt-Datei{' '}
                  <code className="rounded bg-muted px-1">.cursor/mcp.json</code> ein oder öffne in
                  Cursor: <strong>Settings → Features → MCP → Add new MCP Server</strong>.
                </p>
              </div>
            )}
            {clientTab === 'muse' && (
              <div className="flex flex-col gap-1.5">
                <p className="font-semibold text-foreground">Speicherort für Muse:</p>
                <p>
                  Unter <code className="rounded bg-muted px-1">~/.config/muse/settings.json</code> in
                  das <code className="rounded bg-muted px-1">mcpServers</code>-Objekt einfügen.
                </p>
              </div>
            )}
            {clientTab === 'env' && (
              <div className="flex flex-col gap-1.5">
                <p className="font-semibold text-foreground">Manueller Start per Stdio:</p>
                <p>
                  Das Backend muss unter <code className="rounded bg-muted px-1">{baseUrl}</code> laufen.
                  Der MCP-Server kommuniziert über Stdio (JSON-RPC 2.0).
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Step 3: Example Prompts */}
      <Card size="sm" className="border-border">
        <CardHeader>
          <div className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-full bg-primary/20 font-mono text-xs font-semibold text-primary">
              3
            </span>
            <CardTitle className="text-base font-semibold">Prompts für deinen KI-Assistenten</CardTitle>
          </div>
          <CardDescription>
            Sobald der MCP-Server in Claude oder Cursor eingebunden ist, kannst du deine Kaufreisen einfach per Chat steuern.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {promptExamples.map((ex, idx) => (
            <div
              key={idx}
              className="flex flex-col justify-between gap-3 rounded-lg border border-border bg-card p-3.5"
            >
              <div className="flex flex-col gap-1.5">
                <span className="flex items-center gap-1.5 font-heading text-xs font-semibold text-foreground">
                  <FontAwesomeIcon icon={faLightbulb} className="size-3.5 text-hiviz" />
                  {ex.title}
                </span>
                <p className="text-xs text-muted-foreground italic leading-relaxed">
                  „{ex.prompt}“
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="self-start text-xs h-7 gap-1.5"
                onClick={() =>
                  void copyToClipboard(ex.prompt, () => {
                    setPromptCopiedIndex(idx)
                    setTimeout(() => setPromptCopiedIndex(null), 2000)
                  })
                }
              >
                <FontAwesomeIcon
                  icon={promptCopiedIndex === idx ? faCheck : faCopy}
                  className="size-3"
                />
                {promptCopiedIndex === idx ? 'Kopiert!' : 'Prompt kopieren'}
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Step 4: Status & Tools Explorer */}
      <Card size="sm" className="border-border">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-full bg-primary/20 font-mono text-xs font-semibold text-primary">
                4
              </span>
              <CardTitle className="text-base font-semibold">Server-Status & Verfügbare Tools</CardTitle>
            </div>
            <Button size="sm" variant="outline" onClick={loadStatus} disabled={status === 'loading'} className="h-7 text-xs gap-1.5">
              <FontAwesomeIcon icon={faArrowsRotate} className="size-3" />
              Status prüfen
            </Button>
          </div>
          <CardDescription>
            Statusmeldung des Backends (`GET /api/mcp-status`) und bereitgestellte MCP-Tools.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="flex items-center gap-2 text-sm">
            <span
              className={cn(
                'size-2.5 rounded-full',
                status === 'ok' ? 'bg-celeste' : status === 'error' ? 'bg-rust' : 'bg-hiviz animate-pulse',
              )}
            />
            {status === 'loading' && 'Prüfe Backend…'}
            {status === 'ok' && info && (
              <span>
                Backend erreichbar — <strong>{info.server.name}</strong> v{info.server.version} (Protokoll {info.protocolVersion}) an Port {info.port}.
              </span>
            )}
            {status === 'error' && `Backend nicht erreichbar${error ? `: ${error}` : ''}`}
          </p>

          {status === 'ok' && info && info.tools && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold text-muted-foreground">Unterstützte Tools:</p>
              <div className="divide-y divide-border rounded-lg border border-border">
                {info.tools.map((t) => (
                  <div key={t.name} className="flex flex-col gap-1 p-3 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-celeste">{t.name}</span>
                      {t.inputSchema?.required && t.inputSchema.required.length > 0 && (
                        <Badge variant="outline" className="font-mono text-[10px]">
                          Pflicht: {t.inputSchema.required.join(', ')}
                        </Badge>
                      )}
                    </div>
                    <span className="text-muted-foreground">{t.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
