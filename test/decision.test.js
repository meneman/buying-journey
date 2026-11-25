const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SERVER_PATH = '../src/web/backend/server.js';
const STORE_PATH = '../src/db/store.js';

function loadServer(envOverrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bike-decision-'));
  for (const mod of [SERVER_PATH, STORE_PATH]) {
    delete require.cache[require.resolve(mod)];
  }
  delete process.env.FRONTEND_DIST;
  const dbPath = path.join(dir, 'app.db');
  Object.assign(process.env, { PORT: '0', DB_PATH: dbPath, N8N_WEBHOOK_URL: '' }, envOverrides);
  return { server: require(SERVER_PATH), dbPath };
}

async function startApp(t) {
  const { server } = loadServer();
  const httpServer = await new Promise((resolve) => {
    const s = server.app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${httpServer.address().port}`;
  t.after(() => {
    httpServer.closeAllConnections();
    httpServer.close();
    server.closeDatabase();
  });
  return base;
}

async function setup(base, slug, items, budget = '700€') {
  delete require.cache[require.resolve(STORE_PATH)];
  const { openDatabase } = require(STORE_PATH);
  const store = openDatabase(process.env.DB_PATH);
  let key;
  try {
    key = store.createApiKey('anna', 'decision-test').key;
  } finally {
    store.close();
  }
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };
  await fetch(`${base}/api/journeys`, { method: 'POST', headers, body: JSON.stringify({ slug }) }).catch(() => {});
  const doc = { status: { phase: 'Comparing', budget, targetDate: '' }, journey: [], items, specs: [], generalNotes: '' };
  const save = await fetch(`${base}/api/data?journey=${slug}`, { method: 'POST', headers, body: JSON.stringify(doc) });
  assert.equal(save.status, 200);
  return headers;
}

test('Preisverlauf waechst nur bei Preiswechsel', async (t) => {
  const base = await startApp(t);
  const headers = await setup(base, 'preis', [{ name: 'Heiz', price: '612,95 €', status: 'Thinking' }]);
  const first = await (await fetch(`${base}/api/price-history?journey=preis&name=Heiz`, { headers })).json();
  assert.equal(first.history.length, 1);
  assert.equal(first.history[0].amount, 612.95);
  // Notes-Edit ohne Preiswechsel: kein neuer Verlauf.
  const doc = await (await fetch(`${base}/api/data?journey=preis`, { headers })).json();
  doc.items[0].notes = 'nur Notiz';
  const save = await fetch(`${base}/api/data?journey=preis`, {
    method: 'POST', headers, body: JSON.stringify(doc),
  });
  assert.equal(save.status, 200);
  const second = await (await fetch(`${base}/api/price-history?journey=preis&name=Heiz`, { headers })).json();
  assert.equal(second.history.length, 1);
  // Preiswechsel: neuer Verlauf.
  doc.items[0].price = '599,00 €';
  const save2 = await fetch(`${base}/api/data?journey=preis`, {
    method: 'POST', headers, body: JSON.stringify({ ...doc, items: [{ ...doc.items[0], price: '599,00 €' }] }),
  });
  assert.equal(save2.status, 200);
  const third = await (await fetch(`${base}/api/price-history?journey=preis&name=Heiz`, { headers })).json();
  assert.equal(third.history.length, 2);
  assert.equal(third.history[0].amount, 599);
  const unknown = await fetch(`${base}/api/price-history?journey=preis&name=GibtEsNicht`, { headers });
  assert.equal(unknown.status, 404);
});

test('Pro/Contra-Validierung und Criteria-CRUD', async (t) => {
  const base = await startApp(t);
  const headers = await setup(base, 'pro', [{ name: 'A', price: '100€', status: 'Thinking' }]);
  // Zu viele Eintraege -> 400.
  const doc = await (await fetch(`${base}/api/data?journey=pro`, { headers })).json();
  const bad = { ...doc, items: [{ ...doc.items[0], pros: Array(21).fill('gut') }] };
  const res = await fetch(`${base}/api/data?journey=pro`, { method: 'POST', headers, body: JSON.stringify(bad) });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, 'INVALID_PROS_CONS');
  // Criteria setzen, lesen, loeschen.
  const set = await fetch(`${base}/api/criteria?journey=pro`, {
    method: 'POST', headers, body: JSON.stringify({ key: 'Schutzart', weight: 5 }),
  });
  assert.equal(set.status, 200);
  const listed = await (await fetch(`${base}/api/criteria?journey=pro`, { headers })).json();
  assert.deepEqual(listed.criteria, [{ key: 'Schutzart', weight: 5 }]);
  const badWeight = await fetch(`${base}/api/criteria?journey=pro`, {
    method: 'POST', headers, body: JSON.stringify({ key: 'Farbe', weight: 9 }),
  });
  assert.equal(badWeight.status, 400);
  const del = await fetch(`${base}/api/criteria?journey=pro&key=Schutzart`, { method: 'DELETE', headers });
  assert.equal(del.status, 200);
  const gone = await (await fetch(`${base}/api/criteria?journey=pro`, { headers })).json();
  assert.deepEqual(gone.criteria, []);
});

test('Shortlist sortiert nach Score und beachtet Budget', async (t) => {
  const base = await startApp(t);
  const headers = await setup(
    base,
    'short',
    [
      { name: 'Teuer Gut', price: '644,90 €', rating: '⭐⭐⭐⭐⭐', status: 'Thinking', specs: 'Schutzart: IPX4', pros: ['toll'], cons: [] },
      { name: 'Billig Gut', price: '327,99 €', rating: '⭐⭐⭐⭐⭐', status: 'Thinking', specs: 'Schutzart: IPX4', pros: ['toll'], cons: [] },
      { name: 'Raus', price: '10 €', rating: '⭐⭐⭐⭐⭐', status: 'Rejected', specs: 'Schutzart: IPX4' },
    ],
    '400€'
  );
  const body = await (await fetch(`${base}/api/shortlist?journey=short&n=2`, { headers })).json();
  assert.equal(body.items.length, 2);
  assert.equal(body.items[0].name, 'Billig Gut');
  assert.ok(body.items[0].score >= body.items[1].score);
  assert.equal(body.items[0].overBudget, false);
  assert.equal(body.items[1].overBudget, true);
  for (const item of body.items) {
    assert.ok(Array.isArray(item.reasons) && item.reasons.length <= 3);
    assert.ok(item.breakdown && typeof item.breakdown.ratingPoints === 'number');
  }
  // Rejected ist per Default raus.
  assert.ok(!body.items.some((i) => i.name === 'Raus'));
});
