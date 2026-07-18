---
name: buying-journey-manager
description: Verwalte Produkt-Kandidaten, Preise, Spezifikationen, Bewertungen und das Reisetagebuch in SilverBullet für beliebige Kaufreisen.
---

# Buying Journey Manager Skill

Dieser Skill ermöglicht es dem Agenten, komfortabel und strukturiert Produktkandidaten sowie Meilensteine beliebiger Kaufreisen (z.B. Fahrräder, Elektroautos, Laptops) in SilverBullet-Notizen (`[journey].buying-journey.md`) zu katalogisieren und zu pflegen.

## 🛠️ Benutzung im CLI

Der Skill stellt Skripte zur Verfügung, mit denen du über das Terminal direkt Daten eintragen kannst.

### 1. Eintrag hinzufügen / aktualisieren
```bash
node .agents/skills/buying-journey-manager/scripts/add-item.js \
  --journey "bike" \
  --name "Cube Kathmandu Pro" \
  --price "1499€" \
  --rating 4 \
  --status "Shortlisted" \
  --weight "15.8 kg" \
  --frame "Aluminium Superlite" \
  --groupset "Shimano XT 3x10" \
  --brakes "Shimano BR-MT200" \
  --wheels "CUBE ZX20 / Schwalbe Range Cruiser 47mm" \
  --notes "Probefahrt war super bequem, Sattel passt perfekt." \
  --link "https://www.cube.eu/de-de/cube-kathmandu-pro-flashstone-n-black/831100"
```
*(Hinweis: Für andere Produktkategorien wie Autos oder Notebooks kannst du beliebige andere Attribute übergeben, die den Spalten deiner Markdown-Tabelle entsprechen. Gib immer den passenden Parameter `--journey` an.)*

**Mögliche Status-Werte:**
- `Thinking` (In Erwägung)
- `Shortlisted` (Engere Auswahl)
- `Test Ridden` (Erprobt/Besichtigt)
- `Rejected` (Ausgeschieden)
- `Bought` (Gekauft! 🏆)

### 2. Tagebucheintrag (Reise) hinzufügen
```bash
node .agents/skills/buying-journey-manager/scripts/add-log.js \
  --journey "bike" \
  --event "Erste Probefahrt mit dem Cube Kathmandu gemacht" \
  --date "2026-07-16"
```
*(Das Datum `--date` ist optional und verwendet standardmäßig das heutige Datum.)*

---

## 🤖 Anweisungen für den Agenten

Wenn der User ein Produkt oder ein Ereignis nennt:
1. Nutze `run_command` und führe das entsprechende Skript (`add-item.js` oder `add-log.js`) mit den übergebenen Parametern im Verzeichnis `/home/jakob/projekte/bike` aus.
2. Der Server synchronisiert die Daten automatisch mit deinem SilverBullet-Server unter `notes.wohnli.com/[journey].buying-journey.md`.
3. Gib dem User eine kurze Bestätigung mit einem Link zum Web-Interface.
