# VeloPath — Fahrradkauf-Begleiter 🚲

Dieses Projekt hilft dir bei der Auswahl deines perfekten Fahrrads und dokumentiert deine Kauf-Reise. Alle Informationen werden in Echtzeit mit deinem persönlichen **SilverBullet** Server unter `notes.wohnli.com` synchronisiert.

## 🚀 Features

- **🎯 Status & Budget Tracker:** Behalte den Überblick über deine aktuelle Kauf-Phase, dein Budget und dein Ziel-Datum.
- **🚲 Fahrrad-Vergleich:** Trage Modelle ein, bewerte sie mit Sternen, pflege Spezifikationen, trage Vor-/Nachteile ein und füge Links hinzu.
- **🗺️ Reisetagebuch:** Dokumentiere chronologisch Meilensteine wie Probefahrten, Händlergespräche oder Entscheidungen.
- **📝 Allgemeine Notizen:** Freitextfeld für allgemeine Notizen und Kriterien.
- **🔄 SilverBullet Echtzeit-Sync:** Alle Daten werden in der Datei `Fahrradkauf.md` in deinem SilverBullet-Space abgelegt. Du kannst die Datei direkt in SilverBullet oder über dieses Dashboard bearbeiten — beide Richtungen synchronisieren sich automatisch!

---

## 🛠️ Installation & Start

Das Frontend liegt in `frontend/` (Vite + React + TypeScript + shadcn/ui), das Backend in `src/web/backend` (Express).

1. **Abhängigkeiten installieren:**
   ```bash
   npm install
   npm install --prefix frontend
   ```

2. **Umgebungsvariablen konfigurieren:**
   Die Konfiguration befindet sich in der `.env`-Datei im Projekt-Root:
   - `SB_API_BASE_URL`: Basisadresse deines SilverBullet-Servers (z.B. `https://notes.wohnli.com`).
   - `SB_AUTH_TOKEN`: Dein Authentifizierungstoken für die SilverBullet-API.
   - `PORT`: Port, auf dem das Backend lokal läuft (Standard: `3000`).
   - `N8N_WEBHOOK_URL`: Webhook-URL deines n8n-Workflows, der einen Produkt-Link crawlt und die extrahierten Produktdaten zurückgibt (siehe unten).

3. **Entwicklung (mit Hot-Reload):**
   ```bash
   npm run dev
   ```
   Startet Backend (Port `3000`) und Vite-Dev-Server (Port `5173`) gleichzeitig; der Dev-Server leitet `/api`-Aufrufe an das Backend weiter. Öffne [http://localhost:5173](http://localhost:5173).

4. **Produktion:**
   ```bash
   npm run build   # baut das Frontend nach frontend/dist
   npm start        # startet das Backend, das frontend/dist mit ausliefert
   ```
   Öffne [http://localhost:3000](http://localhost:3000).

---

## 📄 Speicherformat in SilverBullet

Die Daten werden in einer strukturierten Markdown-Datei namens `Fahrradkauf.md` gespeichert:

```markdown
# 🚲 Fahrradkauf Journey

## 🎯 Status
- **Phase**: Probefahrten
- **Budget**: 2500€
- **Target Date**: 2026-08-31

## 🗺️ Journey Log
- **2026-07-16**: Erste Probefahrt mit dem Cube Kathmandu gemacht. Liegt gut auf der Straße!
- **2026-07-15**: Budget auf 2500€ festgesetzt.

## 🚲 Bikes Under Consideration
| Name | Price | Rating | Status | Specs | Notes | Link |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Cube Kathmandu | 1499€ | ⭐⭐⭐⭐ | Shortlisted | XT Schaltung, 14.5kg | Sehr bequem | [Link](https://cube.eu/...) |

## 📝 General Notes
- Federgabel ist Pflicht.
- Lieber Kettenschaltung als Nabenschaltung.
```

Du kannst diese Abschnitte direkt in SilverBullet bearbeiten. Beim nächsten Laden oder Klick auf "Neu laden" im Dashboard liest die App deine Änderungen ein!

---

## 🔗 Produkt-Import per Link (n8n)

Im Dashboard und im Vergleich gibt es ein Eingabefeld, in das du einen Produkt-Link einfügen kannst. Das Backend schickt den Link per POST an deinen `N8N_WEBHOOK_URL`-Webhook:

```json
{ "url": "https://…", "journey": "bike" }
```

Der n8n-Workflow crawlt die Seite und muss als Antwort ein JSON-Objekt mit den extrahierten Produktdaten liefern:

```json
{
  "name": "Cube Kathmandu Pro",
  "price": "1.499 €",
  "rating": 4,
  "status": "Thinking",
  "notes": "Kurze Zusammenfassung der Seite.",
  "link": "https://…",
  "specs": [
    { "label": "Rahmen", "value": "Carbon" },
    { "label": "Gewicht", "value": "14.5 kg" }
  ]
}
```

Der Prompt in `src/agent/prompts/product_extraction_prompt.md` beschreibt dieses Schema und eignet sich direkt als Extraktions-Prompt innerhalb des n8n-Workflows. Das Backend wandelt die Antwort automatisch in einen Eintrag um und fügt ihn der Liste hinzu.
