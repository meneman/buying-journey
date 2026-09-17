# Architektur — Übersicht 🗺️

JourneyPath ist eine lokale Kaufbegleit-App: **Express-Backend** (`src/`, SQLite `data/app.db`) + **React-Frontend** (`frontend/`, Vite-Dev `:5173`, Build in `frontend/dist/`). Port: Code-Default `3000`, `.env.example` und der Vite-Proxy nutzen `1337`.

- [[Backend]] — Datenstruktur (Tabellen `journeys`, `journey_logs`, `journey_specs`, `items`, `api_keys` + schemaloses `items.specs`-JSON), Store-API, REST-Endpunkte, Auth + Owner-Trennung, SSE, zweistufige Crawl-Pipeline, MCP
- [[Frontend]] — Seiten, Komponenten, `lib/`-Bausteine, Routing über `?journey=`, Login-Gate, Datenfluss (REST + SSE)
- [[Was-ist-JourneyPath]] — warum das Ganze: KI-gestützter Kauf-Wrapper

## Fluss in einem Satz

```
Browser (React) --REST /api/* + SSE--> Express (src/web/backend) --SQL--> SQLite (data/app.db)
   |                                          |                              ^
   |                                          +-- Crawl-Pipeline:            |
   |                                              Stufe 1 Parse-Tool         |
   |                                              (direct/headless/local-cmd)|
   |                                              Stufe 2 LLM-Auswertung     |
   |                                              (agy/remote-ai/local-cmd/n8n)
   +-- MCP-Tools (stdio, API-Key) / Agent-CLIs (direkt SQLite) --------------+
```

Jede Schreiboperation auf eine Journey broadcastet per SSE an offene Browser (Toast + Reload) — so sieht der Mensch, was der Agent einträgt.

## Schnellstart

```bash
npm install && npm install --prefix frontend
npm run dev     # Backend (:1337 laut .env) + Vite :5173, /api wird geproxyt
npm start       # Backend serviert frontend/dist
npm test        # Backend-Tests (aktuell 132)
npm run mcp     # stdio-MCP-Server (braucht laufendes Backend + API-Key)
```

Config: `.env` (`PORT`, `DB_PATH`, `CRAWL_*`, `N8N_WEBHOOK_URL`, Supabase-Keys, `AUTH_REQUIRED`) + `frontend/.env` (`VITE_*`-Keys). Vollständig kommentiert in `.env.example`; Details je Schicht in den beiden Notizen.

#architektur #übersicht
