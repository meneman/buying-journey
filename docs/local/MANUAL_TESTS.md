# Manuelle Browser-Verifikation: Server-KI-Abgleich für Item-Properties (`specs`)

**Datum:** 2026-11-24

> Hinweis: Vor dem Testen den Dev-Stack selbst starten (`npm run dev` — Backend auf Port `3000`, Vite-Dev-Server auf Port `3300`), dann `http://localhost:3300` im Browser öffnen (`/api`-Calls werden per Proxy ans Backend geleitet).

## Checkliste

- [ ] **Weniger als 2 Items (Edge Case):** Eine Journey mit nur 1 Item auf `/vergleich?journey=<slug>` öffnen. Prüfen, dass die Specs normal als Zeilen angezeigt werden und **keine** Bereichs-Überschriften („Gemeinsame Eigenschaften“ / „Weitere / Einzel-Eigenschaften“) erscheinen.
- [ ] **Items ohne Specs (Edge Case):** Zwei Produkte ohne `specs` anlegen und `/vergleich?journey=<slug>` öffnen. Prüfen, dass keine leeren Spec-Bereiche gerendert werden.
- [ ] **Aufteilung in Gemeinsame vs. Einzel-Eigenschaften (Deterministischer Fallback ohne LLM):** Zwei Produkte mit teilweise überlappenden Specs anlegen (z. B. Produkt 1: `Gewicht: 15 kg`, `Akku: 625 Wh`; Produkt 2: `gewicht: 14 kg`, `Farbe: Grün`). Prüfen, dass auf `/vergleich?journey=<slug>` zwei klar beschriftete Bereiche erscheinen: **Gemeinsame Eigenschaften** (`Gewicht` — case-insensitiv zusammengeführt) und **Weitere / Einzel-Eigenschaften** (`Akku`, `Farbe`).
- [ ] **KI-Synonyme & SSE-Live-Sync (mit konfiguriertem LLM-Provider, z. B. `agy`, `remote-ai` oder `CRAWL_EXTRACT_CMD`):** Ein zweites Produkt mit synonymem Spec-Key (z. B. `Weight: 15.2 kg` vs. `Gesamtgewicht: 14.1 kg`) per Web-UI oder MCP `journey.add_item` hinzufügen, während `/vergleich?journey=<slug>` im Browser offen ist:
  - [ ] Das Speichern antwortet sofort ohne Wartezeit auf das LLM.
  - [ ] Nach Abschluss des Hintergrund-Jobs erscheint ein SSE-Toast (**„Eigenschaften abgeglichen“**) mit Button **„Neu laden“** (ohne laufende Edits still zu überschreiben).
  - [ ] Nach Klick auf **„Neu laden“** werden die vereinheitlichten Spec-Keys unter **Gemeinsame Eigenschaften** einsortiert; Originalwerte und eventuelle Freitext-Specs bleiben unverändert.
- [ ] **Stiller Fallback bei Fehler:** Ungültigen/fehlerhaften Provider setzen (z. B. `CRAWL_EXTRACT_PROVIDER=local-cmd` und `CRAWL_EXTRACT_CMD="exit 1"`). Beim Speichern von 2 Items darf im Browser keine Fehlermeldung erscheinen; die Vergleichstabelle bleibt mit der deterministischen Gruppierung nutzbar.
