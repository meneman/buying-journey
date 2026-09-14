---
name: kanban-edit-card
description: Legt eine neue Karte im Obsidian-Kanban-Board an oder erweitert eine bestehende Karte um Details.
---

# Kanban Edit Card

Legt eine neue Karte im Board `docs/vault/Untitled Kanban.md` (Format des Plugins community-archive/obsidian-kanban) an oder erweitert eine bestehende Karte.

## Wann verwenden

Wenn der User eine neue Karte in `todo`, `progress`, `waiting` oder `done` anlegen will, oder wenn eine bestehende Karte um Details (Beschreibung, Unterpunkte, Datum, Link) ergänzt werden soll.

## Board-Format

- Frontmatter enthält `kanban-plugin: board`.
- Jede `## Überschrift` (`todo`, `progress`, `waiting`, `done`) ist eine Liste.
- Jede Zeile `- [ ] Kartentitel` unter einer Überschrift ist eine Karte.
- Der Block `%% kanban:settings ... %%` am Dateiende gehört zum Plugin und darf nicht verändert werden.

## Vorgehen

1. Datei `docs/vault/Untitled Kanban.md` vollständig lesen.
2. Anlegen: Titel und Zielliste klären (Standard ist `todo`, wenn der User nichts sagt). Eine neue Zeile `- [ ] <Titel>` ans Ende der Zielliste anhängen (vor der nächsten `## Überschrift` bzw. vor dem `%% kanban:settings`-Block). Keine Duplikate anlegen: bei gleichem Titel zuerst nachfragen.
3. Erweitern: Karte per exaktem Titelmatch finden (bei mehreren Treffern nachfragen). Ergänzung als eingerückte Zusatzzeile direkt unter der Kartenzeile einfügen oder den Titel präzisieren, ohne andere Karten oder Listen zu verändern.
4. Datei speichern und dem User die Änderung bestätigen (Karte + Liste).
