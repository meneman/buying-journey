# Manuelle Tests — Crawl-Queue-Worker (2026-09-18)

Bitte `npm run dev` selbst starten (Backend auf Port `3000` per `.env`,
Vite-Dev-Server auf Port `5173`, `/api`-Aufrufe werden proxied).
Danach http://localhost:5173 im Browser öffnen. Backend-Logs im Auge
behalten (`[import-link]`-/`[parse-text]`-Kennzahlen pro Job).

## Link-Import als Queue-Job (Dashboard, `/?journey=bike`)

- [ ] Produkt-Link einfügen → „Importieren“: Das Eingabefeld leert sich sofort,
      unter dem Formular erscheint eine Job-Karte („Wird importiert…“ oder
      „Wartet — Position N“) — kein blockierender Spinner mehr.
- [ ] 3 Links schnell hintereinander importieren: max. 2 Jobs laufen, der
      dritte zeigt „Wartet — Position 1“ (Default-Concurrency 2).
- [ ] Fertigstellung ohne Reload: Das Item erscheint automatisch in der Liste,
      Toast „per Link importiert“ erscheint (SSE-Event, kein manueller Reload).
- [ ] Blockierte Seite (z.B. Bot-Schutz): Es entsteht der markierte Platzhalter
      („Crawl blockiert — Platzhalter angelegt“), zusätzlich bleibt die
      Fehler-Job-Karte mit Fehlertext sichtbar.
- [ ] Fehler-Job-Karte → „Erneut versuchen“: legt einen neuen Job an
      (Job-Karte wechselt zurück auf „Wird importiert…“); „Verwerfen“ entfernt
      die Karte, das Item bleibt unberührt.

## Manueller Inhalt (Platzhalter-Karte)

- [ ] Auf einer Platzhalter-Karte „Inhalt einfügen“ → Seiteninhalt per Strg+V
      einfügen → „Auswerten & übernehmen“: Der Dialog schließt sofort, die Karte
      zeigt „Wird ausgewertet…“ (ggf. mit Warteposition).
- [ ] Fertigstellung ohne Reload: Die Karte übernimmt die ausgewerteten Felder
      automatisch, Toast „Inhalt übernommen“ erscheint.
- [ ] Fehlgeschlagene Auswertung: Die Karte zeigt den Fehlertext + „Erneut
      einfügen“ (öffnet den Dialog erneut); auf der Vergleichs-Seite
      (`/vergleich`) gilt dasselbe im Overlay der blockierten Spalte.

## Neustart / Reload / Reconnect

- [ ] Backend während wartender Jobs neu starten: Die nächste Abfrage zeigt
      Toast „Import-Job verworfen“ mit Erneut-anfragen-Hinweis (GET → 404).
- [ ] Browser-Reload mit wartendem Job: Nach dem Laden wird der Job per
      `GET /api/import-jobs/:id` nachgeladen (Karte erscheint wieder, Ergebnis
      wird bei Fertigstellung übernommen, ohne Doppel-Eintrag).
- [ ] Zweiter Tab gleiche Journey: Fertigstellung toastet dort ebenfalls
      (eigener SSE-Stream pro Tab); fremde Journey bleibt still.

## Heim-Dialog (manuelle Einträge per URL)

- [ ] „Eintrag hinzufügen“ → „Per URL hinzufügen“ → Crawlen: Dialog wartet mit
      Spinner wie bisher und speichert danach direkt (Polling statt
      Server-Block, Verhalten unverändert inkl. Platzhalter-Fallback).
