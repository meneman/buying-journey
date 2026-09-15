# Manuelle Tests — Icons auf Font Awesome umstellen (2026-09-14)

Bitte zuerst selbst `npm run dev` starten (Backend auf Port `3000`, Vite-Dev-Server auf
Port `5173`, öffnet `http://localhost:5173`; `/api`-Calls werden an das Backend geproxyt).
Alle Lucide-Icons wurden gegen Font-Awesome-Free-Solid (Sterne zusätzlich Regular) getauscht,
`lucide-react` ist deinstalliert. Diese Checklist ist von Hand im Browser durchzugehen —
automatisiert verifiziert sind nur `npm test` (42/42 grün, Backend unberührt),
Frontend-Build (`tsc -b` + `vite build`) und `oxlint` (0 Errors, nur vorbestehende Warnungen).

- [ ] `/?journey=bike` öffnen → Header zeigt Routen-Logo, Journey-Switcher mit Fahrrad-Icon,
      Tabs mit Icons (Dashboard/Vergleich/Feedback/Eigenschaften), Reload- und Theme-Icon —
      alle Icons sichtbar, keines fehlt oder ist verrutscht.
- [ ] Leere Bereiche prüfen (Tagebuch/Produkte ohne Einträge) → Schild-Icon lesbar.
- [ ] Produktkarte: Sterne (voll/leer), Bearbeiten-/Löschen-Buttons, „Details“-Link mit Icon.
- [ ] Bewertung per Klick setzen (Produktdialog Sterne-Eingabe) → volle/leere Sterne korrekt.
- [ ] `/vergleich?journey=bike` → Zeilen-Icons (Kompass, Euro, Stern, Info, Notiz) + Aktionen.
- [ ] `/eigenschaften?journey=bike` und `/feedback?journey=bike` → Empty-State-Icons ok.
- [ ] `/` ohne Param → Journey-Karten mit Kategorie-Icons (Fahrrad/Auto/Laptop/Haus/Paket)
      plus „Öffnen“-Pfeil.
- [ ] Journey-Switcher-Dropdown öffnen → Icons pro Journey + „Neue Kaufreise…“ mit Plus.
- [ ] Dialog öffnen (z.B. Eintrag hinzufügen) → X-Schließen-Button oben rechts sichtbar.
- [ ] Link-Import: URL einfügen → Lade-Spinner rotiert während des Imports.
- [ ] Toast auslösen (z.B. Eintrag speichern) → Erfolgs-/Fehler-Icon im Toast sichtbar.
- [ ] Select/Dropdown (falls vorhanden) → Chevron- und Haken-Icons ok.
- [ ] Grob auf Ausrichtung achten: FA-Icons haben leicht anderen Baseline-Versatz als Lucide —
      bei auffälligem Versatz bitte melden (dann wird per CSS nachjustiert).
