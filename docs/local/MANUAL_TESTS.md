# Manuelle Browser-Verifikation: Doku, Skill & Naming auf MCP-First angleichen

**Datum:** 2026-11-24

> Hinweis: Vor dem Testen den Dev-Stack selbst starten (`npm run dev` — Backend auf Port `3000`, Vite-Dev-Server auf Port `1337`), dann `http://localhost:1337` im Browser öffnen (`/api`-Calls werden per Proxy ans Backend geleitet).

## Checkliste (`/mcp` & Naming-Bereinigung)

- [ ] **Login-Gate für `/mcp`:** Ausgeloggt im Header auf den Button **MCP** klicken — die App leitet direkt auf `/login` weiter (kein ungeschützter Zugriff auf `/mcp`).
- [ ] **Standard-Modus auf `/mcp` (`Lokal (Node · Empfohlen)`):** Eingeloggt `/mcp` öffnen. Prüfen, dass im Schritt **„KI-Client konfigurieren“** standardmäßig **„Lokal (Node · Empfohlen)“** aktiv ist und die Snippets für **Claude Desktop**, **Cursor IDE** und **Shell / CLI** auf `node` mit dem Pfad zu `src/mcp/server.js` zeigen (Umschalten auf `npx (Paket)` wechselt auf `npx -y @journey-path/mcp`).
- [ ] **Muse-Servername ohne `bike`-Altlast:** Im Tab **„Muse“** prüfen, dass der Konfigurations-Key unter `mcpServers` jetzt **`"journey-path"`** heißt (nicht mehr `"bike-buying-journey"`).
- [ ] **Server-Status & Tool-Explorer auf `/mcp`:** In Schritt 4 („Server-Status & Verfügbare Tools“) auf **„Status prüfen“** klicken:
  - [ ] Status zeigt grün **`journey-path v1.0.0`** (Protokoll `2024-11-05`) an.
  - [ ] Die Tool-Liste zeigt alle 14 aktuellen MCP-Tools (inkl. `journey.help`, `journey.list`, `journey.create`, `journey.delete_item` usw.) und **keine** entfernten Crawl-Tools (`journey.crawl_link` / `journey.create_from_link`).
- [ ] **Keine In-App-Crawl-Relikte:** Auf Dashboard (`/?journey=bike`) und Vergleich (`/vergleich?journey=bike`) prüfen, dass ausschließlich die manuellen Formulare/Dialoge („Eintrag hinzufügen“ / „Neue Kaufreise“) sichtbar sind.
