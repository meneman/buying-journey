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

1. **Abhängigkeiten installieren:**
   ```bash
   npm install
   ```

2. **Umgebungsvariablen konfigurieren:**
   Die Konfiguration befindet sich in der `.env`-Datei:
   - `SB_API_BASE_URL`: Basisadresse deines SilverBullet-Servers (z.B. `https://notes.wohnli.com`).
   - `SB_AUTH_TOKEN`: Dein Authentifizierungstoken für die SilverBullet-API.
   - `PORT`: Port, auf dem die App lokal läuft (Standard: `3000`).

3. **App starten:**
   ```bash
   npm start
   ```

4. **Dashboard öffnen:**
   Navigiere im Browser zu [http://localhost:3000](http://localhost:3000).

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
