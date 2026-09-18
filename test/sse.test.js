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
  const dbPath = path.join(dir, 'app.db');
  Object.assign(process.env, {
    PORT: '0',
    DB_PATH: dbPath,
    N8N_WEBHOOK_URL: '',
  }, envOverrides);
  return { server: require(SERVER_PATH), dbPath };
}

const dbByBase = new Map();

async function startApp(t, envOverrides) {
  const { server, dbPath } = loadServer(envOverrides);
  const { app, closeDatabase } = server;
  const httpServer = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${httpServer.address().port}`;
  dbByBase.set(base, dbPath);
  t.after(() => {
    dbByBase.delete(base);
    httpServer.closeAllConnections();
    httpServer.close();
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

// Öffnet einen SSE-Stream und sammelt Events (`event:` + `data:`-Blöcke).
// Wichtig: erst auf `ready` warten — sonst rasen POST und Subscribe um die Wette.
function openSse(base, journey, key) {
  const url = `${base}/api/data/events?journey=${encodeURIComponent(journey)}`;
  const events = [];
  let buffer = '';
  let responseHeaders = null;
  let responseStatus = null;
  const token = key !== undefined ? key : testKey(base);
  const req = http.get(url, { headers: { Accept: 'text/event-stream', Authorization: `Bearer ${token}` } }, (res) => {
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

async function postJson(base, urlPath, body, key) {
  return fetch(`${base}${urlPath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key !== undefined ? key : testKey(base)}` },
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

test('SSE bleibt still bei Schreibzugriff eines anderen Users auf denselben Slug', async (t) => {
  const base = await startApp(t);
  const sse = openSse(base, 'bike', testKey(base, 'anna'));
  t.after(() => sse.close());
  await waitFor(sse.events, (e) => e.event === 'ready', 2000, 'ready');

  // Benni schreibt auf "seine" bike-Journey — Annas Stream bleibt still.
  const save = await postJson(base, '/api/data?journey=bike', MIN_DOC, testKey(base, 'benni'));
  assert.equal(save.status, 200);

  await new Promise((r) => setTimeout(r, 600));
  assert.equal(
    sse.events.filter((e) => e.event === 'journey-updated').length,
    0,
    'kein journey-updated für fremden Owner erwartet'
  );
});

test('SSE ohne Token antwortet 401 statt Stream', async (t) => {
  const base = await startApp(t);
  const url = `${base}/api/data/events?journey=bike`;
  const status = await new Promise((resolve, reject) => {
    http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode);
    }).on('error', reject);
  });
  assert.equal(status, 401);
});

test('fertiger Crawl-Job pusht journey-updated mit jobId/jobStatus/item nur an eigene Journey und Owner', async (t) => {
  const prevFetch = process.env.CRAWL_FETCH_CMD;
  const prevExtract = process.env.CRAWL_EXTRACT_CMD;
  const base = await startApp(t, {
    CRAWL_FETCH_CMD: `printf '%s' '{"title":"Stub-Seite","text":"${'Vergleichstext mit Inhalt. '.repeat(80)}"}'`,
    CRAWL_EXTRACT_CMD: `cat >/dev/null; printf '%s' '{"name":"SSE-Bike","price":"999€","specs":"Rahmen: Alu"}'`,
  });
  try {
    const own = openSse(base, 'bike', testKey(base, 'anna'));
    const otherJourney = openSse(base, 'andere', testKey(base, 'anna'));
    const otherOwner = openSse(base, 'bike', testKey(base, 'benni'));
    t.after(() => {
      own.close();
      otherJourney.close();
      otherOwner.close();
    });
    await waitFor(own.events, (e) => e.event === 'ready', 2000, 'ready');
    await waitFor(otherJourney.events, (e) => e.event === 'ready', 2000, 'ready');
    await waitFor(otherOwner.events, (e) => e.event === 'ready', 2000, 'ready');

    const res = await postJson(base, '/api/import-link?journey=bike', {
      link: 'https://example.com/bike',
      provider: 'local-cmd',
      fetcher: 'local-cmd',
    }, testKey(base, 'anna'));
    assert.equal(res.status, 202);
    const created = await res.json();

    const updated = await waitFor(own.events, (e) => {
      if (e.event !== 'journey-updated') return false;
      try {
        return JSON.parse(e.data).jobId === created.jobId;
      } catch {
        return false;
      }
    }, 10000, 'job journey-updated');
    const payload = JSON.parse(updated.data);
    assert.equal(payload.slug, 'bike');
    assert.equal(payload.jobStatus, 'done');
    assert.equal(payload.item.name, 'SSE-Bike');
    assert.equal(typeof payload.updatedAt, 'string');

    await new Promise((r) => setTimeout(r, 600));
    assert.equal(
      otherJourney.events.filter((e) => e.event === 'journey-updated').length,
      0,
      'kein Job-Event für fremde Journey erwartet',
    );
    assert.equal(
      otherOwner.events.filter((e) => e.event === 'journey-updated').length,
      0,
      'kein Job-Event für fremden Owner erwartet',
    );
  } finally {
    if (prevFetch === undefined) delete process.env.CRAWL_FETCH_CMD;
    else process.env.CRAWL_FETCH_CMD = prevFetch;
    if (prevExtract === undefined) delete process.env.CRAWL_EXTRACT_CMD;
    else process.env.CRAWL_EXTRACT_CMD = prevExtract;
  }
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
