# Backend — JourneyPath 🏗️

> Code: `src/` (Node.js, Express 4) · DB: `data/app.db` (SQLite via `node:sqlite`) · Einstieg: `src/web/backend/server.js`
> Siehe auch: [[Übersicht]] · [[Frontend]] · [[Was-ist-JourneyPath]]

## 1. Überblick

```
src/
├── web/backend/
│   ├── server.js                   # Express-App, alle /api-Routen, SSE, Static-Hosting
│   ├── auth.js                     # Identität: API-Key + Supabase-JWT (requireUser/authGate/…)
│   ├── crawl-providers.js          # zweistufige Crawl-Pipeline (Parse-Tool + LLM-Auswertung)
│   ├── crawl-product-schema.json   # JSON-Schema für die Produkt-Extraktion (agy --json-schema)
│   └── journey-naming-schema.json  # JSON-Schema für die Journey-Benennung
├── db/
│   └── store.js    # einzige DB-Schicht: openDatabase(), Schema, Migrationen, CRUD, JSON1, API-Keys
├── core/
│   ├── item-format.js  # starsFromRating(), specsToString()
│   └── paste-clean.js  # cleanPastedContent(): eingefügtes HTML/Text für das LLM putzen
├── mcp/
│   ├── server.js   # MCP-stdIO-Server
│   └── tools.js    # TOOL_DEFS (Single Source of Truth, auch für GET /api/mcp-status)
└── agent/
    ├── scripts/    # add-item.js, add-log.js, crawl-and-extract.js, create-api-key.js, utils.js
    ├── prompts/    # product_extraction_prompt.md, journey_naming_prompt.md
    └── temp/       # last-crawl.json
```

- **Kein ORM.** Alles SQL steht in `src/db/store.js`.
- **Start:** `npm run dev` (Backend + Vite `:5173`), `npm start` (Backend serviert `frontend/dist`), `npm test`, `npm run mcp`.
- **Port:** Code-Default `3000` (`process.env.PORT || 3000`); `.env.example` und der Vite-Proxy nutzen `1337`.
- **Config:** `.env` — `PORT`, `DB_PATH` (Default `data/app.db`), `CRAWL_*` (§6), `N8N_WEBHOOK_URL`, `SUPABASE_URL` / `SUPABASE_ANON_KEY`, `AUTH_REQUIRED`.

## 2. Datenstruktur (SQLite)

Datei: `data/app.db` (WAL-Modus, `PRAGMA foreign_keys = ON`). **Fünf Tabellen**: fester Kern relational, schemalose Vergleichsattribute als JSON, plus API-Keys.

Alle Journey-Tabellen tragen ein **`owner_id`** — Journeys sind pro User getrennt, gleiche Slugs verschiedener User sind unabhängige Journeys (§5).

### 2.1 `journeys` — eine Zeile pro Kaufreise

`PRIMARY KEY (owner_id, slug)`.

| Spalte | Typ / Default | Bedeutung |
|---|---|---|
| `owner_id` | TEXT NOT NULL | Besitzer (Supabase-User-ID bzw. API-Key-User) |
| `slug` | TEXT NOT NULL | Journey-Kürzel, z. B. `bike` (URL-Param `?journey=`) |
| `name` | TEXT NOT NULL `''` → Backfill `= slug` | Anzeigename (Config) |
| `description` | TEXT NOT NULL `''` | Config, max. 500 Zeichen |
| `category` | TEXT NOT NULL `''` | Config, lowercase (`fahrrad`, `laptop`, …), max. 40 |
| `currency` | TEXT NOT NULL `''` → Backfill `€` | Config, max. 10 |
| `section_title` | TEXT NOT NULL `Items Under Consideration` | Anzeige-Setting |
| `list_title` | TEXT NOT NULL `Spezifikationen` | Anzeige-Setting, z. B. `Rahmengrößen` |
| `phase` | TEXT NOT NULL `Planning` | Status-Phase (`Planning`, `Researching`, `Test Riding`, `Comparing`, `Decision`, `Purchased`) |
| `budget` | TEXT NOT NULL `''` | Freitext, z. B. `2500€` |
| `target_date` | TEXT NOT NULL `''` | Freitext-Datum |
| `general_notes` | TEXT NOT NULL `''` | Allgemeine Notizen (Markdown) |
| `feedback` | TEXT NOT NULL `''` | Feedback-Seite (Markdown) |
| `created_at` / `updated_at` | TEXT `datetime('now')` | Auto-Stempel |

Migrationen laufen beim Öffnen: `ensureConfigColumns()` rüstet die Config-Spalten per `ALTER TABLE` nach, `backfillConfigDefaults()` füllt leere `name`/`currency`, ein `PRAGMA table_info(items)`-Check ergänzt `needs_content`. `ensureJourney('bike', owner)` legt die Default-Journey im Namensraum des Owners an.

### 2.2 `journey_logs` — Reisetagebuch

| Spalte | Typ |
|---|---|
| `id` | INTEGER PK AUTOINCREMENT |
| `owner_id` / `journey_slug` | TEXT, FK → `journeys(owner_id, slug)` ON DELETE CASCADE |
| `date` / `event` | TEXT `''` |
| `position` | INTEGER `0` (Sortierung) |

Index: `(owner_id, journey_slug, position)`. Sortierung immer `ORDER BY position, id`.

### 2.3 `journey_specs` — journey-weite Eigenschaften

Gilt für die **ganze Reise** (Seite `/eigenschaften`), nicht pro Produkt. Abzugrenzen von `items.specs`!
Spalten: `id`, `owner_id`, `journey_slug`, `label`, `value`, `position`. Index: `(owner_id, journey_slug, position)`.

### 2.4 `items` — Produkt-Kandidaten

| Spalte | Typ / Default | Bedeutung |
|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | |
| `owner_id` / `journey_slug` | TEXT, FK CASCADE | |
| `name` | TEXT `Unbenannt` | Upsert-Identität (MCP: case-insensitiv) |
| `price` | TEXT `''` | Freitext, z. B. `1499€` |
| `rating` | TEXT `''` | ⭐-String (`⭐⭐⭐`), siehe `starsFromRating()` |
| `status` | TEXT `Thinking` | `Thinking`, `Shortlisted`, `Test Ridden`, `Rejected`, `Bought` |
| `notes` | TEXT `''` | Pro/Contra, Freitext |
| `link` | TEXT `''` | Produkt-URL |
| `specs` | TEXT `'[]'` + `CHECK (json_valid(specs))` | **Schemalose Vergleichsattribute als JSON-Array** (s. u.) |
| `needs_content` | INTEGER `0` | **1 = Platzhalter**: Auto-Crawl war blockiert, Inhalt muss manuell nachgereicht werden (§6.4) |
| `position` | INTEGER `0` | Sortierung |

Index: `(owner_id, journey_slug, position)`. Im Wire-Format erscheint das Flag nur, **wenn gesetzt** (`needsContent: true`) — für normale Items bleibt das JSON unverändert.

### 2.5 `items.specs` — schemaloses JSON-Format

Gespeichert als JSON-Array von Paaren, damit **Reihenfolge + Freitext** erhalten bleiben:

```json
[{"k": "Gewicht", "v": "8.1 kg"}, {"k": null, "v": "Freitext ohne Doppelpunkt"}]
```

- **Wire-Format (REST):** `<br>`-verbundener String: `"Gewicht: 8.1 kg <br> Rahmen: Carbon"`. Konvertierung an der Speichergrenze: `specsStringToJson()` / `specsJsonToString()` in `store.js`.
- **Regeln:** Trennung am **ersten** Doppelpunkt; Zeilen ohne Doppelpunkt → `{k: null}` = Freitext, erzeugt **keine** Vergleichszeile. Schlüssel case-insensitiv zusammengeführt (`Akku` = `akku`), Anzeige behält Erstschreibweise.
- **Abfrage:** `store.specValues(slug, key)` nutzt `json_each` + `json_extract(j.value, '$.k'/'$.v')` mit `lower()`-Vergleich.

### 2.6 `api_keys` — langlebige Keys für den MCP-Zugriff

`id`, `key_hash` (UNIQUE, SHA-256 — **nie Klartext**), `user_id`, `name`, `created_at`, `last_used`, `revoked`. Indizes auf `key_hash` und `user_id`.

## 3. Store-API (`src/db/store.js`)

`openDatabase(pfad?)` → `{ path, listJourneys, listJourneyConfigs, getJourneyConfig, saveJourneyConfig, createJourney, getJourneyData, saveJourneyData, getFeedback, saveFeedback, specValues, hashApiKey, isApiKeyFormat, createApiKey, listApiKeys, revokeApiKey, findApiKeyOwner, close }`

- `getJourneyData(slug, owner)` — Volldokument (lazy-create): `{ status{phase,budget,targetDate}, journey[], items[] (specs als String, optional needsContent), specs[], generalNotes, headers[], sectionTitle, listTitle }`.
- `saveJourneyData(slug, data, owner)` — Voll-Replace in Transaktion (DELETE + INSERT pro Kindtabelle).
- `saveJourneyConfig(slug, patch, owner)` — partiell, nur `name/description/category/currency/sectionTitle/listTitle`, validiert Typ + `CONFIG_LIMITS`; Fehlercodes `CONFIG_UNKNOWN_FIELD` / `CONFIG_INVALID` → API 400.
- `createJourney(slug, fields, owner)` — strikt, kein Lazy-Create; Duplikat → `JOURNEY_EXISTS` → API 409.
- API-Key-Funktionen: Erzeugen (Klartext genau einmal), Auflisten, Widerrufen, Owner-Auflösung per Hash.

## 4. REST-API (`src/web/backend/server.js`)

Alle Daten-Routen hängen hinter **`needUser`** (`requireUser(store)`, §5) — ohne gültige Identität 401, unabhängig von `AUTH_REQUIRED`. `?journey=` wird via `getJourney()` sanitisiert (erstes gewinnt, nur `[a-zA-Z0-9.-]`, Fallback `bike`).

| Methode + Pfad | Funktion |
|---|---|
| `GET /api/config` | `{ storage: 'sqlite' }` (öffentlich) |
| `GET /api/mcp-status` | MCP-Name/Version/Protokoll + Tool-Liste inkl. `inputSchema` aus `tools.js` (öffentlich) |
| `GET /api/me` | Verifizierter Nutzer oder 401 (`optionalAuth`) |
| `POST` / `GET` / `DELETE /api/api-keys[/:id]` | API-Keys anlegen (Klartext einmalig) / auflisten / widerrufen |
| `GET /api/journeys` | Slug-Liste des Owners, sortiert |
| `POST /api/journeys` | Anlegen, 201 `{success, slug}`, 409 bei Duplikat, 400 bei invalide |
| `GET /api/journey-configs` | Alle Configs für die Startseite (ohne Items/Logs) |
| `GET` / `PUT /api/journey-config?journey=X` | Eine Config lesen (lazy-create) / partiell schreiben |
| `GET /api/data?journey=X` | Volldokument (lazy-create) |
| `POST /api/data?journey=X` | Voll-Replace + SSE-Broadcast |
| `GET /api/data/events?journey=X` | SSE-Stream (`journey-updated`, `retry: 5000`, Heartbeat `: heartbeat`) |
| `GET` / `POST /api/feedback` | `{content}` lesen / schreiben |
| `GET /api/crawl-providers` | Liste beider Crawl-Stufen mit `{stage, name, description, configured, active}` (bewusst hinter Login — sonst wären interne Endpunktnamen ausgeloggt sichtbar) |
| `POST /api/import-link?journey=X` | `{link, provider?, fetcher?}` → zweistufiger Crawl → `{item, provider, fetcher, meta}` (speichert **nicht**) |
| `POST /api/parse-text?journey=X` | `{text, link?, provider?}` → LLM-Auswertung **ohne** Fetch-Stufe → `{item, provider, meta}` (speichert **nicht**) |
| `POST /api/suggest-journey` | `{url\|link, title, text, provider?}` → `{slug, name, category, provider, meta}` — Journey-Benennung, speichert **nicht** |

Sonstiges: `express.json({limit: '1mb'})` (400 bei kaputtem JSON, 413 bei zu groß), `GET *` → SPA-Fallback auf `frontend/dist/index.html` bzw. 404-JSON unter `/api/`. Jeder Import schreibt eine Kennzahlen-Logzeile (`[import-link] …`, `[parse-text] …`, `[crawl] …`) — Zeiten, Größen, Fallbacks, **keine Inhalte**.

## 5. Auth & Owner-Trennung (`src/web/backend/auth.js`)

Zwei Token-Arten, beide als `Authorization: Bearer …` (SSE-Fallback `?token=` / `?access_token=`, da `EventSource` keine Header kann):

- **API-Key** — Format `bj_` + 64 Hex-Zeichen, langlebig, gedacht für den MCP. In der DB liegt nur der SHA-256-Hash (`api_keys`). Erzeugen per CLI ohne laufenden Server: `node src/agent/scripts/create-api-key.js --user "jakob" --name "Muse MCP"`.
- **Supabase-JWT** — Browser-Login (Google / Apple / E-Mail+Passwort), verifiziert per `auth.getUser(token)` (Netzwerk); Ergebnis als `req.user = { id, email, appMetadata, userMetadata, aud }`.

Middleware:

- **`requireUser(store)` (= `needUser`)** — das Tor für alle Daten-Routen: löst API-Key **oder** JWT auf, sonst 401. Gilt immer, **unabhängig von `AUTH_REQUIRED`**, denn ohne Identität greift die Owner-Trennung nicht.
- `optionalAuth` — hängt den Nutzer nur an (für `GET /api/me`).
- `authGate` / `requireAuth` — älteres Tor: ohne `AUTH_REQUIRED=true` anonym durchlassen, mit `=true` Token erzwingen (401 ohne/ungültig, 503 wenn Supabase nicht konfiguriert).

Jede Zeile trägt `owner_id`; Slugs sind nur **innerhalb** eines Owners eindeutig.

## 6. Crawl-Pipeline (`src/web/backend/crawl-providers.js`)

Zwei entkoppelte Stufen. Neue Provider werden hier registriert — Route und Frontend-Dropdowns übernehmen sie automatisch über `stage`.

### 6.1 Stufe 1 — Inhalt parsen (Fetcher: `fetch(url) → {title, text}`)

| Name | Bedeutung | Config |
|---|---|---|
| `direct` | **Default**, eingebaut: Backend lädt die Seite selbst, `htmlToText()` extrahiert Titel + Fließtext | — |
| `headless` | Puppeteer rendert JavaScript (JS-Seiten, Bot-Schutz) | `puppeteer` installiert, `CRAWL_HEADLESS_TIMEOUT_MS` |
| `local-cmd` | externes Parse-Tool auf dieser Maschine; `{url}`/`{journey}` als Platzhalter + Env `CRAWL_URL`/`CRAWL_JOURNEY`, stdout `{title?, text}` | `CRAWL_FETCH_CMD` |

**Auto-Fallback:** Scheitert `direct` oder liefert weniger als `CRAWL_DIRECT_MIN_CHARS` (Default 1000) sichtbaren Text, lädt die Pipeline automatisch `headless` nach. **Explizit gewählte** Fetcher fallen nicht zurück — deren Fehler gehen direkt an den Aufrufer.

### 6.2 Stufe 2 — Inhalt mit LLM auswerten (Extraktor: `extract(content) → rawProduct`)

| Name | Bedeutung | Config |
|---|---|---|
| `agy` | **Default**, wenn das Binary im PATH steht: lokale CLI im Print-Mode (`--mode plan`, keine Tools, Antwort per `--json-schema` erzwungen) | `CRAWL_AGY_BIN/-MODEL/-EFFORT/-TIMEOUT_MS` |
| `remote-ai` | `POST {url, journey, title, text}` an einen HTTP-Endpunkt, Key optional als Bearer | `CRAWL_REMOTE_URL`, `CRAWL_REMOTE_KEY` |
| `local-cmd` | lokales Skript, Inhalt als JSON über stdin, stdout = Produkt-JSON | `CRAWL_EXTRACT_CMD` |
| `n8n` | **Legacy, kombiniert**: `POST {url, journey}` an den Webhook, crawlt selbst → Stufe 1 entfällt (`fetcher: null`). Fallback-Default ohne `agy`-Binary | `N8N_WEBHOOK_URL` |

Auflösung: Request-Feld `provider` > `CRAWL_EXTRACT_PROVIDER` / `CRAWL_PROVIDER` > `agy` falls verfügbar, sonst `n8n`. Analog `fetcher` > `CRAWL_FETCH_PROVIDER` > `direct`. Der geparste Inhalt geht auf `CRAWL_MAX_CHARS` (Default 20000) gekappt an die LLM. `toJourneyItem()` mappt das Rohprodukt aufs Item-Format (`starsFromRating`, `specsToString`).

### 6.3 Journey-Benennung (`suggestJourneyCategory`)

`POST /api/suggest-journey` verallgemeinert ein Produkt zur Kategorie, nach der eine neue Journey heißt (Tesla Model 3 → `elektro-auto`). **Eine Quelle, ein Prompt:** `src/agent/prompts/journey_naming_prompt.md`, Antwortform erzwungen über `journey-naming-schema.json`. Naming-fähig sind `agy`, `remote-ai`, `local-cmd`. Ohne solchen Provider (und ohne explizite Provider-Wahl) gibt es einen **ehrlich markierten Rückfall**: die ersten drei Titelwörter, `provider: "fallback"`. Wird ein nicht naming-fähiger Provider explizit gewählt → 501.

### 6.4 Fehlerfälle & manueller Content-Fallback

| Code / Status | Bedeutung | Reaktion |
|---|---|---|
| 400 | Eingabefehler (ungültige URL, unbekannte Stufe, leerer Text) | Nutzer korrigiert die Eingabe — **kein** Platzhalter |
| `CONTENT_BLOCKED` (502) | Extraktion lieferte nur einen Namen, kein Preis und keine Specs → wahrscheinlich Bot-Schutz | Frontend legt Platzhalter mit `needsContent` an |
| `NO_EXTRACTOR` (501/500/400) | kein LLM-Provider konfiguriert bzw. `n8n` kann keinen eingefügten Text auswerten | MCP nutzt den Offline-Rückfall, Frontend meldet es |
| 504 | Zeitüberschreitung (`CRAWL_TIMEOUT_MS` 60 s, agy-Timeout separat) | Platzhalter |

Der manuelle Weg: Nutzer kopiert die Seite, `cleanPastedContent()` (`src/core/paste-clean.js`) wirft Head/Skripte/Styles/Kommentare raus und normalisiert Whitespace, `POST /api/parse-text` wertet den Rest per LLM aus. Danach wird `needs_content` gelöscht.

## 7. MCP (`src/mcp/`)

stdio-Server ohne Dependencies (`npm run mcp`), spricht das Backend über `MCP_BASE_URL` (Default `http://localhost:3000`) mit `MCP_AUTH_TOKEN` (API-Key). `tools.js` ist Single Source of Truth für Namen, Beschreibungen und `inputSchema` — auch für `GET /api/mcp-status`.

| Tool | Wirkung |
|---|---|
| `journey.get` | Volldokument inkl. Config lesen, legt nichts an |
| `journey.add_item` | Produkt anlegen/aktualisieren (Upsert nach Name, case-insensitiv) |
| `journey.crawl_link` | Produktseite headless laden (Titel + Text), speichert nichts |
| `journey.create_from_link` | **Nur `link` ist Pflicht.** Ohne `slug` benennt die LLM die Journey (`/api/suggest-journey`), das Erstprodukt kommt aus `/api/parse-text`. Explizit übergebene Felder überschreiben die Extraktion. Reihenfolge: erst crawlen, dann anlegen — schlägt der Crawl fehl, bleibt nichts zurück. Antwort führt `slugSource` und `ai: {naming, extraction}` mit, damit ein Offline-Rückfall erkennbar ist |

## 8. Weitere Bausteine

- **`src/core/item-format.js`:** `starsFromRating(0–5)` → ⭐-String; `specsToString([{label,value}])` → `<br>`-String.
- **`src/agent/scripts/`:** CLIs (`--journey bike --name …`, Extra-Flags werden Specs), Crawler, API-Key-Erzeugung — schreiben direkt in SQLite, ohne laufendes Backend.
- **Tests:** `npm test` (132 Tests, alle grün) — `test/store.test.js`, `server.test.js`, `auth.test.js`, `item-format.test.js`, `mcp.test.js`, `sse.test.js`, `light-contrast.test.js`, `journeys-overview-logged-out.test.js`, `login-gate.test.js`, `crawl-providers.test.js`, `paste-clean.test.js` sowie `manual-content.test.js` (läuft mit `--experimental-strip-types`). LLM-Attrappe: `test/helpers/llm-stub.js`.

#architektur #backend #sqlite #express #crawl
