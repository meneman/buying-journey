# Backend — JourneyPath 🏗️

> Code: `src/` & `packages/mcp/` (Node.js, Express 4) · DB: `data/app.db` (SQLite via `node:sqlite`) · Einstieg: `src/web/backend/server.js`
> Siehe auch: [[Übersicht]] · [[Frontend]] · [[Was-ist-JourneyPath]]

## 1. Überblick

```
src/
├── web/backend/
│   ├── server.js                    # Express-App, alle /api-Routen, SSE, Static-Hosting, Trigger für Property-Abgleich
│   ├── auth.js                      # Identität: API-Key + Supabase-JWT (requireUser/optionalAuth/authGate)
│   ├── spec-alignment.js            # KI-Property-Abgleich + stiller deterministischer Fallback
│   ├── spec-alignment-schema.json   # JSON-Schema für den Property-Abgleich (agy --json-schema)
│   ├── crawl-queue.js               # In-Memory-Worker-Queue + Debounce/Latest-wins pro (owner, slug)
│   └── crawl-providers.js           # LLM-Provider-Aufrufschicht (agy, remote-ai, local-cmd)
├── db/
│   └── store.js                     # einzige DB-Schicht: openDatabase(), Schema, Migrationen, CRUD, JSON1, API-Keys
├── core/
│   └── item-format.js               # starsFromRating(), specsToString()
├── mcp/
│   ├── server.js                    # Re-Export-Wrapper auf packages/mcp/src/server.js
│   └── tools.js                     # Re-Export-Wrapper auf packages/mcp/src/tools.js
└── agent/
    ├── prompts/
    │   └── spec_alignment_prompt.md # Prompt für den serverseitigen Property-Abgleich
    └── scripts/                     # create-api-key.js sowie Legacy-SQLite-CLIs (add-item.js, add-log.js, utils.js)

packages/mcp/
├── bin/journey-path-mcp.js          # Binär-Einstiegspunkt für @journey-path/mcp
└── src/
    ├── server.js                    # stdio-MCP-Server (JSON-RPC 2.0, 0 Dependencies)
    └── tools.js                     # SERVER_INFO ('journey-path') & TOOL_DEFS (Single Source of Truth für /api/mcp-status)
```

- **Kein ORM.** Alles SQL steht in `src/db/store.js`.
- **Start:** `npm run dev` (Backend `:3000` + Vite `:1337`), `npm start` (Backend serviert `frontend/dist`), `npm test`, `npm run mcp`.
- **Port:** Code-Default `3000` (`process.env.PORT || 3000`); `.env` setzt `1337` für `npm start`, `npm run dev` nutzt `PORT=3000` + Vite `:1337` — der Browser-Einstieg ist immer `http://localhost:1337`.
- **Config:** `.env` — `PORT`, `DB_PATH` (Default `data/app.db`), `FRONTEND_DIST`, `CRAWL_EXTRACT_PROVIDER` / `CRAWL_PROVIDER`, `CRAWL_AGY_*`, `CRAWL_REMOTE_*`, `CRAWL_EXTRACT_CMD`, `CRAWL_QUEUE_CONCURRENCY` (Default `2`), `SPEC_ALIGNMENT_DEBOUNCE_MS` (Default `300`), `SUPABASE_URL`, `SUPABASE_ANON_KEY` / `SUPABASE_PUBLISHABLE_KEY`, `AUTH_REQUIRED`.

## 2. Datenstruktur (SQLite)

Datei: `data/app.db` (WAL-Modus, `PRAGMA foreign_keys = ON`). **Fünf Tabellen**: fester Kern relational, schemalose Vergleichsattribute als JSON, plus API-Keys.

Alle Journey-Tabellen tragen ein **`owner_id`** — Journeys sind pro User getrennt, gleiche Slugs verschiedener User sind unabhängige Journeys (§5).

### 2.1 `journeys` — eine Zeile pro Kaufreise

`PRIMARY KEY (owner_id, slug)`.

| Spalte | Typ / Default | Bedeutung |
|---|---|---|
| `owner_id` | TEXT NOT NULL | Besitzer (Supabase-User-ID bzw. API-Key-User) |
| `slug` | TEXT NOT NULL | Journey-Kürzel, z. B. `bike` (URL-Param `?journey=`) |
| `name` | TEXT NOT NULL `''` | Anzeigename (Config) |
| `description` | TEXT NOT NULL `''` | Config, max. 500 Zeichen |
| `category` | TEXT NOT NULL `''` | Config, lowercase (`fahrrad`, `laptop`, …), max. 40 |
| `currency` | TEXT NOT NULL `''` | Config, max. 10 |
| `section_title` | TEXT NOT NULL `Items Under Consideration` | Anzeige-Setting |
| `list_title` | TEXT NOT NULL `Spezifikationen` | Anzeige-Setting, z. B. `Rahmengrößen` |
| `phase` | TEXT NOT NULL `Planning` | Status-Phase (`Planning`, `Researching`, `Test Riding`, `Comparing`, `Decision`, `Purchased`) |
| `budget` | TEXT NOT NULL `''` | Freitext, z. B. `2500€` |
| `target_date` | TEXT NOT NULL `''` | Freitext-Datum |
| `general_notes` | TEXT NOT NULL `''` | Allgemeine Notizen (Markdown) |
| `feedback` | TEXT NOT NULL `''` | Feedback-Seite (Markdown) |
| `spec_comparison` | TEXT NOT NULL `''` | JSON `{ commonKeys, uniqueKeys, updatedAt }` des Property-Abgleichs |
| `created_at` / `updated_at` | TEXT `datetime('now')` | Auto-Stempel |

Migrationen beim Öffnen: Ältere Tabellen ohne `owner_id` werden verworfen; bestehende `journeys`-Tabellen ohne `spec_comparison` sowie `items`-Tabellen ohne `needs_content` werden per `ALTER TABLE` nachgerüstet. `ensureOwnedJourney(slug, owner)` legt fehlende Journeys im Namensraum des Owners mit `defaultJourneyRow(slug)` an.

### 2.2 `journey_logs` — Reisetagebuch

| Spalte | Typ |
|---|---|
| `id` | INTEGER PK AUTOINCREMENT |
| `owner_id` / `journey_slug` | TEXT, FK → `journeys(owner_id, slug)` ON DELETE CASCADE |
| `date` / `event` | TEXT `''` |
| `position` | INTEGER `0` (Sortierung) |

Index: `(owner_id, journey_slug, position)`. Sortierung: `ORDER BY position, id`.

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
| `needs_content` | INTEGER `0` | Legacy-Spalte für Altdaten in `data/app.db` (wird nicht mehr an API/UI ausgeliefert) |
| `position` | INTEGER `0` | Sortierung |

Index: `(owner_id, journey_slug, position)`.

### 2.5 `items.specs` — schemaloses JSON-Format

Gespeichert als JSON-Array von Paaren, damit **Reihenfolge + Freitext** erhalten bleiben:

```json
[{"k": "Gewicht", "v": "8.1 kg"}, {"k": null, "v": "Freitext ohne Doppelpunkt"}]
```

- **Wire-Format (REST):** `<br>`-verbundener String: `"Gewicht: 8.1 kg <br> Rahmen: Carbon"`. Konvertierung an der Speichergrenze: `specsStringToJson()` / `specsJsonToString()` in `store.js`.
- **Regeln:** Trennung am **ersten** Doppelpunkt; Zeilen ohne Doppelpunkt → `{k: null}` = Freitext, erzeugt **keine** Vergleichszeile.
- **Abfrage:** `store.specValues(slug, owner, key)` nutzt `json_each` + `json_extract(j.value, '$.k'/'$.v')` mit `lower()`-Vergleich.

### 2.6 `api_keys` — langlebige Keys für den MCP-Zugriff

`id`, `key_hash` (UNIQUE, SHA-256 — **nie Klartext**), `user_id`, `name`, `created_at`, `last_used`, `revoked`. Indizes auf `key_hash` und `user_id`.

## 3. Store-API (`src/db/store.js`)

`openDatabase(pfad?)` → `{ path, listJourneys, listJourneyConfigs, getJourneyConfig, saveJourneyConfig, createJourney, deleteJourney, getJourneyData, getItemsSnapshot, saveJourneyData, applySpecAlignment, computeItemsHash, getFeedback, saveFeedback, specValues, hashApiKey, isApiKeyFormat, createApiKey, listApiKeys, revokeApiKey, findApiKeyOwner, close }`

- `getJourneyData(slug, owner)` — Volldokument (lazy-create): `{ status{phase,budget,targetDate}, journey[], items[], specs[], generalNotes, headers[], sectionTitle, listTitle, specComparison? }`.
- `saveJourneyData(slug, owner, data, options?)` — Voll-Replace in Transaktion; mit `preserveSpecComparison: true` bleibt `spec_comparison` bei reinen Nicht-Item-Updates erhalten.
- `applySpecAlignment(slug, owner, { expectedItemsHash, updatedSpecsByIndex?, specComparison })` — atomarer interner Commit mit Hash-Prüfung (verwirft veraltete Ergebnisse bei zwischenzeitlichen Edits) und ohne Rekursions-Trigger.
- `createJourney(slug, owner, fields)` — strikt, kein Lazy-Create; Duplikat → `JOURNEY_EXISTS` → API `409`.
- `deleteJourney(slug, owner)` — löscht die Journey inkl. abhängiger Zeilen (`ON DELETE CASCADE`).

## 4. REST-API (`src/web/backend/server.js`)

Alle Daten-Routen hängen hinter **`needUser`** (`requireUser(store)`, §5) — ohne gültige Identität `401`, unabhängig von `AUTH_REQUIRED`. `?journey=` wird via `getJourney()` sanitisiert (erstes gewinnt, nur `[a-zA-Z0-9.-]`, Fallback `bike`). Ausnahme `DELETE /api/journeys?journey=X`: verlangt einen explizit gültigen Slug (`400` ohne `bike`-Fallback).

| Methode + Pfad | Funktion |
|---|---|
| `GET /api/config` | `{ storage: 'sqlite' }` (öffentlich) |
| `GET /api/mcp-status` | MCP-Name/Version/Protokoll + Tool-Liste inkl. `inputSchema`, `serverFile`, `packageName`, `port`, `baseUrl` (öffentlich) |
| `GET /api/me` | Verifizierter Nutzer oder `401` (`optionalAuth`) |
| `POST` / `GET` / `DELETE /api/api-keys[/:id]` | API-Keys anlegen (Klartext einmalig) / auflisten / widerrufen |
| `GET /api/journeys` | Slug-Liste des Owners, sortiert |
| `POST /api/journeys` | Anlegen, `201 {success, slug}`, `409` bei Duplikat, `400` bei invalide |
| `DELETE /api/journeys?journey=X` | Löschen (`200 {success, slug}`, `404` wenn unbekannt, `400` bei fehlendem/ungültigem Slug) |
| `GET /api/journey-configs` | Alle Configs für die Startseite (ohne Items/Logs) |
| `GET` / `PUT /api/journey-config?journey=X` | Eine Config lesen (lazy-create) / partiell schreiben |
| `GET /api/data?journey=X` | Volldokument (lazy-create, optional mit `specComparison`) |
| `POST /api/data?journey=X` | Voll-Replace + SSE-Broadcast + asynchroner Property-Abgleich bei geänderten Items (`>= 2` Produkte mit Specs) |
| `GET /api/data/events?journey=X` | SSE-Stream (`ready`, `journey-updated` mit optionalem `reason: "property-sync"`, `retry: 5000`, Heartbeat `: heartbeat`) |
| `GET` / `POST /api/feedback?journey=X` | `{content}` lesen / schreiben |

Sonstiges: `express.json({limit: '1mb'})` (`400` bei kaputtem JSON, `413` bei zu groß), `app.all('/api/*', 404)` für einheitliches JSON-404 sowie `GET *` als SPA-Fallback auf `frontend/dist/index.html`.

## 5. Auth & Owner-Trennung (`src/web/backend/auth.js`)

Zwei Token-Arten, beide als `Authorization: Bearer …` (SSE-Fallback `?token=` / `?access_token=`, da `EventSource` keine Header senden kann):

- **API-Key (`bj_` + 64 Hex-Zeichen):** Langlebig, für MCP-Clients. In der DB liegt nur der SHA-256-Hash (`api_keys`). Erzeugen per `/mcp`-UI oder CLI (`node src/agent/scripts/create-api-key.js --user "jakob" --name "Claude"`).
- **Supabase-JWT:** Browser-Login (Google / Apple / E-Mail+Passwort), verifiziert per `auth.getUser(token)`.

Jede Zeile trägt `owner_id`; Slugs sind nur **innerhalb** eines Owners eindeutig.

## 6. Serverseitiger KI-Property-Abgleich (`spec-alignment.js`, `crawl-queue.js`, `crawl-providers.js`)

Web-Crawling im Backend gibt es nicht mehr — `crawl-providers.js` stellt ausschließlich die schlanke LLM-Provider-Schicht (`runLlmJson`) für Hintergrundaufgaben bereit:

| Provider | Bedeutung | Config |
|---|---|---|
| `agy` | **Default** (Priorität 1), wenn das Binary im PATH steht: lokale CLI (`--mode plan`, `--json-schema`) | `CRAWL_AGY_BIN`, `-MODEL`, `-EFFORT`, `-TIMEOUT_MS` |
| `remote-ai` | `POST` JSON-Payload an einen HTTP-Endpunkt (Key optional als Bearer) | `CRAWL_REMOTE_URL`, `CRAWL_REMOTE_KEY` |
| `local-cmd` | Lokales Kommando, JSON über stdin, Ergebnis-JSON über stdout | `CRAWL_EXTRACT_CMD` |

Ablauf in `POST /api/data`:
1. `store.getItemsSnapshot()` + `computeItemsHash()` prüfen, ob sich `items` geändert haben (`itemsChanged`).
2. Bei `itemsChanged && nextItems.length >= 2 && hasAnyKeyedSpecs(nextItems)`:
   - **Ohne konfigurierten LLM-Provider:** Stiller deterministischer Fallback (`computeDeterministicSpecComparison` ohne Key-Umbenennung und ohne Extra-SSE).
   - **Mit LLM-Provider:** `specQueue.scheduleDebounced` (`CRAWL_QUEUE_CONCURRENCY`, `SPEC_ALIGNMENT_DEBOUNCE_MS`, Latest-wins pro `owner/slug`) ruft asynchron `alignJourneySpecs()` mit `src/agent/prompts/spec_alignment_prompt.md` + `spec-alignment-schema.json` auf.
3. Vor Commit prüft `store.applySpecAlignment()` den `expectedItemsHash` (schützt vor Überschreiben neuerer Nutzer-Edits) und schreibt nur `items.specs` + `journeys.spec_comparison`, ohne `POST /api/data` erneut zu triggern. Bei Erfolg feuert `broadcastJourneyUpdate(owner, journey, { reason: 'property-sync' })`; bei LLM-Fehlern greift ein stiller Fallback.

## 7. MCP (`packages/mcp/`, Wrapper `src/mcp/`)

Abhängigkeitsfreier stdio-MCP-Server (`npm run mcp`), spricht das Backend über `MCP_BASE_URL` (Default `http://localhost:3000` bzw. `PORT`) mit `MCP_AUTH_TOKEN` (API-Key). `packages/mcp/src/tools.js` (`SERVER_INFO.name = 'journey-path'`) ist Single Source of Truth für Namen, Beschreibungen und `inputSchema` — auch für `GET /api/mcp-status`.

Bereitgestellte Tools (19): `journey.help`, `journey.list`, `journey.create`, `journey.update_config`, `journey.delete`, `journey.get` (mit `status`/`search`/`sort`/`limit`/`offset`/`fields`), `journey.compare`, `journey.shortlist`, `journey.price_history`, `journey.set_criteria`, `journey.delete_criteria`, `journey.add_item` (mit `priceAmount`/`priceCurrency`/`priceQualifier`/`pros`/`cons`), `journey.delete_item`, `journey.update_meta`, `journey.add_log`, `journey.delete_log`, `journey.set_spec`, `journey.delete_spec`, `journey.set_feedback`.

## 8. Vergleich, Preise, Entscheidung (Feature-Set 2026-11)

- **Preise strukturiert:** `items` hat `price_amount`/`price_currency`/`price_qualifier`/`price_updated_at` neben dem Anzeige-String `price` (Parser in `src/core/price-parse.js`, DE-Formate wie `1.189,95 €`, `ab 249,00 €`). Bei geaendertem Anzeigetext gewinnt der Text (schuetzt vor veralteten Round-Trip-Werten), bei unveraendertem Text eine explizite Zahl (MCP). Aenderungen landen in `price_history` (per Item-Name geschluesselt, damit Voll-Replace sie nicht per CASCADE loescht).
- **Pro/Contra & Kriterien:** `items.pros`/`cons` (JSON-Arrays, max. 20 x 200 Zeichen), `journey_criteria` (`key`, `weight` 1..5). Scoring in `src/core/decision.js`: `12*rating + 2*(pros-cons) + pricePoints (max. 20) + criteriaPoints`, gedeckelt 0..100, mit `breakdown` und max. 3 `reasons`.
- **Lesende Endpunkte (kein Lazy-Create, kein SSE):** `GET /api/data` mit Filter/Sortierung/Paginierung, `GET /api/compare` (Preisspanne, Scores, common/unique, `missing`), `GET /api/shortlist?n=` (Default ohne `Rejected`), `GET /api/criteria` + `POST`/`DELETE`, `GET /api/price-history?name=&limit=`.
- **Fehlerformat neu:** `{error, code}` mit `INVALID_*`, `JOURNEY_NOT_FOUND`, `ITEM_NOT_FOUND`, `CRITERION_NOT_FOUND`.

## 9. Weitere Bausteine & Tests

- **`src/core/item-format.js`:** `starsFromRating(0–5)` → ⭐-String; `specsToString([{label,value}])` → `<br>`-String.
- **`src/core/price-parse.js` / `decision.js`:** DE-Preisparser, deterministisches Scoring, Budget-Urteil, Filter-/Sortier-Helfer.
- **`src/agent/scripts/`:** `create-api-key.js` sowie Legacy-Offline-SQLite-CLIs (`add-item.js`, `add-log.js`, `utils.js`).
- **Tests (`npm test`):** `item-format.test.js`, `store.test.js`, `server.test.js`, `auth.test.js`, `light-contrast.test.js`, `mcp.test.js`, `sse.test.js`, `journeys-overview-logged-out.test.js`, `login-gate.test.js`, `crawl-providers.test.js`, `crawl-queue.test.js`, `spec-alignment.test.js`, `price-parse.test.js`, `compare.test.js`, `decision.test.js` sowie (mit `--experimental-strip-types`) `journey-switch.test.js`, `compare-cell-wrap.test.js`, `compare-spec-grouping.test.js`.

#architektur #backend #sqlite #express #mcp
