# JourneyPath — dein Kauf-Begleiter 🧭

JourneyPath begleitet größere Anschaffungen von der Recherche bis zur Entscheidung: Kandidaten sammeln, vergleichen, bewerten, dokumentieren. Alle Informationen liegen lokal in einer **SQLite-Datenbank** (`data/app.db`) — jede Kaufreise (Bike, Laptop, EV, …) hat eigene Vergleichseigenschaften, die schemalos als JSON gespeichert werden.

Gestartet als Fahrradkauf-Begleiter (Journey `bike`, früherer Projektname *VeloPath*), ist die App inzwischen kategorie-unabhängig. Warum es das Projekt gibt, steht in [docs/vault/Was-ist-JourneyPath.md](docs/vault/Was-ist-JourneyPath.md).

## 🚀 Features & MCP-First-Ablauf

JourneyPath trennt sauber zwischen **KI-Recherche über MCP**, **Web-App zum Vergleichen/Pflegen** und **serverseitigem Property-Abgleich**:

- **🤖 MCP-First mit deinem KI-Assistenten (`packages/mcp/`):** Claude Desktop, Cursor oder Muse recherchieren mit ihren eigenen Web-Tools und steuern komplette Kaufreisen über 14 MCP-Tools (`journey.help`, `journey.list`, `journey.create`, `journey.add_item`, `journey.update_meta`, `journey.add_log`, `journey.set_spec`, `journey.set_feedback` u. v. m.).
- **⚖️ Übersicht, Vergleich & Pflege (Web-App):** Kaufreisen anlegen, Produkte manuell hinzufügen/bearbeiten/bewerten, Status und Reisetagebuch pflegen. Die Web-App führt selbst **keine** Web-Crawls oder manuellen KI-Importe mehr aus.
- **🧠 Serverseitiger KI-Property-Abgleich (`specs`):** Trägt der Client oder Nutzer ab 2 Produkten `specs` frei ein, vereinheitlicht das Backend im Hintergrund per LLM (`agy`, `remote-ai` oder `local-cmd`) synonyme Keys (z. B. `Weight` / `Gewicht` → `Gewicht`), trennt in **Gemeinsame Eigenschaften** vs. **Weitere / Einzel-Eigenschaften** und pusht das Update per SSE an offene Browser. Ohne LLM-Provider greift ein stiller deterministischer Fallback.
- **🎯 Status, Budget & Reisetagebuch:** Phase, Budget, Zieldatum, chronologische Meilensteine, journey-weite Eigenschaften (`/eigenschaften`), Feedback (`/feedback`) und allgemeine Notizen.
- **💾 Lokaler SQLite-Speicher mit User-Trennung:** Alle Daten liegen in `data/app.db` (`owner_id`-isoliert pro API-Key oder Supabase-User).

---

## 🛠️ Installation & Start

Das Frontend liegt in `frontend/` (React 19 + Vite + TypeScript + shadcn/ui + Tailwind CSS 4), das Backend in `src/web/backend` (Express 4), der MCP-Server in `packages/mcp/` (Wrapper unter `src/mcp/`).

1. **Abhängigkeiten installieren:**
   ```bash
   npm install
   npm install --prefix frontend
   ```

2. **Umgebungsvariablen konfigurieren:**
   Vorlagen stehen in `.env.example` (Backend) und `frontend/.env`:
   - `PORT`: Backend-Port (Code-Default `3000`; `.env` nutzt `1337` für `npm start`. Im Dev (`npm run dev`) läuft das Backend per `PORT=3000`-Override und Vite auf `1337`, der Browser-Einstieg ist immer `http://localhost:1337`).
   - `DB_PATH`: Pfad zur SQLite-Datei (Default: `data/app.db`).
   - `FRONTEND_DIST`: Pfad zum gebauten Frontend (Default: `frontend/dist`).
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY` (bzw. `SUPABASE_PUBLISHABLE_KEY`), `AUTH_REQUIRED`: Browser-Auth via Supabase-JWT.
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (in `frontend/.env`): Supabase-Client-Keys für das Frontend.
   - **Serverseitiger KI-Property-Abgleich (optional):** `CRAWL_EXTRACT_PROVIDER` / `CRAWL_PROVIDER` (`agy`, `remote-ai`, `local-cmd`), `CRAWL_AGY_BIN` / `-MODEL` / `-EFFORT` / `-TIMEOUT_MS`, `CRAWL_REMOTE_URL` / `-KEY`, `CRAWL_EXTRACT_CMD`, `CRAWL_QUEUE_CONCURRENCY` (Default `2`), `SPEC_ALIGNMENT_DEBOUNCE_MS` (Default `300`).
   - **MCP-Server:** `MCP_BASE_URL` (Default `http://localhost:3000` bzw. `PORT`), `MCP_AUTH_TOKEN` (API-Key `bj_…`).

3. **Entwicklung (mit Hot-Reload):**
   ```bash
   npm run dev
   ```
   Startet Backend (`:3000`) und Vite-Dev-Server (`http://localhost:1337`) gleichzeitig; `/api`-Aufrufe werden an das Backend geproxyt.

4. **Produktion:**
   ```bash
   npm run build   # baut das Frontend nach frontend/dist
   npm start       # startet das Backend und liefert frontend/dist mit aus
   ```

5. **Tests & Frontend-Checks:**
   ```bash
   npm test
   npm --prefix frontend run build
   npm --prefix frontend run lint
   ```

---

## 🔐 Anmeldung, Login-Gate & Datentrennung pro User

Alle `/api`-Daten-Routen verlangen eine Identität (`401` ohne gültigen Bearer-Token) — und jede Identität sieht **nur ihre eigenen Journeys** (Owner-Trennung per `owner_id`, gleiche Slugs verschiedener User sind unabhängige Journeys). Zwei Token-Arten werden akzeptiert:

- **API-Key (`bj_…`):** Langlebiger Token für den MCP-Zugriff (ein Key = ein User). Verwaltung direkt auf der Seite `/mcp` (`POST /api/api-keys`, `GET /api/api-keys`, `DELETE /api/api-keys/:id`) oder per CLI ohne laufenden Server:
  ```bash
  node src/agent/scripts/create-api-key.js --user "jakob" --name "Claude Desktop"
  ```
- **Supabase-JWT:** Browser-Login über `/login` (**Google**, **Apple** oder **E-Mail + Passwort**).

**Login-Gate im Frontend (`frontend/src/App.tsx`):** Ausgeloggt sind ausschließlich `/login` und die Startseite `/` (ohne `?journey=`, allgemeine Infoseite) zugänglich. Alle geschützten Ansichten — einschließlich `/mcp`, `/?journey=<slug>`, `/vergleich`, `/eigenschaften`, `/feedback` und `/einstellungen` — liegen hinter `<LoginGate>` und leiten ausgeloggt auf `/login` weiter (der MCP-Button im Header bleibt sichtbar und führt über das Gate zum Login).

---

## 📄 Speicherformat & REST-API

Die Daten liegen in `data/app.db` (SQLite via `node:sqlite`):

- **Tabellen:** `journeys` (inkl. Config-Felder und `spec_comparison`), `journey_logs`, `journey_specs`, `items` (inkl. schemalosem JSON-Array `specs`), `api_keys` (nur SHA-256-Hashes).
- **Öffentliche Endpunkte:** `GET /api/config` (`{ storage: 'sqlite' }`), `GET /api/mcp-status` (Server-Info + `inputSchema` aller MCP-Tools), `GET /api/me` (`200 { user }` oder `401`).
- **Geschützte Endpunkte (`needUser`):**
  - `POST` / `GET` / `DELETE /api/api-keys[/:id]`
  - `GET` / `POST` / `DELETE /api/journeys` (`DELETE /api/journeys?journey=X`)
  - `GET /api/journey-configs`, `GET` / `PUT /api/journey-config?journey=X`
  - `GET` / `POST /api/data?journey=X` (`GET` liefert optional `specComparison`; `POST` speichert, broadcastet SSE und stößt bei geänderten Items mit ≥ 2 Produkten asynchron den Property-Abgleich an)
  - `GET /api/data/events?journey=X` (SSE-Stream mit Event `journey-updated`, optional `reason: "property-sync"`)
  - `GET` / `POST /api/feedback?journey=X`

Eine ausführliche Systemdokumentation liegt im Obsidian-Vault unter `docs/vault/Architektur/` (`Übersicht.md`, `Backend.md`, `Frontend.md`).

---

## 🔍 Vergleichseigenschaften (`specs`) & KI-Abgleich

Vergleichseigenschaften sind **schemalos**: Sobald ein `Schlüssel: Wert`-Präfix in den `specs` eines Items verwendet wird, erscheint auf `/vergleich` eine entsprechende Zeile (Trennung am ersten Doppelpunkt; Zeilen ohne Doppelpunkt sind Freitext und erzeugen keine Vergleichszeile).

- **Speicherung (`POST /api/data`):** Bei ≥ 2 Produkten mit benannten `specs` läuft im Hintergrund über die Queue (`src/web/backend/crawl-queue.js`, Debounce/Latest-wins pro `(owner, slug)`) der KI-Abgleich (`src/web/backend/spec-alignment.js` mit `src/agent/prompts/spec_alignment_prompt.md` + `spec-alignment-schema.json`).
- **Ergebnis & Live-Sync:** Synonyme Keys werden auf eine kanonische Schreibweise vereinheitlicht (Reihenfolge, Werte und Freitext bleiben erhalten) und in `Common` (**Gemeinsame Eigenschaften**, bei allen Items befüllt) vs. `Unique` (**Weitere / Einzel-Eigenschaften**) eingeteilt. Ein Hash-Vergleich verhindert das Überschreiben neuerer Edits; der interne Commit triggert keine Rekursion und sendet `journey-updated` (`reason: "property-sync"`) per SSE.
- **Stiller Fallback:** Ist kein LLM-Provider konfiguriert, gibt es `< 2` Items oder schlägt das LLM fehl, erfolgt ohne Fehlermeldung eine rein deterministische, case-insensitive Gruppierung.

---

## 🤖 MCP-Server (`journey-path`)

`npm run mcp` startet den abhängigkeitsfreien stdio-MCP-Server (`packages/mcp/src/server.js`, Wrapper `src/mcp/server.js`) mit 14 Tools:

| Tool | Wirkung |
|---|---|
| `journey.help` | Kompakte Anleitung zu Tools, Workflows, Enums (`ITEM_STATUSES`, `PHASES`) und `specs`-Konventionen |
| `journey.list` | Alle Kaufreisen des Users inkl. Basis-Config auflisten |
| `journey.create` | Neue Kaufreise anlegen (`slug` Pflicht, Rest optional) |
| `journey.update_config` | Basis-Eigenschaften & Anzeige-Settings partiell aktualisieren |
| `journey.delete` | Kaufreise inkl. Items, Logs und Specs löschen |
| `journey.get` | Komplettes Journey-Dokument inkl. Feedback und Config lesen (legt nichts an) |
| `journey.add_item` | Produkt anlegen/aktualisieren (Upsert nach Name, case-insensitiv) |
| `journey.delete_item` | Produkt anhand des Namens entfernen |
| `journey.update_meta` | Phase, Budget, Zieldatum und allgemeine Notizen aktualisieren |
| `journey.add_log` / `journey.delete_log` | Tagebucheinträge hinzufügen (chronologisch absteigend) bzw. entfernen |
| `journey.set_spec` / `journey.delete_spec` | Journey-weite Eigenschaften (`/eigenschaften`) setzen bzw. löschen |
| `journey.set_feedback` | Markdown-Inhalt von `/feedback` speichern |

### Einrichtung in Claude Desktop / Cursor / Muse

Auf der Seite `/mcp` der Web-App kannst du per Klick einen API-Key erstellen und das fertig befüllte Setup-Snippet kopieren. Standardmäßig empfiehlt sich der lokale Start per Node direkt auf `src/mcp/server.js` (solange `@journey-path/mcp` nicht auf npm veröffentlicht ist):

```json
{
  "mcpServers": {
    "journey-path": {
      "command": "node",
      "args": ["<PFAD-ZUM-REPO>/src/mcp/server.js"],
      "env": {
        "MCP_BASE_URL": "http://localhost:3000",
        "MCP_AUTH_TOKEN": "bj_… (API-Key aus /mcp oder create-api-key.js)"
      }
    }
  }
}
```

Voraussetzung: Das Backend läuft (`npm run dev` bzw. `npm start`). Läuft es auf Port `1337` (wie in `.env.example`), muss `MCP_BASE_URL` auf `http://localhost:1337` zeigen. Weitere Details zum Paket stehen in [packages/mcp/README.md](packages/mcp/README.md).
