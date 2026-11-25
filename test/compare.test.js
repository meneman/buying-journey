const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SERVER_PATH = '../src/web/backend/server.js';
const STORE_PATH = '../src/db/store.js';

function loadServer(envOverrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bike-compare-'));
  for (const mod of [SERVER_PATH, STORE_PATH]) {
    delete require.cache[require.resolve(mod)];
  }
  delete process.env.FRONTEND_DIST;
  const dbPath = path.join(dir, 'app.db');
  Object.assign(process.env, { PORT: '0', DB_PATH: dbPath, N8N_WEBHOOK_URL: '' }, envOverrides);
  return { server: require(SERVER_PATH), dbPath };
}

async function startApp(t, envOverrides) {
  const { server, dbPath } = loadServer(envOverrides);
  const httpServer = await new Promise((resolve) => {
    const s = server.app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${httpServer.address().port}`;
  t.after(() => {
    httpServer.closeAllConnections();
    httpServer.close();
    server.closeDatabase();
  });
  return { base, dbPath };
}

async function setupJourney(base, slug, items, budget = '') {
  // API-Key erzeugen (eigener Store auf DB_PATH).
  delete require.cache[require.resolve(STORE_PATH)];
  const { openDatabase } = require(STORE_PATH);
  const store = openDatabase(process.env.DB_PATH);
  let key;
  try {
    key = store.createApiKey('anna', 'compare-test').key;
  } finally {
    store.close();
  }
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };
  // Journey explizit anlegen (falls neu), Fehler 409 ignorieren.
  await fetch(`${base}/api/journeys`, { method: 'POST', headers, body: JSON.stringify({ slug }) }).catch(() => {});
  const doc = {
    status: { phase: 'Comparing', budget, targetDate: '' },
    journey: [],
    items,
    specs: [],
    generalNotes: '',
  };
  const save = await fetch(`${base}/api/data?journey=${slug}`, { method: 'POST', headers, body: JSON.stringify(doc) });
  assert.equal(save.status, 200);
  return headers;
}

test('GET /api/compare gruppiert, erkennt Luecken und sortiert nach Preis', async (t) => {
  const { base } = await startApp(t);
  const headers = await setupJourney(base, 'heiz', [
    { name: 'Prestige Weiss', price: '612,95 €', rating: '⭐⭐⭐⭐⭐', status: 'Thinking', specs: 'Leistung heizstab: 600 W <br> Schutzart: IPX4' },
    { name: 'Alrona Anthrazit', price: '644,90 €', rating: '⭐⭐⭐⭐⭐', status: 'Thinking', specs: 'Leistung heizstab: 600 W <br> Farbe: Anthrazit' },
    { name: 'Heilmetz Weiss', price: '327,99 €', rating: '⭐⭐⭐⭐⭐', status: 'Thinking', specs: 'Leistung heizstab: 800 W' },
    { name: 'Schulte Turin', price: 'ab 249,00 € (konfigurierbar)', rating: '⭐⭐⭐⭐⭐', status: 'Thinking', specs: 'Leistung heizstab: 600 W' },
  ]);
  const res = await fetch(`${base}/api/compare?journey=heiz&sort=price&dir=asc`, { headers });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.totalItems, 4);
  assert.deepEqual(body.items.map((i) => i.name), ['Schulte Turin', 'Heilmetz Weiss', 'Prestige Weiss', 'Alrona Anthrazit']);
  assert.deepEqual(body.priceRange, { min: 249, max: 644.9, currency: 'EUR' });
  const keys = [...body.common.map((c) => c.key), ...body.unique.map((c) => c.key)];
  assert.ok(keys.includes('Leistung heizstab'));
  const missingSchulte = body.missing.find((m) => m.item === 'Schulte Turin');
  assert.ok(missingSchulte && missingSchulte.missingKeys.includes('Schutzart'));
  for (const item of body.items) {
    assert.equal(typeof item.score, 'number');
    assert.ok(Array.isArray(item.reasons) && item.reasons.length <= 3);
  }
});

test('GET /api/compare filtert Status und meldet Fehlercodes', async (t) => {
  const { base } = await startApp(t);
  const headers = await setupJourney(base, 'filter', [
    { name: 'A', price: '100€', status: 'Thinking', specs: 'Farbe: Weiss' },
    { name: 'B', price: '200€', status: 'Rejected', specs: 'Farbe: Schwarz' },
  ]);
  const filtered = await (await fetch(`${base}/api/compare?journey=filter&status=Thinking`, { headers })).json();
  assert.deepEqual(filtered.items.map((i) => i.name), ['A']);
  const badStatus = await fetch(`${base}/api/compare?journey=filter&status=Nope`, { headers });
  assert.equal(badStatus.status, 400);
  assert.equal((await badStatus.json()).code, 'INVALID_STATUS');
  const badSort = await fetch(`${base}/api/compare?journey=filter&sort=nope`, { headers });
  assert.equal(badSort.status, 400);
  const unknown = await fetch(`${base}/api/compare?journey=gibt-es-nicht`, { headers });
  assert.equal(unknown.status, 404);
  assert.equal((await unknown.json()).code, 'JOURNEY_NOT_FOUND');
});

test('GET /api/data filtert, sucht und paginiert rueckwaertskompatibel', async (t) => {
  const { base } = await startApp(t);
  const headers = await setupJourney(base, 'page', [
    { name: 'Prestige Weiss', price: '612,95 €', status: 'Thinking', specs: 'Farbe: Weiss', notes: 'offen' },
    { name: 'Alrona Anthrazit', price: '644,90 €', status: 'Thinking', specs: 'Farbe: Anthrazit', notes: 'offen' },
    { name: 'Heilmetz Weiss', price: '327,99 €', status: 'Shortlisted', specs: 'Farbe: Weiss', notes: 'billig' },
  ]);
  // Ohne Parameter: Voll-Dokument ohne pagination (Byte-kompatibel zum alten Vertrag).
  const full = await (await fetch(`${base}/api/data?journey=page`, { headers })).json();
  assert.equal(full.items.length, 3);
  assert.ok(!('pagination' in full));
  // Status + Sort + Limit.
  const sel = await (await fetch(`${base}/api/data?journey=page&status=Thinking&sort=price&dir=asc&limit=1`, { headers })).json();
  assert.deepEqual(sel.pagination, { total: 2, returned: 1, limit: 1, offset: 0 });
  assert.deepEqual(sel.items.map((i) => i.name), ['Prestige Weiss']);
  // Suche.
  const search = await (await fetch(`${base}/api/data?journey=page&search=anthrazit`, { headers })).json();
  assert.deepEqual(search.items.map((i) => i.name), ['Alrona Anthrazit']);
  // Offset hinter Ende.
  const empty = await (await fetch(`${base}/api/data?journey=page&offset=99`, { headers })).json();
  assert.equal(empty.items.length, 0);
  assert.equal(empty.pagination.returned, 0);
  // Fehlercodes.
  const badField = await fetch(`${base}/api/data?journey=page&fields=nope`, { headers });
  assert.equal(badField.status, 400);
});
