# Architektur — Übersicht 🗺️

VeloPath ist eine lokale Kaufbegleit-App: **Express-Backend** (`src/`, Port `1337`, SQLite `data/app.db`) + **React-Frontend** (`frontend/`, Vite-Dev `:5173`, Build in `frontend/dist/`).

- [[Backend]] — Datenstruktur (Tabellen `journeys`, `journey_logs`, `journey_specs`, `items` + schemaloses `items.specs`-JSON), Store-API, REST-Endpunkte, Auth, SSE, MCP
- [[Frontend]] — Seiten, Komponenten, `lib/`-Bausteine, Routing über `?journey=`, Datenfluss (REST + SSE)

## Fluss in einem Satz

```
Browser (React) --REST /api/* + SSE--> Express (src/web/backend) --SQL--> SQLite (data/app.db)
   |                                                                          ^
   +-- n8n-Webhook (Link-Import) / MCP-Tools / Agent-CLIs ---------------------+
```

## Schnellstart

```bash
npm install && npm install --prefix frontend
npm run dev     # Backend :1337 + Vite :5173, /api wird geproxyt
npm start       # Backend serviert frontend/dist auf :1337
npm test        # Backend-Tests
```

Config: `.env` (`PORT`, `DB_PATH`, `N8N_WEBHOOK_URL`, Supabase-Keys, `AUTH_REQUIRED`) + `frontend/.env` (`VITE_*`-Keys). Details je Schicht in den beiden Notizen.

#architektur #übersicht
