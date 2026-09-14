const { test } = require('node:test');
const assert = require('node:assert/strict');

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SERVER_PATH = '../src/web/backend/server.js';
const STORE_PATH = '../src/db/store.js';

/** (Re)loads the server module with deterministic env and an isolated SQLite file. */
function loadServer(envOverrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bike-test-'));
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

async function postJson(base, path, body, rawBody) {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: rawBody !== undefined ? rawBody : JSON.stringify(body),
  });
}

test('GET /api/config reports the sqlite storage backend', async (t) => {
  const base = await startApp(t);
  const res = await fetch(`${base}/api/config`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { storage: 'sqlite' });
});

test('journeys start with bike and data round-trips through SQLite', async (t) => {
  const base = await startApp(t);
  const journeys = await (await fetch(`${base}/api/journeys`)).json();
  assert.ok(journeys.includes('bike'));

  const doc = {
    status: { phase: 'Comparing', budget: '2500€', targetDate: '2026-08-31' },
    journey: [{ date: '2026-07-16', event: 'Probefahrt' }],
    items: [
      {
        name: 'Cube Kathmandu Pro',
        price: '1499€',
        specs: 'Rahmen: Alu <br> Gewicht: 15.8 kg',
        rating: '⭐⭐⭐⭐',
        status: 'Shortlisted',
        notes: 'top',
        link: 'https://example.com/cube',
      },
    ],
    specs: [{ label: 'Größe', value: 'M' }],
    generalNotes: '- Federgabel ist Pflicht',
    sectionTitle: 'Bikes Under Consideration',
    listTitle: 'Rahmengrößen',
  };
  const save = await postJson(base, '/api/data?journey=bike', doc);
  assert.equal(save.status, 200);
  assert.deepEqual(await save.json(), { success: true });

  const loaded = await (await fetch(`${base}/api/data?journey=bike`)).json();
  assert.deepEqual(loaded, { ...doc, headers: ['Name', 'Price', 'Specs', 'Rating', 'Status', 'Notes', 'Link'] });
});

test('journeys are isolated with heterogeneous specs', async (t) => {
  const base = await startApp(t);
  await postJson(base, '/api/data?journey=laptop', {
    status: {}, journey: [],
    items: [{ name: 'MacBook', specs: 'CPU: M3', status: 'Thinking' }],
    specs: [], generalNotes: '',
  });
  const bike = await (await fetch(`${base}/api/data?journey=bike`)).json();
  assert.deepEqual(bike.items, []);
  const journeys = await (await fetch(`${base}/api/journeys`)).json();
  assert.ok(journeys.includes('bike') && journeys.includes('laptop'));
});

test('feedback round-trips with a default', async (t) => {
  const base = await startApp(t);
  const initial = await (await fetch(`${base}/api/feedback?journey=bike`)).json();
  assert.ok(initial.content.includes('Feedback'));
  const save = await postJson(base, '/api/feedback?journey=bike', { content: 'Eigene Notizen' });
  assert.equal(save.status, 200);
  const loaded = await (await fetch(`${base}/api/feedback?journey=bike`)).json();
  assert.equal(loaded.content, 'Eigene Notizen');
});

test('POST /api/data rejects non-object bodies with 400', async (t) => {
  const base = await startApp(t);
  for (const payload of ['[1,2]', '"nur ein String"', '']) {
    const res = await postJson(base, '/api/data?journey=bike', undefined, payload);
    assert.equal(res.status, 400, `expected 400 for body ${payload || '(empty)'}`);
    assert.equal(typeof (await res.json()).error, 'string');
  }
});

test('POST /api/feedback requires a string content field', async (t) => {
  const base = await startApp(t);
  for (const body of [{}, { content: 42 }, { content: null }]) {
    const res = await postJson(base, '/api/feedback?journey=bike', body);
    assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(body)}`);
    assert.equal(typeof (await res.json()).error, 'string');
  }
});

test('POST /api/import-link validates the link before any network use', async (t) => {
  const base = await startApp(t);
  const cases = [
    [{}, 'missing link'],
    [{ link: 42 }, 'non-string link'],
    [{ link: 'keine-url' }, 'malformed URL'],
    [{ link: 'ftp://example.com/produkt' }, 'non-http(s) URL'],
  ];
  for (const [body, label] of cases) {
    const res = await postJson(base, '/api/import-link?journey=bike', body);
    assert.equal(res.status, 400, `expected 400 for ${label}`);
    assert.equal(typeof (await res.json()).error, 'string');
  }
});

test('getJourney sanitizes journey parameters', () => {
  const { getJourney } = loadServer();
  assert.equal(getJourney({ query: {} }), 'bike');
  assert.equal(getJourney({ query: { journey: 'city-bike' } }), 'city-bike');
  assert.equal(getJourney({ query: { journey: ['a', 'b'] } }), 'a');
  assert.equal(getJourney({ query: { journey: 'a/b?c' } }), 'abc');
  assert.equal(getJourney({ query: { journey: '!!!' } }), 'bike');
  assert.equal(getJourney({}), 'bike');
});

test('unknown API routes answer JSON 404', async (t) => {
  const base = await startApp(t);
  const res = await fetch(`${base}/api/gibt-es-nicht`);
  assert.equal(res.status, 404);
  assert.equal(typeof (await res.json()).error, 'string');
});

test('SPA fallback serves the built frontend', async (t) => {
  const base = await startApp(t);
  const res = await fetch(`${base}/irgendeine-route`);
  assert.equal(res.status, 200);
  assert.ok((await res.text()).includes('root'));
});

test('SPA fallback answers JSON when no build exists', async (t) => {
  const base = await startApp(t, { FRONTEND_DIST: '/does/not/exist-frontend-dist' });
  const res = await fetch(`${base}/irgendeine-route`);
  assert.equal(res.status, 404);
  assert.equal(typeof (await res.json()).error, 'string');
});
