const { test } = require('node:test');
const assert = require('node:assert/strict');

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
  assert.deepEqual(store.getJourneyData('bike', 'anna'), {
    ...doc,
    headers: ['Name', 'Price', 'Specs', 'Rating', 'Status', 'Notes', 'Link'],
  });
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

test('needsContent-Flag übersteht den Save/Get-Roundtrip (gesetzt und ungesetzt)', async (t) => {
  const store = memDb(t);
  store.saveJourneyData('bike', 'anna', {
    status: {}, journey: [], specs: [], generalNotes: '',
    items: [
      { name: 'Blockiert-Auto', link: 'https://example.com/auto', needsContent: true },
      { name: 'Normal-Bike', link: 'https://example.com/bike' },
    ],
  });
  const items = store.getJourneyData('bike', 'anna').items;
  assert.equal(items[0].needsContent, true);
  assert.ok(!('needsContent' in items[1]), 'ungesetztes Flag darf nicht im Drahtformat auftauchen');
  // Flag lässt sich durch erneutes Speichern ohne Flag wieder löschen.
  store.saveJourneyData('bike', 'anna', {
    status: {}, journey: [], specs: [], generalNotes: '',
    items: [{ name: 'Blockiert-Auto', link: 'https://example.com/auto' }],
  });
  assert.ok(!('needsContent' in store.getJourneyData('bike', 'anna').items[0]));
});
