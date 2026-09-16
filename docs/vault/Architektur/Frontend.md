# Frontend — VeloPath 🖥️

> Code: `frontend/` (Vite + React + TypeScript + Tailwind + shadcn/ui) · Einstieg: `frontend/src/main.tsx` → `App.tsx`
> Siehe auch: [[Übersicht]] · [[Backend]] · API-Vertrag in [[Backend]] §4, Typen in `frontend/src/lib/types.ts`

## 1. Überblick

- **Stack:** Vite 7, React 18, TypeScript, `tailwindcss` (Vite-Plugin), shadcn/ui-Komponenten in `src/components/ui/`, Icons via `spec-icons.ts` + FontAwesome, Theme via `next-themes` (Hell/Dunkel).
- **Start:** `npm run dev` → Vite `:5173` proxyt `/api` ans Backend (`:1337`); `npm run build` → `frontend/dist/` (wird vom Backend statisch ausgeliefert).
- **Alias:** `@` → `frontend/src` (siehe `vite.config.ts` + `tsconfig.*`).
- **Env:** `frontend/.env` — `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (gleiche Werte wie Backend ohne Prefix).

## 2. Ordnerstruktur

```
frontend/src/
├── main.tsx                  # React-Root, lädt App + index.css
├── App.tsx                   # Provider-Baum + Routes
├── index.css                 # Tailwind + globale Styles
├── pages/                    # eine Komponente pro Route
│   ├── JourneysOverview.tsx  # `/` ohne ?journey= — Startseite (alle Configs)
│   ├── Dashboard.tsx         # `/` mit ?journey= — Detail-Dashboard
│   ├── Compare.tsx           # `/vergleich` — Vergleichstabelle aus items.specs-Union
│   ├── Specs.tsx             # `/eigenschaften` — journey_specs (gilt der ganzen Reise!)
│   ├── Feedback.tsx          # `/feedback` — Feedback-Markdown
│   ├── Settings.tsx          # `/einstellungen` — Config (name/description/category/…)
│   ├── Login.tsx             # `/login` — Google / Apple / E-Mail+Passwort (Supabase)
│   └── Mcp.tsx               # `/mcp` — MCP-Anleitung + Status (GET /api/mcp-status)
├── components/
│   ├── layout/               # AppShell, AppHeader, NavTabs, JourneySwitcher, …
│   ├── ui/                   # shadcn-Bausteine (button, dialog, card, table, …)
│   ├── ProductCard.tsx       # Produktkarte im Dashboard
│   ├── ProductDialog.tsx     # Anlegen/Bearbeiten (Specs-Feld: `Schlüssel: Wert` pro Zeile)
│   ├── ImportLinkForm.tsx    # Produkt-Link → POST /api/import-link → Dialog-Vorausfüllung
│   ├── StarRating.tsx / RatingDialog.tsx
│   ├── AscentTracker.tsx, Link.tsx
├── lib/
│   ├── api.ts                # alle Fetch-Wrapper (fetchJourneyData, saveJourneyData, …)
│   ├── types.ts              # JourneyData, JourneyItem, JourneyConfig, ITEM_STATUSES, PHASES
│   ├── router.tsx            # Mini-Router (pathname + ?journey=), useJourney(), useJourneyHref()
│   ├── journey-data-context.tsx  # lädt + speichert JourneyData der aktiven Journey (+ SSE)
│   ├── journey-id.ts         # Slug-Normalisierung (lowercase, nur [a-z0-9.-])
│   ├── journey-category.ts   # Kategorie → Icon/Label
│   ├── auth-context.tsx      # Supabase-Session, loggedIn, Token für api.ts
│   ├── page-sync-context.tsx # seitenübergreifende Sync-Hinweise (Toasts bei SSE-Update)
│   ├── supabase.ts           # Supabase-Client + getAccessToken()
│   ├── spec-icons.ts         # bekannte Spec-Schlüssel → Icon, sonst Info-Icon
│   ├── status-style.ts, markdown-lite.tsx, utils.ts
```

## 3. Routing (`lib/router.tsx`, `App.tsx`)

Kein React Router — eigener Mini-Router über `window.location` + `popstate`:

| URL | Seite |
|---|---|
| `/` (ohne `?journey=`) | [[#..-pages-JourneysOverview\|JourneysOverview]] — Kachel-Übersicht aller Journeys (`GET /api/journey-configs`) |
| `/?journey=bike` | Dashboard — Status/Budget-Tracker, Produktlisten, Tagebuch, Notizen |
| `/vergleich?journey=X` | Compare — Matrix über die **Vereinigung aller `items.specs`-Schlüssel** (Reihenfolge: erstes Auftreten, fehlend = `—`) |
| `/eigenschaften?journey=X` | Specs — `journey_specs` (Reise-weit, **nicht** pro Produkt!) |
| `/feedback?journey=X` | Feedback-Text |
| `/einstellungen?journey=X` | Basis-Eigenschaften + Anzeige-Settings (`PUT /api/journey-config`) |
| `/login`, `/mcp` | ohne Journey-Param; auch **ausgeloggt** erlaubt |

`useJourney()` liest `?journey=` (Default `bike`), `useJourneyHref()` baut journey-erhaltende Links. `JourneyDataProvider` (Key = Journey-Slug) versorgt Dashboard/Compare/Specs mit Daten; ohne Login leitet alles außer `/`, `/login`, `/mcp` auf `/` um.

## 4. Datenfluss

```
Seite/Komponente → lib/api.ts → REST (Backend) → SQLite
                                    ↘ SSE /api/data/events → journey-data-context → Re-Render + Toast
```

- **Lesen:** `fetchJourneyConfigs()` (Startseite), `fetchJourneyData(slug)` (Detail), `fetchJourneyConfig()`, `fetchFeedback()`, `fetchMcpStatus()`, `fetchMe()`.
- **Schreiben:** `saveJourneyData()` (Volldokument), `saveJourneyConfig()` (Patch), `createJourney()`, `importItemFromLink()` (liefert `{item}` für den Dialog, speichert nicht selbst).
- **Auth:** `authHeaders()` hängt `Authorization: Bearer <Supabase-JWT>` an; SSE nutzt `buildJourneyEventsUrl(journey, token)` mit `?token=` (vgl. [[Backend]] §5).
- **Specs-Eingabe:** `ProductDialog` — eine Eigenschaft pro Zeile `Schlüssel: Wert`; Trennung am ersten Doppelpunkt; Zeilen ohne Doppelpunkt = Freitext. Icons via `spec-icons.ts`.
- **Status/Rating:** Konstanten in `types.ts` — `ITEM_STATUSES` (Thinking … Bought), `PHASES` (Planning … Purchased), `parseRating()` (zählt ⭐), `translateStatus()` (EN → DE-Label).

## 5. Wichtige Abgrenzungen (Fehlerquellen!)

1. **`items.specs` vs. `journey_specs`:** Ersteres = Vergleichsattribute **pro Produkt** (Compare-Seite), Zweiteres = Eigenschaften der **ganzen Reise** (Eigenschaften-Seite). Nicht vermischen!
2. **Wire-Format Specs:** Frontend spricht `<br>`-String (`specs?: string` in `JourneyItem`), die DB speichert JSON — Konvertierung liegt im Backend (`store.js`).
3. **Anzeige-Schreibweise:** Schlüssel case-insensitiv gruppiert, erstes Auftreten bestimmt Label + Reihenfolge.
4. **Dev-Proxy:** Vite leitet nur `/api` weiter — Frontend-Routen (`/vergleich`, …) löst der SPA-Fallback des Backends.

#architektur #frontend #react #vite
