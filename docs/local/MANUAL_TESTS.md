# Manuelle Tests — MCP-Erweiterungen (2026-09-15)

> Hinweis: Bitte `npm run dev` selbst starten (wird nicht automatisch gestartet).
> Backend auf Port `3000`, Vite-Dev-Server auf Port `5173`, App unter
> `http://localhost:5173` öffnen. `/api`-Calls werden an das Backend geproxyt.
> Die `/mcp`-Seite ist read-only (keine editierbaren Felder) und app-weit ohne
> `?journey=`-Param erreichbar (wie `/login`).

Automatisiert verifiziert (2026-09-15):
`npm test` 66/66 grün, Frontend-Build (`vite build`) ok (nur Chunk-Size-Warnung,
kein Fehler), `npm --prefix frontend run lint` 0 Errors / 16 Warnings.

## 1) Button / Route (inkl. ausgeloggt)

- [ ] App laden (z. B. `http://localhost:5173/`) → in der oberen Auth-Zeile steht
      neben Reload/ThemeToggle ein Button „MCP“ mit Stecker-Icon (auch im
      Mobile-Layout kein Umbruch-Chaos).
- [ ] „MCP“ klicken → springt auf `/mcp` (ohne `?journey=`-Param), Button zeigt
      aktiven Zustand.
- [ ] Direkt-URL `http://localhost:5173/mcp` aufrufen → Seite lädt (kein Redirect,
      kein 404).
- [ ] Ausgeloggt (bzw. Inkognito ohne Login) → Button und `/mcp` bleiben
      sichtbar/erreichbar; Detail-Routen (`/?journey=bike`) leiten wie bisher auf
      die Übersicht um.

## 2) Status grün (Backend läuft)

- [ ] `/mcp` bei laufendem Backend → Status grün (Celeste-Punkt):
      „Backend erreichbar — bike-buying-journey v1.0.0 (Protokoll 2024-11-05)“
      plus Hinweis, dass `npm run mcp` separat läuft und hier nicht erkennbar ist.
- [ ] Alle 3 Tools mit Beschreibung gelistet:
      `journey.get`, `journey.add_item`, `journey.crawl_link`.

## 3) Status rot (Backend gestoppt)

- [ ] Backend stoppen (Dev-Server weiter laufen lassen), `/mcp` neu laden →
      Status rot (Rust-Punkt): „Backend nicht erreichbar …“ mit Fehlermeldung.
- [ ] Setup-Snippet, Selbsttest-Karte und Kurzanleitung bleiben trotzdem lesbar.

## 4) Retry-Button („Erneut prüfen“)

- [ ] Bei rotem Status ist der Button „Erneut prüfen“ (Rotate-Icon) sichtbar.
- [ ] Backend wieder starten, „Erneut prüfen“ klicken → Status wechselt ohne
      Reload zurück auf grün.
- [ ] Bei grünem Status heißt der Button „Status aktualisieren“ (gleicher Button,
      kein überflüssiges Element); klicken ohne Backend-Neustart → bleibt grün.
- [ ] Backend stoppen, „Status aktualisieren“ klicken → Status wird rot, Button heißt
      jetzt „Erneut prüfen“ (Anleitung und Snippet-Fallback bleiben lesbar).

## 5) Selbsttest-Button („Lesepfad prüfen“)

- [ ] Karte „Lesepfad prüfen“ → Button „Lesepfad prüfen“ (Lupen-Icon) klicken.
- [ ] Bei laufendem Backend → Ergebniszeile „Lesepfad ok — N Journey(s) (…);
      "bike" gelesen mit M Item(s).“
- [ ] Während des Laufs zeigt der Button „Prüfe…“ und ist deaktiviert.
- [ ] Bei gestopptem Backend → Ergebniszeile „Lesepfad fehlgeschlagen: …“.

## 6) Snippet ohne Platzhalter kopierbar

- [ ] Karte „Setup für Muse“: `pre`-Block enthält den `mcpServers`-Block für
      `~/.config/muse/settings.json` mit `command node`,
      `args ["/absoluter/pfad/src/mcp/server.js"]` und
      `env { "MCP_BASE_URL": "http://localhost:3000" }` — kein
      `<PFAD-ZUM-REPO>`-Platzhalter, direkt einfügbar (Hinweiszeile: „Pfad und URL
      stammen aus `GET /api/mcp-status` — direkt einfügbar.“).
- [ ] „Snippet kopieren“ klicken → Button wechselt kurz auf „Kopiert!“
      (Check-Icon), Eingefügtes entspricht exakt dem angezeigten Block.
- [ ] Nur falls das Backend keinen Pfad/keine URL liefert (Fallback): Platzhalter
      `<PFAD-ZUM-REPO>` durch den absoluten Pfad dieses Checkouts ersetzen.

## 7) Pflichtparameter sichtbar

- [ ] Unter dem grünen Status listet jedes Tool seine Pflichtparameter, z. B.
      `journey.get (Pflicht: slug)`, `journey.add_item (Pflicht: …)`,
      `journey.crawl_link (Pflicht: …)` — Daten stammen aus
      `GET /api/mcp-status` (`tool.inputSchema.required`).
- [ ] Tools ohne Pflichtparameter zeigen keinen „(Pflicht: …)“-Zusatz.
