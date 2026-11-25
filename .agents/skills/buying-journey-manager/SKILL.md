---
name: buying-journey-manager
description: Verwalte Produkt-Kandidaten, Preise, Spezifikationen, Bewertungen und das Reisetagebuch für beliebige Kaufreisen über MCP-Tools oder die REST-API (mit SQLite-CLI als Legacy-Fallback).
---

# Buying Journey Manager Skill

Dieser Skill steuert Kaufreisen (z. B. Fahrräder, Elektroautos, Laptops) im **MCP-First-Workflow**: Der Agent recherchiert Produkte selbst mit seinen eigenen Web-Werkzeugen und übergibt strukturierte Daten über die MCP-Tools (oder die REST-API) an das Backend.

## 1. Primärer Workflow: MCP-Tools (`journey-path`)

Wenn der MCP-Server eingebunden ist, nutze ausschließlich die MCP-Tools:

1. **Orientierung holen:** `journey.help` liefert Workflows, gültige Status-/Phasen-Werte (`ITEM_STATUSES`, `PHASES`) und `specs`-Konventionen; `journey.list` zeigt vorhandene Kaufreisen.
2. **Journey anlegen oder öffnen:** `journey.create` (legt neue Journey explizit an) bzw. `journey.get` (liest vollständiges Dokument ohne stilles Anlegen). Basis-Config/Anzeige-Titel bei Bedarf über `journey.update_config` anpassen.
3. **Selbst recherchieren & strukturiert eintragen:** Recherchiere Produktseiten mit den eigenen Agent-Tools und speichere jedes Modell per `journey.add_item` (Upsert nach `name`, case-insensitiv; `specs` als Objekt mit klaren, konsistenten Keys wie `{"Gewicht": "15.8 kg", "Rahmen": "Alu"}`).
   - Das Backend vereinheitlicht synonyme `specs`-Keys ab 2 Produkten automatisch im Hintergrund und pusht das Update per SSE an geöffnete Browser.
4. **Weitere Bereiche pflegen:** `journey.update_meta` (Phase, Budget, Zieldatum, allgemeine Notizen), `journey.add_log` / `journey.delete_log` (Reisetagebuch), `journey.set_spec` / `journey.delete_spec` (journey-weite Eigenschaften auf `/eigenschaften`), `journey.set_feedback` (`/feedback`), `journey.delete_item` / `journey.delete`.

**Gültige Item-Status-Werte:** `Thinking`, `Shortlisted`, `Test Ridden`, `Rejected`, `Bought`.  
**Gültige Journey-Phasen:** `Planning`, `Researching`, `Test Riding`, `Comparing`, `Decision`, `Purchased`.

## 1b. Vergleich, Preise, Entscheidung (neue Tools)

- **Vergleichen:** `journey.compare` (`slug`, optional `status`/`sort`/`dir`) liefert Preisspanne, Scores mit `breakdown`/`reasons`, gemeinsame vs. einzelne Eigenschaften und `missing`-Lücken. Beispiel: `journey.compare` mit `slug: "badheizkoerper"`, `sort: "price"`.
- **Selektiv lesen:** `journey.get` versteht zusätzlich `status`, `search`, `sort`, `dir`, `limit`, `offset`, `fields`. Ohne Optionen kommt das Voll-Dokument wie bisher.
- **Preise strukturiert:** `journey.add_item` nimmt `priceAmount`, `priceCurrency`, `priceQualifier` sowie `pros`/`cons` (Arrays). Der Anzeigetext `price` bleibt führend und gewinnt bei Änderung.
- **Verlauf:** `journey.price_history` (`slug`, `name`, optional `limit`) zeigt den Preisverlauf, neueste zuerst.
- **Kriterien & Shortlist:** `journey.set_criteria` / `journey.delete_criteria` gewichten Spec-Keys (oder `price`/`rating`) 1..5; `journey.shortlist` (`slug`, `n`, optional `status`) nennt Top-N mit Begründung und Budget-Urteil, ändert aber keinen Status.

---

## 2. Alternativweg: REST-API mit API-Key (`curl`)

Voraussetzung: Das Backend läuft (`npm run dev:server` oder `npm start`, Default-Port `3000` bzw. `1337` laut `.env.example`) und es liegt ein gültiger Bearer-Token (`MCP_AUTH_TOKEN`, Format `bj_…`) vor. Alle Daten-Routen verlangen `Authorization: Bearer <TOKEN>`.

```bash
BASE_URL="http://localhost:3000"
TOKEN="bj_..."

# Alle Slugs des Users auflisten
curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/journeys"

# Neue Journey explizit anlegen (201 angelegt, 409 Duplikat, 400 ungültiger Slug)
curl -s -X POST "$BASE_URL/api/journeys" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"slug":"smartphone","name":"Smartphone","category":"laptop","phase":"Planning","budget":"800€"}'

# Dokument lesen oder speichern (POST /api/data triggert SSE + ab 2 Items Property-Abgleich)
curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/data?journey=smartphone"
```

- Slug-Normalisierung (wie `frontend/src/lib/journey-id.ts`): Kleinbuchstaben, nur `a-z 0-9 . -`.
- Läuft das Backend nicht, schlägt `curl` mit Verbindungsfehler fehl — es wird nie still lokal geschrieben.

---

## 3. API-Keys per CLI verwalten (ohne laufenden Server)

Falls kein Browser-Login genutzt wird, lassen sich API-Keys direkt in `data/app.db` erzeugen, listen oder widerrufen:

```bash
node src/agent/scripts/create-api-key.js --user "jakob" --name "Claude Desktop"
node src/agent/scripts/create-api-key.js --list --user "jakob"
node src/agent/scripts/create-api-key.js --revoke 3 --user "jakob"
```

Der Klartext-Key erscheint genau einmal — er gehört als `MCP_AUTH_TOKEN` in die Client-Konfiguration.

---

## 4. Legacy-Offline-Skripte (Direkt-SQLite, nur wenn Backend nicht läuft)

Die folgenden CLI-Skripte schreiben direkt in `data/app.db` (ohne SSE-Broadcast und ohne serverseitigen KI-Property-Abgleich) und dienen nur noch als Offline-Fallback:

- **Item anlegen/aktualisieren:**
  ```bash
  node src/agent/scripts/add-item.js \
    --user "jakob" \
    --journey "bike" \
    --name "Cube Kathmandu Pro" \
    --price "1499€" \
    --rating 4 \
    --status "Shortlisted" \
    --gewicht "15.8 kg" \
    --rahmen "Aluminium Superlite" \
    --notes "Probefahrt war super bequem."
  ```
- **Tagebucheintrag hinzufügen:**
  ```bash
  node src/agent/scripts/add-log.js \
    --user "jakob" \
    --journey "bike" \
    --event "Erste Probefahrt gemacht" \
    --date "2026-07-16"
  ```

*(Hinweis: Das frühere Puppeteer-Crawl-Skript `crawl-and-extract.js` wurde im Zuge des MCP-First-Umbaus entfernt — Web-Recherche übernimmt ausschließlich der KI-Client.)*
