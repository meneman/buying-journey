# Vault – Übersicht 🗂️

Dieser Ordner (`docs/vault`) ist ein **Obsidian Vault** – der Wissens- und Notizbereich zu [JourneyPath](../../README.md), dem KI-gestützten Kauf-Begleiter. (Ursprünglich hieß das Projekt *VeloPath* – siehe [[Was-ist-JourneyPath]].)

## Öffnen in Obsidian

1. Obsidian öffnen
2. **Open folder as vault** wählen
3. Diesen Ordner auswählen: `docs/vault`

> Einstellungen liegen in `.obsidian/` und sind bereits im Repo versioniert.

## Worum geht es hier?

Start: [[Was-ist-JourneyPath]] — Sinn des Projekts (KI-gestützter Kauf-Wrapper: URL rein, LLM füllt den Eintrag, MCP-Agent schreibt mit).

- **Kaufreisen** dokumentieren: Kandidaten, Probefahrten, Händlergespräche, Entscheidungen
- **Wissen sammeln:** Kaufkriterien, Specs, Links, Vor-/Nachteile
- **Projektwissen** festhalten: alles, was nicht in den Code gehört

Die App-Daten selbst liegen lokal in SQLite (`data/app.db`, siehe [[Architektur/Backend|Backend]]) – dieser Vault ist für Notizen, Recherche und Übersicht rundherum gedacht.

## Struktur

- [[Was-ist-JourneyPath]] – Sinn, KI-Wege in die App, Abgrenzung, typischer Ablauf
- `Architektur/` – Systemdokumentation: [[Architektur/Übersicht|Übersicht]], [[Architektur/Backend|Backend]] (SQLite-Datenstruktur, API, Auth, Crawl-Pipeline, MCP), [[Architektur/Frontend|Frontend]] (Seiten, Komponenten, Datenfluss)

Vorgeschlagene Struktur beim Wachsen:

- `Entscheidungen/` – festgehaltene Kaufentscheidungen mit Datum und Begründung
- `Modelle/` – eine Notiz pro Kandidat (Specs, Link, Pro/Contra)
- `Tagebuch/` – chronologische Notizen zu Probefahrten und Terminen
- `Inbox/` – schneller Eingang für Links und Ideen, wird regelmäßig sortiert

## Konventionen

- Eine Notiz = ein Thema, Dateiname = Titel
- Untereinander mit `[[Wikilinks]]` verknüpfen statt alles in eine Datei zu schreiben
- Tags sparsam nutzen, z. B. `#entscheidung`, `#probefahrt`, `#favorit`
- Diese `README.md` bleibt die Startseite des Vaults
