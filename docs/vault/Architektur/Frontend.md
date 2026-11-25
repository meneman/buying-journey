# Frontend — JourneyPath 🖥️

> Code: `frontend/` (React 19 + Vite + TypeScript + Tailwind CSS 4 + shadcn/ui) · Einstieg: `frontend/src/main.tsx` → `App.tsx`
> Siehe auch: [[Übersicht]] · [[Backend]] · [[Was-ist-JourneyPath]] · API-Vertrag in [[Backend]] §4, Typen in `frontend/src/lib/types.ts`

## 1. Überblick

- **Stack:** Vite 8, React 19, TypeScript, `@tailwindcss/vite` (Tailwind CSS 4), shadcn/ui-Komponenten in `src/components/ui/`, FontAwesome-Icons (`spec-icons.ts`, `journey-category.ts`), Theme via `next-themes` (Hell/Dunkel).
- **Start:** `npm run dev` → Vite `:1337` proxyt `/api` ans Backend (`http://localhost:3000`); `npm run build` → `frontend/dist/` (wird vom Backend statisch ausgeliefert).
- **Lint & Typecheck:** `npm --prefix frontend run build` (`tsc -b && vite build`) und `npm --prefix frontend run lint` (`oxlint`).
- **Alias:** `@` → `frontend/src` (siehe `vite.config.ts` + `tsconfig.*`).
- **Env:** `frontend/.env` — `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

## 2. Ordnerstruktur

```
frontend/src/
├── main.tsx                    # React-Root, lädt App + index.css
├── App.tsx                     # Supabase-Config-Check + Provider-Baum + Routes + LoginGate
├── index.css                   # Tailwind + globale Design-Tokens (WCAG-AA Light + Dark)
├── pages/                      # eine Komponente pro Route
│   ├── JourneysOverview.tsx    # `/` ohne ?journey= — Startseite (eingeloggt: Kacheln + MCP-Karte, ausgeloggt: Infoseite)
│   ├── Dashboard.tsx           # `/` mit ?journey= — Detail-Dashboard
│   ├── Compare.tsx             # `/vergleich` — Vergleichstabelle (Gemeinsame vs. Weitere/Einzel-Eigenschaften)
│   ├── Specs.tsx               # `/eigenschaften` — journey_specs (gilt der ganzen Reise!)
│   ├── Feedback.tsx            # `/feedback` — Feedback-Markdown
│   ├── Settings.tsx            # `/einstellungen` — Config (name/description/category/…)
│   ├── Login.tsx               # `/login` — Google / Apple / E-Mail+Passwort (Supabase)
│   └── Mcp.tsx                 # `/mcp` — MCP-Hub (API-Key-Verwaltung, Client-Snippets, Beispiel-Prompts, Tool-Explorer)
├── components/
│   ├── layout/                 # AppShell, AppHeader, NavTabs, JourneySwitcher, CreateJourneyDialog, ThemeToggle
│   ├── ui/                     # shadcn-Bausteine (alert-dialog, badge, button, card, dialog, dropdown-menu, …)
│   ├── LoginGate.tsx           # Login-Wächter für geschützte Routen
│   ├── ExpandableText.tsx      # 3-Zeilen-Clamp mit „.. Öffnen / Schließen“-Toggle in Compare
│   ├── ProductCard.tsx         # Produktkarte im Dashboard
│   ├── ProductDialog.tsx       # Manuelles Formular: Name, Preis, Status, Bewertung, Specs, Link, Notizen
│   ├── RatingDialog.tsx        # Overlay für Bewertung + Status + Kommentar in Compare
│   ├── StarRating.tsx          # Sterne-Anzeige und -Eingabe
│   ├── AscentTracker.tsx       # Status-/Phasen-/Budget-Tracker
│   └── Link.tsx                # Router-Link
├── lib/
│   ├── api.ts                  # alle Fetch-Wrapper + ApiError (status/code) + SSE-URL-Builder
│   ├── types.ts                # JourneyData, SpecComparison, JourneyItem, JourneyConfig, ITEM_STATUSES, PHASES
│   ├── router.tsx              # Mini-Router (pathname + ?journey=), useJourney(), useJourneyHref()
│   ├── router-path.ts          # targetPathForJourneySwitch() beim Journey-Wechsel
│   ├── journey-data-context.tsx# lädt + speichert JourneyData der aktiven Journey (+ SSE-Toast-Handling)
│   ├── journey-id.ts           # Slug-Normalisierung (lowercase, nur [a-z0-9.-])
│   ├── journey-category.ts     # Kategorie → Icon/Label
│   ├── auth-context.tsx        # Supabase-Session, useLoggedIn(), Token für api.ts
│   ├── page-sync-context.tsx   # Sync-Status + Reload-Trigger im Header
│   ├── supabase.ts             # Supabase-Client + getAccessToken()
│   ├── spec-grouping.ts        # groupSpecKeys() & parseSpecsString() (Backend-specComparison + deterministischer Fallback)
│   ├── spec-icons.ts           # bekannte Spec-Schlüssel → Icon, Re-Export von spec-grouping.ts
│   ├── status-style.ts, markdown-lite.tsx, utils.ts
```

## 3. Routing & Login-Gate (`lib/router.tsx`, `App.tsx`, `components/LoginGate.tsx`)

Kein React Router — eigener Mini-Router über `window.location` + `popstate`. Fehlt `VITE_SUPABASE_ANON_KEY`, zeigt `App.tsx` einen Konfigurationsbildschirm (`MissingConfigScreen`).

**Öffentlich ohne Login sind nur zwei Ansichten:** `/login` und `/` ohne `?journey=`. Alle anderen Routen — **auch `/mcp`** — liegen innerhalb von `<LoginGate>`, das ausgeloggt direkt auf `/login` weiterleitet und während der Session-Prüfung „Lädt…" zeigt. Der MCP-Button in `AppHeader.tsx` bleibt immer sichtbar und führt ausgeloggt über das Gate zum Login.

| URL | Seite | Ausgeloggt |
|---|---|---|
| `/` (ohne `?journey=`) | JourneysOverview — Kachel-Übersicht (`GET /api/journey-configs`) + MCP-Hinweis | ✅ allgemeine Infoseite mit „Neue Kaufreise"/„Anmelden" → `/login` |
| `/login` | Login (Google / Apple / E-Mail+Passwort) | ✅ |
| `/?journey=bike` | Dashboard — Status/Budget-Tracker, Produktlisten, Tagebuch, Notizen | → `/login` |
| `/vergleich?journey=X` | Compare — Matrix nach **Gemeinsame Eigenschaften** & **Weitere / Einzel-Eigenschaften** | → `/login` |
| `/eigenschaften?journey=X` | Specs — `journey_specs` (Reise-weit, **nicht** pro Produkt!) | → `/login` |
| `/feedback?journey=X` | Feedback-Text | → `/login` |
| `/einstellungen?journey=X` | Basis-Eigenschaften + Anzeige-Settings (`PUT /api/journey-config`) | → `/login` |
| `/mcp` | MCP-Hub (API-Keys, Setup-Snippets mit Default `Lokal (Node)`, Prompts, Tool-Explorer) | → `/login` |

`useJourney()` liest `?journey=` (Default `bike`), `useJourneyHref()` baut journey-erhaltende Links. `JourneyDataProvider` (Key = Journey-Slug) versorgt Dashboard/Compare/Specs mit Daten.

## 4. Datenfluss & Live-Sync

```
Seite/Komponente → lib/api.ts → REST (Backend) → SQLite
                                    ↘ SSE /api/data/events → journey-data-context → Toast + Reload
```

- **Lesen:** `fetchJourneyConfigs()` (Startseite), `fetchJourneyData(slug)` (Detail inkl. optionalem `specComparison`), `fetchJourneyConfig()`, `fetchFeedback()`, `fetchMcpStatus()`, `fetchMe()`, `fetchApiKeys()`.
- **Schreiben:** `saveJourneyData()` (Volldokument), `saveJourneyConfig()` (Patch), `createJourney()`, `createApiKey()`, `revokeApiKey()`. Es gibt keine Crawl- oder KI-Import-Aktionen in der Web-App.
- **SSE (`journey-data-context.tsx`):** Subscribet auf `GET /api/data/events?journey=X` (`?token=`). Bei `journey-updated` erscheint ein Toast mit „Neu laden“-Button (bei `reason: "property-sync"` als „Eigenschaften abgeglichen“, sonst als „Neue Daten vom MCP-Server“) — laufende Eingaben werden nie still überschrieben.
- **Vergleichstabelle (`Compare.tsx` + `spec-grouping.ts`):** `groupSpecKeys(items, data.specComparison)` trennt bei `>= 2` Items in **Gemeinsame Eigenschaften** (bei allen Items befüllt) und **Weitere / Einzel-Eigenschaften** (nur bei einzelnen Items vorhanden). Fehlt `specComparison` oder sind lokal neue Keys dazugekommen, greift derselbe deterministische case-insensitive Fallback. Bei `< 2` Items werden die Specs ohne Bereichs-Trennung angezeigt.
- **Auth:** `authHeaders()` hängt `Authorization: Bearer <Supabase-JWT>` an.
- **Specs-Eingabe:** `ProductDialog` — reines manuelles Formular; eine Eigenschaft pro Zeile `Schlüssel: Wert` (Trennung am ersten Doppelpunkt; Zeilen ohne Doppelpunkt = Freitext).

## 5. Wichtige Abgrenzungen

1. **`items.specs` vs. `journey_specs`:** Ersteres = Vergleichsattribute **pro Produkt** (`Compare`), Zweiteres = Eigenschaften der **ganzen Reise** (`Specs`). Nicht vermischen!
2. **Wire-Format Specs:** Frontend spricht `<br>`-String (`specs?: string` in `JourneyItem`), die DB speichert JSON — Konvertierung liegt im Backend (`store.js`).
3. **Dev-Proxy:** Vite leitet nur `/api` weiter — Frontend-Routen (`/vergleich`, `/mcp`, …) löst der SPA-Fallback des Backends.

## 6. Tests

Kein Browser-Harness — die Frontend-Checks laufen unter `node --test`:

- **Logiktests (`--experimental-strip-types`):** `test/journey-switch.test.js`, `test/compare-spec-grouping.test.js`.
- **Quelltext-Regressionen:** `test/login-gate.test.js`, `test/journeys-overview-logged-out.test.js`, `test/light-contrast.test.js`, `test/compare-cell-wrap.test.js`.

Manuelle Browser-Checklisten liegen bei UI-Änderungen in `docs/local/MANUAL_TESTS.md`.

## 7. Vergleich, Preise, Entscheidung (Feature-Set 2026-11)

- **`Compare`:** Preisspalte mit Qualifier-Badge (`ab`), neue Zeile Pro/Contra (`item.pros`/`cons` aus `ProductDialog`, eine Zeile pro Punkt).
- **`Specs`:** neuer Bereich Kriterien-Gewichte (`GET/POST/DELETE /api/criteria`, Zahleneingabe 1..5, Hinweis auf `price|rating`).
- **`lib/api.ts`:** `fetchCompare`, `fetchShortlist`, `fetchPriceHistory`, `fetchCriteria`, `setCriteria`, `deleteCriteria`.
- **`lib/types.ts`:** `JourneyItem` mit `priceAmount`/`priceCurrency`/`priceQualifier`/`priceUpdatedAt`/`pros`/`cons`, `JourneyData.criteria?`, `JourneyCriteria`, `CompareItemScore`, `PriceHistoryEntry`.

#architektur #frontend #react #vite
