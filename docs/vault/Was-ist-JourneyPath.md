# Was ist JourneyPath? Sinn des Projekts 🧭

> Ein Satz: **JourneyPath ist ein MCP-gestützter Kauf-Begleiter** — eine lokale Wissens- und Vergleichsplattform um den gesamten Kaufentscheidungsprozess, in die Mensch (Web-App) *und* KI-Assistent (MCP) gleichberechtigt hineinarbeiten.

> [!info] Namen im Projekt
> Die App heißt **JourneyPath** — in der UI (`frontend/index.html`, `AppHeader.tsx`), im MCP-Server (`journey-path`, Paket `@journey-path/mcp`) und im Repo-`README.md`. Der Ursprungsname **VeloPath** stammt daher, dass alles als Fahrradkauf-Hilfe (Journey `bike`) startete; er taucht nur noch historisch auf. Die App ist vollständig kategorie-unabhängig.

## Sinn

Kaufen ist Recherche + Vergleich + Bauchgefühl über Wochen. Tabs, PDFs, Händlergespräche und Preise verstreuen sich. JourneyPath sammelt das an **einem Ort**:

- **Kandidaten** vergleichen (Preis, Specs, Bewertung, Status von `Thinking` bis `Bought`)
- **Reisetagebuch** führen (Probefahrten, Gespräche, Entscheidungen mit Datum)
- **Kriterien** festhalten (Notizen, journey-weite Eigenschaften, Feedback)

Eine **Kaufreise (Journey) = eine Anschaffung**, adressiert über `?journey=<slug>`. Das Schema passt auf jede Kategorie (Fahrrad, Laptop, E-Auto, Schrank, Smartphone …) — die Vergleichsattribute liegen schemalos als JSON in `items.specs`, jede Journey hat also ihren eigenen Attributsatz.

## Wie Mensch & KI zusammenarbeiten (MCP-First)

JourneyPath führt in der Web-App **keine eigenen Web-Crawls oder manuellen KI-Importe** mehr aus. Stattdessen greifen drei klare Rollen ineinander — alle Daten landen in derselben lokalen SQLite-Datei (`data/app.db`):

### 1. KI-Client über MCP: Recherche & vollständiges CRUD

`npm run mcp` startet den abhängigkeitsfreien stdio-MCP-Server (`packages/mcp/src/server.js`, Wrapper `src/mcp/server.js`) mit 14 Tools (`journey.help`, `journey.list`, `journey.create`, `journey.update_config`, `journey.delete`, `journey.get`, `journey.add_item`, `journey.delete_item`, `journey.update_meta`, `journey.add_log`, `journey.delete_log`, `journey.set_spec`, `journey.delete_spec`, `journey.set_feedback`).

Der KI-Assistent (Claude Desktop, Cursor, Muse) nutzt **seine eigenen Web-Tools** zur Recherche und schreibt strukturierte Ergebnisse direkt über MCP in die Journey. Jeder MCP-Zugriff authentifiziert sich über einen langlebigen API-Key (`bj_…`, `MCP_AUTH_TOKEN`) und arbeitet ausschließlich im Namensraum dieses Users.

### 2. Web-App: Übersicht, Vergleich & manuelle Pflege

Im Browser verwaltet der Mensch seine Kaufreisen über Dashboard (`/?journey=`), Vergleichsmatrix (`/vergleich`), journey-weite Eigenschaften (`/eigenschaften`), Feedback (`/feedback`), Einstellungen (`/einstellungen`) und den `/mcp`-Setup-Hub (API-Keys erstellen, fertige Snippets kopieren, Tool-Explorer prüfen).

Schreibt der MCP-Server Daten, erhält der geöffnete Browser sofort einen SSE-Toast („Neue Daten vom MCP-Server“ mit „Neu laden“-Button), ohne laufende Eingaben still zu überschreiben.

### 3. Server: Storage, Auth, SSE & KI-Property-Abgleich

Wenn Produkte über `POST /api/data` eingetragen oder geändert werden (egal ob per MCP `journey.add_item` oder manuell im Browser) und mindestens 2 Items mit `specs` vorhanden sind, prüft der Server **asynchron im Hintergrund** per konfiguriertem LLM-Provider (`agy`, `remote-ai` oder `local-cmd`):

- **Synonyme vereinheitlichen:** z. B. `Weight` / `Gewicht` / `Gesamtgewicht` → einheitlicher kanonischer Key `Gewicht` (Werte, Reihenfolge und Freitext bleiben erhalten).
- **Gemeinsame vs. Einzel-Eigenschaften ermitteln:** `/vergleich` teilt die dynamischen Spec-Zeilen automatisch in **Gemeinsame Eigenschaften** (bei allen Items befüllt) und **Weitere / Einzel-Eigenschaften** (nur bei einzelnen Items vorhanden).
- **Stiller Fallback:** Fehlt ein LLM-Provider oder schlägt der Aufruf fehl, greift ohne Fehlermeldung eine deterministische, case-insensitive Gruppierung.

Daneben gibt es weiterhin Legacy-CLI-Skripte (`src/agent/scripts/create-api-key.js` für API-Keys sowie `add-item.js` / `add-log.js` als Offline-SQLite-Fallback ohne laufendes Backend).

## Was es nicht ist

- Kein Shop, kein Preisvergleichsportal, keine Kaufabwicklung.
- Kein Cloud-Datenspeicher: Datenhoheit lokal in SQLite (Backup = Datei kopieren). Login (API-Key oder Supabase-JWT) dient der **Trennung pro User** (`owner_id`).
- Keine anonyme Nutzung: Alle Datenrouten antworten ohne Identität mit `401`. Ausgeloggt sichtbar sind nur `/login` und die Startseite `/` (ohne `?journey=`, allgemeine Infoseite).

## Typischer Ablauf

1. **Kaufreise anlegen** — manuell in der Web-App („Neue Kaufreise“) oder per MCP (`journey.create`).
2. **Kandidaten sammeln** — dem KI-Assistenten Produktwünsche oder Links nennen (er recherchiert und ruft `journey.add_item` auf) oder manuell im Produktdialog eintragen.
3. **Automatischer Abgleich & Vergleich** — ab 2 Produkten vereinheitlicht der Server synonyme `specs` im Hintergrund; auf `/vergleich` erscheinen **Gemeinsame Eigenschaften** und **Weitere / Einzel-Eigenschaften** sauber getrennt.
4. **Reise dokumentieren** — Probefahrten und Gespräche ins Tagebuch, Budget/Phase und Notizen pflegen (per Web-UI oder MCP).
5. **Entscheiden** — Status bis `Bought` 🏆.

Siehe auch: [[Architektur/Übersicht|Architektur-Übersicht]] · [[Architektur/Backend|Backend]] · [[Architektur/Frontend|Frontend]] · Haupt-`README.md` im Projekt-Root.

#übersicht #sinn #mcp
