---
name: kanban-move-card
description: Verschiebt eine Karte im Obsidian-Kanban-Board zwischen todo, progress, waiting und done.
---

# Kanban Move Card

Verschiebt eine Karte im Board `docs/vault/Untitled Kanban.md` (Format des Plugins community-archive/obsidian-kanban) von einer Liste in eine andere.

## Wann verwenden

Wenn der User eine bestehende Karte von `todo` nach `progress` oder von `progress` nach `done` (oder zurück) verschieben will — oder eine blockierte Karte nach `waiting` parken bzw. von dort zurückholen will.

## Board-Format

- Frontmatter enthält `kanban-plugin: board`.
- Jede `## Überschrift` (`todo`, `progress`, `waiting`, `done`) ist eine Liste. `waiting` parkt Karten, die in `progress` blockiert sind (siehe Schritt 3).
- Jede Zeile `- [ ] Kartentitel` unter einer Überschrift ist eine Karte.
- Der Block `%% kanban:settings ... %%` am Dateiende gehört zum Plugin und darf nicht verändert werden.

## Vorgehen

1. Datei `docs/vault/Untitled Kanban.md` vollständig lesen.
2. Kartentitel eindeutig identifizieren (exakter Zeilenmatch `- [ ] <Titel>`). Bei mehreren Treffern oder unklarem Titel beim User nachfragen, keine Karte raten.
3. Nur die erlaubten Übergänge ausführen: `todo` zu `progress` oder `progress` zu `done` (Rückrichtung nur auf ausdrücklichen Wunsch). Ausnahme: `progress` zu `waiting`, wenn die Karte blockiert ist — d.h. etwas bei der Arbeit schiefgelaufen ist oder eine Entscheidung ansteht, die der KI-Agent nicht alleine treffen kann und die sich auch nicht sinnvoll anders auflösen lässt. Rückweg `waiting` zu `progress` nur auf ausdrücklichen Wunsch, sobald die Blockade geklärt ist.
4. Die komplette Kartenzeile aus der Quellliste entfernen und ans Ende der Zielliste anhängen (vor der nächsten `## Überschrift` bzw. vor dem `%% kanban:settings`-Block). Keine anderen Zeilen, Listen oder Formatierungen verändern.
5. Datei speichern und dem User die Verschiebung bestätigen (Karte + Quelle + Ziel).
