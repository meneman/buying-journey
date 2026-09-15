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

test('GET /api/journeys lists every journey slug-sorted (start page contract)', async (t) => {
  const base = await startApp(t);
  for (const slug of ['zebra', 'apfel']) {
    const save = await postJson(base, `/api/data?journey=${slug}`, {
      status: {}, journey: [], items: [], specs: [], generalNotes: '',
    });
    assert.equal(save.status, 200);
  }
  const journeys = await (await fetch(`${base}/api/journeys`)).json();
  assert.deepEqual(journeys, ['apfel', 'bike', 'zebra']);
});

test('POST /api/journeys creates a journey explicitly (no lazy GET)', async (t) => {
  const base = await startApp(t);
  const res = await postJson(base, '/api/journeys', {
    slug: 'smartphone',
    phase: 'Planning',
    budget: '800€',
    targetDate: '2026-12-31',
    generalNotes: '- Modelle vergleichen',
  });
  assert.equal(res.status, 201);
  assert.deepEqual(await res.json(), { success: true, slug: 'smartphone' });

  const journeys = await (await fetch(`${base}/api/journeys`)).json();
  assert.ok(journeys.includes('smartphone'));

  const data = await (await fetch(`${base}/api/data?journey=smartphone`)).json();
  assert.equal(data.status.phase, 'Planning');
  assert.equal(data.status.budget, '800€');
  assert.equal(data.status.targetDate, '2026-12-31');
  assert.equal(data.generalNotes, '- Modelle vergleichen');
});

test('POST /api/journeys reports duplicates with 409', async (t) => {
  const base = await startApp(t);
  const created = await postJson(base, '/api/journeys', { slug: 'smartphone' });
  assert.equal(created.status, 201);
  for (const slug of ['smartphone', 'SmartPhone']) {
    const dup = await postJson(base, '/api/journeys', { slug });
    assert.equal(dup.status, 409, `expected 409 for duplicate ${slug}`);
    assert.equal(typeof (await dup.json()).error, 'string');
  }
  const dupBike = await postJson(base, '/api/journeys', { slug: 'bike' });
  assert.equal(dupBike.status, 409);
});

test('POST /api/journeys rejects missing and invalid slugs with 400', async (t) => {
  const base = await startApp(t);
  for (const body of [{}, { slug: '' }, { slug: '   ' }, { slug: '!!!' }, { slug: 42 }, null]) {
    const res = await postJson(base, '/api/journeys', body);
    assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(body)}`);
    assert.equal(typeof (await res.json()).error, 'string');
  }
  for (const body of [{ slug: 'neu1', phase: 42 }, { slug: 'neu2', budget: ['x'] }]) {
    const res = await postJson(base, '/api/journeys', body);
    assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(body)}`);
  }
});

test('POST /api/journeys normalizes slugs like the frontend', async (t) => {
  const base = await startApp(t);
  const res = await postJson(base, '/api/journeys', { slug: '  SmartPhone  ' });
  assert.equal(res.status, 201);
  assert.deepEqual(await res.json(), { success: true, slug: 'smartphone' });
  const journeys = await (await fetch(`${base}/api/journeys`)).json();
  assert.ok(journeys.includes('smartphone'));
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

async function putJson(base, path, body, rawBody) {
  return fetch(`${base}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: rawBody !== undefined ? rawBody : JSON.stringify(body),
  });
}

test('journey config round-trips base properties and settings', async (t) => {
  const base = await startApp(t);
  const initial = await (await fetch(`${base}/api/journey-config?journey=bike`)).json();
  assert.equal(initial.slug, 'bike');
  assert.equal(initial.name, 'bike');
  assert.equal(initial.currency, '€');
  assert.equal(initial.sectionTitle, 'Bikes Under Consideration');
  assert.equal(initial.listTitle, 'Rahmengrößen');

  const patch = {
    name: 'Mein Bike',
    description: 'Pendeln + Touren',
    category: 'Fahrrad',
    currency: '€',
    sectionTitle: 'Räder im Vergleich',
    listTitle: 'Größen',
  };
  const save = await putJson(base, '/api/journey-config?journey=bike', patch);
  assert.equal(save.status, 200);
  const saved = await save.json();
  assert.equal(saved.success, true);
  assert.equal(saved.config.name, 'Mein Bike');
  assert.equal(saved.config.category, 'fahrrad');
  assert.equal(saved.config.description, 'Pendeln + Touren');

  const loaded = await (await fetch(`${base}/api/journey-config?journey=bike`)).json();
  assert.deepEqual(loaded, saved.config);

  // Partial update keeps untouched fields.
  await putJson(base, '/api/journey-config?journey=bike', { name: 'Renner' });
  const partial = await (await fetch(`${base}/api/journey-config?journey=bike`)).json();
  assert.equal(partial.name, 'Renner');
  assert.equal(partial.description, 'Pendeln + Touren');
});

test('journey configs list every journey slug-sorted (start page contract)', async (t) => {
  const base = await startApp(t);
  await postJson(base, '/api/journeys', { slug: 'zebra' });
  await postJson(base, '/api/journeys', { slug: 'apfel', name: 'Apfel-Geräte', category: 'laptop' });
  const configs = await (await fetch(`${base}/api/journey-configs`)).json();
  assert.deepEqual(configs.map((c) => c.slug), ['apfel', 'bike', 'zebra']);
  const apfel = configs.find((c) => c.slug === 'apfel');
  assert.equal(apfel.name, 'Apfel-Geräte');
  assert.equal(apfel.category, 'laptop');
});

test('PUT /api/journey-config rejects invalid patches with 400', async (t) => {
  const base = await startApp(t);
  const cases = [
    [{}, 'empty object'],
    [null, 'null body'],
    [[], 'array body'],
    [{ unbekannt: 'x' }, 'unknown field'],
    [{ name: 42 }, 'non-string field'],
    [{ name: 'x'.repeat(81) }, 'overlong name'],
    [{ description: 'x'.repeat(501) }, 'overlong description'],
  ];
  for (const [body, label] of cases) {
    const res = await putJson(base, '/api/journey-config?journey=bike', body);
    assert.equal(res.status, 400, `expected 400 for ${label}`);
    assert.equal(typeof (await res.json()).error, 'string');
  }
});

test('POST /api/journeys accepts base properties as config defaults', async (t) => {
  const base = await startApp(t);
  const res = await postJson(base, '/api/journeys', {
    slug: 'laptop',
    name: 'Notebook',
    description: 'Arbeit + Freizeit',
    category: 'Laptop',
    currency: '€',
  });
  assert.equal(res.status, 201);
  const config = await (await fetch(`${base}/api/journey-config?journey=laptop`)).json();
  assert.equal(config.name, 'Notebook');
  assert.equal(config.description, 'Arbeit + Freizeit');
  assert.equal(config.category, 'laptop');
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
