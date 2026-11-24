const { test } = require('node:test');
const assert = require('node:assert/strict');

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const SERVER_PATH = '../src/web/backend/server.js';
const STORE_PATH = '../src/db/store.js';
const MCP_PATH = path.join(__dirname, '..', 'src', 'mcp', 'server.js');

const dbByBase = new Map(); // base-URL -> DB_PATH des Test-Backends

/** Startet das Backend mit isolierter SQLite-Datei auf einem freien Port. */
async function startBackend(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bike-mcp-test-'));
  for (const mod of [SERVER_PATH, STORE_PATH]) {
    delete require.cache[require.resolve(mod)];
  }
  delete process.env.FRONTEND_DIST;
  const dbPath = path.join(dir, 'app.db');
  Object.assign(process.env, {
    PORT: '0',
    DB_PATH: dbPath,
    N8N_WEBHOOK_URL: '',
  });
  const { app, closeDatabase } = require(SERVER_PATH);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  dbByBase.set(base, dbPath);
  t.after(() => {
    dbByBase.delete(base);
    server.closeAllConnections();
    server.close();
    closeDatabase();
  });
  return base;
}

/** Legt einen API-Key für `user` in der DB dieses Test-Backends an. */
function apiKey(base, user = 'anna', name = 'test-key') {
  const { openDatabase } = require(STORE_PATH);
  const store = openDatabase(dbByBase.get(base));
  try {
    return store.createApiKey(user, name).key;
  } finally {
    store.close();
  }
}

const defaultKeys = new Map();
function testKey(base, user = 'anna') {
  const mapKey = `${base}::${user}`;
  if (!defaultKeys.has(mapKey)) defaultKeys.set(mapKey, apiKey(base, user));
  return defaultKeys.get(mapKey);
}

/** Backend-GET mit Key-Auth (für Setup/Verifikation in den Tests). */
function getAuthed(base, urlPath, user = 'anna') {
  return fetch(`${base}${urlPath}`, {
    headers: { Authorization: `Bearer ${testKey(base, user)}` },
  });
}

/** Legt die Journey explizit an (der MCP legt nie still an — Setup pro Test). */
async function ensureJourneyApi(base, slug, user = 'anna') {
  const res = await fetch(`${base}/api/journeys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${testKey(base, user)}` },
    body: JSON.stringify({ slug }),
  });
  assert.ok(res.status === 201 || res.status === 409, `Setup-Create scheiterte: ${res.status}`);
}

/** Startet den MCP-Server (stdio) gegen die gegebene Basis-URL.
 * Default: mit Test-Key für User 'anna' (wie eine echte MCP-Einstellung mit
 * MCP_AUTH_TOKEN). Explizit `null` übergeben, um ganz ohne Token zu testen. */
function startMcp(t, baseUrl, token) {
  const resolved = token === undefined && dbByBase.has(baseUrl) ? testKey(baseUrl) : token;
  const env = { ...process.env, MCP_BASE_URL: baseUrl };
  delete env.MCP_AUTH_TOKEN;
  if (resolved) env.MCP_AUTH_TOKEN = resolved;
  const child = spawn(process.execPath, [MCP_PATH], {
    env,
    stdio: ['pipe', 'pipe', 'ignore'],
  });
  t.after(() => child.kill());
  child.stdout.setEncoding('utf8');
  const pending = new Map();
  let nextId = 1;
  let buffer = '';
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    let idx;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      const msg = JSON.parse(line);
      const waiter = pending.get(msg.id);
      if (waiter) {
        pending.delete(msg.id);
        waiter(msg);
      }
    }
  });
  function rpc(method, params) {
    const id = nextId++;
    return new Promise((resolve) => {
      pending.set(id, resolve);
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  }
  function notify(method, params) {
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
  }
  return { rpc, notify };
}

async function handshake(client) {
  const init = await client.rpc('initialize', {});
  assert.equal(init.result.serverInfo.name, 'bike-buying-journey');
  client.notify('notifications/initialized', {});
}

test('tools/list bietet journey.get an', async (t) => {
  const base = await startBackend(t);
  const client = startMcp(t, base);
  await handshake(client);
  const res = await client.rpc('tools/list', {});
  const tool = res.result.tools.find((x) => x.name === 'journey.get');
  assert.ok(tool, 'journey.get fehlt in tools/list');
  assert.deepEqual(tool.inputSchema.required, ['slug']);
});

test('tools/list bietet journey.add_item an', async (t) => {
  const base = await startBackend(t);
  const client = startMcp(t, base);
  await handshake(client);
  const res = await client.rpc('tools/list', {});
  const tool = res.result.tools.find((x) => x.name === 'journey.add_item');
  assert.ok(tool, 'journey.add_item fehlt in tools/list');
  assert.deepEqual(tool.inputSchema.required, ['slug', 'name']);
});

test('journey.add_item legt ein neues Produkt an', async (t) => {
  const base = await startBackend(t);
  await ensureJourneyApi(base, 'bike');
  const client = startMcp(t, base);
  await handshake(client);
  const res = await client.rpc('tools/call', {
    name: 'journey.add_item',
    arguments: {
      slug: 'bike',
      name: 'MCP Testrad',
      price: '999€',
      rating: 4,
      status: 'Shortlisted',
      specs: { weight: '15.8 kg' },
    },
  });
  assert.ok(!res.result.isError, `unerwarteter Tool-Fehler: ${JSON.stringify(res)}`);
  const out = JSON.parse(res.result.content[0].text);
  assert.equal(out.success, true);
  assert.equal(out.created, true);
  assert.equal(out.item.rating, '⭐⭐⭐⭐');
  const data = await (await getAuthed(base, '/api/data?journey=bike')).json();
  const item = data.items.find((i) => i.name === 'MCP Testrad');
  assert.ok(item, 'Item wurde nicht in der Journey gespeichert');
  assert.equal(item.price, '999€');
  assert.match(item.specs, /Weight: 15\.8 kg/);
});

test('journey.add_item aktualisiert ein vorhandenes Produkt ohne Duplikat', async (t) => {
  const base = await startBackend(t);
  await ensureJourneyApi(base, 'bike');
  const client = startMcp(t, base);
  await handshake(client);
  await client.rpc('tools/call', {
    name: 'journey.add_item',
    arguments: { slug: 'bike', name: 'Upsert-Rad', price: '1000€', specs: { weight: '16 kg' } },
  });
  const res = await client.rpc('tools/call', {
    name: 'journey.add_item',
    arguments: { slug: 'BIKE', name: 'upsert-rad', price: '1200€', specs: { frame: 'Alu' } },
  });
  assert.ok(!res.result.isError, `unerwarteter Tool-Fehler: ${JSON.stringify(res)}`);
  const out = JSON.parse(res.result.content[0].text);
  assert.equal(out.created, false);
  const data = await (await getAuthed(base, '/api/data?journey=bike')).json();
  const matches = data.items.filter((i) => i.name.toLowerCase() === 'upsert-rad');
  assert.equal(matches.length, 1, 'Upsert hat ein Duplikat angelegt');
  assert.equal(matches[0].price, '1200€');
  assert.match(matches[0].specs, /Weight: 16 kg/);
  assert.match(matches[0].specs, /Frame: Alu/);
});

test('journey.add_item ohne Name gibt Invalid-Params-Fehler', async (t) => {
  const base = await startBackend(t);
  const client = startMcp(t, base);
  await handshake(client);
  const res = await client.rpc('tools/call', {
    name: 'journey.add_item',
    arguments: { slug: 'bike', price: '100€' },
  });
  assert.equal(res.error.code, -32602);
});

test('journey.add_item mit ungültigem Status gibt Invalid-Params-Fehler', async (t) => {
  const base = await startBackend(t);
  const client = startMcp(t, base);
  await handshake(client);
  const res = await client.rpc('tools/call', {
    name: 'journey.add_item',
    arguments: { slug: 'bike', name: 'Status-Rad', status: 'Maybe' },
  });
  assert.equal(res.error.code, -32602);
});

test('journey.add_item in unbekannter Journey legt nichts an', async (t) => {
  const base = await startBackend(t);
  const before = await (await getAuthed(base, '/api/journeys')).json();
  const client = startMcp(t, base);
  await handshake(client);
  const res = await client.rpc('tools/call', {
    name: 'journey.add_item',
    arguments: { slug: 'gibt-es-nicht', name: 'Geisterrad' },
  });
  assert.equal(res.result.isError, true);
  assert.match(res.result.content[0].text, /Unbekannte Journey/);
  const after = await (await getAuthed(base, '/api/journeys')).json();
  assert.deepEqual(after, before);
});

test('tools/list enthält keine entfernten Crawl-Tools mehr (MCP-Client-First)', async (t) => {
  const base = await startBackend(t);
  const client = startMcp(t, base);
  await handshake(client);
  const res = await client.rpc('tools/list', {});
  const names = res.result.tools.map((x) => x.name);
  assert.ok(!names.includes('journey.crawl_link'), 'journey.crawl_link darf nicht mehr existieren');
  assert.ok(!names.includes('journey.create_from_link'), 'journey.create_from_link darf nicht mehr existieren');
  for (const removed of ['journey.crawl_link', 'journey.create_from_link']) {
    const call = await client.rpc('tools/call', { name: removed, arguments: { link: 'https://example.com' } });
    assert.equal(call.error.code, -32602);
  }
});

test('journey.get liefert das komplette bike-Dokument', async (t) => {
  const base = await startBackend(t);
  await ensureJourneyApi(base, 'bike');
  const client = startMcp(t, base);
  await handshake(client);
  const res = await client.rpc('tools/call', { name: 'journey.get', arguments: { slug: 'bike' } });
  assert.ok(!res.result.isError, `unerwarteter Tool-Fehler: ${JSON.stringify(res)}`);
  const doc = JSON.parse(res.result.content[0].text);
  assert.equal(doc.slug, 'bike');
  for (const key of ['phase', 'budget', 'targetDate']) {
    assert.ok(key in doc.status, `status.${key} fehlt`);
  }
  for (const key of ['journey', 'items', 'specs', 'generalNotes', 'headers', 'sectionTitle', 'listTitle']) {
    assert.ok(key in doc, `${key} fehlt im Dokument`);
  }
  assert.ok('feedback' in doc, 'feedback fehlt im Dokument');
  assert.ok(doc.config && typeof doc.config === 'object', 'config fehlt im Dokument');
  for (const key of ['slug', 'name', 'description', 'category', 'currency', 'sectionTitle', 'listTitle']) {
    assert.ok(key in doc.config, `config.${key} fehlt`);
  }
  assert.equal(doc.config.slug, 'bike');
});

test('journey.get spiegelt die aktuelle Config (Basis-Eigenschaften)', async (t) => {
  const base = await startBackend(t);
  const put = await fetch(`${base}/api/journey-config?journey=bike`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${testKey(base)}` },
    body: JSON.stringify({ name: 'MCP-Bike', category: 'fahrrad', currency: '€' }),
  });
  assert.equal(put.status, 200);
  const client = startMcp(t, base);
  await handshake(client);
  const res = await client.rpc('tools/call', { name: 'journey.get', arguments: { slug: 'bike' } });
  assert.ok(!res.result.isError, `unerwarteter Tool-Fehler: ${JSON.stringify(res)}`);
  const doc = JSON.parse(res.result.content[0].text);
  assert.equal(doc.config.name, 'MCP-Bike');
  assert.equal(doc.config.category, 'fahrrad');
  assert.equal(doc.config.currency, '€');
});

test('unbekannter Slug gibt definierten Fehler und legt nichts an', async (t) => {
  const base = await startBackend(t);
  const before = await (await getAuthed(base, '/api/journeys')).json();
  const client = startMcp(t, base);
  await handshake(client);
  const res = await client.rpc('tools/call', {
    name: 'journey.get',
    arguments: { slug: 'gibt-es-nicht' },
  });
  assert.equal(res.result.isError, true);
  assert.match(res.result.content[0].text, /Unbekannte Journey/);
  const after = await (await getAuthed(base, '/api/journeys')).json();
  assert.deepEqual(after, before);
});

test('leerer Slug gibt Invalid-Params-Fehler', async (t) => {
  const base = await startBackend(t);
  const client = startMcp(t, base);
  await handshake(client);
  const res = await client.rpc('tools/call', { name: 'journey.get', arguments: { slug: '   ' } });
  assert.equal(res.error.code, -32602);
});

test('unerreichbares Backend gibt definierten Tool-Fehler', async (t) => {
  const client = startMcp(t, 'http://127.0.0.1:1');
  await handshake(client);
  const res = await client.rpc('tools/call', { name: 'journey.get', arguments: { slug: 'bike' } });
  assert.equal(res.result.isError, true);
  assert.match(res.result.content[0].text, /nicht erreichbar/);
});

test('GET /api/mcp-status liefert Server-Info und Tool-Liste (für die /mcp-Seite)', async (t) => {
  const base = await startBackend(t);
  const res = await fetch(`${base}/api/mcp-status`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.server, { name: 'bike-buying-journey', version: '1.0.0' });
  assert.equal(body.protocolVersion, '2024-11-05');
  assert.deepEqual(
    body.tools.map((tool) => tool.name),
    [
      'journey.help',
      'journey.list',
      'journey.create',
      'journey.update_config',
      'journey.delete',
      'journey.get',
      'journey.add_item',
      'journey.delete_item',
      'journey.update_meta',
      'journey.add_log',
      'journey.delete_log',
      'journey.set_spec',
      'journey.delete_spec',
      'journey.set_feedback',
    ]
  );
  for (const tool of body.tools) {
    assert.ok(tool.description && tool.description.length > 0, `${tool.name} ohne Beschreibung`);
    assert.ok(tool.inputSchema && typeof tool.inputSchema === 'object', `${tool.name} ohne inputSchema`);
    assert.equal(tool.inputSchema.type, 'object');
    assert.ok(Array.isArray(tool.inputSchema.required), `${tool.name} ohne inputSchema.required-Array`);
  }
  assert.ok(
    typeof body.serverFile === 'string' &&
      body.serverFile.endsWith(path.join('src', 'mcp', 'server.js')),
    `serverFile zeigt nicht auf src/mcp/server.js: ${body.serverFile}`
  );
  assert.equal(typeof body.port, 'number');
  const expectedPort = Number(process.env.PORT);
  assert.equal(body.port, expectedPort);
  const expectedBase = process.env.MCP_BASE_URL || `http://localhost:${body.port}`;
  assert.equal(body.baseUrl, expectedBase);
});

test('GET /api/mcp-status spiegelt tools/list des MCP-Servers', async (t) => {
  const base = await startBackend(t);
  const status = await (await fetch(`${base}/api/mcp-status`)).json();
  const client = startMcp(t, base);
  await handshake(client);
  const listed = await client.rpc('tools/list', {});
  assert.deepEqual(
    listed.result.tools.map((tool) => tool.name).sort(),
    status.tools.map((tool) => tool.name).sort()
  );
  for (const tool of listed.result.tools) {
    const mirrored = status.tools.find((x) => x.name === tool.name);
    assert.ok(mirrored, `${tool.name} fehlt in /api/mcp-status`);
    assert.equal(mirrored.description, tool.description);
    assert.deepEqual(mirrored.inputSchema, tool.inputSchema);
  }
});

test('ohne MCP_AUTH_TOKEN meldet der MCP einen Auth-Hinweis statt Daten', async (t) => {
  const base = await startBackend(t);
  const client = startMcp(t, base, null);
  await handshake(client);
  const get = await client.rpc('tools/call', {
    name: 'journey.get',
    arguments: { slug: 'bike' },
  });
  assert.equal(get.result.isError, true);
  assert.match(get.result.content[0].text, /MCP_AUTH_TOKEN/);
  const add = await client.rpc('tools/call', {
    name: 'journey.add_item',
    arguments: { slug: 'bike', name: 'Geisterrad' },
  });
  assert.equal(add.result.isError, true);
  assert.match(add.result.content[0].text, /MCP_AUTH_TOKEN/);
});

test('MCP arbeitet pro Key nur im eigenen Namensraum (Cross-User-Trennung)', async (t) => {
  const base = await startBackend(t);
  await ensureJourneyApi(base, 'bike', 'anna');
  const anna = startMcp(t, base, testKey(base, 'anna'));
  await handshake(anna);
  const added = await anna.rpc('tools/call', {
    name: 'journey.add_item',
    arguments: { slug: 'bike', name: 'Annas Rad', price: '999€' },
  });
  assert.ok(!added.result.isError, `unerwarteter Tool-Fehler: ${JSON.stringify(added)}`);

  // Bennis Key sieht Annas Journey nicht — für ihn ist der Slug unbekannt.
  const benni = startMcp(t, base, testKey(base, 'benni'));
  await handshake(benni);
  const get = await benni.rpc('tools/call', {
    name: 'journey.get',
    arguments: { slug: 'bike' },
  });
  assert.equal(get.result.isError, true);
  assert.match(get.result.content[0].text, /Unbekannte Journey/);

  // Bennis Schreiben auf denselben Slug legt eine getrennte Journey an.
  await ensureJourneyApi(base, 'bike', 'benni');
  const addedBenni = await benni.rpc('tools/call', {
    name: 'journey.add_item',
    arguments: { slug: 'bike', name: 'Bennis Rad' },
  });
  assert.ok(!addedBenni.result.isError, `unerwarteter Tool-Fehler: ${JSON.stringify(addedBenni)}`);
  const dataAnna = await (await getAuthed(base, '/api/data?journey=bike', 'anna')).json();
  assert.deepEqual(dataAnna.items.map((i) => i.name), ['Annas Rad']);
  const dataBenni = await (await getAuthed(base, '/api/data?journey=bike', 'benni')).json();
  assert.deepEqual(dataBenni.items.map((i) => i.name), ['Bennis Rad']);
});

test('Standalone-Paket packages/mcp/bin/journey-path-mcp.js startet und beantwortet initialize', async (t) => {
  const base = await startBackend(t);
  const pkgBin = path.join(__dirname, '..', 'packages', 'mcp', 'bin', 'journey-path-mcp.js');
  const child = spawn(process.execPath, [pkgBin], {
    env: { ...process.env, MCP_BASE_URL: base, MCP_AUTH_TOKEN: testKey(base) },
    stdio: ['pipe', 'pipe', 'ignore'],
  });
  t.after(() => child.kill());
  child.stdout.setEncoding('utf8');
  let line = '';
  const initPromise = new Promise((resolve) => {
    child.stdout.on('data', (chunk) => {
      line += chunk;
      if (line.includes('\n')) {
        resolve(JSON.parse(line.trim()));
      }
    });
  });
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }) + '\n');
  const initRes = await initPromise;
  assert.equal(initRes.result.serverInfo.name, 'bike-buying-journey');
  assert.equal(initRes.result.protocolVersion, '2024-11-05');
});

test('journey.help liefert Workflows, Enums, Konventionen und vollständige Tool-Übersicht', async (t) => {
  const base = await startBackend(t);
  const client = startMcp(t, base);
  await handshake(client);
  const res = await client.rpc('tools/call', { name: 'journey.help', arguments: {} });
  assert.ok(!res.result.isError);
  const help = JSON.parse(res.result.content[0].text);
  assert.ok(Array.isArray(help.workflows) && help.workflows.length > 0);
  assert.ok(help.enums.itemStatuses.includes('Shortlisted'));
  assert.ok(help.enums.journeyPhases.includes('Comparing'));
  assert.ok(help.conventions && typeof help.conventions.specs === 'string');
  assert.ok(help.tools.some((tool) => tool.name === 'journey.help'));
  assert.ok(help.tools.some((tool) => tool.name === 'journey.delete_item'));
});

test('journey.list, journey.create, journey.update_config und journey.delete verwalten Journeys vollständig', async (t) => {
  const base = await startBackend(t);
  const client = startMcp(t, base);
  await handshake(client);

  const emptyList = await client.rpc('tools/call', { name: 'journey.list', arguments: {} });
  assert.equal(JSON.parse(emptyList.result.content[0].text).count, 0);

  const created = await client.rpc('tools/call', {
    name: 'journey.create',
    arguments: {
      slug: 'Laptop',
      name: 'Arbeits-Laptop',
      category: 'laptop',
      budget: '2000€',
      phase: 'Researching',
    },
  });
  assert.ok(!created.result.isError, `Create-Fehler: ${JSON.stringify(created)}`);
  assert.equal(JSON.parse(created.result.content[0].text).slug, 'laptop');

  const dup = await client.rpc('tools/call', {
    name: 'journey.create',
    arguments: { slug: 'laptop' },
  });
  assert.equal(dup.result.isError, true);
  assert.match(dup.result.content[0].text, /existiert bereits/);

  const listed = await client.rpc('tools/call', { name: 'journey.list', arguments: {} });
  const listOut = JSON.parse(listed.result.content[0].text);
  assert.equal(listOut.count, 1);
  assert.equal(listOut.journeys[0].name, 'Arbeits-Laptop');

  const updated = await client.rpc('tools/call', {
    name: 'journey.update_config',
    arguments: { slug: 'laptop', name: 'Ultrabook 2026', currency: 'CHF' },
  });
  assert.ok(!updated.result.isError);
  assert.equal(JSON.parse(updated.result.content[0].text).config.name, 'Ultrabook 2026');

  const unknownCfg = await client.rpc('tools/call', {
    name: 'journey.update_config',
    arguments: { slug: 'unbekannt', name: 'Nope' },
  });
  assert.equal(unknownCfg.result.isError, true);
  assert.match(unknownCfg.result.content[0].text, /Unbekannte Journey/);

  const deleted = await client.rpc('tools/call', {
    name: 'journey.delete',
    arguments: { slug: 'laptop' },
  });
  assert.ok(!deleted.result.isError);
  assert.equal(JSON.parse(deleted.result.content[0].text).deleted, true);

  const delMissing = await client.rpc('tools/call', {
    name: 'journey.delete',
    arguments: { slug: 'laptop' },
  });
  assert.equal(delMissing.result.isError, true);
  assert.match(delMissing.result.content[0].text, /Unbekannte Journey/);
});

test('journey.delete_item, update_meta, add_log/delete_log, set_spec/delete_spec und set_feedback funktionieren end-to-end', async (t) => {
  const base = await startBackend(t);
  await ensureJourneyApi(base, 'bike');
  const client = startMcp(t, base);
  await handshake(client);

  // Meta-Update (Phase, Budget, Zieldatum, Notizen)
  const meta = await client.rpc('tools/call', {
    name: 'journey.update_meta',
    arguments: {
      slug: 'bike',
      phase: 'Comparing',
      budget: '3000€',
      targetDate: '2026-09-01',
      generalNotes: '- Carbon oder Alu?',
    },
  });
  assert.ok(!meta.result.isError);
  const badPhase = await client.rpc('tools/call', {
    name: 'journey.update_meta',
    arguments: { slug: 'bike', phase: 'Ungueltig' },
  });
  assert.equal(badPhase.error.code, -32602);

  // Item anlegen und per journey.delete_item wieder entfernen
  await client.rpc('tools/call', {
    name: 'journey.add_item',
    arguments: { slug: 'bike', name: 'Canyon Grizl', price: '1999€' },
  });
  const delItem = await client.rpc('tools/call', {
    name: 'journey.delete_item',
    arguments: { slug: 'bike', name: 'canyon grizl' },
  });
  assert.ok(!delItem.result.isError);
  assert.equal(JSON.parse(delItem.result.content[0].text).deleted, 'Canyon Grizl');
  const delMissingItem = await client.rpc('tools/call', {
    name: 'journey.delete_item',
    arguments: { slug: 'bike', name: 'Unbekanntes Rad' },
  });
  assert.equal(delMissingItem.result.isError, true);

  // Reisetagebuch: zwei Einträge anlegen (absteigend sortiert), dann einen löschen
  await client.rpc('tools/call', {
    name: 'journey.add_log',
    arguments: { slug: 'bike', date: '2026-06-01', event: 'Erste Recherche' },
  });
  await client.rpc('tools/call', {
    name: 'journey.add_log',
    arguments: { slug: 'bike', date: '2026-06-15', event: 'Probefahrt beim Händler' },
  });
  const delLog = await client.rpc('tools/call', {
    name: 'journey.delete_log',
    arguments: { slug: 'bike', index: 1 },
  });
  assert.ok(!delLog.result.isError);
  assert.equal(JSON.parse(delLog.result.content[0].text).deleted.event, 'Erste Recherche');

  // Journey-weite Specs (/eigenschaften): setzen, upserten, löschen
  const specAdd = await client.rpc('tools/call', {
    name: 'journey.set_spec',
    arguments: { slug: 'bike', label: 'Rahmengröße', value: 'M' },
  });
  assert.equal(JSON.parse(specAdd.result.content[0].text).created, true);
  const specUpd = await client.rpc('tools/call', {
    name: 'journey.set_spec',
    arguments: { slug: 'bike', label: 'rahmengröße', value: 'L' },
  });
  assert.equal(JSON.parse(specUpd.result.content[0].text).created, false);
  await client.rpc('tools/call', {
    name: 'journey.set_spec',
    arguments: { slug: 'bike', label: 'Einsatzzweck', value: 'Gravel' },
  });
  const specDel = await client.rpc('tools/call', {
    name: 'journey.delete_spec',
    arguments: { slug: 'bike', label: 'einsatzzweck' },
  });
  assert.ok(!specDel.result.isError);

  // Feedback schreiben + unbekannten Slug ablehnen
  const fb = await client.rpc('tools/call', {
    name: 'journey.set_feedback',
    arguments: { slug: 'bike', content: '## Fazit\nTop Auswahl.' },
  });
  assert.ok(!fb.result.isError);
  const fbUnknown = await client.rpc('tools/call', {
    name: 'journey.set_feedback',
    arguments: { slug: 'unbekannt', content: 'Text' },
  });
  assert.equal(fbUnknown.result.isError, true);

  // Komplettes Dokument gegenprüfen
  const docRes = await client.rpc('tools/call', { name: 'journey.get', arguments: { slug: 'bike' } });
  const doc = JSON.parse(docRes.result.content[0].text);
  assert.equal(doc.status.phase, 'Comparing');
  assert.equal(doc.status.budget, '3000€');
  assert.equal(doc.generalNotes, '- Carbon oder Alu?');
  assert.deepEqual(doc.items, []);
  assert.deepEqual(doc.journey, [{ date: '2026-06-15', event: 'Probefahrt beim Händler' }]);
  assert.deepEqual(doc.specs, [{ label: 'Rahmengröße', value: 'L' }]);
  assert.equal(doc.feedback, '## Fazit\nTop Auswahl.');
});
