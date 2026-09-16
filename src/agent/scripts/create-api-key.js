#!/usr/bin/env node
// API-Key-Verwaltung für die MCP-Auth (ein Key = ein User).
//
// Der Key reist als Bearer-Token mit jedem Backend-Call (MCP-Einstellung
// `MCP_AUTH_TOKEN`) — der MCP arbeitet damit ausschließlich im Namensraum
// dieses Users. In der DB liegt nur der SHA-256-Hash; der Klartext erscheint
// genau einmal bei der Erzeugung. Es muss kein Server laufen — das Skript
// schreibt direkt in die SQLite-DB (data/app.db, via DB_PATH umleitbar).
//
// Erzeugen (druckt den Key EINMAL — sofort in die MCP-Einstellungen übernehmen):
//   node src/agent/scripts/create-api-key.js --user jakob --name "Muse MCP"
//
// Auflisten (ohne Klartext):
//   node src/agent/scripts/create-api-key.js --list --user jakob
//
// Widerrufen:
//   node src/agent/scripts/create-api-key.js --revoke 3 --user jakob
const { openDatabase } = require('../../db/store.js');

const args = process.argv.slice(2);
const params = {};
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    const key = args[i].slice(2);
    let val = true;
    if (args[i + 1] && !args[i + 1].startsWith('--')) {
      val = args[i + 1];
      i++;
    }
    params[key] = val;
  }
}

const user = typeof params.user === 'string' ? params.user.trim() : '';

if (!user) {
  console.error('❌ Fehler: Parameter --user ist erforderlich (User-ID, z.B. --user jakob).');
  process.exit(1);
}

function main() {
  const store = openDatabase();
  try {
    if (params.list !== undefined) {
      const keys = store.listApiKeys(user);
      if (keys.length === 0) {
        console.log(`Keine aktiven API-Keys für User "${user}".`);
      } else {
        console.log(`Aktive API-Keys für User "${user}":`);
        for (const k of keys) {
          console.log(`  #${k.id}  ${k.name || '(ohne Name)'}  erstellt: ${k.created_at}  zuletzt: ${k.last_used || 'nie'}`);
        }
      }
      return;
    }
    if (params.revoke !== undefined) {
      const id = Number(params.revoke);
      if (!Number.isInteger(id) || id < 1) {
        console.error('❌ Fehler: --revoke benötigt eine Key-ID (siehe --list).');
        process.exit(1);
      }
      if (store.revokeApiKey(user, id)) {
        console.log(`✅ API-Key #${id} von User "${user}" widerrufen.`);
      } else {
        console.error(`❌ Fehler: Key #${id} bei User "${user}" nicht gefunden.`);
        process.exit(1);
      }
      return;
    }
    const name = typeof params.name === 'string' ? params.name : '';
    const created = store.createApiKey(user, name);
    console.log(`✅ API-Key #${created.id} für User "${created.userId}" erzeugt.`);
    console.log('');
    console.log('Klartext (EINMALIG — jetzt in die MCP-Einstellungen übernehmen):');
    console.log(`  ${created.key}`);
    console.log('');
    console.log('MCP-Einstellung (~/.config/muse/settings.json → mcpServers → env):');
    console.log(`  "MCP_AUTH_TOKEN": "${created.key}"`);
  } finally {
    store.close();
  }
}

try {
  main();
} catch (error) {
  console.error('❌ Fehler:', error.message);
  process.exit(1);
}
