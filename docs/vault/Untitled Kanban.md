---

kanban-plugin: board

---

## todo

- [ ] change icons to font awesome font
- [ ] Neue Karte via Muse Code erstellt (2026-09-14)


## progress


## done

- [ ] SilverBullet-Referenzen entfernen (SQLite/JSON1 ist Backend)
  - Scope: Full cleanup — tote Laufzeit-Referenzen UND One-shot-Migrations-Infra entfernen (Migration gilt als abgeschlossen, SQLite ist einziges Backend)
  - AppHeader: SilverBullet-Button ersatzlos streichen — `frontend/src/components/layout/AppHeader.tsx` (Import + Hook-Aufruf + Button-Block), Hook-Datei `frontend/src/lib/use-silverbullet-url.ts` komplett löschen (Backend `GET /api/config` in `src/web/backend/server.js` liefert nur `{storage:'sqlite'}`, Button war dadurch ohnehin tot)
  - Migrations-Infra löschen: `scripts/migrate-from-silverbullet.js`, `src/core/sb-client.js` (nur vom Migrations-Skript genutzt), `test/sb-client.test.js`, `package.json`-Einträge (`description`, `scripts.migrate`, `sb-client.test.js` im Test-Skript) bereinigen
  - Doku/Meta mitsäubern: `frontend/index.html` (Meta-Description), `README.md` (Migrations-Abschnitt + Env-Hinweis), `docs/vault/README.md` (Hinweis App-Daten in SilverBullet), historische Kommentare in `src/agent/scripts/utils.js`, `src/db/store.js`
  - Vorher prüfen: kein weiterer Laufzeit-Caller von `makeRequest`/`SB_API_BASE_URL`/`SB_AUTH_TOKEN` außer Migrations-Skript + Test; `.env`-Variablen danach entbehrlich
  - Akzeptanz: Suche nach `silverbullet`/`silverBulletUrl`/`SB_API`/`SB_AUTH`/`sb-client` liefert null Treffer im Code (ausgenommen diese Karte als Historie); Frontend baut, `npm test` grün (ohne `sb-client.test.js`)
  - Erledigt 2026-09-14: Migrations-Infra gelöscht (`scripts/migrate-from-silverbullet.js` + leeres `scripts/`-Verzeichnis, `src/core/sb-client.js`, `test/sb-client.test.js`), `package.json` bereinigt (Description, `migrate`-Skript, Test-Skript), Doku/Meta gesäubert (`frontend/index.html`, `README.md`, `docs/vault/README.md`, Kommentar-Köpfe in `src/agent/scripts/utils.js` + `src/db/store.js`); zusätzlich eine Residual-Zeile in `.agents/skills/buying-journey-manager/SKILL.md` ent-SB-t. Abweichung: AppHeader-Button + `use-silverbullet-url.ts` waren in der Arbeitskopie bereits entfernt (nichts mehr zu tun), `GET /api/config` lieferte schon `{storage:'sqlite'}`. Verifikation: `npm test` 27/27 grün, Frontend-Build ok, `oxlint` 0 Errors (7 Warnungen in unberührten Dateien). Suche ohne Treffer außer dieser Karte; `.env` (git-ignoriert, mit live-Token) enthält noch `SB_API_BASE_URL`/`SB_AUTH_TOKEN` — bitte selbst entfernen/rotieren. Keine neuen Tests (reine Löschung; `sb-client.test.js` mit Modul entfernt). Kein UI-Touch, daher kein `MANUAL_TESTS.md`.



## waiting





%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false]}
```
%%