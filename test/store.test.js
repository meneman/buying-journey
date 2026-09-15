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
  store.saveJourneyData('bike', doc);
  assert.deepEqual(store.getJourneyData('bike'), {
    ...doc,
    headers: ['Name', 'Price', 'Specs', 'Rating', 'Status', 'Notes', 'Link'],
  });
});

test('heterogeneous journeys stay isolated and queryable via JSON1', async (t) => {
  const store = memDb(t);
  store.saveJourneyData('bike', {
    status: {}, journey: [],
    items: [{ name: 'Cube', specs: 'Gewicht: 15.8 kg', status: 'Thinking' }],
    specs: [], generalNotes: '',
  });
  store.saveJourneyData('laptop', {
    status: {}, journey: [],
    items: [{ name: 'MacBook', specs: 'CPU: M3 <br> RAM: 16 GB', status: 'Thinking' }],
    specs: [], generalNotes: '',
  });
  assert.deepEqual(store.specValues('bike', 'gewicht'), [{ name: 'Cube', value: '15.8 kg' }]);
  assert.deepEqual(store.specValues('bike', 'cpu'), []);
  assert.deepEqual(store.specValues('laptop', 'cpu'), [{ name: 'MacBook', value: 'M3' }]);
  assert.deepEqual(store.listJourneys().sort(), ['bike', 'laptop']);
});

test('unknown journeys start with defaults and reject bad input', async (t) => {
  const store = memDb(t);
  const data = store.getJourneyData('gravel');
  assert.equal(data.status.phase, 'Planning');
  assert.deepEqual(data.items, []);
  assert.ok(store.listJourneys().includes('gravel'));
  assert.throws(() => store.saveJourneyData('bike', null), /object/);
  assert.throws(() => store.saveJourneyData('bike', []), /object/);
  assert.throws(() => store.saveFeedback('bike', 42), /string/);
});

test('journey config holds base properties and settings with defaults', async (t) => {
  const store = memDb(t);
  const config = store.getJourneyConfig('bike');
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
  store.createJourney('zebra', { name: 'Zebra-Zeug' });
  const updated = store.saveJourneyConfig('bike', { name: 'Mein Bike', category: 'Fahrrad' });
  assert.equal(updated.name, 'Mein Bike');
  assert.equal(updated.category, 'fahrrad');
  const configs = store.listJourneyConfigs();
  assert.deepEqual(configs.map((c) => c.slug), ['bike', 'zebra']);
  assert.equal(configs[0].name, 'Mein Bike');

  assert.throws(() => store.saveJourneyConfig('bike', {}), /leer/);
  assert.throws(() => store.saveJourneyConfig('bike', null), /Objekt/);
  assert.throws(() => store.saveJourneyConfig('bike', { nope: 'x' }), /Unbekannt/);
  assert.throws(() => store.saveJourneyConfig('bike', { name: 42 }), /String/);
  assert.throws(() => store.saveJourneyConfig('bike', { name: 'x'.repeat(81) }), /zu lang/);
});

test('feedback round-trips with a sensible default', async (t) => {
  const store = memDb(t);
  assert.ok(store.getFeedback('bike').includes('Feedback'));
  store.saveFeedback('bike', 'Eigene Notizen');
  assert.equal(store.getFeedback('bike'), 'Eigene Notizen');
});
