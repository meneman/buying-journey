# Manuelle Tests — Backend→Frontend Live-Updates (SSE) (2026-09-15)

Bitte zuerst selbst `npm run dev` starten (Backend auf Port `3000`, Vite-Dev-Server auf
Port `5173`, öffnet `http://localhost:5173`; `/api`-Calls werden an das Backend geproxyt).
Der SSE-Stream (`GET /api/data/events?journey=X`) meldet externe Änderungen nur per Toast —
ein Reload passiert ausschließlich über den Toast-Button, nie still. Automatisiert verifiziert:
`npm test` 64/64 grün (3 neue SSE-Tests), Frontend-Build (`tsc -b` + `vite build`) ok,
`oxlint` 0 Errors (nur vorbestehende Warnungen).

## Toast + Reload auf geöffneter Journey (MCP-Schreibzugriff)
- [ ] `/?journey=bike` öffnen → kein Toast beim Laden, Seite zeigt aktuellen Stand.
- [ ] Per MCP `journey.add_item` (slug `bike`, neuer Name) speichern → oben/unten erscheint
      Toast „Neue Daten vom MCP-Server“ mit Button „Neu laden“, KEIN automatischer Reload,
      KEIN Seiten-Reload, laufende Eingaben bleiben erhalten.
- [ ] „Neu laden“ klicken → das neue Item erscheint in der Liste, Toast verschwindet.
- [ ] Erneut per MCP auf `bike` schreiben, aber VOR dem Klick auf „Neu laden“ ein Textfeld
      editieren (z.B. Notizen, Debounce 600ms) → ohne Klick geht keine Editierung verloren;
      erst der Klick lädt neu.

## Fremde Journey stört nicht / Scope
- [ ] `/?journey=bike` offen lassen, per MCP auf eine ANDERE Journey schreiben
      (z.B. `laptop`) → kein Toast auf der Bike-Seite, keine Veränderung.
- [ ] Feedback auf `bike` speichern (`/feedback?journey=bike`) → kein Update-Toast
      (Feedback ist bewusst außerhalb des Live-Scopes).

## Reconnect / Tabs / Journey-Wechsel
- [ ] Backend neu starten während die Seite offen ist → nach Neustart kommt bei der
      nächsten MCP-Änderung wieder ein Toast (Browser reconnectet automatisch, kein
      manueller Reload nötig).
- [ ] Zwei Tabs mit `/?journey=bike` öffnen, per MCP schreiben → beide Tabs zeigen je
      einen Toast; in Tab 1 „Neu laden“ klicken → Tab 1 aktuell, Tab 2 behält den Toast
      bis dort ebenfalls geklickt wird.
- [ ] Von `/?journey=bike` zu `/?journey=laptop` wechseln → alter Toast ist weg, Stream
      folgt der neuen Journey (MCP-Schreib auf `bike` stört auf `laptop` nicht).
