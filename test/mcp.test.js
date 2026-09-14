const { test } = require('node:test');
const assert = require('node:assert/strict');

const fs = require('node:fs');
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
