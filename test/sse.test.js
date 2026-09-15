const { test } = require('node:test');
const assert = require('node:assert/strict');

const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const SERVER_PATH = '../src/web/backend/server.js';
const STORE_PATH = '../src/db/store.js';

function loadServer(envOverrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bike-sse-test-'));
  for (const mod of [SERVER_PATH, STORE_PATH]) {
    delete require.cache[require.resolve(mod)];
  }
  delete process.env.FRONTEND_DIST;
  Object.assign(process.env, {
    PORT: '0',
    DB_PATH: path.join(dir, 'app.db'),
    N8N_WEBHOOK_URL: '',
  }, envOverrides);
  return require(SERVER_PATH);
}

async function startApp(t, envOverrides) {
  const { app, closeDatabase } = loadServer(envOverrides);
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

// Öffnet einen SSE-Stream und sammelt Events (`event:` + `data:`-Blöcke).
// Wichtig: erst auf `ready` warten — sonst rasen POST und Subscribe um die Wette.
function openSse(base, journey) {
  const url = `${base}/api/data/events?journey=${encodeURIComponent(journey)}`;
  const events = [];
  let buffer = '';
  let responseHeaders = null;
  let responseStatus = null;
  const req = http.get(url, { headers: { Accept: 'text/event-stream' } }, (res) => {
    responseStatus = res.statusCode;
    responseHeaders = res.headers;
    res.setEncoding('utf8');
    res.on('data', (chunk) => {
      buffer += chunk;
      let idx;
      while ((idx = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const eventLine = block.split('\n').find((l) => l.startsWith('event:'));
        const dataLines = block.split('\n').filter((l) => l.startsWith('data:'));
        if (!eventLine) continue; // retry:/Heartbeat-Kommentare ignorieren
        const event = eventLine.slice('event:'.length).trim();
        const data = dataLines.map((l) => l.slice('data:'.length).trim()).join('\n');
        events.push({ event, data });
      }
    });
  });
  return {
    events,
    get status() {
      return responseStatus;
    },
    get headers() {
      return responseHeaders;
    },
    close() {
      req.destroy();
    },
  };
}

async function waitFor(events, predicate, timeoutMs, label) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const found = events.find(predicate);
    if (found) return found;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`Timeout beim Warten auf SSE-Event (${label})`);
}

async function postJson(base, urlPath, body) {
  return fetch(`${base}${urlPath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const MIN_DOC = {
  status: {},
  journey: [],
  items: [{ name: 'MCP-Bike' }],
  specs: [],
  generalNotes: '',
};

test('SSE-Stream meldet ready und feuert journey-updated bei POST /api/data', async (t) => {
  const base = await startApp(t);
  const sse = openSse(base, 'bike');
  t.after(() => sse.close());

  const ready = await waitFor(sse.events, (e) => e.event === 'ready', 2000, 'ready');
  assert.equal(JSON.parse(ready.data).slug, 'bike');
  assert.equal(sse.status, 200);
  assert.match(String(sse.headers['content-type'] || ''), /text\/event-stream/);

  const save = await postJson(base, '/api/data?journey=bike', MIN_DOC);
  assert.equal(save.status, 200);

  const updated = await waitFor(sse.events, (e) => e.event === 'journey-updated', 2000, 'journey-updated');
  const payload = JSON.parse(updated.data);
  assert.equal(payload.slug, 'bike');
  assert.equal(typeof payload.updatedAt, 'string');
});

test('SSE-Stream bleibt still bei Schreibzugriff auf andere Journey', async (t) => {
  const base = await startApp(t);
  const sse = openSse(base, 'bike');
  t.after(() => sse.close());
  await waitFor(sse.events, (e) => e.event === 'ready', 2000, 'ready');

  const save = await postJson(base, '/api/data?journey=andere', MIN_DOC);
  assert.equal(save.status, 200);

  await new Promise((r) => setTimeout(r, 600));
  assert.equal(
    sse.events.filter((e) => e.event === 'journey-updated').length,
    0,
    'kein journey-updated für fremde Journey erwartet'
  );
});

test('POST /api/feedback triggert kein journey-updated (Scope: nur /api/data)', async (t) => {
  const base = await startApp(t);
  const sse = openSse(base, 'bike');
  t.after(() => sse.close());
  await waitFor(sse.events, (e) => e.event === 'ready', 2000, 'ready');

  const save = await postJson(base, '/api/feedback?journey=bike', { content: 'Hallo' });
  assert.equal(save.status, 200);

  await new Promise((r) => setTimeout(r, 600));
  assert.equal(
    sse.events.filter((e) => e.event === 'journey-updated').length,
    0,
    'kein journey-updated für Feedback erwartet'
  );
});
