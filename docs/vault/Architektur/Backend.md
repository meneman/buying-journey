# Backend — VeloPath 🏗️

> Code: `src/` (Node.js, Express 4) · DB: `data/app.db` (SQLite via `node:sqlite`) · Einstieg: `src/web/backend/server.js`
> Siehe auch: [[Übersicht]] · [[Frontend]]

## 1. Überblick

```
src/
├── web/backend/
│   ├── server.js   # Express-App, alle /api-Routen, SSE, Static-Hosting
│   └── auth.js     # Supabase-JWT-Prüfung (authGate / optionalAuth / requireAuth)
├── db/
│   └── store.js    # einzige DB-Schicht: openDatabase(), Schema, CRUD, JSON1-Queries
├── core/
│   └── item-format.js  # starsFromRating(), specsToString()
├── mcp/
│   ├── server.js   # MCP-stdIO-Server
│   └── tools.js    # TOOL_DEFS (Single Source of Truth, auch für GET /api/mcp-status)
└── agent/
    ├── scripts/    # add-item.js, add-log.js, crawl-and-extract.js, utils.js
    ├── prompts/    # product_extraction_prompt.md
    └── temp/       # last-crawl.json
```

- **Kein ORM.** Alles SQL steht in `src/db/store.js`.
- **Start:** `npm run dev` (Backend `:1337` + Vite `:5173`), `npm start` (Backend serviert `frontend/dist`), `npm test`.
- **Config:** `.env` — `PORT`, `DB_PATH` (Default `data/app.db`), `N8N_WEBHOOK_URL`, `SUPABASE_URL` / `SUPABASE_ANON_KEY`, `AUTH_REQUIRED`.

## 2. Datenstruktur (SQLite)

Datei: `data/app.db` (WAL-Modus, `PRAGMA foreign_keys = ON`). Vier Tabellen, fester Kern relational + schemalose Vergleichsattribute als JSON.

### 2.1 `journeys` — eine Zeile pro Kaufreise

| Spalte | Typ / Default | Bedeutung |
|---|---|---|
| `slug` | TEXT PK | Journey-Kürzel, z. B. `bike` (URL-Param `?journey=`) |
| `name` | TEXT NOT NULL `''` → Backfill `= slug` | Anzeigename (Config) |
| `description` | TEXT NOT NULL `''` | Config, max. 500 Zeichen |
| `category` | TEXT NOT NULL `''` | Config, lowercase (`fahrrad`, `laptop`, …), max. 40 |
| `currency` | TEXT NOT NULL `''` → Backfill `€` | Config, max. 10 |
| `section_title` | TEXT NOT NULL | Anzeige-Setting, z. B. `Bikes Under Consideration` |
| `list_title` | TEXT NOT NULL | Anzeige-Setting, z. B. `Rahmengrößen` / `Spezifikationen` |
| `phase` | TEXT NOT NULL `Planning` | Status-Phase (`Planning`, `Researching`, `Test Riding`, `Comparing`, `Decision`, `Purchased`) |
| `budget` | TEXT NOT NULL `''` | Freitext, z. B. `2500€` |
| `target_date` | TEXT NOT NULL `''` | Freitext-Datum |
| `general_notes` | TEXT NOT NULL `''` | Allgemeine Notizen (Markdown) |
| `feedback` | TEXT NOT NULL `''` | Feedback-Seite (Markdown) |
| `created_at` / `updated_at` | TEXT `datetime('now')` | Auto-Stempel |

Migration: `ensureConfigColumns()` rüstet `name/description/category/currency/section_title/list_title` per `ALTER TABLE` nach, `backfillConfigDefaults()` füllt leere `name`/`currency`. `ensureJourney('bike')` legt die Default-Journey an.

### 2.2 `journey_logs` — Reisetagebuch

| Spalte | Typ |
|---|---|
| `id` | INTEGER PK AUTOINCREMENT |
| `journey_slug` | TEXT FK → `journeys(slug)` ON DELETE CASCADE |
| `date` | TEXT `''` |
| `event` | TEXT `''` |
| `position` | INTEGER `0` (Sortierung) |

Index: `(journey_slug, position)`. Sortierung immer `ORDER BY position, id`.

### 2.3 `journey_specs` — journey-weite Eigenschaften

Gilt für die **ganze Reise** (Seite `/eigenschaften`), nicht pro Produkt. Abzugrenzen von `items.specs`!

| Spalte | Typ |
|---|---|
| `id` | INTEGER PK AUTOINCREMENT |
| `journey_slug` | TEXT FK CASCADE |
| `label` / `value` | TEXT `''` |
| `position` | INTEGER `0` |

Index: `(journey_slug, position)`.

### 2.4 `items` — Produkt-Kandidaten

| Spalte | Typ / Default | Bedeutung |
|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | |
| `journey_slug` | TEXT FK CASCADE | |
| `name` | TEXT `Unbenannt` | Upsert-Identität (MCP: case-insensitiv) |
| `price` | TEXT `''` | Freitext, z. B. `1499€` |
| `rating` | TEXT `''` | ⭐-String (`⭐⭐⭐`), siehe `starsFromRating()` |
| `status` | TEXT `Thinking` | `Thinking`, `Shortlisted`, `Test Ridden`, `Rejected`, `Bought` |
| `notes` | TEXT `''` | Pro/Contra, Freitext |
| `link` | TEXT `''` | Produkt-URL |
| `specs` | TEXT `'[]'` + `CHECK (json_valid(specs))` | **Schemalose Vergleichsattribute als JSON-Array** (s. u.) |
| `position` | INTEGER `0` | Sortierung |

Index: `(journey_slug, position)`.

### 2.5 `items.specs` — schemaloses JSON-Format

Gespeichert als JSON-Array von Paaren, damit **Reihenfolge + Freitext** erhalten bleiben:

```json
[{"k": "Gewicht", "v": "8.1 kg"}, {"k": null, "v": "Freitext ohne Doppelpunkt"}]
```

- **Wire-Format (REST):** `<br>`-verbundener String: `"Gewicht: 8.1 kg <br> Rahmen: Carbon"`. Konvertierung an der Speichergrenze: `specsStringToJson()` / `specsJsonToString()` in `store.js`.
- **Regeln:** Trennung am **ersten** Doppelpunkt; Zeilen ohne Doppelpunkt → `{k: null}` = Freitext, erzeugt **keine** Vergleichszeile. Schlüssel case-insensitiv zusammengeführt (`Akku` = `akku`), Anzeige behält Erstschreibweise.
- **Abfrage:** `store.specValues(slug, key)` nutzt `json_each` + `json_extract(j.value, '$.k'/'$.v')` mit `lower()`-Vergleich.

## 3. Store-API (`src/db/store.js`)

`openDatabase(pfad?)` → `{ path, listJourneys, listJourneyConfigs, getJourneyConfig, saveJourneyConfig, createJourney, getJourneyData, saveJourneyData, getFeedback, saveFeedback, specValues, close }`

- `getJourneyData(slug)` — Volldokument (lazy-create): `{ status{phase,budget,targetDate}, journey[], items[] (specs als String), specs[], generalNotes, headers[], sectionTitle, listTitle }`.
- `saveJourneyData(slug, data)` — Voll-Replace in Transaktion (DELETE + INSERT pro Kindtabelle).
- `saveJourneyConfig(slug, patch)` — partiell, nur `name/description/category/currency/sectionTitle/listTitle`, validiert Typ + `CONFIG_LIMITS`; Fehlercodes `CONFIG_UNKNOWN_FIELD` / `CONFIG_INVALID` → API 400.
- `createJourney(slug, fields)` — strikt, kein Lazy-Create; Duplikat → `JOURNEY_EXISTS` → API 409.

## 4. REST-API (`src/web/backend/server.js`)

Alle Daten-Routen hängen hinter `authGate` (siehe §5). `?journey=` wird via `getJourney()` sanitisiert (erstes gewinnt, nur `[a-zA-Z0-9.-]`, Fallback `bike`).

| Methode + Pfad | Funktion |
|---|---|
| `GET /api/config` | `{ storage: 'sqlite' }` (öffentlich) |
| `GET /api/mcp-status` | MCP-Name/Version/Tool-Liste aus `tools.js` (öffentlich) |
| `GET /api/me` | Verifizierter Nutzer oder 401 (immer `optionalAuth`) |
| `GET /api/journeys` | Slug-Liste, sortiert |
| `POST /api/journeys` | Anlegen, 201 `{success, slug}`, 409 bei Duplikat, 400 bei invalide |
| `GET /api/journey-configs` | Alle Configs für Startseite (ohne Items/Logs) |
| `GET /api/journey-config?journey=X` | Eine Config (lazy-create) |
| `PUT /api/journey-config?journey=X` | Partieller Config-Update |
| `GET /api/data?journey=X` | Volldokument (lazy-create) |
| `POST /api/data?journey=X` | Voll-Replace + SSE-Broadcast |
| `GET /api/data/events?journey=X` | SSE-Stream (`journey-updated`, `retry: 5000`, Heartbeat `: heartbeat`) |
| `GET /api/feedback` / `POST /api/feedback` | `{content}` lesen / `{content: string}` schreiben |
| `POST /api/import-link?journey=X` | `{link}` → POST an `N8N_WEBHOOK_URL` → `{item}` zurück (speichert **nicht** selbst) |

Sonstiges: `express.json({limit: '1mb'})` (400 bei kaputtem JSON, 413 bei zu groß), `GET *` → SPA-Fallback auf `frontend/dist/index.html` bzw. 404-JSON unter `/api/`.

## 5. Auth (`src/web/backend/auth.js`)

- Supabase-JWT via `Authorization: Bearer …` (SSE-Fallback `?token=` / `?access_token=`, da `EventSource` keine Header kann).
- Verifizierung per `auth.getUser(token)` (Netzwerk), Ergebnis als `req.user = { id, email, appMetadata, userMetadata, aud }`.
- **Verify-only-Default:** ohne `AUTH_REQUIRED=true` lässt `authGate` anonym durch (`req.user = null`), hängt Nutzer nur an wenn Token gültig.
- **`AUTH_REQUIRED=true`:** `requireAuth` erzwingt Token (401 ohne/ungültig, 503 wenn Supabase nicht konfiguriert oder Lib fehlt).
- Login-Flows (alle Frontend via `supabase-js`, alle liefern dasselbe JWT): E-Mail/Passwort + Google/Apple-OAuth mit Rücksprung `/login`.

## 6. Weitere Bausteine

- **`src/core/item-format.js`:** `starsFromRating(0–5)` → ⭐-String; `specsToString([{label,value}])` → `<br>`-String (für n8n-Import).
- **`src/mcp/`:** Tools `journey.get`, `journey.add_item` (Upsert nach Name), `journey.crawl_link`, `journey.create_from_link`.
- **`src/agent/scripts/`:** CLIs (`--journey bike --name …`, Extra-Flags werden Specs) + Crawler; `product_extraction_prompt.md` als Extraktions-Prompt.
- **Tests:** `npm test` — `test/store.test.js`, `server.test.js`, `auth.test.js`, `item-format.test.js`, `mcp.test.js`, `sse.test.js`, `light-contrast.test.js`.

#architektur #backend #sqlite #express
