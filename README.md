# VeloPath — Fahrradkauf-Begleiter 🚲

Dieses Projekt hilft dir bei der Auswahl deines perfekten Fahrrads und dokumentiert deine Kauf-Reise. Alle Informationen liegen lokal in einer **SQLite-Datenbank** (`data/app.db`) — jede Kaufreise (Bike, Laptop, EV, …) hat eigene Vergleichseigenschaften, die schemalos als JSON gespeichert werden.

## 🚀 Features

- **🎯 Status & Budget Tracker:** Behalte den Überblick über deine aktuelle Kauf-Phase, dein Budget und dein Ziel-Datum.
- **🚲 Fahrrad-Vergleich:** Trage Modelle ein, bewerte sie mit Sternen, pflege Spezifikationen, trage Vor-/Nachteile ein und füge Links hinzu.
- **🗺️ Reisetagebuch:** Dokumentiere chronologisch Meilensteine wie Probefahrten, Händlergespräche oder Entscheidungen.
- **📝 Allgemeine Notizen:** Freitextfeld für allgemeine Notizen und Kriterien.
- **💾 SQLite-Speicher:** Kein externer Sync nötig — die DB-Datei lässt sich einfach sichern (Datei kopieren).

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

## 📄 Speicherformat in SQLite

Die Daten liegen in `data/app.db` (SQLite, via `node:sqlite` — keine extra Dependency):

- **Fester Kern** als Tabellen: `journeys` (Status, Budget, Notizen, Feedback), `journey_logs` (Tagebuch), `journey_specs` (Journey-weite Eigenschaften), `items` (Name, Preis, Rating, Status, Notizen, Link).
- **Heterogene Vergleichseigenschaften** als JSON in `items.specs` (JSON1, `json_valid`-geprüft): Bike → `Gewicht, Rahmen, Schaltung`, Laptop → `CPU, RAM, SSD`, EV → `Reichweite, Batterie`. Jede Journey hat ihren eigenen Attributsatz, abfragbar z.B. mit `json_each` (siehe `store.specValues()` in `src/db/store.js`).

Die REST-API (`/api/data`, `/api/journeys`, `/api/feedback`, `/api/import-link`) ist unverändert — das Frontend arbeitet ohne Anpassung weiter.

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
