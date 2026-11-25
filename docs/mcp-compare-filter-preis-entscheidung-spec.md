# MCP-Erweiterungen: Vergleich, selektives Lesen, Preise, Entscheidungshilfen

Status: Umgesetzt am 2026-11-25 (Backend, MCP, Frontend, Tests, Doku). Scope: Features 1, 2, 3, 5 aus der Ideensammlung.
Nicht im Scope: Crawl-Reimport (Feature 4, explizit abgelehnt), Kategorien/Konsolidierung
(Feature 6, vorerst egal).

Ziel: Kaufentscheidungen wie bei `badheizkoerper` (4 Kandidaten, 249 EUR bis 645 EUR)
per MCP beantworten, ohne Voll-Dump und ohne Preis- Ratespiele.

## 0. Ist-Stand und Konventionen

- MCP-Tools: Single Source of Truth in `packages/mcp/src/tools.js` (`TOOL_DEFS`),
  stdio-Server in `packages/mcp/src/server.js` ruft nur REST (`GET /api/data`,
  `POST /api/data`, Config-, Feedback-Routen). Kein Direkt-DB-Zugriff.
- REST-Vertrag und Tabellen in `src/web/backend/server.js`, `src/db/store.js`,
  Doku in `docs/vault/Architektur/Backend.md`.
- Items: `items(price TEXT Freitext, rating TEXT Stern-String, status, notes, link,
  specs TEXT JSON-Array, position)`. Wire-Format Specs: `<br>`-String, Trennung am
  ersten Doppelpunkt, Zeilen ohne Doppelpunkt sind Freitext ohne Vergleichszeile.
- Vergleich: Backend schreibt `journeys.spec_comparison` (`commonKeys`, `uniqueKeys`),
  Frontend gruppiert in `frontend/src/lib/spec-grouping.ts` und rendert in
  `frontend/src/pages/Compare.tsx` (Gemeinsame vs. Weitere Eigenschaften).
  Ohne LLM greift der deterministische case-insensitive Fallback.
- Schreiben: `POST /api/data` ist Voll-Replace plus SSE-Broadcast (`journey-updated`,
  `reason: property-sync` bei Abgleich). `applySpecAlignment` nutzt Hash-Guard gegen
  konkurrierende Edits und triggert keine Rekursion.
- Auth: alle Daten-Routen hinter `needUser`, strikte `owner_id`-Trennung.
- Tests: `npm test` (Node-Testrunner, siehe `package.json`), Frontend-Logik teils mit
  `--experimental-strip-types`.

## 1. Feature 1: `journey.compare` (lesend, kein Schreiben)

Problem: `journey.get` liefert alles roh, `specs` teils als String, kein Preisvergleich,
keine Lueckenanalyse. Jeder Client baut das heute selbst.

### 1.1 Neue Oberflaechen

- REST (neu, lesend): `GET /api/compare?journey=X[&status=...][&sort=...][&dir=...]`
  Antwort ist abgeleitet, schreibt nichts, kein SSE, kein Abgleich-Trigger.
- MCP (neu): `journey.compare` ruft obige Route auf und reicht das Ergebnis durch.
  Kein Direkt-Compute im MCP-Server, damit Web-App und MCP dieselbe Logik nutzen.

### 1.2 Request

```json
{
  "slug": "badheizkoerper",
  "status": "Thinking",
  "sort": "price",
  "dir": "asc",
  "includeSpecs": true,
  "includeNotes": false
}
```

- `slug` Pflicht, Slug-Regeln wie `journey.get` (kein `bike`-Fallback im MCP).
- `status` optional, ein Wert aus `ITEM_STATUSES` oder Array davon. Unbekannter Wert
  faellt nicht still weg, sondern liefert `400 INVALID_STATUS`.
- `sort` optional: `position` (Default), `price`, `rating`, `name`.
- `dir` optional: `asc` (Default), `desc`.
- `includeSpecs`, `includeNotes` optional, Default `true` bzw. `false` (Token sparen).

### 1.3 Response

```json
{
  "slug": "badheizkoerper",
  "totalItems": 4,
  "returnedItems": 4,
  "sort": {"by": "price", "dir": "asc"},
  "priceRange": {"min": 249.0, "max": 644.9, "currency": "EUR"},
  "items": [
    {"name": "...", "price": "612,95 EUR", "priceAmount": 612.95,
     "priceCurrency": "EUR", "rating": 5, "status": "Thinking"}
  ],
  "common": [{"key": "Leistung heizstab", "values": {"Item A": "600 W"}}],
  "unique": [{"key": "Farbe", "values": {"Item B": "Anthrazit"}}],
  "missing": [{"item": "Schulte Turin", "missingKeys": ["Schutzart"]}],
  "specComparison": {"commonKeys": [], "uniqueKeys": [], "updatedAt": "..."}
}
```

### 1.4 Regeln

- Gruppierung wiederverwendet Backend-`specComparison` plus deterministischen Fallback
  aus `groupSpecKeys` (keine neue Logik, kein LLM im Lese-Pfad).
- `common` heisst: Key ist in der Vergleichsmenge und bei allen zurueckgegebenen Items
  befuellt. `unique`: nur bei einer Teilmenge befuellt. Freitext ohne Doppelpunkt
  erzeugt keine Zeile. Fehlende Werte werden als `"—"` dargestellt und zusaetzlich
  in `missing` aufgelistet.
- Preise: Anzeige-String bleibt fuehrend, `priceAmount`/`priceCurrency` kommen aus
  Feature 3 (Abschnitt 3). Nicht parsbar heisst `priceAmount: null`, Sortierung legt
  solche Items ans Ende (bei `asc`) bzw. an den Anfang (bei `desc`), stabil nach
  `position, id`.
- Leere Journey: `totalItems 0`, `priceRange null`, `common []`, `unique []`.
  Unbekannter Slug: `404 JOURNEY_NOT_FOUND`, kein Lazy-Create im Lese-Pfad.
- Budget- und Score-Felder aus Feature 5 (Abschnitt 5) werden hier mitgeliefert,
  sobald Feature 5 aktiv ist (`overBudget`, `score`), sonst entfallen sie.

### 1.5 Fehler und Tests

- `400 INVALID_SLUG`, `400 INVALID_STATUS`, `400 INVALID_SORT`, `401/403` wie Bestand,
  `404 JOURNEY_NOT_FOUND`, `405` nur GET erlaubt.
- Tests: `compare-endpoint.test.js` (Gruppierung mit/ohne `specComparison`, Freitext
  ignoriert, Missing-Erkennung), `compare-sort.test.js` (Preis asc/desc mit null am
  korrekten Ende, Rating, Name), MCP-Test fuer Passthrough plus Fehlercode.

## 2. Feature 2: selektives Lesen (`journey.get`-Optionen, kein neues Tool)

Problem: `journey.get` ist immer Voll-Dump (Status, Logs, Items, Specs, Feedback,
Config). Bei 4 Items mit langen Notes/Specs ist das verschwenderisch und macht
Filter/Sortierung dem Client ueberlassen.

### 2.1 Request (rueckwaertskompatibel, alles optional)

```json
{
  "slug": "badheizkoerper",
  "status": ["Thinking", "Shortlisted"],
  "search": "anthrazit",
  "sort": "price",
  "dir": "asc",
  "limit": 20,
  "offset": 0,
  "fields": ["items", "status"],
  "includeSpecComparison": true,
  "includeLogs": true,
  "includeSpecs": true,
  "includeFeedback": false,
  "includeConfig": false
}
```

- Ohne Optionen antwortet `journey.get` exakt wie heute (Default: alles, Items in
  `position, id`-Reihenfolge). Das haelt Skill, Web-App und alte Clients stabil.
- `fields` ist eine Positivliste aus `items, status, specs, journey, generalNotes,
  feedback, config, headers, sectionTitle, listTitle, specComparison`. Unbekannte
  Felder: `400 INVALID_FIELDS`. Leere Liste heisst: nur `slug` plus `pagination`.
- `status`: ein Status oder Array, case-sensitiv wie `ITEM_STATUSES`. Ungueltig heisst
  `400 INVALID_STATUS` (kein stiller Drop).
- `search`: case-insensitiver Substring ueber `name`, `notes`, Spec-Keys und Spec-Werte.
- `sort/dir`: wie in 1.2. `price` nutzt `price_amount`, `rating` die Sterne als Zahl,
  `name` per `lower(name)`, sonst `position, id`.
- `limit` 1..200 (Default: alles, explizit `0` ist `400`), `offset` >= 0.
  Antwort enthaelt `pagination {total, returned, limit, offset}`.
- `include*`-Flags sind Kurzform fuer `fields`; bei Widerspruch gewinnt `fields`
  und das Flag wird ignoriert (kein Fehler, aber dokumentiert).

### 2.2 REST-Abbildung

- `GET /api/data?journey=X` akzeptiert dieselben Query-Parameter
  (`status` wiederholbar oder kommagetrennt, `search`, `sort`, `dir`, `limit`,
  `offset`, `fields` kommagetrennt, `includeSpecComparison=0/1` usw.).
- Antwort bleibt das Volldokument-Format, nur gefiltert/gekuerzt, plus `pagination`.
  `POST /api/data` bleibt unveraendert Voll-Replace (kein Patch in diesem Spec).
- SSE bleibt unveraendert; gefilterte Reads triggern nichts.

### 2.3 Regeln und Tests

- Filter wirken nur auf Items; Logs, Specs, Feedback werden nur ein-/ausgeblendet,
  nie gefiltert. `total` zaehlt Items nach Filter, vor `limit/offset`.
- Tests: Default-Antwort unveraendert (Bestands-Fixtures), Status-Filter strikt,
  Search ueber Name/Notes/Specs, Sort stabil mit Null-Handling, Pagination-Kanten
  (`offset` hinter Ende heisst `returned 0`), `INVALID_*`-Faelle.

## 3. Feature 3: Preise als Daten (Anzeige bleibt, Sortierung wird echt)

Problem: `price` ist Freitext (`"612,95 EUR"`, `"ab 249,00 EUR (konfigurierbar)"`,
`"1.189,95 EUR"`). Sortieren und Budget pruefen ist damit Ratespiel.

### 3.1 Speicher (Migration, abwaertskompatibel)

- `items` bekommt `price_amount REAL NULL`, `price_currency TEXT DEFAULT ''`,
  `price_qualifier TEXT DEFAULT ''`, `price_updated_at TEXT DEFAULT ''`.
- `price` (Anzeige-String) bleibt fuehrend und wird weiter ausgeliefert. Neu sind
  zusaetzliche Felder im Item: `priceAmount`, `priceCurrency` (ISO-Code `EUR/USD/...`),
  `priceQualifier` (`ab`, `bis`, `konfigurierbar`, ...), `priceUpdatedAt`.
- Neue Tabelle `price_history`:
  `id, owner_id, journey_slug, item_id (FK items.id ON DELETE CASCADE),
  amount REAL NULL, currency TEXT, display TEXT, source TEXT (mcp|ui|import),
  created_at TEXT datetime('now')`. Index `(owner_id, journey_slug, item_id, id)`.
- Migration fuellt `price_amount/currency/qualifier` per Parser aus bestehendem
  `price` (siehe 3.3). Nicht parsbar heisst `NULL`, Anzeige bleibt unveraendert.
  Es wird nichts ueberschrieben, was der Parser nicht versteht.

### 3.2 Schreiben und Historie

- `journey.add_item` akzeptiert neu optional `priceAmount`, `priceCurrency`,
  `priceQualifier`. Wer nur `price` schickt, bekommt Parser-Normalisierung; wer
  strukturiert schickt, gewinnt ueber den Parser. `PUT /api/journey-config` bleibt
  unberuehrt, `POST /api/data` uebernimmt die neuen Felder im Voll-Replace.
- Historie wird geschrieben, sobald sich Anzeige-String oder Betrag/Waehrung eines
  Items aendern (Quelle `mcp` bzw. `ui`). Reine Positions- oder Notes-Edits schreiben
  keine Historie. `applySpecAlignment` schreibt nie Historie.
- Neues lesendes MCP-Tool `journey.price_history`:
  `{slug, name, limit 1..100 Default 20}` -> `{slug, name, history:
  [{amount, currency, display, source, at}]}` neueste zuerst. Unbekanntes Item:
  `404 ITEM_NOT_FOUND`. Kein Schreiben, kein SSE.

### 3.3 Parser (DE-Formate zuerst)

- Versteht `612,95 EUR`, `644,90EUR`, `1.189,95 EUR`, `ab 249,00 EUR`, `$ 1,299.00`,
  Kuerzel `EUR`/`USD`/`CHF` sowie Symbole `EUR/USD/$`.Qualifier erkennt `ab`,
  `bis`, `ca.`, `konfigurierbar`, `variante` (case-insensitiv, Rest bleibt im
  Anzeige-String erhalten).
- Tausender- und Dezimaltrennung wird nach Sprache des Betrags entschieden:
  `1.189,95` -> `1189.95`, `1,299.00` -> `1299.00`, `249` -> `249.0`.
  Mehrdeutiges (`1.299`) wird als `1299.0` gelesen und im Spec-Test fixiert.
- Waehrung aus Config (`currency`) ist nur Fallback, wenn der Preis keine traegt.
  Ausgabe normiert auf ISO-Code plus gerundeten Betrag (2 Nachkommastellen).
- Tests: `price-parse.test.js` mit allen obigen Faellen plus Negativfaellen
  (`konfigurierbar` ohne Zahl -> `NULL`, leer -> `NULL`, Muell -> `NULL` ohne Fehler).

### 3.4 Frontend und Tests

- `ProductDialog`: Preis-Eingabe mit Live-Vorschau (erkannter Betrag + Qualifier),
  Qualifier als Chip. `Compare`: Preisspalte zeigt Anzeige plus Badge bei `ab`.
- Neue Seite oder Dialog-Sektion Preisverlauf pro Item (aus `price_history`).
- Tests: Store-Migration (Alt-DB ohne neue Spalten oeffnet und parst), Historie nur
  bei Preiswechsel, `journey.price_history`-Paginierung und `ITEM_NOT_FOUND`.

## 5. Feature 5: Entscheidungshilfen (Pro/Contra, Kriterien, Budget, Shortlist)

Problem: heute nur `rating` plus Freitext-`notes`. Gewichtung, Budget und Top-N
muss der Client raten. Ziel ist eine erklaerbare, deterministische Hilfe, kein
LLM-Ranking.

### 5.1 Daten

- `items` bekommt `pros TEXT DEFAULT '[]'` und `cons TEXT DEFAULT '[]'` (JSON-Arrays
  aus kurzen Strings, max. 20 Eintraege je max. 200 Zeichen). `notes` bleibt.
- Neue Tabelle `journey_criteria`:
  `id, owner_id, journey_slug, key TEXT (Spec-Key oder `price|rating`),
  weight INTEGER 1..5 Default 3, position INTEGER`. Upsert-Key ist `lower(key)`.
- MCP: `journey.add_item` akzeptiert `pros`/`cons` (Arrays, trimmen, Duplikate raus,
  Limits mit `400 INVALID_PROS_CONS` bei Verstoss). Neu `journey.set_criteria`
  `{slug, key, weight}` und `journey.delete_criteria` `{slug, key}` sowie Lesen ueber
  `journey.get` (`fields` enthaelt `criteria`) und `GET /api/criteria?journey=X`.
- Budget bleibt Freitext in `journeys.budget`, wird aber mit dem Preis-Parser aus 3.3
  als Obergrenze gelesen (`2500EUR` -> `2500.0 EUR`). Nicht parsbar heisst: kein
  Budget-Urteil, nie ein Fehler.

### 5.2 Scoring (deterministisch, erklaerbar, v1)

- Score pro Item 0..100, nur aus vorhandenen Daten, keine versteckten Gewichte:
  `rating` (Sterne 0..5) zaehlt stark, `pros minus cons` gibt kleine Punkte,
  Preis gibt Punkte fuer Guenstigkeit innerhalb der Journey (gute Spanne, kein
  absolutes Urteil), `criteria`-Gewichte verstaerken passende Spec-Keys.
- Formel v1 (im Code als Konstante, im Spec-Test fixiert):
  `score = 12 * rating + 2 * (pros - cons) + pricePoints + criteriaPoints`,
  gedeckelt auf 0..100, gerundet auf 1 Nachkommastelle. `pricePoints` max. 20 fuer
  das guenstigste parsbare Item, linear fallend bis 0 fuers teuerste; ohne parsbaren
  Preis 0. `criteriaPoints`: pro Kriterium mit Gewicht w (1..5) gibt ein befuellter
  Spec-Key `2 * w / AnzahlKriterien * 5` Punkte, `price`-Kriterium nutzt Preisrang,
  `rating`-Kriterium nutzt Sterne. Alles ohne LLM.
- Antwort enthaelt immer `breakdown {ratingPoints, prosConsPoints, pricePoints,
  criteriaPoints}` plus `reasons [max. 3 kurze Strings]`, z. B.
  `"guenstigster Preis"`, `"5 Sterne"`, `"3 Pros, 1 Contra"`. Kein Fliesstext-Ranking.

### 5.3 Shortlist (lesend, schreibt keinen Status)

- REST: `GET /api/shortlist?journey=X&n=3` (Default 3, 1..10). MCP: `journey.shortlist`
  `{slug, n, status}` (optional Status-Filter wie in 1.2, Default alle ausser `Rejected`).
- Sortierung: `score desc, priceAmount asc (NULL zuletzt), rating desc, name asc`.
  Jedes Ergebnis enthaelt `score`, `breakdown`, `reasons`, `overBudget`, `priceAmount`.
  Status-Umschreibung auf `Shortlisted` macht der Nutzer danach selbst per
  `journey.add_item` (kein Auto-Schreiben, keine Ueberraschung).
- Budget-Urteil: `overBudget true/false/null` (null bei nicht parsbar). `compare`
  liefert dasselbe Feld pro Item mit, sobald Feature 3 aktiv ist.

### 5.4 Frontend und Tests

- `Compare`: Pro/Contra-Spalte, Budget-Badge (`ueber Budget` / `im Budget` / `kein
  Budget`), Score-Spalte mit Tooltip aus `breakdown`, Shortlist-Button ruft
  `GET /api/shortlist` und zeigt Top-N mit Begruendung.
- `ProductDialog`: Pro/Contra-Editor (ein Eintrag pro Zeile, Counter 20x200).
  `/eigenschaften`: Kriterien-Gewichte (Zahleneingabe 1..5) plus Hinweis auf `price|rating`.
- Tests: `decision-score.test.js` (fixe Fixture-Journey mit 4 Items, erwartete Scores
  und Reihenfolge), `budget-check.test.js` (parsbar, `ab`-Preise, nicht parsbar ->
  null), `shortlist.test.js` (Filter `Rejected` raus, `n`-Grenzen, stabile Sortierung),
  `pros-cons-validation.test.js`.

## 6. Querschnitt (gilt fuer alle vier Features)

- Auth/Owner: neue Routen hinter `needUser`, strikte `owner_id`-Filter, gleiche
  Slug-Sanitisierung wie Bestand. Kein Lazy-Create auf Lese-Routen.
- Fehlerformat: `{error: {code, message}}` mit Codes `INVALID_SLUG`, `INVALID_STATUS`,
  `INVALID_SORT`, `INVALID_FIELDS`, `INVALID_PROS_CONS`, `ITEM_NOT_FOUND`,
  `JOURNEY_NOT_FOUND`. Kein stiller Fallback bei falschen Enums.
- SSE: nur Schreib-Routen broadcasten (`POST /api/data`, Criteria- und Pro/Contra-Edits
  darueber). Neue Lese-Routen triggern weder Broadcast noch Property-Abgleich.
- Kompatibilitaet: `GET /api/data` ohne neue Parameter antwortet Byte-fuer-Byte wie
  heute plus optionales `pagination` nur bei gesetztem Filter. `price`-String und
  `rating`-Sterne bleiben im Wire-Format. Neue Spalten sind NULL-/Default-faehig.
- Doku: `packages/mcp/src/tools.js` plus `GET /api/mcp-status` aus derselben Quelle,
  `docs/vault/Architektur/Backend.md` und `Frontend.md` nachziehen, Skill-Beispiele
  fuer `compare`, Filter, Preisverlauf und Shortlist ergaenzen.
- Test-Gates: `npm test`, `npm --prefix frontend run build`,
  `npm --prefix frontend run lint`. Neue Tests wie oben, keine Skips.

## 7. Abnahme am Beispiel `badheizkoerper`

- `journey.compare {slug: badheizkoerper, sort: price}` listet Schulte zuerst
  (`ab`-Badge), zeigt `Schutzart` als Luecke bei Schulte und `Farbe` als
  Unique-Key bei Alrona.
- `journey.get {slug, status: Thinking, sort: price, limit: 2}` liefert 2 Items plus
  `pagination {total: 4, returned: 2}`.
- Preis `ab 249,00 EUR (konfigurierbar)` parst zu `249.0 EUR + qualifier ab`,
  Historie waechst nur bei Preiswechsel.
- `journey.shortlist {slug, n: 2}` nennt Heilmetz (Preis) und Prestige/Alrona
  (Ausstattung) mit je max. 3 Gruenden und Budget-Flag.




