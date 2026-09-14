# Vault – Übersicht 🗂️

Dieser Ordner (`docs/vault`) ist ein **Obsidian Vault** – der Wissens- und Notizbereich zum Projekt [VeloPath](../../README.md), dem Fahrradkauf-Begleiter.

## Öffnen in Obsidian

1. Obsidian öffnen
2. **Open folder as vault** wählen
3. Diesen Ordner auswählen: `docs/vault`

> Einstellungen liegen in `.obsidian/` und sind bereits im Repo versioniert.

## Worum geht es hier?

- **Fahrradkauf-Journey** dokumentieren: Modelle, Probefahrten, Händlergespräche, Entscheidungen
- **Wissen sammeln:** Kaufkriterien, Specs, Links, Vor-/Nachteile
- **Projektwissen** festhalten: alles, was nicht in den Code gehört

Die App-Daten selbst liegen lokal in SQLite (`data/app.db`, siehe Haupt-README) – dieser Vault ist für Notizen, Recherche und Übersicht rundherum gedacht.

## Struktur

Aktuell gibt es nur diese Übersicht. Vorgeschlagene Struktur beim Wachsen:

- `Entscheidungen/` – festgehaltene Kaufentscheidungen mit Datum und Begründung
- `Modelle/` – eine Notiz pro Fahrrad-Modell (Specs, Link, Pro/Contra)
- `Tagebuch/` – chronologische Notizen zu Probefahrten und Terminen
- `Inbox/` – schneller Eingang für Links und Ideen, wird regelmäßig sortiert

## Konventionen

- Eine Notiz = ein Thema, Dateiname = Titel
- Untereinander mit `[[Wikilinks]]` verknüpfen statt alles in eine Datei zu schreiben
- Tags sparsam nutzen, z. B. `#entscheidung`, `#probefahrt`, `#favorit`
- Diese `README.md` bleibt die Startseite des Vaults
