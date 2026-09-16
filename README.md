# VeloPath — Fahrradkauf-Begleiter 🚲

Dieses Projekt hilft dir bei der Auswahl deines perfekten Fahrrads und dokumentiert deine Kauf-Reise. Alle Informationen liegen lokal in einer **SQLite-Datenbank** (`data/app.db`) — jede Kaufreise (Bike, Laptop, EV, …) hat eigene Vergleichseigenschaften, die schemalos als JSON gespeichert werden.

## 🚀 Features

- **🎯 Status & Budget Tracker:** Behalte den Überblick über deine aktuelle Kauf-Phase, dein Budget und dein Ziel-Datum.
- **🚲 Fahrrad-Vergleich:** Trage Modelle ein, bewerte sie mit Sternen, pflege Spezifikationen, trage Vor-/Nachteile ein und füge Links hinzu.
- **🗺️ Reisetagebuch:** Dokumentiere chronologisch Meilensteine wie Probefahrten, Händlergespräche oder Entscheidungen.
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
   - `PORT`: Port, auf dem das Backend lokal läuft (Standard: `3000`).
   - `N8N_WEBHOOK_URL`: Webhook-URL deines n8n-Workflows, der einen Produkt-Link crawlt und die extrahierten Produktdaten zurückgibt (siehe unten).

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

## 🔐 Anmeldung (Supabase Auth)

Die Login-Seite (`/login`) bietet **Google**, **Apple** und **E-Mail + Passwort**. Alle drei liefern dasselbe Supabase-JWT, das das Backend per `auth.getUser()` verifiziert — serverseitig ist nichts umzustellen (auch `AUTH_REQUIRED=true` gilt unverändert für OAuth-Tokens).

Einmalig im [Supabase-Dashboard](https://supabase.com/dashboard) einrichten (Details siehe `.env.example`):

1. **Authentication → Providers:** Google (Client ID/Secret aus der Google Cloud Console) und/oder Apple (Services ID, Team ID, Key ID, Private Key aus dem Apple Developer Portal) aktivieren. Callback-URL dort jeweils: `https://<projekt>.supabase.co/auth/v1/callback`.
2. **Authentication → URL Configuration:** Site URL = Produktions-Origin; unter Additional Redirect URLs `http://localhost:5173/login` (Dev) und `<Produktions-Origin>/login` eintragen — die App kehrt nach dem OAuth-Flow auf `/login` zurück.

Solange ein Anbieter im Dashboard deaktiviert ist, schlägt sein Button mit einer Fehlermeldung auf der Login-Seite fehl (statt still zu laden).

---

## 📄 Speicherformat in SQLite

Die Daten liegen in `data/app.db` (SQLite, via `node:sqlite` — keine extra Dependency):

- **Fester Kern** als Tabellen: `journeys` (Basis-Eigenschaften Name/Beschreibung/Kategorie/Währung, Anzeige-Settings `section_title`/`list_title`, Status, Budget, Notizen, Feedback), `journey_logs` (Tagebuch), `journey_specs` (Journey-weite Eigenschaften), `items` (Name, Preis, Rating, Status, Notizen, Link).
- **Heterogene Vergleichseigenschaften** als JSON in `items.specs` (JSON1, `json_valid`-geprüft): Bike → `Gewicht, Rahmen, Schaltung`, Laptop → `CPU, RAM, SSD`, EV → `Reichweite, Batterie`. Jede Journey hat ihren eigenen Attributsatz, abfragbar z.B. mit `json_each` (siehe `store.specValues()` in `src/db/store.js`).

Die REST-API (`/api/data`, `/api/journeys`, `/api/feedback`, `/api/import-link`) bleibt bestehen — dazu kommen die Config-Endpunkte für Basis-Eigenschaften + Settings: `GET /api/journey-config?journey=X` (lesen), `PUT /api/journey-config?journey=X` (partiell schreiben: `name`, `description`, `category`, `currency`, `sectionTitle`, `listTitle`) und `GET /api/journey-configs` (alle Configs für die Startseite).

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
- **Link-Import:** n8n liefert `"specs": [{"label": "Akku", "value": "750 Wh"}]`.

Regeln: Getrennt wird am **ersten** Doppelpunkt; Zeilen ohne Doppelpunkt sind Freitext und erzeugen **keine** Vergleichszeile. Schlüssel werden **case-insensitiv** zusammengeführt (`Akku` = `akku`), die Anzeige behält die zuerst verwendete Schreibweise. Bekannte Schlüssel bekommen automatisch ein Icon (`frontend/src/lib/spec-icons.ts`), alle anderen das Standard-Info-Icon. Zu unterscheiden davon sind die journey-weiten Eigenschaften auf der Eigenschaften-Seite (`journey_specs`) — sie gelten für die ganze Kaufreise, nicht pro Produkt.

## 🔗 Produkt-Import per Link (n8n)

Im Dashboard und im Vergleich gibt es ein Eingabefeld, in das du einen Produkt-Link einfügen kannst. Das Backend schickt den Link per POST an deinen `N8N_WEBHOOK_URL`-Webhook:

```json
{ "url": "https://…", "journey": "bike" }
```

Der n8n-Workflow crawlt die Seite und muss als Antwort ein JSON-Objekt mit den extrahierten Produktdaten liefern:

```json
{
  "name": "Cube Kathmandu Pro",
  "price": "1.499 €",
  "rating": 4,
  "status": "Thinking",
  "notes": "Kurze Zusammenfassung der Seite.",
  "link": "https://…",
  "specs": [
    { "label": "Rahmen", "value": "Carbon" },
    { "label": "Gewicht", "value": "14.5 kg" }
  ]
}
```

Der Prompt in `src/agent/prompts/product_extraction_prompt.md` beschreibt dieses Schema und eignet sich direkt als Extraktions-Prompt innerhalb des n8n-Workflows. Das Backend wandelt die Antwort automatisch in einen Eintrag um und fügt ihn der Liste hinzu.

## 🤖 MCP-Server (Buying Journey in Muse)

`npm run mcp` startet den stdio-MCP-Server (`src/mcp/server.js`, ohne Dependencies) mit den Tools `journey.get` (komplettes Dokument inkl. Config lesen, legt nichts an), `journey.add_item` (Produkt anlegen/aktualisieren per Upsert), `journey.crawl_link` (Produktseite headless laden, speichert nichts) und `journey.create_from_link` (neue Journey anlegen + Initial-Link als erstes Produkt crawlen). Voraussetzung: Das Backend läuft (`npm run dev:server`, Default `http://localhost:3000`, via `MCP_BASE_URL` konfigurierbar).

Einbindung in Muse Code: in `~/.config/muse/settings.json` unter `mcpServers` eintragen (wirkt ab dem nächsten Start):

```json
"bike-buying-journey": {
  "type": "stdio",
  "command": "node",
  "args": ["/home/jakob/projekte/bike/src/mcp/server.js"],
  "env": {"MCP_BASE_URL": "http://localhost:3000"},
  "mode": "optional"
}
```
