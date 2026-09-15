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

/** Startet das Backend mit isolierter SQLite-Datei auf einem freien Port. */
async function startBackend(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bike-mcp-test-'));
  for (const mod of [SERVER_PATH, STORE_PATH]) {
    delete require.cache[require.resolve(mod)];
  }
  delete process.env.FRONTEND_DIST;
  Object.assign(process.env, {
    PORT: '0',
    DB_PATH: path.join(dir, 'app.db'),
    N8N_WEBHOOK_URL: '',
  });
  const { app, closeDatabase } = require(SERVER_PATH);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  t.after(() => {
    server.closeAllConnections();
    server.close();
    closeDatabase();
  });
  return `http://127.0.0.1:${server.address().port}`;
}

/** Startet den MCP-Server (stdio) gegen die gegebene Basis-URL. */
function startMcp(t, baseUrl) {
  const child = spawn(process.execPath, [MCP_PATH], {
    env: { ...process.env, MCP_BASE_URL: baseUrl },
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

const PRODUCT_HTML = `<!doctype html><html><head><title>MCP Testrad Pro</title></head><body><h1>MCP Testrad Pro</h1><p>Preis: 1299€</p><p>Rahmen: Aluminium, Gewicht: 14.2 kg</p></body></html>`;

/** Startet einen statischen HTTP-Server mit einer Produktseite für Crawl-Tests. */
async function startStaticServer(t) {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(PRODUCT_HTML);
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
  const data = await (await fetch(`${base}/api/data?journey=bike`)).json();
  const item = data.items.find((i) => i.name === 'MCP Testrad');
  assert.ok(item, 'Item wurde nicht in der Journey gespeichert');
  assert.equal(item.price, '999€');
  assert.match(item.specs, /Weight: 15\.8 kg/);
});

test('journey.add_item aktualisiert ein vorhandenes Produkt ohne Duplikat', async (t) => {
  const base = await startBackend(t);
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
  const data = await (await fetch(`${base}/api/data?journey=bike`)).json();
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
  const before = await (await fetch(`${base}/api/journeys`)).json();
  const client = startMcp(t, base);
  await handshake(client);
  const res = await client.rpc('tools/call', {
    name: 'journey.add_item',
    arguments: { slug: 'gibt-es-nicht', name: 'Geisterrad' },
  });
  assert.equal(res.result.isError, true);
  assert.match(res.result.content[0].text, /Unbekannte Journey/);
  const after = await (await fetch(`${base}/api/journeys`)).json();
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
  const data = await (await fetch(`${base}/api/data?journey=bike`)).json();
  const item = data.items.find((i) => i.name === 'MCP Testrad Pro');
  assert.ok(item, 'gecrawltes Item wurde nicht gespeichert');
  assert.equal(item.link, pageUrl);
});

test('journey.get liefert das komplette bike-Dokument', async (t) => {
  const base = await startBackend(t);
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
    headers: { 'Content-Type': 'application/json' },
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
  const before = await (await fetch(`${base}/api/journeys`)).json();
  const client = startMcp(t, base);
  await handshake(client);
  const res = await client.rpc('tools/call', {
    name: 'journey.get',
    arguments: { slug: 'gibt-es-nicht' },
  });
  assert.equal(res.result.isError, true);
  assert.match(res.result.content[0].text, /Unbekannte Journey/);
  const after = await (await fetch(`${base}/api/journeys`)).json();
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
    ['journey.get', 'journey.add_item', 'journey.crawl_link']
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
