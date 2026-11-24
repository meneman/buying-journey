# Manuelle Tests — MCP-Client-First bereinigen (2026-11-24)

Bitte `npm run dev` selbst starten (Backend auf Port `3000`, Vite-Dev-Server auf Port `3300`, `/api`-Aufrufe werden proxied).
Danach im Browser anmelden und die folgenden Punkte prüfen:

## `/mcp`-Seite (http://localhost:3300/mcp)

- [ ] Unter „4. Server-Status & Verfügbare Tools“ ist der Status grün (`Backend erreichbar`).
- [ ] In der Tool-Liste erscheinen ausschließlich die 14 verbleibenden Tools (`journey.help`, `journey.list`, `journey.create`, `journey.update_config`, `journey.delete`, `journey.get`, `journey.add_item`, `journey.delete_item`, `journey.update_meta`, `journey.add_log`, `journey.delete_log`, `journey.set_spec`, `journey.delete_spec`, `journey.set_feedback`).
- [ ] Die entfernten Crawl-Tools `journey.crawl_link` und `journey.create_from_link` tauchen nirgends mehr in der Tool-Liste auf.

## Bestehende Daten & Produktkarten (`/` bzw. `/?journey=<slug>`)

- [ ] Bestehende Kaufreisen aus `data/app.db` laden ohne Fehler im Dashboard (`/?journey=bike` o. ä.) und in der Vergleichsansicht (`/vergleich`).
- [ ] Produktkarten rendern normal (ohne `needsContent`-Sonderzustand oder Fehlermeldungen in der Browser-Konsole).
