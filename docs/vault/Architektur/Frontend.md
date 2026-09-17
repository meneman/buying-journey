# Frontend — JourneyPath 🖥️

> Code: `frontend/` (Vite + React + TypeScript + Tailwind + shadcn/ui) · Einstieg: `frontend/src/main.tsx` → `App.tsx`
> Siehe auch: [[Übersicht]] · [[Backend]] · [[Was-ist-JourneyPath]] · API-Vertrag in [[Backend]] §4, Typen in `frontend/src/lib/types.ts`

## 1. Überblick

- **Stack:** Vite 7, React 18, TypeScript, `tailwindcss` (Vite-Plugin), shadcn/ui-Komponenten in `src/components/ui/`, Icons via `spec-icons.ts` + FontAwesome, Theme via `next-themes` (Hell/Dunkel).
- **Start:** `npm run dev` → Vite `:5173` proxyt `/api` ans Backend (`http://localhost:1337`); `npm run build` → `frontend/dist/` (wird vom Backend statisch ausgeliefert).
- **Alias:** `@` → `frontend/src` (siehe `vite.config.ts` + `tsconfig.*`).
- **Env:** `frontend/.env` — `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (gleiche Werte wie Backend ohne Prefix).

## 2. Ordnerstruktur

```
frontend/src/
├── main.tsx                  # React-Root, lädt App + index.css
├── App.tsx                   # Provider-Baum + Routes + LoginGate
├── index.css                 # Tailwind + globale Styles
├── pages/                    # eine Komponente pro Route
│   ├── JourneysOverview.tsx  # `/` ohne ?journey= — Startseite (eingeloggt: Kacheln, ausgeloggt: Infoseite)
│   ├── Dashboard.tsx         # `/` mit ?journey= — Detail-Dashboard
│   ├── Compare.tsx           # `/vergleich` — Vergleichstabelle aus items.specs-Union
│   ├── Specs.tsx             # `/eigenschaften` — journey_specs (gilt der ganzen Reise!)
│   ├── Feedback.tsx          # `/feedback` — Feedback-Markdown
│   ├── Settings.tsx          # `/einstellungen` — Config (name/description/category/…)
│   ├── Login.tsx             # `/login` — Google / Apple / E-Mail+Passwort (Supabase)
│   └── Mcp.tsx               # `/mcp` — MCP-Anleitung + Status (GET /api/mcp-status)
├── components/
│   ├── layout/               # AppShell, AppHeader, NavTabs, JourneySwitcher, CreateJourneyDialog, ThemeToggle
│   ├── ui/                   # shadcn-Bausteine (button, dialog, card, table, select, …)
│   ├── LoginGate.tsx         # Login-Wächter für geschützte Routen
│   ├── ProductCard.tsx       # Produktkarte im Dashboard (inkl. „Inhalt einfügen"-Hinweis)
│   ├── ProductDialog.tsx     # Eintrag hinzufügen/bearbeiten — URL-first, manuelle Felder aufklappbar
│   ├── ImportLinkForm.tsx    # Produkt-Link → POST /api/import-link → Item direkt in die Liste
│   ├── CrawlProviderSelect.tsx   # Dropdown je Crawl-Stufe (fetch/extract) aus GET /api/crawl-providers
│   ├── ManualContentDialog.tsx   # Seiteninhalt einfügen → POST /api/parse-text
│   ├── StarRating.tsx / RatingDialog.tsx
│   ├── AscentTracker.tsx, Link.tsx
├── lib/
│   ├── api.ts                # alle Fetch-Wrapper + ApiError (status/code)
│   ├── types.ts              # JourneyData, JourneyItem (inkl. needsContent), JourneyConfig, ITEM_STATUSES, PHASES
│   ├── router.tsx            # Mini-Router (pathname + ?journey=), useJourney(), useJourneyHref()
│   ├── journey-data-context.tsx  # lädt + speichert JourneyData der aktiven Journey (+ SSE)
│   ├── manual-content.ts     # Platzhalter-Logik für blockierte Crawls (needsContent)
│   ├── journey-id.ts         # Slug-Normalisierung (lowercase, nur [a-z0-9.-])
│   ├── journey-category.ts   # Kategorie → Icon/Label
│   ├── auth-context.tsx      # Supabase-Session, loggedIn, Token für api.ts
│   ├── page-sync-context.tsx # seitenübergreifende Sync-Hinweise (Toasts bei SSE-Update)
│   ├── supabase.ts           # Supabase-Client + getAccessToken()
│   ├── spec-icons.ts         # bekannte Spec-Schlüssel → Icon, sonst Info-Icon
│   ├── status-style.ts, markdown-lite.tsx, utils.ts
```

## 3. Routing & Login-Gate (`lib/router.tsx`, `App.tsx`, `components/LoginGate.tsx`)

Kein React Router — eigener Mini-Router über `window.location` + `popstate`.

**Öffentlich ohne Login sind nur zwei Ansichten:** `/login` und `/` ohne `?journey=`. Alles andere steckt in `<LoginGate>`, das ausgeloggt direkt auf `/login` weiterleitet (statt geschützte Inhalte anzudeuten und im Hintergrund 401er zu produzieren) und während der Session-Prüfung „Lädt…" zeigt. Der MCP-Button im Header bleibt dabei sichtbar.

| URL | Seite | Ausgeloggt |
|---|---|---|
| `/` (ohne `?journey=`) | JourneysOverview — Kachel-Übersicht (`GET /api/journey-configs`) | ✅ allgemeine Infoseite mit „Neue Kaufreise"/„Anmelden" → `/login` |
| `/login` | Login (Google / Apple / E-Mail+Passwort) | ✅ |
| `/?journey=bike` | Dashboard — Status/Budget-Tracker, Produktlisten, Tagebuch, Notizen | → `/login` |
| `/vergleich?journey=X` | Compare — Matrix über die **Vereinigung aller `items.specs`-Schlüssel** (Reihenfolge: erstes Auftreten, fehlend = `—`) | → `/login` |
| `/eigenschaften?journey=X` | Specs — `journey_specs` (Reise-weit, **nicht** pro Produkt!) | → `/login` |
| `/feedback?journey=X` | Feedback-Text | → `/login` |
| `/einstellungen?journey=X` | Basis-Eigenschaften + Anzeige-Settings (`PUT /api/journey-config`) | → `/login` |
| `/mcp` | MCP-Status + Setup-Anleitung (app-weit ohne `?journey=`) | → `/login` |

`useJourney()` liest `?journey=` (Default `bike`), `useJourneyHref()` baut journey-erhaltende Links. `JourneyDataProvider` (Key = Journey-Slug) versorgt Dashboard/Compare/Specs mit Daten.

## 4. Datenfluss

```
Seite/Komponente → lib/api.ts → REST (Backend) → SQLite
                                    ↘ SSE /api/data/events → journey-data-context → Re-Render + Toast
```

- **Lesen:** `fetchJourneyConfigs()` (Startseite), `fetchJourneyData(slug)` (Detail), `fetchJourneyConfig()`, `fetchFeedback()`, `fetchMcpStatus()`, `fetchMe()`, `fetchCrawlProviders()`.
- **Schreiben:** `saveJourneyData()` (Volldokument), `saveJourneyConfig()` (Patch), `createJourney()`, `importItemFromLink()` / `parseItemFromText()` (liefern nur das Item — persistiert wird über `saveJourneyData`).
- **Fehler:** `request()` wirft einen `ApiError` mit `status` und optionalem `code` (z. B. `CONTENT_BLOCKED`) — darauf baut die Platzhalter-Entscheidung in §6 auf.
- **Auth:** `authHeaders()` hängt `Authorization: Bearer <Supabase-JWT>` an; SSE nutzt `buildJourneyEventsUrl(journey, token)` mit `?token=` (vgl. [[Backend]] §5).
- **Specs-Eingabe:** `ProductDialog` — eine Eigenschaft pro Zeile `Schlüssel: Wert`; Trennung am ersten Doppelpunkt; Zeilen ohne Doppelpunkt = Freitext. Icons via `spec-icons.ts`.
- **Status/Rating:** Konstanten in `types.ts` — `ITEM_STATUSES` (Thinking … Bought), `PHASES` (Planning … Purchased), `parseRating()` (zählt ⭐), `translateStatus()` (EN → DE-Label).
- **Logs:** Import-Aufrufe schreiben Start- und Ergebniszeilen (`[import] …`) in die Browser-Konsole — Provider, Fallback, Zeichen, Dauer, ob Specs/Preis kamen.

## 5. URL-first: Einträge und Kaufreisen anlegen

Der Standardweg ist überall **die URL**, nicht das Formular:

- **`ProductDialog` (Hinzufügen):** oben „Per URL hinzufügen" (autofokussiert) plus zwei `CrawlProviderSelect`-Dropdowns (Parse-Tool / LLM-Auswertung, `auto` = Backend-Standard). Das gecrawlte Item wird **direkt gespeichert**, ohne Kontrollschritt. Die manuellen Felder liegen hinter „Manuell eingeben (Name, Preis, Details …)". Beim **Bearbeiten** eines Eintrags ist das Formular wie gehabt sofort sichtbar.
- **`ImportLinkForm`** (Dashboard/Compare): Link einwerfen, Item wird angehängt.
- **`CreateJourneyDialog`:** Pflicht ist entweder eine Produkt-URL *oder* ein Kürzel. Mit URL und ohne Kürzel wird zuerst gecrawlt, dann das Kürzel aus dem Produktnamen abgeleitet (`suggestSlugFromName`, Fallback `suggestSlugFromUrl`), die Journey angelegt — bei 409 automatisch mit Suffix `-2`, `-3`, … (`createUnique`, 6 Versuche) — und das Erstprodukt gespeichert. Kürzel, Anzeigename, Kategorie und Beschreibung sind optional aufklappbar.

## 6. Blockierte Seiten: der `needsContent`-Fallback

Nicht jede Shop-Seite lässt sich crawlen. Statt eines Fehlers entsteht ein **markierter Platzhalter** — die Logik liegt gebündelt in `lib/manual-content.ts`:

| Funktion | Aufgabe |
|---|---|
| `shouldCreatePlaceholder(error)` | Platzhalter nur bei Server-Fehlern. Bei **400** (ungültige URL, unbekannte Stufe) muss der Nutzer die Eingabe korrigieren; **ohne** `status` (Backend offline) scheitert das Speichern ohnehin |
| `fallbackItemName(link)` | lesbarer Name aus der URL, z. B. `model3 · tesla.com` |
| `placeholderForBlockedLink(link, error, status?)` | baut das Item mit `needsContent: true`, Link und `MANUAL_CONTENT_NOTE` als Notiz |
| `trimPastedForUpload(raw)` | kürzt eingefügten Inhalt clientseitig (Default 300 000 Zeichen); das Backend trimmt danach auf das LLM-Limit |
| `mergeParsedContent(current, parsed)` | führt das geparste Item mit dem Platzhalter zusammen (geparste Felder gewinnen, Original-Link bleibt) und **löscht das Flag** |

Angezeigt wird das so:

- **`ProductCard`** (Dashboard): gestrichelter Kasten „Automatischer Import blockiert — Seiteninhalt manuell einfügen" + Button „Inhalt einfügen".
- **`Compare`**: die ganze Spalte ist ausgegraut und `pointer-events-none`/`aria-hidden`; in der ersten Zeile liegt der „Inhalt einfügen"-Button über der Zelle.
- **`ManualContentDialog`**: Der Nutzer kopiert die Seite (Strg+A/Strg+V) in eine Paste-Zone. **Der Text wird nie gerendert** — sichtbar ist nur die Zeichenzahl. `POST /api/parse-text` wertet ihn per LLM aus, das Ergebnis ersetzt den Platzhalter (Toast „Inhalt übernommen").

## 7. Wichtige Abgrenzungen (Fehlerquellen!)

1. **`items.specs` vs. `journey_specs`:** Ersteres = Vergleichsattribute **pro Produkt** (Compare-Seite), Zweiteres = Eigenschaften der **ganzen Reise** (Eigenschaften-Seite). Nicht vermischen!
2. **Wire-Format Specs:** Frontend spricht `<br>`-String (`specs?: string` in `JourneyItem`), die DB speichert JSON — Konvertierung liegt im Backend (`store.js`).
3. **Anzeige-Schreibweise:** Schlüssel case-insensitiv gruppiert, erstes Auftreten bestimmt Label + Reihenfolge.
4. **Dev-Proxy:** Vite leitet nur `/api` weiter — Frontend-Routen (`/vergleich`, …) löst der SPA-Fallback des Backends.
5. **Crawl-Ergebnisse werden ohne Kontrollschritt gespeichert.** Wer das LLM-Ergebnis prüfen will, korrigiert danach über „Bearbeiten".
6. **`needsContent` nur gesetzt übertragen:** Das Flag fehlt im JSON normaler Items — Prüfungen immer über `Boolean(item.needsContent)`.

## 8. Tests

Kein Browser-Harness — die Frontend-Tests laufen unter `node --test` und sind zweierlei Art:

- **Echte Logiktests:** `test/manual-content.test.js` importiert `lib/manual-content.ts` (läuft deshalb mit `--experimental-strip-types`) und prüft Platzhalter-Entscheidung und Merge.
- **Quelltext-Regressionen:** `test/login-gate.test.js`, `test/journeys-overview-logged-out.test.js` und `test/light-contrast.test.js` lesen `.tsx`/`.css` als Text und prüfen, dass bestimmte Stellen vorhanden bleiben (Login-Guard vor den API-Aufrufen, `navigate('/login')` im Gate, Kontrastwerte). Sie rendern nichts — sie verhindern nur, dass eine Regel still verschwindet.

Klickpfade stehen in `docs/local/MANUAL_TESTS.md`.

#architektur #frontend #react #vite
