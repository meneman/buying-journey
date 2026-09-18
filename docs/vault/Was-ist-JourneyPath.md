# Was ist JourneyPath? Sinn des Projekts 🧭

> Ein Satz: **JourneyPath ist ein KI-gestützter Kauf-Wrapper** — eine lokale Hülle um den gesamten Kaufentscheidungsprozess, in die Mensch *und* KI-Assistent hineinarbeiten.

> [!info] Namen im Projekt
> Die App heißt **JourneyPath** — in der UI (`frontend/index.html`, `AppHeader.tsx`, Crawler-User-Agent) und im Repo-`README.md`. Der Ursprungsname **VeloPath** stammt daher, dass alles als Fahrradkauf-Hilfe (Journey `bike`) startete; er taucht nur noch als historische Notiz auf. Die App ist inzwischen kategorie-unabhängig.

## Sinn

Kaufen ist Recherche + Vergleich + Bauchgefühl über Wochen. Tabs, PDFs, Händlergespräche und Preise verstreuen sich. JourneyPath sammelt das an **einem Ort**:

- **Kandidaten** vergleichen (Preis, Specs, Bewertung, Status von `Thinking` bis `Bought`)
- **Reisetagebuch** führen (Probefahrten, Gespräche, Entscheidungen mit Datum)
- **Kriterien** festhalten (Notizen, journey-weite Eigenschaften, Feedback)

Eine **Kaufreise (Journey) = eine Anschaffung**, adressiert über `?journey=<slug>`. Das Schema passt auf jede Kategorie (Fahrrad, Laptop, E-Auto, Schrank, Smartphone …) — die Vergleichsattribute liegen schemalos als JSON in `items.specs`, jede Journey hat also ihren eigenen Attributsatz.

## Warum „KI-Software" / „Wrapper"?

Der Wrapper stellt Kaufdaten so bereit, dass **Browser und KI-Agent gleichberechtigt** damit arbeiten. Es gibt drei Wege hinein — alle landen in derselben lokalen SQLite-Datei:

### 1. URL einwerfen, LLM füllt den Eintrag

Der Produkt-Import ist **URL-first**: Im „Eintrag hinzufügen"-Dialog, im Import-Feld und beim Anlegen einer Kaufreise reicht eine Produkt-URL — Name, Preis, Specs, Notizen kommen aus der LLM-Auswertung. Die manuelle Eingabe ist nur noch der aufklappbare Zweitweg.

Dahinter läuft eine **zweistufige Crawl-Pipeline** (`src/web/backend/crawl-providers.js`, Details in [[Architektur/Backend|Backend]] §6):

| Stufe | Aufgabe | Provider |
|---|---|---|
| 1 — Parse-Tool | Seite laden, Titel + Fließtext extrahieren | `direct` (eingebaut), `headless` (Puppeteer, rendert JS), `local-cmd` |
| 2 — LLM-Auswertung | Inhalt → Produkt-JSON | `agy` (lokale CLI, Default), `remote-ai` (HTTP), `local-cmd`, `n8n` (Legacy-Webhook, crawlt selbst) |

Liefert `direct` zu wenig Text oder scheitert, wird automatisch `headless` nachgeladen (JS-Seiten, Bot-Schutz). Beide Stufen sind pro Request wählbar — im Frontend über zwei Dropdowns, die ihren Status aus `GET /api/crawl-providers` ziehen.

### 2. Blockierte Seite? Inhalt von Hand nachreichen

Manche Shops lassen sich gar nicht crawlen. Dann entsteht kein Fehler, sondern ein **markierter Platzhalter** (`needsContent`): Der Eintrag landet mit Link und Hinweis in der Liste, Dashboard und Vergleich zeigen ihn ausgegraut mit „Inhalt einfügen". Dort kopiert man die Seite komplett hinein (Strg+A/Strg+V) — der Text wird nie angezeigt, nur die Zeichenzahl —, das Backend putzt ihn (`src/core/paste-clean.js`) und wertet ihn per LLM aus (`POST /api/parse-text`). Danach ist das Flag erledigt.

### 3. MCP: der Agent bedient die App

`npm run mcp` startet den stdio-MCP-Server (`src/mcp/server.js`) mit `journey.get`, `journey.add_item`, `journey.crawl_link` und `journey.create_from_link`. Letzteres ist voll KI-gesteuert: **nur der Link ist Pflicht** — den Journey-Namen verallgemeinert ein LLM aus dem Produkt (Tesla Model 3 → Journey `elektro-auto`, Prompt: `src/agent/prompts/journey_naming_prompt.md`, Endpunkt `POST /api/suggest-journey`), das Erstprodukt kommt aus der Extraktion. Ohne KI-Provider gibt es statt eines Fehlers einen **ehrlich markierten Offline-Rückfall** (Titel + Link, `ai: "fallback"`).

Jeder MCP-Zugriff braucht einen langlebigen API-Key (`bj_…`, `MCP_AUTH_TOKEN`) und arbeitet ausschließlich im Namensraum dieses Users. Schreibt der Agent, sieht der offene Browser es per SSE-Toast + Reload.

Daneben gibt es **Agent-Skill + CLI-Skripte** (`.agents/skills/buying-journey-manager/`, `src/agent/scripts/add-item.js`, `add-log.js`, `crawl-and-extract.js`), die direkt in SQLite schreiben — ohne laufendes Backend.

Mensch recherchiert, KI trägt ein und fasst zusammen — **Single Source of Truth bleibt die lokale SQLite-Datei** (`data/app.db`).

## Was es nicht ist

- Kein Shop, kein Preisvergleichsportal, keine Kaufabwicklung.
- Kein Cloud-Dienst: Datenhoheit lokal (Backup = Datei kopieren). Login (API-Key oder Supabase) dient der **Trennung pro User** (`owner_id`) — gleiche Slugs verschiedener User sind unabhängige Journeys.
- Keine Kaufempfehlung der KI — sie strukturiert und füllt, der Mensch bewertet und entscheidet.
- Keine anonyme Nutzung: alle Datenrouten antworten ohne Identität mit 401. Ausgeloggt sichtbar sind nur `/login` und eine allgemeine Info-Startseite.

## Typischer Ablauf

1. **Kaufreise anlegen** — Produkt-URL in „Neue Kaufreise" einwerfen; Kürzel und Anzeigename leitet die App aus dem gecrawlten Produkt ab (manuelle Felder optional aufklappbar).
2. **Kandidaten sammeln** — weitere Links einwerfen, oder der KI zurufen („trag das Rad für 1499 € ein"). Blockierte Seiten per „Inhalt einfügen" nachreichen.
3. **Vergleichen** — Matrix über die Vereinigung aller `items.specs`-Schlüssel, Sterne vergeben, Favoriten markieren ([[Architektur/Frontend|Frontend]]).
4. **Reise dokumentieren** — Probefahrten und Gespräche ins Tagebuch, Budget und Phase pflegen.
5. **Entscheiden** — Status bis `Bought` 🏆.

Siehe auch: [[Architektur/Übersicht|Architektur-Übersicht]] · [[Architektur/Backend|Backend]] · [[Architektur/Frontend|Frontend]] · Haupt-`README.md` im Projekt-Root.

#übersicht #sinn #ki
