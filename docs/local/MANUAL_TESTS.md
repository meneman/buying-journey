# Manuelle Tests — MCP-Server Voll-CRUD & `journey.help` (2026-11-24)

Bitte `npm run dev` selbst starten (Backend auf Port `3000`, Vite-Dev-Server auf Port `3300`, `/api`-Aufrufe werden proxied).
Danach http://localhost:3300/mcp im Browser öffnen (vorher einloggen).

## `/mcp`-Seite (Tool-Explorer & Beispiel-Prompts)

- [ ] Unter „4. Server-Status & Verfügbare Tools“ ist der Status grün (`Backend erreichbar`).
- [ ] In der Tool-Liste erscheinen alle neuen CRUD-Tools plus `journey.help` (`journey.help`, `journey.list`, `journey.create`, `journey.update_config`, `journey.delete`, `journey.get`, `journey.add_item`, `journey.delete_item`, `journey.update_meta`, `journey.add_log`, `journey.delete_log`, `journey.set_spec`, `journey.delete_spec`, `journey.set_feedback`) mit Beschreibung und Pflichtparametern.
- [ ] Bei `journey.help` und `journey.list` wird kein leeres Pflichtparameter-Badge angezeigt (`required: []`).
- [ ] Unter „3. Prompts für deinen KI-Assistenten“ zeigen die 3 Karten die aktualisierten Beispiel-Prompts (inkl. `journey.help`, Auflisten/Anlegen und Status-/Tagebuch-Update) und lassen sich per „Prompt kopieren“ in die Zwischenablage kopieren.
