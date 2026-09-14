---

kanban-plugin: board

---

## todo

- [ ] change icons to font awesome font
- [ ] Neue Karte via Muse Code erstellt (2026-09-14)
## progress
## done

- [ ] Buying-Journey-Skill (REST): neue Journey per API anlegen
  - Scope: nur Anlegen — diese Karte baut ausschließlich "neue Journey anlegen" (kein Item-/Log-/Feedback-CRUD, kein Chat-Loop; das spätere Skillset für App-Steuerung per Chat kommt als eigene Folgekarte)
  - Skill-Form: bestehenden Skill `.agents/skills/buying-journey-manager/SKILL.md` erweitern (REST-Modus dazu, kein neuer Skill daneben; Direkt-SQLite-Skripte `src/agent/scripts/add-item.js`/`add-log.js` bleiben unberührt)
  - Backend: neuer expliziter `POST /api/journeys`-Endpunkt in `src/web/backend/server.js` (Slug + optionale Felder Phase/Budget/Zieldatum/Notizen); kein Lazy-Create-Missbrauch über `GET /api/data` (das heute via `ensureJourney` in `src/db/store.js` stillschweigend anlegt)
  - Skill spricht REST statt Direkt-DB: Basis-URL/Port konfigurierbar (Default Port 3000, vgl. `.env` `PORT`/`DB_PATH`), Backend muss laufen; klare Fehlermeldung wenn Backend down (statt stillem SQLite-Schreiben)
  - Bestand heute (nicht neu erfinden): `GET /api/journeys` listet, `POST /api/data` speichert zu existierendem Slug, `GET /api/data?journey=X` legt via `ensureJourney` an; Slug-Normalisierung heute im Frontend (`frontend/src/lib/journey-id.ts`, aus CreateJourneyDialog wiederverwendet) — für Skill/Backend übernehmen
  - Zu klären bei Umsetzung: Request-/Response-Schema des POST (Slug-Pflicht, Duplikat → 409 vs. Idempotent-200), Validierung (leerer/ungültiger Slug)
  - Edge Cases: Slug existiert bereits, leerer/ungültiger Slug, Backend nicht laufend, `DB_PATH`-Variante
  - Akzeptanz: Skill-Befehl legt neue Journey (z.B. `smartphone`) per REST an, `GET /api/journeys` listet sie, kein Direkt-DB-Schreiben im neuen Pfad; `npm test` grün
  - Erledigt 2026-09-14: neuer `POST /api/journeys` in `src/web/backend/server.js` (Slug-Pflicht + optionale Strings Phase/Budget/TargetDate/GeneralNotes/SectionTitle/ListTitle, Slug-Normalisierung wie `frontend/src/lib/journey-id.ts`; `201 {success, slug}`, `409` bei Duplikat, `400` bei fehlendem/leerem/ungültigem Slug oder nicht-String-Optionalen) plus `store.createJourney()` in `src/db/store.js` (Defaults via `defaultJourneyRow`, Duplikat wirft `JOURNEY_EXISTS`); `GET /api/data`-Lazy-Create unangetastet. Offene Punkte der Karte entschieden: Duplikat → 409 (nicht idempotent-200), leere/ungültige Slugs → 400 ohne `bike`-Fallback. Skill `.agents/skills/buying-journey-manager/SKILL.md` um REST-Abschnitt „2b“ erweitert (curl-Beispiele mit konfigurierbarer Basis-URL, Default Port 3000, Backend-muss-laufen-Hinweis, Slug-/Antwort-Regeln). Tests: 4 neue Tests in `test/server.test.js` (explizites Anlegen + Feld-Roundtrip, 409-Duplikat inkl. normalisiertem Doppel, 400-Fälle, Normalisierung); `npm test` 32/32 grün; Skill-Pfad zusätzlich live verifiziert (201/409/400 + Listen-Eintrag). Kein UI-Touch, daher kein `MANUAL_TESTS.md`.

- [ ] Startseite `/`: aktive Buying-Journeys listen + Neuer-Button
  - Platzierung: `/` wird Übersicht — ohne `?journey=`-Param Liste zeigen, mit `?journey=<slug>` wie bisher das Detail-Dashboard (`frontend/src/App.tsx` `Routes`, Detail-Pfade `/vergleich`, `/eigenschaften`, `/feedback` bleiben param-gebunden)
  - Umfang: alle Journeys 1:1 aus `GET /api/journeys` (slug-sortiert, heute `src/db/store.js` `listJourneys`), kein Aktiv-Filter (Phase ist Freitext, Default `Planning`, kein Enum)
  - Karten minimal: pro Journey nur Name/Icon (`iconForJourney`) + Öffnen-Link (`/?journey=<slug>`); kein Backend-Umbau, keine N+1 Detail-Calls
  - Neuer-Button: bestehenden Erstellen-Dialog aus `JourneySwitcher.tsx` wiederverwenden (nur Kürzel, gleiche Slug-Normalisierung, Lazy-Create via Navigation + `ensureJourney`); dortigen veralteten Dateinamen-Hinweis (`.buying-journey.md`, SQLite speichert keine Files) mit korrigieren
  - Edge: Lade-/Fehlerverhalten wie im Switcher (Fallback lokale `recent_journeys`); Leerzustand de facto nie leer (Backend sichert mind. `bike`)
  - Akzeptanz: `/` ohne Param listet alle Slugs, Öffnen springt ins Dashboard, Neuer-Button legt Journey an und navigiert dorthin
  - Erledigt 2026-09-14: `/` ohne `?journey=` zeigt neue `JourneysOverview`-Seite (Name/Icon + Öffnen-Link je Slug, nur `GET /api/journeys`, kein Backend-Umbau), mit Param weiter Detail-Dashboard (`frontend/src/App.tsx`); Erstellen-Dialog als `CreateJourneyDialog` extrahiert und in Switcher + Übersicht wiederverwendet (gleiche Slug-Normalisierung via neuem `frontend/src/lib/journey-id.ts`, Lazy-Create via Navigation + `ensureJourney`), veralteter `.buying-journey.md`-Hinweis korrigiert. Tests: neuer Backend-Test „GET /api/journeys lists every journey slug-sorted“ in `test/server.test.js` (Startseiten-Vertrag), `npm test` 28/28 grün, Frontend-Build ok, `oxlint` 0 Errors; manuelle Browser-Verifikation ausstehend, siehe `docs/local/MANUAL_TESTS.md`.

- [ ] SilverBullet-Referenzen entfernen (SQLite/JSON1 ist Backend)
  - Scope: Full cleanup — tote Laufzeit-Referenzen UND One-shot-Migrations-Infra entfernen (Migration gilt als abgeschlossen, SQLite ist einziges Backend)
  - AppHeader: SilverBullet-Button ersatzlos streichen — `frontend/src/components/layout/AppHeader.tsx` (Import + Hook-Aufruf + Button-Block), Hook-Datei `frontend/src/lib/use-silverbullet-url.ts` komplett löschen (Backend `GET /api/config` in `src/web/backend/server.js` liefert nur `{storage:'sqlite'}`, Button war dadurch ohnehin tot)
  - Migrations-Infra löschen: `scripts/migrate-from-silverbullet.js`, `src/core/sb-client.js` (nur vom Migrations-Skript genutzt), `test/sb-client.test.js`, `package.json`-Einträge (`description`, `scripts.migrate`, `sb-client.test.js` im Test-Skript) bereinigen
  - Doku/Meta mitsäubern: `frontend/index.html` (Meta-Description), `README.md` (Migrations-Abschnitt + Env-Hinweis), `docs/vault/README.md` (Hinweis App-Daten in SilverBullet), historische Kommentare in `src/agent/scripts/utils.js`, `src/db/store.js`
  - Vorher prüfen: kein weiterer Laufzeit-Caller von `makeRequest`/`SB_API_BASE_URL`/`SB_AUTH_TOKEN` außer Migrations-Skript + Test; `.env`-Variablen danach entbehrlich
  - Akzeptanz: Suche nach `silverbullet`/`silverBulletUrl`/`SB_API`/`SB_AUTH`/`sb-client` liefert null Treffer im Code (ausgenommen diese Karte als Historie); Frontend baut, `npm test` grün (ohne `sb-client.test.js`)
  - Erledigt 2026-09-14: Migrations-Infra gelöscht (`scripts/migrate-from-silverbullet.js` + leeres `scripts/`-Verzeichnis, `src/core/sb-client.js`, `test/sb-client.test.js`), `package.json` bereinigt (Description, `migrate`-Skript, Test-Skript), Doku/Meta gesäubert (`frontend/index.html`, `README.md`, `docs/vault/README.md`, Kommentar-Köpfe in `src/agent/scripts/utils.js` + `src/db/store.js`); zusätzlich eine Residual-Zeile in `.agents/skills/buying-journey-manager/SKILL.md` ent-SB-t. Abweichung: AppHeader-Button + `use-silverbullet-url.ts` waren in der Arbeitskopie bereits entfernt (nichts mehr zu tun), `GET /api/config` lieferte schon `{storage:'sqlite'}`. Verifikation: `npm test` 27/27 grün, Frontend-Build ok, `oxlint` 0 Errors (7 Warnungen in unberührten Dateien). Suche ohne Treffer außer dieser Karte; `.env` (git-ignoriert, mit live-Token) enthält noch `SB_API_BASE_URL`/`SB_AUTH_TOKEN` — bitte selbst entfernen/rotieren. Keine neuen Tests (reine Löschung; `sb-client.test.js` mit Modul entfernt). Kein UI-Touch, daher kein `MANUAL_TESTS.md`.
- [ ] Light-Theme (`frontend/src/index.css`): Kontrastfehler nach WCAG AA überall fixen
  - Scope: nur Kontrast fixen — kein Redesign, keine neuen Farben/Layouts; ausschließlich `:root`-Tokens in `frontend/src/index.css` anpassen, `.dark`-Block unberührt lassen
  - Maßstab: WCAG AA — 4.5:1 für normalen Text, 3:1 für großen Text/UI-Komponenten/Fokusringe; Messung pro Vorder-/Hintergrund-Paar, nicht per Augenmaß
  - Geltungsbereich: überall — alle Pages (`Dashboard`, `Compare`, `Specs`, `Feedback`, `JourneysOverview`), Layout (`AppHeader`, `AppShell`, `NavTabs`, `JourneySwitcher`), Dialoge/Dropdowns/Toasts/Tooltips, Badges/Buttons/Inputs/Selects/Tables aus `components/ui`
  - Bestand heute: Light-Theme = `:root`-Variablen in `frontend/src/index.css` (Background `#F7F5EF`, Muted `#EDE8DC`, Muted-Foreground `#6E7686`, Primary `#2E8B76` auf `#FBFAF7`, Destructive `#B85C29`, Hiviz `#CFE829`, Steel `#6E7686`, Border/Input `#E1DACA`); Umschaltung via `ThemeToggle.tsx` (`next-themes`), Default `system` in `App.tsx`
  - Verdachtspaare zuerst prüfen: `muted-foreground` auf `muted`/`background`, `primary`/`celeste`/`rust` auf ihren Foregrounds, `steel` auf hellem Grund, `secondary-foreground`/`accent-foreground` auf `secondary`/`accent`, Placeholder-/Disabled-/Border-Zustände
  - Edge Cases: Light-Theme erzwungen testen (System-Dark darf Fehler nicht verdecken); Hover-/Focus-/Disabled-States und `ring` mitprüfen; Dark-Theme-Kontraste nicht verschlechtern
  - Akzeptanz: alle Text-/UI-Paare im Light-Theme erfüllen WCAG AA, Frontend-Build ok, `npm test` grün
  - Erledigt 2026-09-14: nur `:root`-Tokens abgedunkelt (gleicher Farbton, kein Redesign): `primary`/`celeste`/`ring` `#2E8B76`→`#287A66`, `muted-foreground`/`steel` `#6E7686`→`#5F6777`, `destructive`/`rust` `#B85C29`→`#A65324`; alle 14 gemessenen Text-/UI-Paare erfüllen jetzt WCAG AA (vorher 8 darunter, z.B. Muted-auf-Muted 3.74→4.65, Celeste-auf-Card 4.14→5.16, Weiß-auf-Primary 3.97→4.95). `.dark`-Block unberührt. Abweichung: `border`/`input` `#E1DACA` bewusst unverändert (dekorative Rahmen, kein Text; 3:1 dort wäre ein Redesign — der Fokus-`ring` als Zustandsanzeige liegt bei 4.74:1); Hover `primary/80` verbessert (2.95→3.44, transienter State). Tests: neuer `test/light-contrast.test.js` (5 Tests inkl. Dark-Unberührt-Wächter), Testskript in `package.json` erweitert; `npm test` 37/37 grün, Frontend-Build ok, `oxlint` 0 Errors (7 Warnungen in unberührten Dateien). Manuelle Browser-Verifikation ausstehend, siehe `docs/local/MANUAL_TESTS.md`.



- [ ] Backend/MCP: Infos zu bestimmter Buying Journey per REST+MCP lesbar machen
  - Scope: komplett — ein Aufruf liefert Status (Phase/Budget/Zieldatum), Items (Name/Preis/Specs/Rating/Status/Notizen/Link), Journey-Logs, Journey-Specs, GeneralNotes, Feedback zu genau einem Journey-Slug
  - Nur Lesen — kein Schreiben über diese Schnittstelle (kein POST/PUT/DELETE im MCP-Tool; existierende POST-Endpunkte bleiben unberührt)
  - Form: eigener MCP-Server (stdio) im Repo, der die REST-API aufruft (kein Direkt-DB-Zugriff aus dem MCP-Server, Backend muss laufen, Default-Port 3000)
  - Bestand heute (nicht neu erfinden): `src/web/backend/server.js` hat `GET /api/journeys`, `GET /api/data?journey=X` (liefert status, journey, items, specs, generalNotes, headers, sectionTitle, listTitle), `GET /api/feedback?journey=X`; Daten via `src/db/store.js` (`listJourneys`, `getJourneyData`, `getFeedback`); kein MCP-Code im Repo (Suche nach `mcp`/`MCP` ohne Treffer)
  - Zu klären bei Umsetzung: neuen kombinierten Lese-Endpunkt (z.B. Journey+Feedback in einem) oder MCP-Server aggregiert `GET /api/data` + `GET /api/feedback`; Umgang mit unbekanntem Slug (heute legt `getJourney()`/`ensureJourney()` stillschweigend mit Defaults an — für Read-Zugriff 404 statt Auto-Anlage prüfen); Slug-Sanitizing beibehalten
  - Edge Cases: unbekannter/leerer Journey-Slug, leere Journey (keine Items/Logs), Backend nicht laufend, `DB_PATH`-Variante, `frontend/dist` fehlt
  - Akzeptanz: MCP-Tool (z.B. `journey.get`) liefert für `bike` das komplette Dokument; unbekannter Slug gibt definierten Fehler (kein stilles Anlegen); `npm test` grün
  - Erledigt 2026-09-14: neuer MCP-Server `src/mcp/server.js` (stdio, JSON-RPC 2.0, ohne Dependencies, per `npm run mcp` startbar; Basis-URL via `MCP_BASE_URL` bzw. `PORT`, Default Port 3000); einziges Tool `journey.get` liefert `{slug, status, journey, items, specs, generalNotes, headers, sectionTitle, listTitle, feedback}`. Offene Punkte entschieden: kein neuer Backend-Endpunkt (MCP aggregiert `GET /api/journeys` + `GET /api/data` + `GET /api/feedback`, Backend unberührt); unbekannter Slug → definierter `isError`-Fehler, leerer Slug → `-32602`, Existenzprüfung via `/api/journeys` vor jedem `/api/data`-Call → kein stilles Anlegen (Frontend-Lazy-Create erhalten); Slug-Sanitizing wie Backend (unsafe Zeichen raus + lowercase, aber ohne `bike`-Fallback); Backend down → `isError` mit klarer Meldung. Tests: neuer `test/mcp.test.js` (5 Tests: tools/list, vollständiges bike-Dokument, unbekannter Slug ohne Anlage, leerer Slug, Backend down), Testskript in `package.json` erweitert; `npm test` 42/42 grün; zusätzlich live verifiziert (Doc-Keys, Fehlertext, Journeys-Liste unverändert). Kein UI-Touch, daher `MANUAL_TESTS.md` unverändert.
## waiting





%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false]}
```
%%