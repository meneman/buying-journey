const { test } = require('node:test');
const assert = require('node:assert/strict');

const fs = require('node:fs');
const http = require('node:http');
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

const LLM_STUB_PATH = path.join(__dirname, 'helpers', 'llm-stub.js');
const LLM_ENV_KEYS = ['CRAWL_EXTRACT_PROVIDER', 'CRAWL_EXTRACT_CMD', 'N8N_WEBHOOK_URL', 'LLM_STUB_LOG'];

/**
 * Schaltet die Backend-KI auf den deterministischen Stub um (local-cmd).
 * Rückgabe: `calls()` liefert die Anfragen, die der Stub gesehen hat — damit
 * lässt sich prüfen, was die Pipeline dem "LLM" schickt (z.B. der
 * Journey-Kontext der Extraktion).
 */
function useLlmStub(t) {
  const snap = Object.fromEntries(LLM_ENV_KEYS.map((k) => [k, process.env[k]]));
  const logPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bike-llm-stub-')), 'calls.jsonl');
  process.env.CRAWL_EXTRACT_PROVIDER = 'local-cmd';
  process.env.CRAWL_EXTRACT_CMD = `node "${LLM_STUB_PATH}"`;
  process.env.LLM_STUB_LOG = logPath;
  delete process.env.N8N_WEBHOOK_URL;
  t.after(() => {
    for (const k of LLM_ENV_KEYS) {
      if (snap[k] === undefined) delete process.env[k];
      else process.env[k] = snap[k];
    }
  });
  return {
    calls() {
      if (!fs.existsSync(logPath)) return [];
      return fs
        .readFileSync(logPath, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    },
  };
}

const PRODUCT_HTML = `<!doctype html><html><head><title>MCP Testrad Pro</title></head><body><h1>MCP Testrad Pro</h1><p>Preis: 1299€</p><p>Rahmen: Aluminium, Gewicht: 14.2 kg</p></body></html>`;

const TESLA_HTML = `<!doctype html><html><head><title>Tesla Model 3 Highland</title></head><body><h1>Tesla Model 3</h1><p>Preis: 42990€</p><p>Reichweite (WLTP): 513 km, Akku: 60 kWh, Leistung: 283 PS</p></body></html>`;

/** Startet einen statischen HTTP-Server mit einer Produktseite für Crawl-Tests. */
async function startStaticServer(t, html = PRODUCT_HTML) {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  return `http://127.0.0.1:${server.address().port}/produkt`;
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

test('tools/list bietet journey.crawl_link an', async (t) => {
  const base = await startBackend(t);
  const client = startMcp(t, base);
  await handshake(client);
  const res = await client.rpc('tools/list', {});
  const tool = res.result.tools.find((x) => x.name === 'journey.crawl_link');
  assert.ok(tool, 'journey.crawl_link fehlt in tools/list');
  assert.deepEqual(tool.inputSchema.required, ['link']);
});

test('journey.crawl_link liefert Titel und Text einer Produktseite', async (t) => {
  const base = await startBackend(t);
  const pageUrl = await startStaticServer(t);
  const client = startMcp(t, base);
  await handshake(client);
  const res = await client.rpc('tools/call', {
    name: 'journey.crawl_link',
    arguments: { link: pageUrl },
  });
  assert.ok(!res.result.isError, `unerwarteter Tool-Fehler: ${JSON.stringify(res)}`);
  const out = JSON.parse(res.result.content[0].text);
  assert.equal(out.url, pageUrl);
  assert.equal(out.title, 'MCP Testrad Pro');
  assert.match(out.text, /1299€/);
  assert.match(out.text, /14\.2 kg/);
  assert.equal(out.truncated, false);
});

test('journey.crawl_link kürzt langen Text mit truncated-Flag', async (t) => {
  const base = await startBackend(t);
  const pageUrl = await startStaticServer(t);
  const client = startMcp(t, base);
  await handshake(client);
  const res = await client.rpc('tools/call', {
    name: 'journey.crawl_link',
    arguments: { link: pageUrl, maxChars: 10 },
  });
  assert.ok(!res.result.isError, `unerwarteter Tool-Fehler: ${JSON.stringify(res)}`);
  const out = JSON.parse(res.result.content[0].text);
  assert.equal(out.truncated, true);
  assert.ok(out.text.length <= 10, `Text wurde nicht gekürzt: ${out.text.length} Zeichen`);
});

test('journey.crawl_link ohne Link gibt Invalid-Params-Fehler', async (t) => {
  const base = await startBackend(t);
  const client = startMcp(t, base);
  await handshake(client);
  const res = await client.rpc('tools/call', {
    name: 'journey.crawl_link',
    arguments: { link: '   ' },
  });
  assert.equal(res.error.code, -32602);
});

test('journey.crawl_link mit Nicht-http-URL gibt Invalid-Params-Fehler', async (t) => {
  const base = await startBackend(t);
  const client = startMcp(t, base);
  await handshake(client);
  const res = await client.rpc('tools/call', {
    name: 'journey.crawl_link',
    arguments: { link: 'ftp://example.com/produkt' },
  });
  assert.equal(res.error.code, -32602);
});

test('journey.crawl_link auf unerreichbaren Host gibt definierten Tool-Fehler', async (t) => {
  const base = await startBackend(t);
  const client = startMcp(t, base);
  await handshake(client);
  const res = await client.rpc('tools/call', {
    name: 'journey.crawl_link',
    arguments: { link: 'http://127.0.0.1:1/produkt' },
  });
  assert.equal(res.result.isError, true);
  assert.match(res.result.content[0].text, /konnte nicht geladen werden/);
});

test('Link-Flow: crawl_link und add_item speichern ein Element mit URL', async (t) => {
  const base = await startBackend(t);
  const pageUrl = await startStaticServer(t);
  await ensureJourneyApi(base, 'bike');
  const client = startMcp(t, base);
  await handshake(client);
  const crawl = await client.rpc('tools/call', {
    name: 'journey.crawl_link',
    arguments: { link: pageUrl },
  });
  assert.ok(!crawl.result.isError, `Crawl-Fehler: ${JSON.stringify(crawl)}`);
  const crawled = JSON.parse(crawl.result.content[0].text);
  const add = await client.rpc('tools/call', {
    name: 'journey.add_item',
    arguments: {
      slug: 'bike',
      name: crawled.title,
      price: '1299€',
      status: 'Thinking',
      link: crawled.url,
      specs: { Gewicht: '14.2 kg' },
    },
  });
  assert.ok(!add.result.isError, `Add-Fehler: ${JSON.stringify(add)}`);
  assert.equal(JSON.parse(add.result.content[0].text).created, true);
  const data = await (await getAuthed(base, '/api/data?journey=bike')).json();
  const item = data.items.find((i) => i.name === 'MCP Testrad Pro');
  assert.ok(item, 'gecrawltes Item wurde nicht gespeichert');
  assert.equal(item.link, pageUrl);
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
    ['journey.get', 'journey.add_item', 'journey.crawl_link', 'journey.create_from_link']
  );
  for (const tool of body.tools) {
    assert.ok(tool.description && tool.description.length > 0, `${tool.name} ohne Beschreibung`);
    assert.ok(tool.inputSchema && typeof tool.inputSchema === 'object', `${tool.name} ohne inputSchema`);
    assert.equal(tool.inputSchema.type, 'object');
    assert.ok(
      Array.isArray(tool.inputSchema.required) && tool.inputSchema.required.length > 0,
      `${tool.name} ohne inputSchema.required`
    );
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

test('tools/list bietet journey.create_from_link an', async (t) => {
  const base = await startBackend(t);
  const client = startMcp(t, base);
  await handshake(client);
  const res = await client.rpc('tools/list', {});
  const tool = res.result.tools.find((x) => x.name === 'journey.create_from_link');
  assert.ok(tool, 'journey.create_from_link fehlt in tools/list');
  assert.deepEqual(tool.inputSchema.required, ['link']);
  assert.ok(tool.inputSchema.properties.slug, 'optionales "slug" fehlt im Schema');
});

test('journey.create_from_link legt Journey mit KI-extrahiertem Erstprodukt an', async (t) => {
  useLlmStub(t);
  const base = await startBackend(t);
  const pageUrl = await startStaticServer(t);
  const before = await (await getAuthed(base, '/api/journeys')).json();
  assert.ok(!before.includes('schraenke'));
  const client = startMcp(t, base);
  await handshake(client);
  const res = await client.rpc('tools/call', {
    name: 'journey.create_from_link',
    arguments: { slug: 'Schraenke', link: pageUrl },
  });
  assert.ok(!res.result.isError, `unerwarteter Tool-Fehler: ${JSON.stringify(res)}`);
  const out = JSON.parse(res.result.content[0].text);
  assert.equal(out.success, true);
  assert.equal(out.slug, 'schraenke');
  assert.equal(out.created, true);
  assert.equal(out.slugSource, 'explicit');
  assert.equal(out.ai.extraction, 'local-cmd');
  assert.equal(out.item.link, pageUrl);
  assert.equal(out.item.name, 'MCP Testrad Pro');
  assert.equal(out.item.price, '1299€');
  assert.match(out.item.specs, /Rahmen: Aluminium/);
  const after = await (await getAuthed(base, '/api/journeys')).json();
  assert.ok(after.includes('schraenke'), 'Journey wurde nicht angelegt');
  const data = await (await getAuthed(base, '/api/data?journey=schraenke')).json();
  assert.equal(data.items.length, 1);
  assert.equal(data.items[0].link, pageUrl);
});

test('journey.create_from_link mit existierendem Slug legt nichts an', async (t) => {
  const base = await startBackend(t);
  const pageUrl = await startStaticServer(t);
  await ensureJourneyApi(base, 'bike');
  const before = await (await getAuthed(base, '/api/journeys')).json();
  const dataBefore = await (await getAuthed(base, '/api/data?journey=bike')).json();
  const client = startMcp(t, base);
  await handshake(client);
  const res = await client.rpc('tools/call', {
    name: 'journey.create_from_link',
    arguments: { slug: 'bike', link: pageUrl },
  });
  assert.equal(res.result.isError, true);
  assert.match(res.result.content[0].text, /existiert bereits/);
  const after = await (await getAuthed(base, '/api/journeys')).json();
  assert.deepEqual(after, before);
  const dataAfter = await (await getAuthed(base, '/api/data?journey=bike')).json();
  assert.deepEqual(dataAfter.items, dataBefore.items);
});

test('journey.create_from_link ohne Slug: KI benennt Journey und extrahiert Produkt', async (t) => {
  useLlmStub(t);
  const base = await startBackend(t);
  const pageUrl = await startStaticServer(t);
  const client = startMcp(t, base);
  await handshake(client);
  const res = await client.rpc('tools/call', {
    name: 'journey.create_from_link',
    arguments: { link: pageUrl },
  });
  assert.ok(!res.result.isError, `unerwarteter Tool-Fehler: ${JSON.stringify(res)}`);
  const out = JSON.parse(res.result.content[0].text);
  assert.equal(out.success, true);
  assert.equal(out.slug, 'bike');
  assert.equal(out.slugSource, 'auto');
  assert.equal(out.journeyName, 'Fahrrad');
  assert.equal(out.ai.naming, 'local-cmd');
  assert.equal(out.ai.extraction, 'local-cmd');
  assert.equal(out.item.name, 'MCP Testrad Pro');
  assert.equal(out.item.price, '1299€');
  assert.match(out.item.specs, /Gewicht: 14\.2 kg/);
  const after = await (await getAuthed(base, '/api/journeys')).json();
  assert.ok(after.includes('bike'), 'Journey wurde nicht angelegt');
});

test('journey.create_from_link ohne Slug nennt eine Model-3-Seite "elektro-auto"', async (t) => {
  useLlmStub(t);
  const base = await startBackend(t);
  const pageUrl = await startStaticServer(t, TESLA_HTML);
  const client = startMcp(t, base);
  await handshake(client);
  const res = await client.rpc('tools/call', {
    name: 'journey.create_from_link',
    arguments: { link: pageUrl },
  });
  assert.ok(!res.result.isError, `unerwarteter Tool-Fehler: ${JSON.stringify(res)}`);
  const out = JSON.parse(res.result.content[0].text);
  assert.equal(out.success, true);
  assert.equal(out.slug, 'elektro-auto');
  assert.equal(out.slugSource, 'auto');
  assert.equal(out.journeyName, 'Elektro-Auto');
  assert.equal(out.category, 'auto');
  assert.equal(out.item.name, 'Tesla Model 3');
  assert.equal(out.item.price, '42990€');
  assert.match(out.item.specs, /Reichweite \(wltp\): 513 km/);
  assert.equal(out.item.rating, '⭐⭐⭐⭐');
  assert.equal(out.item.link, pageUrl);
  const after = await (await getAuthed(base, '/api/journeys')).json();
  assert.ok(after.includes('elektro-auto'), 'Journey wurde nicht angelegt');
  const config = await (
    await fetch(`${base}/api/journey-config?journey=elektro-auto`, {
      headers: { Authorization: `Bearer ${testKey(base)}` },
    })
  ).json();
  assert.equal(config.name, 'Elektro-Auto');
  assert.equal(config.category, 'auto');
  const data = await (await getAuthed(base, '/api/data?journey=elektro-auto')).json();
  assert.equal(data.items.length, 1);
  assert.equal(data.items[0].link, pageUrl);
});

test('journey.create_from_link: die Extraktion bekommt die neue Journey als Kontext', async (t) => {
  // Regression: Der Extraktions-Prompt nennt die Kaufreise. Ohne `?journey=`
  // auf POST /api/parse-text fiel das Backend auf "bike" zurück — die
  // Extraktion einer Model-3-Seite lief also im Fahrrad-Kontext.
  const stub = useLlmStub(t);
  const base = await startBackend(t);
  const pageUrl = await startStaticServer(t, TESLA_HTML);
  const client = startMcp(t, base);
  await handshake(client);
  const res = await client.rpc('tools/call', {
    name: 'journey.create_from_link',
    arguments: { link: pageUrl },
  });
  assert.ok(!res.result.isError, `unerwarteter Tool-Fehler: ${JSON.stringify(res)}`);
  assert.equal(JSON.parse(res.result.content[0].text).slug, 'elektro-auto');
  const extraction = stub.calls().filter((c) => c.task !== 'journey-naming');
  assert.equal(extraction.length, 1, 'genau ein Extraktions-Aufruf erwartet');
  assert.equal(extraction[0].journey, 'elektro-auto');
});

test('journey.create_from_link mit explizitem Slug behält diesen bei', async (t) => {
  useLlmStub(t);
  const base = await startBackend(t);
  const pageUrl = await startStaticServer(t, TESLA_HTML);
  const client = startMcp(t, base);
  await handshake(client);
  const res = await client.rpc('tools/call', {
    name: 'journey.create_from_link',
    arguments: { slug: 'stromer', link: pageUrl },
  });
  assert.ok(!res.result.isError, `unerwarteter Tool-Fehler: ${JSON.stringify(res)}`);
  const out = JSON.parse(res.result.content[0].text);
  assert.equal(out.slug, 'stromer');
  assert.equal(out.slugSource, 'explicit');
  assert.ok(!('journeyName' in out), 'expliziter Slug darf keinen Auto-Namen setzen');
  assert.equal(out.ai.naming, null);
  assert.equal(out.item.name, 'Tesla Model 3');
});

test('journey.create_from_link ohne Slug und ohne KI-Provider nutzt den Offline-Rückfall', async (t) => {
  const base = await startBackend(t);
  // Erst nach startBackend (setzt N8N_WEBHOOK_URL zurück). n8n kann nicht
  // benennen → markierter Offline-Rückfall statt Fehler (deterministisch,
  // auch mit agy-Binary im PATH).
  const snap = Object.fromEntries(LLM_ENV_KEYS.map((k) => [k, process.env[k]]));
  process.env.CRAWL_EXTRACT_PROVIDER = 'n8n';
  process.env.N8N_WEBHOOK_URL = 'https://n8n.example/hook';
  delete process.env.CRAWL_EXTRACT_CMD;
  t.after(() => {
    for (const k of LLM_ENV_KEYS) {
      if (snap[k] === undefined) delete process.env[k];
      else process.env[k] = snap[k];
    }
  });
  const pageUrl = await startStaticServer(t, TESLA_HTML);
  const client = startMcp(t, base);
  await handshake(client);
  const res = await client.rpc('tools/call', {
    name: 'journey.create_from_link',
    arguments: { link: pageUrl },
  });
  assert.ok(!res.result.isError, `unerwarteter Tool-Fehler: ${JSON.stringify(res)}`);
  const out = JSON.parse(res.result.content[0].text);
  assert.equal(out.success, true);
  assert.equal(out.slug, 'tesla-model-3');
  assert.equal(out.slugSource, 'fallback');
  assert.equal(out.journeyName, 'Tesla Model 3');
  assert.equal(out.ai.naming, 'fallback');
  assert.equal(out.ai.extraction, 'fallback');
  assert.equal(out.item.name, 'Tesla Model 3 Highland');
  assert.equal(out.item.link, pageUrl);
  const after = await (await getAuthed(base, '/api/journeys')).json();
  assert.ok(after.includes('tesla-model-3'), 'Journey wurde nicht angelegt');
});

test('journey.create_from_link mit Slug und ohne KI-Provider legt Offline-Produkt an', async (t) => {
  const base = await startBackend(t);
  const snap = Object.fromEntries(LLM_ENV_KEYS.map((k) => [k, process.env[k]]));
  process.env.CRAWL_EXTRACT_PROVIDER = 'n8n';
  process.env.N8N_WEBHOOK_URL = 'https://n8n.example/hook';
  delete process.env.CRAWL_EXTRACT_CMD;
  t.after(() => {
    for (const k of LLM_ENV_KEYS) {
      if (snap[k] === undefined) delete process.env[k];
      else process.env[k] = snap[k];
    }
  });
  const pageUrl = await startStaticServer(t);
  const client = startMcp(t, base);
  await handshake(client);
  const res = await client.rpc('tools/call', {
    name: 'journey.create_from_link',
    arguments: { slug: 'offline-bike', link: pageUrl },
  });
  assert.ok(!res.result.isError, `unerwarteter Tool-Fehler: ${JSON.stringify(res)}`);
  const out = JSON.parse(res.result.content[0].text);
  assert.equal(out.slug, 'offline-bike');
  assert.equal(out.slugSource, 'explicit');
  assert.equal(out.ai.extraction, 'fallback');
  assert.equal(out.item.name, 'MCP Testrad Pro');
  assert.equal(out.item.link, pageUrl);
});

test('journey.create_from_link mit leerem Slug oder ungültigem Link gibt Invalid-Params-Fehler', async (t) => {
  const base = await startBackend(t);
  const client = startMcp(t, base);
  await handshake(client);
  const emptySlug = await client.rpc('tools/call', {
    name: 'journey.create_from_link',
    arguments: { slug: '   ', link: 'http://127.0.0.1:9/produkt' },
  });
  assert.equal(emptySlug.error.code, -32602);
  const badLink = await client.rpc('tools/call', {
    name: 'journey.create_from_link',
    arguments: { slug: 'neu', link: 'ftp://example.com/produkt' },
  });
  assert.equal(badLink.error.code, -32602);
});

test('journey.create_from_link auf unerreichbaren Link legt keine Journey an', async (t) => {
  const base = await startBackend(t);
  const before = await (await getAuthed(base, '/api/journeys')).json();
  const client = startMcp(t, base);
  await handshake(client);
  const res = await client.rpc('tools/call', {
    name: 'journey.create_from_link',
    arguments: { slug: 'geistermoebel', link: 'http://127.0.0.1:1/produkt' },
  });
  assert.equal(res.result.isError, true);
  assert.match(res.result.content[0].text, /konnte nicht geladen werden/);
  const after = await (await getAuthed(base, '/api/journeys')).json();
  assert.deepEqual(after, before);
});

test('journey.create_from_link bei unerreichbarem Backend gibt definierten Tool-Fehler', async (t) => {
  const client = startMcp(t, 'http://127.0.0.1:1');
  await handshake(client);
  const res = await client.rpc('tools/call', {
    name: 'journey.create_from_link',
    arguments: { slug: 'neu', link: 'http://127.0.0.1:9/produkt' },
  });
  assert.equal(res.result.isError, true);
  assert.match(res.result.content[0].text, /nicht erreichbar/);
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
