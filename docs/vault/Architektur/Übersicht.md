# Architektur — Übersicht 🗺️

JourneyPath ist eine lokale Kaufbegleit-App: **Express-Backend** (`src/`, SQLite `data/app.db`) + **React-Frontend** (`frontend/`, Vite-Dev `:1337`, Build in `frontend/dist/`) + **stdio-MCP-Server** (`packages/mcp/`, Wrapper `src/mcp/`). Browser-Einstieg immer `http://localhost:1337` (dev wie prod); Backend: Code-Default `3000`, `.env` setzt `1337` für `npm start`.

- [[Backend]] — Datenstruktur (Tabellen `journeys`, `journey_logs`, `journey_specs`, `items`, `api_keys` + schemaloses `items.specs`-JSON + `spec_comparison`), Store-API, REST-Endpunkte, Auth + Owner-Trennung, SSE, asynchroner KI-Property-Abgleich (`spec-alignment.js` + `crawl-queue.js` + `crawl-providers.js`), MCP
- [[Frontend]] — Seiten, Komponenten, `lib/`-Bausteine, Routing über `?journey=`, Login-Gate (inkl. `/mcp`), Datenfluss (REST + SSE), `Compare`-Gruppierung
- [[Was-ist-JourneyPath]] — warum das Ganze: MCP-First-Kauf-Begleiter

## Fluss in einem Satz

```
Browser (React) ──REST /api/* + SSE──▶ Express (src/web/backend) ──SQL──▶ SQLite (data/app.db)
                                              │                              ▲
KI-Client (Claude/Cursor/Muse)                ▼ (async ab 2 Items)           │
   └── MCP (packages/mcp, API-Key) ──REST──▶ KI-Property-Abgleich            │
                                              (spec-alignment / crawl-queue /│
                                               agy | remote-ai | local-cmd) ─┘
```

Schreibzugriffe über `POST /api/data` und abgeschlossene Property-Abgleiche (`reason: "property-sync"`) broadcasten per SSE (`GET /api/data/events`) an offene Browser — dort erscheint ein Toast mit „Neu laden“-Button.

## Schnellstart

```bash
npm install && npm install --prefix frontend
npm run dev     # Backend (:3000 via PORT-Override) + Vite :1337, /api wird geproxyt
npm start       # Backend serviert frontend/dist
npm test        # Backend- & Frontend-Logiktests
npm run build   # baut frontend/dist
npm run mcp     # stdio-MCP-Server (braucht laufendes Backend + MCP_AUTH_TOKEN)
```

Config: `.env` (`PORT`, `DB_PATH`, `FRONTEND_DIST`, `CRAWL_*`, `SPEC_ALIGNMENT_DEBOUNCE_MS`, Supabase-Keys, `AUTH_REQUIRED`) + `frontend/.env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). Vollständig kommentiert in `.env.example`; Details je Schicht in den beiden Notizen.

#architektur #übersicht
