const { test } = require('node:test');
const assert = require('node:assert/strict');

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { openDatabase, specsStringToJson, specsJsonToString } = require('../src/db/store.js');

function memDb(t) {
  const store = openDatabase(':memory:');
  t.after(() => store.close());
  return store;
}

test('specs string survives the JSON round-trip (keyed, free-text, pipes)', () => {
  const raw = 'Rahmen: Carbon | Alu <br> Gewicht: 14.5 kg <br> einfach nur Text';
  const back = specsJsonToString(specsStringToJson(raw));
  assert.equal(back, raw);
  assert.equal(specsJsonToString(specsStringToJson('')), '');
  assert.equal(specsJsonToString(specsStringToJson(undefined)), '');
});

test('save/get round-trips a full journey document', async (t) => {
  const store = memDb(t);
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
    specs: [{ label: 'Größe', value: 'M (165-180 cm)' }],
    generalNotes: '- Federgabel ist Pflicht',
    sectionTitle: 'Bikes Under Consideration',
    listTitle: 'Rahmengrößen',
  };
  store.saveJourneyData('bike', 'anna', doc);
  const loaded = store.getJourneyData('bike', 'anna');
  assert.deepEqual(loaded.headers, ['Name', 'Price', 'Specs', 'Rating', 'Status', 'Notes', 'Link']);
  assert.deepEqual(loaded.status, doc.status);
  assert.deepEqual(loaded.journey, doc.journey);
  assert.deepEqual(loaded.specs, doc.specs);
  assert.equal(loaded.items.length, 1);
  assert.equal(loaded.items[0].priceAmount, 1499);
  assert.equal(loaded.items[0].priceCurrency, 'EUR');
  assert.deepEqual(loaded.items[0].pros, []);
  assert.deepEqual(loaded.items[0].cons, []);
  assert.deepEqual(loaded.criteria, []);
});

test('heterogeneous journeys stay isolated and queryable via JSON1', async (t) => {
  const store = memDb(t);
  store.saveJourneyData('bike', 'anna', {
    status: {}, journey: [],
    items: [{ name: 'Cube', specs: 'Gewicht: 15.8 kg', status: 'Thinking' }],
    specs: [], generalNotes: '',
  });
  store.saveJourneyData('laptop', 'anna', {
    status: {}, journey: [],
    items: [{ name: 'MacBook', specs: 'CPU: M3 <br> RAM: 16 GB', status: 'Thinking' }],
    specs: [], generalNotes: '',
  });
  assert.deepEqual(store.specValues('bike', 'anna', 'gewicht'), [{ name: 'Cube', value: '15.8 kg' }]);
  assert.deepEqual(store.specValues('bike', 'anna', 'cpu'), []);
  assert.deepEqual(store.specValues('laptop', 'anna', 'cpu'), [{ name: 'MacBook', value: 'M3' }]);
  assert.deepEqual(store.listJourneys('anna').sort(), ['bike', 'laptop']);
});

test('same slug in different owner namespaces stays fully separate', async (t) => {
  const store = memDb(t);
  store.saveJourneyData('bike', 'anna', {
    status: {}, journey: [], specs: [], generalNotes: '',
    items: [{ name: 'Annas Rad', price: '999€', status: 'Thinking' }],
  });
  // Benni sieht nichts von Anna — weder Liste noch Items noch Specs.
  assert.deepEqual(store.listJourneys('benni'), []);
  assert.deepEqual(store.getJourneyData('bike', 'benni').items, []);
  assert.deepEqual(store.specValues('bike', 'benni', 'gewicht'), []);
  // Bennis Schreiben legt eine eigene, unabhängige Journey an.
  store.saveJourneyData('bike', 'benni', {
    status: {}, journey: [], specs: [], generalNotes: '',
    items: [{ name: 'Bennis Rad', price: '1€', status: 'Thinking' }],
  });
  assert.deepEqual(
    store.getJourneyData('bike', 'anna').items.map((i) => i.name),
    ['Annas Rad']
  );
  assert.deepEqual(
    store.getJourneyData('bike', 'benni').items.map((i) => i.name),
    ['Bennis Rad']
  );
  assert.deepEqual(store.listJourneys('anna'), ['bike']);
  assert.deepEqual(store.listJourneys('benni'), ['bike']);
  // Configs sind ebenfalls getrennt.
  store.saveJourneyConfig('bike', 'anna', { name: 'Annas Bikes' });
  assert.equal(store.getJourneyConfig('bike', 'anna').name, 'Annas Bikes');
  assert.equal(store.getJourneyConfig('bike', 'benni').name, 'bike');
  // Doppelte Slugs pro Owner bleiben verboten, quer ist erlaubt.
  store.createJourney('eigen', 'anna', {});
  assert.throws(() => store.createJourney('eigen', 'anna', {}), /existiert bereits/);
  store.createJourney('eigen', 'benni', {});
  // Ohne Owner geht nichts.
  assert.throws(() => store.listJourneys(''), /Owner/);
  assert.throws(() => store.getJourneyData('bike', null), /Owner/);
});

test('api keys resolve to their owner, revoke stops them', async (t) => {
  const store = memDb(t);
  assert.equal(store.isApiKeyFormat('kein-key'), false);
  assert.equal(store.isApiKeyFormat('bj_' + 'a'.repeat(64)), true);
  const created = store.createApiKey('anna', 'Muse MCP');
  assert.ok(store.isApiKeyFormat(created.key));
  assert.equal(typeof created.id, 'number');
  const hit = store.findApiKeyOwner(created.key);
  assert.equal(hit.userId, 'anna');
  assert.equal(hit.name, 'Muse MCP');
  assert.equal(store.findApiKeyOwner('bj_' + 'b'.repeat(64)), null);
  assert.equal(store.findApiKeyOwner('supabase.jwt.token'), null);
  assert.deepEqual(
    store.listApiKeys('anna').map((k) => k.name),
    ['Muse MCP']
  );
  assert.deepEqual(store.listApiKeys('benni'), []);
  assert.equal(store.revokeApiKey('benni', created.id), false);
  assert.equal(store.revokeApiKey('anna', created.id), true);
  assert.equal(store.findApiKeyOwner(created.key), null);
  assert.deepEqual(store.listApiKeys('anna'), []);
  assert.throws(() => store.createApiKey('  ', 'x'), /userId/);
});

test('unknown journeys start with defaults and reject bad input', async (t) => {
  const store = memDb(t);
  const data = store.getJourneyData('gravel', 'anna');
  assert.equal(data.status.phase, 'Planning');
  assert.deepEqual(data.items, []);
  assert.ok(store.listJourneys('anna').includes('gravel'));
  assert.throws(() => store.saveJourneyData('bike', 'anna', null), /object/);
  assert.throws(() => store.saveJourneyData('bike', 'anna', []), /object/);
  assert.throws(() => store.saveFeedback('bike', 'anna', 42), /string/);
});

test('journey config holds base properties and settings with defaults', async (t) => {
  const store = memDb(t);
  const config = store.getJourneyConfig('bike', 'anna');
  assert.equal(config.slug, 'bike');
  assert.equal(config.name, 'bike');
  assert.equal(config.description, '');
  assert.equal(config.category, '');
  assert.equal(config.currency, '€');
  assert.equal(config.sectionTitle, 'Bikes Under Consideration');
  assert.equal(config.listTitle, 'Rahmengrößen');
  assert.equal(typeof config.createdAt, 'string');
});

test('saveJourneyConfig patches fields and lists configs slug-sorted', async (t) => {
  const store = memDb(t);
  store.createJourney('zebra', 'anna', { name: 'Zebra-Zeug' });
  const updated = store.saveJourneyConfig('bike', 'anna', { name: 'Mein Bike', category: 'Fahrrad' });
  assert.equal(updated.name, 'Mein Bike');
  assert.equal(updated.category, 'fahrrad');
  const configs = store.listJourneyConfigs('anna');
  assert.deepEqual(configs.map((c) => c.slug), ['bike', 'zebra']);
  assert.equal(configs[0].name, 'Mein Bike');

  assert.throws(() => store.saveJourneyConfig('bike', 'anna', {}), /leer/);
  assert.throws(() => store.saveJourneyConfig('bike', 'anna', null), /Objekt/);
  assert.throws(() => store.saveJourneyConfig('bike', 'anna', { nope: 'x' }), /Unbekannt/);
  assert.throws(() => store.saveJourneyConfig('bike', 'anna', { name: 42 }), /String/);
  assert.throws(() => store.saveJourneyConfig('bike', 'anna', { name: 'x'.repeat(81) }), /zu lang/);
});

test('feedback round-trips with a sensible default', async (t) => {
  const store = memDb(t);
  assert.ok(store.getFeedback('bike', 'anna').includes('Feedback'));
  store.saveFeedback('bike', 'anna', 'Eigene Notizen');
  assert.equal(store.getFeedback('bike', 'anna'), 'Eigene Notizen');
});

test('legacy items with needs_content column in SQLite remain readable', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bike-legacy-db-'));
  const dbPath = path.join(dir, 'app.db');
  const first = openDatabase(dbPath);
  first.saveJourneyData('bike', 'anna', {
    status: {}, journey: [], specs: [], generalNotes: '',
    items: [{ name: 'Alt-Auto', link: 'https://example.com/auto' }],
  });
  first.close();

  const raw = new DatabaseSync(dbPath);
  raw.prepare("UPDATE items SET needs_content = 1 WHERE owner_id = 'anna' AND journey_slug = 'bike'").run();
  raw.close();

  const reopened = openDatabase(dbPath);
  t.after(() => reopened.close());
  const items = reopened.getJourneyData('bike', 'anna').items;
  assert.equal(items.length, 1);
  assert.equal(items[0].name, 'Alt-Auto');
  assert.equal('needsContent' in items[0], false);
});

test('deleteJourney removes owner journey with cascade and leaves other owners untouched', (t) => {
  const store = memDb(t);
  store.saveJourneyData('bike', 'anna', {
    status: { phase: 'Comparing' },
    journey: [{ date: '2026-07-01', event: 'Test' }],
    items: [{ name: 'Annas Rad', specs: 'Gewicht: 10 kg', status: 'Thinking' }],
    specs: [{ label: 'Größe', value: 'M' }],
    generalNotes: 'Notiz',
  });
  store.saveJourneyData('bike', 'benni', {
    status: {},
    journey: [],
    items: [{ name: 'Bennis Rad', status: 'Thinking' }],
    specs: [],
    generalNotes: '',
  });
  assert.equal(store.deleteJourney('gibt-es-nicht', 'anna'), false);
  assert.equal(store.deleteJourney('bike', 'anna'), true);
  assert.equal(store.deleteJourney('bike', 'anna'), false);
  assert.deepEqual(store.listJourneys('anna'), []);
  assert.deepEqual(store.specValues('bike', 'anna', 'gewicht'), []);
  assert.deepEqual(store.listJourneys('benni'), ['bike']);
  assert.deepEqual(store.getJourneyData('bike', 'benni').items.map((i) => i.name), ['Bennis Rad']);
});

test('applySpecAlignment speichert specComparison mit Hash-Schutz und ohne Nebenwirkungen', (t) => {
  const store = memDb(t);
  store.saveJourneyData('bike', 'anna', {
    status: { phase: 'Comparing' },
    journey: [],
    specs: [],
    generalNotes: '',
    items: [
      { name: 'Rad A', specs: 'Weight: 15 kg <br> Top-Gabel' },
      { name: 'Rad B', specs: 'Gewicht: 14 kg' },
    ],
  });
  const snap = store.getItemsSnapshot('bike', 'anna');
  assert.equal(snap.exists, true);

  // Falscher Hash wird abgelehnt (schützt neuere Edits).
  const stale = store.applySpecAlignment('bike', 'anna', {
    expectedItemsHash: 'veralteter-hash',
    updatedSpecsByIndex: ['X: 1', 'X: 2'],
    specComparison: { commonKeys: ['X'], uniqueKeys: [] },
  });
  assert.deepEqual(stale, { applied: false, reason: 'stale' });

  // Passender Hash übernimmt vereinheitlichte Specs + Vergleichsstruktur.
  const ok = store.applySpecAlignment('bike', 'anna', {
    expectedItemsHash: snap.hash,
    updatedSpecsByIndex: ['Gewicht: 15 kg <br> Top-Gabel', 'Gewicht: 14 kg'],
    specComparison: { commonKeys: ['Gewicht'], uniqueKeys: [], updatedAt: '2026-11-24T12:00:00.000Z' },
  });
  assert.deepEqual(ok, { applied: true, changedSpecs: true });

  const doc = store.getJourneyData('bike', 'anna');
  assert.equal(doc.items[0].specs, 'Gewicht: 15 kg <br> Top-Gabel');
  assert.deepEqual(doc.specComparison, {
    commonKeys: ['Gewicht'],
    uniqueKeys: [],
    updatedAt: '2026-11-24T12:00:00.000Z',
  });

  // preserveSpecComparison=true behält specComparison bei reinem Notiz-Update.
  store.saveJourneyData('bike', 'anna', { ...doc, generalNotes: 'Neu' }, { preserveSpecComparison: true });
  assert.deepEqual(store.getJourneyData('bike', 'anna').specComparison, {
    commonKeys: ['Gewicht'],
    uniqueKeys: [],
    updatedAt: '2026-11-24T12:00:00.000Z',
  });
});
