---
name: buying-journey-manager
description: Verwalte Produkt-Kandidaten, Preise, Spezifikationen, Bewertungen und das Reisetagebuch in der SQLite-Datenbank für beliebige Kaufreisen.
---

# Buying Journey Manager Skill

Dieser Skill ermöglicht es dem Agenten, komfortabel und strukturiert Produktkandidaten sowie Meilensteine beliebiger Kaufreisen (z.B. Fahrräder, Elektroautos, Laptops) in der lokalen SQLite-Datenbank (`data/app.db`, via `src/db/store.js`) zu katalogisieren und zu pflegen. Jede Journey hat ihren eigenen Attributsatz, der schemalos als JSON in `items.specs` liegt.

## 🛠️ Benutzung im CLI

Der Skill stellt Skripte zur Verfügung, mit denen du über das Terminal direkt Daten eintragen kannst.

### 1. Eintrag hinzufügen / aktualisieren
```bash
node src/agent/scripts/add-item.js \
  --journey "bike" \
  --name "Cube Kathmandu Pro" \
  --price "1499€" \
  --rating 4 \
  --status "Shortlisted" \
  --weight "15.8 kg" \
  --frame "Aluminium Superlite" \
  --groupset "Shimano XT 3x10" \
  --brakes "Shimano BR-MT200" \
  --wheels "CUBE ZX20 / Schwalbe Range Cruiser 47mm" \
  --notes "Probefahrt war super bequem, Sattel passt perfekt." \
  --link "https://www.cube.eu/de-de/cube-kathmandu-pro-flashstone-n-black/831100"
```
*(Hinweis: Für andere Produktkategorien wie Autos oder Notebooks kannst du beliebige andere Attribute übergeben — sie landen schemalos als JSON in `items.specs` dieser Journey. Gib immer den passenden Parameter `--journey` an. Es muss kein Server laufen: die Skripte schreiben direkt in `data/app.db`.)*

**Mögliche Status-Werte:**
- `Thinking` (In Erwägung)
- `Shortlisted` (Engere Auswahl)
- `Test Ridden` (Erprobt/Besichtigt)
- `Rejected` (Ausgeschieden)
- `Bought` (Gekauft! 🏆)

### 2. Tagebucheintrag (Reise) hinzufügen
```bash
node src/agent/scripts/add-log.js \
  --journey "bike" \
  --event "Erste Probefahrt mit dem Cube Kathmandu gemacht" \
  --date "2026-07-16"
```
*(Das Datum `--date` ist optional und verwendet standardmäßig das heutige Datum.)*

### 3. Produkt aus URL hinzufügen (Crawl & Extract)
```bash
node \
  src/agent/scripts/crawl-and-extract.js \
  "https://example.com/product-page" \
  [optional_screenshot_path]
```
Das Skript lädt die Seite headless über Puppeteer und speichert das Ergebnis im Ordner `src/agent/temp/last-crawl.json`.

---

## 🤖 Anweisungen für den Agenten

### A. Wenn der User ein Produkt oder ein Ereignis direkt nennt:
1. Nutze `run_command` und führe das entsprechende Skript (`add-item.js` oder `add-log.js`) mit den übergebenen Parametern im Projekt-Root unter Verwendung der Pfade (`src/agent/scripts/...`) aus. Es muss kein Server laufen — die Skripte schreiben direkt in die SQLite-DB (`data/app.db`).
2. Die Daten liegen nur noch lokal in SQLite.
3. Gib dem User eine kurze Bestätigung mit einem Link zum Web-Interface.

### B. Wenn der User eine URL nennt, um ein Produkt zu einer Kaufreise hinzuzufügen:
1. **Journey klären**: Prüfe, ob die Ziel-Kaufreise klar ist.
   * Lade die Liste der verfügbaren Reisen über die API (`GET /api/journeys`).
   * Wenn unklar (z.B. mehrere Reisen passen oder es ist eine neue Kategorie), frage den User, ob er ein existierendes Journey (z.B. `bike`, `laptop`, `ev`) erweitern oder ein neues Journey (z.B. `smartphone`) anlegen möchte.
2. **Crawl ausführen**: Führe das Skript `src/agent/scripts/crawl-and-extract.js` per `run_command` mit der URL aus.
3. **Daten extrahieren**: Lies die Ergebnisdatei `src/agent/temp/last-crawl.json` mit `view_file` aus.
4. **LLM-Verarbeitung**:
   * Analysiere den extrahierten Text unter Berücksichtigung von `src/agent/prompts/product_extraction_prompt.md`.
   * Identifiziere den Produktnamen, Preis, Bewertung und 3-6 relevante technische Vergleichskriterien (Specs) passend zur Produktkategorie.
5. **Eintrag speichern**: Führe das Skript `src/agent/scripts/add-item.js` mit den extrahierten Werten aus (neue Journeys werden automatisch mit Defaults angelegt).
6. **Bestätigen**: Präsentiere dem User die extrahierten Kriterien als Tabelle zur Kontrolle und bestätige den Eintrag.

