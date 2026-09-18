# JourneyPath — dein Kauf-Begleiter 🧭

JourneyPath begleitet größere Anschaffungen von der Recherche bis zur Entscheidung: Kandidaten sammeln, vergleichen, bewerten, dokumentieren. Alle Informationen liegen lokal in einer **SQLite-Datenbank** (`data/app.db`) — jede Kaufreise (Bike, Laptop, EV, …) hat eigene Vergleichseigenschaften, die schemalos als JSON gespeichert werden.

Gestartet als Fahrradkauf-Begleiter (Journey `bike`, früherer Projektname *VeloPath*), ist die App inzwischen kategorie-unabhängig. Warum es das Projekt gibt, steht in `docs/vault/Was-ist-JourneyPath.md`.

## 🚀 Features

- **🎯 Status & Budget Tracker:** Behalte den Überblick über deine aktuelle Kauf-Phase, dein Budget und dein Ziel-Datum.
- **🔗 URL-first erfassen:** Produkt-Link einwerfen — eine zweistufige Crawl-Pipeline lädt die Seite und lässt ein LLM Name, Preis, Specs und Notizen extrahieren (siehe unten). Manuelle Eingabe bleibt als Zweitweg.
- **📋 Blockierte Seiten:** Lässt sich eine Seite nicht crawlen, entsteht ein markierter Platzhalter — Seiteninhalt einmal per Copy & Paste nachreichen, das LLM füllt den Eintrag.
- **⚖️ Vergleich:** Trage Modelle ein, bewerte sie mit Sternen, pflege Spezifikationen, trage Vor-/Nachteile ein und füge Links hinzu.
- **🗺️ Reisetagebuch:** Dokumentiere chronologisch Meilensteine wie Probefahrten, Händlergespräche oder Entscheidungen.
- **🤖 MCP-Server:** Ein KI-Agent liest und schreibt die Kaufreise direkt — inklusive „neue Journey aus einem Link anlegen".
- **📝 Allgemeine Notizen:** Freitextfeld für allgemeine Notizen und Kriterien.
- **💾 SQLite-Speicher:** Alle Daten liegen lokal in der SQLite-Datei — sichern durch Datei kopieren.

---

## 🛠️ Installation & Start

Das Frontend liegt in `frontend/` (Vite + React + TypeScript + shadcn/ui), das Backend in `src/web/backend` (Express).

1. **Abhängigkeiten installieren:**
   ```bash
   npm install
   npm install --prefix frontend
   ```

2. **Umgebungsvariablen konfigurieren:**
   Die Konfiguration befindet sich in der `.env`-Datei im Projekt-Root:
   - `DB_PATH`: Pfad zur SQLite-Datei (Standard: `data/app.db` im Projekt).
   - `PORT`: Port, auf dem das Backend lokal läuft (Code-Default `3000`; `.env.example` und der Vite-Dev-Proxy nutzen `1337`).
   - `CRAWL_*`: Provider der Crawl-Pipeline (siehe „Produkt-Import per Link" unten) — vollständig kommentiert in `.env.example`.

3. **Entwicklung (mit Hot-Reload):**
   ```bash
   npm run dev
   ```
   Startet Backend (Port `3000`) und Vite-Dev-Server (Port `5173`) gleichzeitig; der Dev-Server leitet `/api`-Aufrufe an das Backend weiter. Öffne [http://localhost:5173](http://localhost:5173).

4. **Produktion:**
   ```bash
   npm run build   # baut das Frontend nach frontend/dist
   npm start        # startet das Backend, das frontend/dist mit ausliefert
   ```
   Öffne [http://localhost:3000](http://localhost:3000).

5. **Backend-Tests ausführen:**
   ```bash
   npm test
   ```

---

## 🔐 Anmeldung & Datentrennung pro User

Alle `/api`-Daten-Routen verlangen eine Identität (401 ohne gültigen Bearer-Token) — und jede Identität sieht **nur ihre eigenen Journeys** (Owner-Trennung per `owner_id`, gleiche Slugs verschiedener User sind unabhängige Journeys). Zwei Token-Arten werden akzeptiert:

- **API-Key** (langlebig, Format `bj_…`): ein Key = ein User, gedacht für den MCP-Zugriff. Erzeugen per CLI (schreibt direkt in die DB, kein Server nötig):
  ```bash
  node src/agent/scripts/create-api-key.js --user "jakob" --name "Muse MCP"
  ```
  Der Klartext erscheint genau einmal — danach nur noch Hash in `api_keys`. Auflisten mit `--list --user …`, widerrufen mit `--revoke <id> --user …`. Alternativ per REST (mit gültigem Token): `POST /api/api-keys`, `GET /api/api-keys`, `DELETE /api/api-keys/:id`.
- **Supabase-JWT** (Browser-Login): Die Login-Seite (`/login`) bietet **Google**, **Apple** und **E-Mail + Passwort**. Alle drei liefern dasselbe Supabase-JWT, das das Backend per `auth.getUser()` verifiziert — serverseitig ist nichts umzustellen (auch `AUTH_REQUIRED=true` gilt unverändert für OAuth-Tokens).

Einmalig im [Supabase-Dashboard](https://supabase.com/dashboard) einrichten (Details siehe `.env.example`):

1. **Authentication → Providers:** Google (Client ID/Secret aus der Google Cloud Console) und/oder Apple (Services ID, Team ID, Key ID, Private Key aus dem Apple Developer Portal) aktivieren. Callback-URL dort jeweils: `https://<projekt>.supabase.co/auth/v1/callback`.
2. **Authentication → URL Configuration:** Site URL = Produktions-Origin; unter Additional Redirect URLs `http://localhost:5173/login` (Dev) und `<Produktions-Origin>/login` eintragen — die App kehrt nach dem OAuth-Flow auf `/login` zurück.

Solange ein Anbieter im Dashboard deaktiviert ist, schlägt sein Button mit einer Fehlermeldung auf der Login-Seite fehl (statt still zu laden).

---

## 📄 Speicherformat in SQLite

Die Daten liegen in `data/app.db` (SQLite, via `node:sqlite` — keine extra Dependency):

- **Fester Kern** als Tabellen: `journeys` (Basis-Eigenschaften Name/Beschreibung/Kategorie/Währung, Anzeige-Settings `section_title`/`list_title`, Status, Budget, Notizen, Feedback), `journey_logs` (Tagebuch), `journey_specs` (Journey-weite Eigenschaften), `items` (Name, Preis, Rating, Status, Notizen, Link, `needs_content`) und `api_keys` (nur SHA-256-Hashes). Alle Journey-Tabellen tragen ein `owner_id` — Journeys sind pro User getrennt.
- **Heterogene Vergleichseigenschaften** als JSON in `items.specs` (JSON1, `json_valid`-geprüft): Bike → `Gewicht, Rahmen, Schaltung`, Laptop → `CPU, RAM, SSD`, EV → `Reichweite, Batterie`. Jede Journey hat ihren eigenen Attributsatz, abfragbar z.B. mit `json_each` (siehe `store.specValues()` in `src/db/store.js`).

Die REST-API im Überblick (alle Daten-Routen verlangen eine Identität, siehe oben):

- **Daten:** `GET`/`POST /api/data?journey=X`, `GET /api/data/events?journey=X` (SSE), `GET`/`POST /api/feedback`, `GET`/`POST /api/journeys`
- **Config:** `GET`/`PUT /api/journey-config?journey=X` (partiell schreiben: `name`, `description`, `category`, `currency`, `sectionTitle`, `listTitle`), `GET /api/journey-configs` (alle Configs für die Startseite)
- **Crawl:** `GET /api/crawl-providers` (Statusliste beider Stufen), `POST /api/import-link?journey=X` (URL crawlen), `POST /api/parse-text?journey=X` (eingefügten Inhalt auswerten), `POST /api/suggest-journey` (Journey benennen) — **keine** dieser Routen speichert selbst
- **Sonstiges:** `GET /api/config`, `GET /api/mcp-status` (beide öffentlich), `GET /api/me`, `POST`/`GET`/`DELETE /api/api-keys[/:id]`

Eine ausführliche Systemdokumentation liegt im Obsidian-Vault: `docs/vault/Architektur/` (Backend, Frontend, Übersicht).

## 🔍 Vergleichseigenschaften hinzufügen

Vergleichseigenschaften sind **schemalos**: Eine neue Eigenschaft entsteht, sobald ein neuer `Schlüssel:`-Präfix in den Specs irgendeines Eintrags verwendet wird — kein Schema-Update, keine Migration nötig. Die Vergleichs-Seite bildet automatisch aus der Vereinigung aller Schlüssel je eine Zeile (Reihenfolge: erstes Auftreten; fehlende Werte zeigen `—`).

- **Produktdialog (UI):** Feld „Spezifikationen“, eine Eigenschaft pro Zeile im Format `Schlüssel: Wert`, z.B.
  ```
  Gewicht: 8.1 kg
  Rahmen: Carbon
  Akku: 750 Wh
  ```
- **CLI:** `node src/agent/scripts/add-item.js --journey bike --name "Modell" --akku "750 Wh"` — jedes zusätzliche `--flag` wird eine Eigenschaft (Key = Flag-Name mit Großbuchstaben am Anfang).
- **MCP:** `journey.add_item` mit `"specs": {"akku": "750 Wh"}`.
- **Link-Import:** Die LLM-Extraktion liefert `"specs": "Akku: 750 Wh <br> Gewicht: 8.1 kg"` (n8n alternativ als Liste `[{"label": "Akku", "value": "750 Wh"}]`).

Regeln: Getrennt wird am **ersten** Doppelpunkt; Zeilen ohne Doppelpunkt sind Freitext und erzeugen **keine** Vergleichszeile. Schlüssel werden **case-insensitiv** zusammengeführt (`Akku` = `akku`), die Anzeige behält die zuerst verwendete Schreibweise. Bekannte Schlüssel bekommen automatisch ein Icon (`frontend/src/lib/spec-icons.ts`), alle anderen das Standard-Info-Icon. Zu unterscheiden davon sind die journey-weiten Eigenschaften auf der Eigenschaften-Seite (`journey_specs`) — sie gelten für die ganze Kaufreise, nicht pro Produkt.

## 🔗 Produkt-Import per Link

Der Standardweg, einen Eintrag anzulegen, ist **die URL** — im Dashboard, im Vergleich, im „Eintrag hinzufügen"-Dialog und beim Anlegen einer neuen Kaufreise. `POST /api/import-link` crawlt sie in **zwei entkoppelten Stufen** (Interface: `src/web/backend/crawl-providers.js`):

**Stufe 1 — Inhalt parsen** (Titel + Fließtext):

| Provider | Bedeutung | Konfiguration |
|---|---|---|
| `direct` | **Default**, eingebaut: Backend lädt die Seite selbst | — |
| `headless` | Puppeteer rendert JavaScript (JS-Seiten, Bot-Schutz) | `puppeteer` installiert, `CRAWL_HEADLESS_TIMEOUT_MS` |
| `local-cmd` | eigenes Parse-Skript auf dieser Maschine | `CRAWL_FETCH_CMD` |

Scheitert `direct` oder liefert weniger als `CRAWL_DIRECT_MIN_CHARS` (Default 1000) Zeichen, wird automatisch `headless` nachgeladen. Explizit gewählte Parse-Tools fallen **nicht** zurück.

**Stufe 2 — Inhalt per LLM auswerten** (Produkt-JSON):

| Provider | Bedeutung | Konfiguration |
|---|---|---|
| `agy` | **Default**, wenn das Binary im PATH liegt: lokale CLI im Print-Mode, Antwort per JSON-Schema erzwungen | `CRAWL_AGY_BIN`, `-MODEL`, `-EFFORT`, `-TIMEOUT_MS` |
| `remote-ai` | HTTP-Endpunkt, Key optional als Bearer | `CRAWL_REMOTE_URL`, `CRAWL_REMOTE_KEY` |
| `local-cmd` | eigenes Skript, Inhalt als JSON über stdin | `CRAWL_EXTRACT_CMD` |
| `n8n` | **Legacy, kombiniert:** crawlt selbst, Stufe 1 entfällt. Fallback-Default ohne `agy` | `N8N_WEBHOOK_URL` |

Auflösung: Request-Feld > `CRAWL_EXTRACT_PROVIDER` / `CRAWL_FETCH_PROVIDER` > Default. Beide Stufen sind pro Request wählbar (`{ "provider": …, "fetcher": … }`); im Frontend sitzen dafür zwei Dropdowns, die ihren Status aus `GET /api/crawl-providers` ziehen. Der geparste Inhalt geht auf `CRAWL_MAX_CHARS` (Default 20000) gekappt an das LLM. Alle `CRAWL_*`-Variablen sind in `.env.example` kommentiert.

Das Produkt-JSON braucht mindestens `name`; erwartet wird:

```json
{
  "name": "Cube Kathmandu Pro",
  "price": "1.499 €",
  "rating": 4,
  "status": "Thinking",
  "notes": "Kurze Zusammenfassung der Seite.",
  "link": "https://…",
  "specs": "Rahmen: Carbon <br> Gewicht: 14.5 kg"
}
```

`specs` darf auch als Liste (`[{ "label": "Rahmen", "value": "Carbon" }]`) kommen — `n8n`-Workflows liefern das so. `src/agent/prompts/product_extraction_prompt.md` beschreibt das Schema und eignet sich direkt als Extraktions-Prompt. Das Backend **speichert nichts selbst**; es gibt das Item zurück, der Aufrufer persistiert es.

### Wenn die Seite blockiert

Liefert die Extraktion nur einen Namen (kein Preis, keine Specs — typisch bei Bot-Schutz), antwortet die Route mit `CONTENT_BLOCKED`. Statt eines Fehlers legt das Frontend dann einen **markierten Platzhalter** an (`needsContent`): Der Eintrag erscheint ausgegraut mit Link und Hinweis. Über „Inhalt einfügen" kopierst du die Seite komplett hinein (Strg+A/Strg+V) — der Text wird nie angezeigt, nur die Zeichenzahl —, `src/core/paste-clean.js` putzt ihn und `POST /api/parse-text` wertet ihn per LLM aus. Danach ist der Eintrag normal.

Bei einem **Eingabefehler** (400: ungültige URL, unbekannte Stufe) entsteht kein Platzhalter — dann ist die Eingabe zu korrigieren.

### Journey-Benennung

`POST /api/suggest-journey` verallgemeinert ein Produkt zur Kategorie, nach der eine neue Kaufreise heißt (Tesla Model 3 → Journey `elektro-auto`). Grundlage ist immer `src/agent/prompts/journey_naming_prompt.md`; naming-fähig sind `agy`, `remote-ai` und `local-cmd`. Ohne solchen Provider gibt es einen ehrlich markierten Rückfall (`provider: "fallback"`, Kürzel aus dem Seitentitel) statt eines Fehlers.

## 🤖 MCP-Server (Buying Journey in Muse)

`npm run mcp` startet den stdio-MCP-Server (`src/mcp/server.js`, ohne Dependencies) mit vier Tools:

| Tool | Wirkung |
|---|---|
| `journey.get` | komplettes Dokument inkl. Config lesen, legt nichts an |
| `journey.add_item` | Produkt anlegen/aktualisieren (Upsert nach Name, case-insensitiv) |
| `journey.crawl_link` | Produktseite headless laden (Titel + Text), speichert nichts |
| `journey.create_from_link` | neue Journey anlegen + Initial-Link als erstes Produkt — **nur `link` ist Pflicht** |

`journey.create_from_link` ist mit KI-Provider voll KI-gesteuert: Ohne `slug` benennt das LLM die Journey (Model-3-Link → Journey `elektro-auto`, siehe „Journey-Benennung" oben), das Erstprodukt kommt aus der LLM-Extraktion; explizit übergebene Felder überschreiben sie. Ohne KI-Provider gibt es statt eines Fehlers einen markierten Offline-Rückfall (Titel + Link) — die Antwort führt `slugSource` und `ai: { naming, extraction }` mit, sodass erkennbar bleibt, was geraten wurde. Reihenfolge: erst crawlen, dann anlegen — schlägt der Crawl fehl, bleibt nichts zurück.

Voraussetzung: Das Backend läuft (`npm run dev:server`). Der MCP spricht standardmäßig `http://localhost:3000` — läuft das Backend auf einem anderen Port (`.env.example` setzt `PORT=1337`), muss `MCP_BASE_URL` entsprechend zeigen.

Der MCP braucht einen API-Key des Users (`MCP_AUTH_TOKEN`) — ohne ihn antwortet jedes Tool mit einem Auth-Hinweis (401), und mit ihm arbeitet der MCP ausschließlich im Namensraum dieses Users (siehe „Anmeldung & Datentrennung pro User“).

Einbindung in Muse Code: in `~/.config/muse/settings.json` unter `mcpServers` eintragen (wirkt ab dem nächsten Start — **pro User ein Eintrag mit eigenem Key**):

```json
"bike-buying-journey": {
  "type": "stdio",
  "command": "node",
  "args": ["/home/jakob/projekte/bike/src/mcp/server.js"],
  "env": {
    "MCP_BASE_URL": "http://localhost:3000",
    "MCP_AUTH_TOKEN": "bj_… (eigener API-Key aus create-api-key.js)"
  },
  "mode": "optional"
}
```
