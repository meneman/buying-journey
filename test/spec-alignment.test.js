const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const {
  computeDeterministicSpecComparison,
  extractKeyMappings,
  applyKeyMappingsToItems,
  alignJourneySpecs,
} = require('../src/web/backend/spec-alignment.js');

const SERVER_PATH = '../src/web/backend/server.js';
const STORE_PATH = '../src/db/store.js';

const ENV_KEYS = [
  'PORT',
  'DB_PATH',
  'FRONTEND_DIST',
  'CRAWL_PROVIDER',
  'CRAWL_EXTRACT_PROVIDER',
  'CRAWL_EXTRACT_CMD',
  'CRAWL_REMOTE_URL',
  'CRAWL_REMOTE_KEY',
  'CRAWL_AGY_BIN',
  'SPEC_ALIGNMENT_DEBOUNCE_MS',
];

function snapshotEnv() {
  return Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
}

function restoreEnv(snap) {
  for (const k of ENV_KEYS) {
    if (snap[k] === undefined) delete process.env[k];
    else process.env[k] = snap[k];
  }
}

async function startApp(t, envOverrides = {}) {
  const snap = snapshotEnv();
  const origPath = process.env.PATH;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bike-align-test-'));
  for (const mod of [SERVER_PATH, STORE_PATH]) {
    delete require.cache[require.resolve(mod)];
  }
  for (const k of ENV_KEYS) delete process.env[k];
  process.env.PATH = `/nonexistent-no-agy${path.delimiter}${origPath}`;
  const dbPath = path.join(dir, 'app.db');
  Object.assign(process.env, {
    PORT: '0',
    DB_PATH: dbPath,
    SPEC_ALIGNMENT_DEBOUNCE_MS: '30',
    ...envOverrides,
  });

  const { app, closeDatabase } = require(SERVER_PATH);
  const httpServer = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${httpServer.address().port}`;

  const { openDatabase } = require(STORE_PATH);
  const keyStore = openDatabase(dbPath);
  const key = keyStore.createApiKey('anna', 'test-key').key;
  keyStore.close();

  t.after(() => {
    httpServer.closeAllConnections();
    httpServer.close();
    closeDatabase();
    process.env.PATH = origPath;
    restoreEnv(snap);
  });

  return { base, key, dir };
}

function openSse(base, journey, token) {
  const url = `${base}/api/data/events?journey=${encodeURIComponent(journey)}`;
  const events = [];
  let buffer = '';
  const req = http.get(url, { headers: { Accept: 'text/event-stream', Authorization: `Bearer ${token}` } }, (res) => {
    res.setEncoding('utf8');
    res.on('data', (chunk) => {
      buffer += chunk;
      let idx;
      while ((idx = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const eventLine = block.split('\n').find((l) => l.startsWith('event:'));
        const dataLines = block.split('\n').filter((l) => l.startsWith('data:'));
        if (!eventLine) continue;
        events.push({
          event: eventLine.slice('event:'.length).trim(),
          data: dataLines.map((l) => l.slice('data:'.length).trim()).join('\n'),
        });
      }
    });
  });
  return { events, close: () => req.destroy() };
}

async function waitFor(predicate, timeoutMs, label) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await predicate();
    if (res) return res;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`Timeout beim Warten auf: ${label}`);
}

async function postData(base, key, journey, doc) {
  return fetch(`${base}/api/data?journey=${encodeURIComponent(journey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(doc),
  });
}

async function getData(base, key, journey) {
  const res = await fetch(`${base}/api/data?journey=${encodeURIComponent(journey)}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  return res.json();
}

test('computeDeterministicSpecComparison gruppiert case-insensitiv in commonKeys und uniqueKeys', () => {
  const empty = computeDeterministicSpecComparison([]);
  assert.deepEqual(empty, { commonKeys: [], uniqueKeys: [] });

  const one = computeDeterministicSpecComparison([{ name: 'A', specs: 'Weight: 10 kg <br> Nur Text' }]);
  assert.deepEqual(one, { commonKeys: ['Weight'], uniqueKeys: [] });

  const multi = computeDeterministicSpecComparison([
    { name: 'A', specs: 'Weight: 10 kg <br> Akku: 500 Wh <br> Freitext' },
    { name: 'B', specs: 'weight: 12 kg <br> Farbe: Rot <br> Akku: ' },
  ], { updatedAt: '2026-11-24T12:00:00.000Z' });
  assert.deepEqual(multi, {
    commonKeys: ['Weight'],
    uniqueKeys: ['Akku', 'Farbe'],
    updatedAt: '2026-11-24T12:00:00.000Z',
  });
});

test('applyKeyMappingsToItems vereinheitlicht Keys, bewahrt Reihenfolge/Werte/Freitext und dedupliziert', () => {
  const items = [
    { name: 'Rad A', specs: 'Weight: 15 kg <br> Carbon-Gabel <br> Gesamtgewicht: 15 kg' },
    { name: 'Rad B', specs: 'Gewicht: 14 kg <br> Rahmen: Alu' },
  ];
  const mapping = extractKeyMappings(items, {
    keyMappings: [
      { from: 'Weight', to: 'Gewicht' },
      { from: 'Gesamtgewicht', to: 'Gewicht' },
      { from: 'Unbekannt', to: 'Ignoriert' },
      { from: 'Rahmen', to: 'Ungueltig:Doppelpunkt' },
    ],
  });
  assert.equal(mapping.get('weight'), 'Gewicht');
  assert.equal(mapping.get('gesamtgewicht'), 'Gewicht');
  assert.equal(mapping.has('unbekannt'), false);
  assert.equal(mapping.has('rahmen'), false);

  const { updatedSpecsByIndex, changedSpecs } = applyKeyMappingsToItems(items, mapping);
  assert.equal(changedSpecs, true);
  assert.equal(updatedSpecsByIndex[0], 'Gewicht: 15 kg <br> Carbon-Gabel');
  assert.equal(updatedSpecsByIndex[1], 'Gewicht: 14 kg <br> Rahmen: Alu');
});

test('alignJourneySpecs: < 2 Items, keine Specs, kein Provider und LLM-Fehler nutzen stillen Fallback', async () => {
  const snap = snapshotEnv();
  const origPath = process.env.PATH;
  try {
    for (const k of ENV_KEYS) delete process.env[k];
    process.env.PATH = '/nonexistent-no-agy';

    let called = 0;
    const stubLlm = async () => {
      called += 1;
      return { result: { keyMappings: [], commonKeys: [], uniqueKeys: [] }, provider: 'local-cmd' };
    };

    // < 2 Items -> kein LLM-Call
    const single = await alignJourneySpecs({
      journey: 'bike',
      items: [{ name: 'A', specs: 'Weight: 10 kg' }],
      runLlm: stubLlm,
    });
    assert.equal(single.usedLlm, false);
    assert.equal(called, 0);

    // >= 2 Items ohne benannte Specs -> kein LLM-Call
    const noSpecs = await alignJourneySpecs({
      journey: 'bike',
      items: [{ name: 'A', specs: 'nur Freitext' }, { name: 'B', specs: '' }],
      runLlm: stubLlm,
    });
    assert.equal(noSpecs.usedLlm, false);
    assert.equal(called, 0);

    // Kein Provider konfiguriert -> stiller Fallback ohne Key-Umbenennung
    const noProvider = await alignJourneySpecs({
      journey: 'bike',
      items: [
        { name: 'A', specs: 'Weight: 10 kg' },
        { name: 'B', specs: 'Gewicht: 12 kg' },
      ],
      runLlm: stubLlm,
    });
    assert.equal(noProvider.usedLlm, false);
    assert.equal(called, 0);
    assert.deepEqual(noProvider.updatedSpecsByIndex, ['Weight: 10 kg', 'Gewicht: 12 kg']);
    assert.deepEqual(noProvider.specComparison.uniqueKeys, ['Weight', 'Gewicht']);

    // Provider konfiguriert, aber LLM wirft Fehler -> stiller Fallback
    process.env.CRAWL_EXTRACT_CMD = 'cat';
    const failed = await alignJourneySpecs({
      journey: 'bike',
      items: [
        { name: 'A', specs: 'Weight: 10 kg <br> Rahmen: Alu' },
        { name: 'B', specs: 'Gewicht: 12 kg <br> rahmen: Carbon' },
      ],
      runLlm: async () => {
        called += 1;
        throw new Error('LLM offline');
      },
    });
    assert.equal(called, 1);
    assert.equal(failed.usedLlm, false);
    assert.equal(failed.changedSpecs, false);
    assert.deepEqual(failed.updatedSpecsByIndex, [
      'Weight: 10 kg <br> Rahmen: Alu',
      'Gewicht: 12 kg <br> rahmen: Carbon',
    ]);
    assert.deepEqual(failed.specComparison.commonKeys, ['Rahmen']);
    assert.deepEqual(failed.specComparison.uniqueKeys, ['Weight', 'Gewicht']);
  } finally {
    process.env.PATH = origPath;
    restoreEnv(snap);
  }
});

test('Integration: POST /api/data antwortet sofort, LLM-Stub vereinheitlicht Specs, feuert SSE und triggert keine Schleife', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bike-llm-stub-'));
  const callLog = path.join(dir, 'calls.log');
  const stubScript = path.join(dir, 'llm-stub.sh');
  fs.writeFileSync(
    stubScript,
    `#!/bin/sh
echo "call" >> "${callLog}"
sleep 0.08
printf '%s' '{"keyMappings":[{"from":"Weight","to":"Gewicht"},{"from":"Gesamtgewicht","to":"Gewicht"}],"commonKeys":["Gewicht","Rahmen"],"uniqueKeys":["Akku","Farbe"]}'
`
  );
  fs.chmodSync(stubScript, 0o755);

  const { base, key } = await startApp(t, {
    CRAWL_EXTRACT_PROVIDER: 'local-cmd',
    CRAWL_EXTRACT_CMD: stubScript,
    SPEC_ALIGNMENT_DEBOUNCE_MS: '20',
  });

  const sse = openSse(base, 'bike', key);
  t.after(() => sse.close());
  await waitFor(() => sse.events.find((e) => e.event === 'ready'), 2000, 'SSE ready');

  const res = await postData(base, key, 'bike', {
    status: { phase: 'Comparing' },
    journey: [],
    specs: [],
    generalNotes: '',
    items: [
      { name: 'Rad 1', specs: 'Weight: 15.2 kg <br> Rahmen: Alu <br> Akku: 625 Wh <br> Top-Gabel' },
      { name: 'Rad 2', specs: 'Gesamtgewicht: 14.1 kg <br> Rahmen: Carbon <br> Farbe: Grün' },
    ],
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { success: true });

  // Haupt-Request kehrte sofort zurück, bevor der 80ms-Stub fertig war.
  const syncEvent = await waitFor(
    () =>
      sse.events.find((e) => {
        if (e.event !== 'journey-updated') return false;
        const p = JSON.parse(e.data);
        return p.reason === 'property-sync';
      }),
    3000,
    'SSE property-sync'
  );
  assert.equal(JSON.parse(syncEvent.data).slug, 'bike');

  const doc = await getData(base, key, 'bike');
  assert.equal(doc.items[0].specs, 'Gewicht: 15.2 kg <br> Rahmen: Alu <br> Akku: 625 Wh <br> Top-Gabel');
  assert.equal(doc.items[1].specs, 'Gewicht: 14.1 kg <br> Rahmen: Carbon <br> Farbe: Grün');
  assert.deepEqual(doc.specComparison.commonKeys, ['Gewicht', 'Rahmen']);
  assert.deepEqual(doc.specComparison.uniqueKeys, ['Akku', 'Farbe']);
  assert.equal(typeof doc.specComparison.updatedAt, 'string');

  // Loop-Schutz: Ein weiteres Nicht-Item-Update triggert keinen erneuten LLM-Call
  // und erhält specComparison.
  await postData(base, key, 'bike', {
    ...doc,
    generalNotes: 'Notiz ergänzt',
  });
  await new Promise((r) => setTimeout(r, 150));

  const lines = fs.readFileSync(callLog, 'utf8').trim().split('\n').filter(Boolean);
  assert.equal(lines.length, 1, `LLM-Stub darf genau 1x laufen, lief aber ${lines.length}x`);

  const afterNotes = await getData(base, key, 'bike');
  assert.equal(afterNotes.generalNotes, 'Notiz ergänzt');
  assert.deepEqual(afterNotes.specComparison.commonKeys, ['Gewicht', 'Rahmen']);
});

test('Integration: Debounce (Latest-wins) und Race-Condition-Schutz überschreiben keine neueren Nutzer-Edits', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bike-race-stub-'));
  const callLog = path.join(dir, 'calls.log');
  const gateFile = path.join(dir, 'gate');
  const stubScript = path.join(dir, 'race-stub.sh');
  // Beim ersten Aufruf wartet der Stub auf `gateFile`, sodass ein zwischenzeitlicher
  // Nutzer-Edit den Hash in der DB ändert, bevor der erste Job committet.
  fs.writeFileSync(
    stubScript,
    `#!/bin/sh
echo "call" >> "${callLog}"
COUNT=$(wc -l < "${callLog}" | tr -d ' ')
if [ "$COUNT" = "1" ]; then
  while [ ! -f "${gateFile}" ]; do sleep 0.02; done
  printf '%s' '{"keyMappings":[{"from":"Weight","to":"AlteUmbenennung"}],"commonKeys":["AlteUmbenennung"],"uniqueKeys":[]}'
else
  printf '%s' '{"keyMappings":[{"from":"Weight","to":"Gewicht"}],"commonKeys":["Gewicht"],"uniqueKeys":["Neu"]}'
fi
`
  );
  fs.chmodSync(stubScript, 0o755);

  const { base, key } = await startApp(t, {
    CRAWL_EXTRACT_PROVIDER: 'local-cmd',
    CRAWL_EXTRACT_CMD: stubScript,
    SPEC_ALIGNMENT_DEBOUNCE_MS: '25',
  });

  // 1. Snapshot A triggert Job 1 (wartet auf gateFile).
  await postData(base, key, 'bike', {
    status: {}, journey: [], specs: [], generalNotes: '',
    items: [
      { name: 'Rad A', specs: 'Weight: 15 kg' },
      { name: 'Rad B', specs: 'Gewicht: 14 kg' },
    ],
  });

  await waitFor(() => fs.existsSync(callLog), 2000, 'Job 1 gestartet');

  // 2. Während Job 1 läuft: Nutzer editiert Item A und fügt Spec "Neu" hinzu (Snapshot B).
  await postData(base, key, 'bike', {
    status: {}, journey: [], specs: [], generalNotes: '',
    items: [
      { name: 'Rad A', price: '1999€', specs: 'Weight: 15 kg <br> Neu: Ja' },
      { name: 'Rad B', specs: 'Gewicht: 14 kg' },
    ],
  });

  // Gate für Job 1 öffnen — Job 1 muss sein veraltetes Ergebnis verwerfen!
  fs.writeFileSync(gateFile, 'go');

  await waitFor(
    () => {
      if (!fs.existsSync(callLog)) return false;
      const lines = fs.readFileSync(callLog, 'utf8').trim().split('\n').filter(Boolean);
      return lines.length >= 2;
    },
    3000,
    'Job 2 abgeschlossen'
  );

  const resolved = await waitFor(
    async () => {
      const d = await getData(base, key, 'bike');
      return d.specComparison && d.specComparison.commonKeys.includes('Gewicht') ? d : null;
    },
    2000,
    'Gewicht im finalen Dokument'
  );
  assert.equal(resolved.items[0].price, '1999€');
  assert.equal(resolved.items[0].specs, 'Gewicht: 15 kg <br> Neu: Ja');
  assert.ok(!resolved.items[0].specs.includes('AlteUmbenennung'));
  assert.deepEqual(resolved.specComparison.commonKeys, ['Gewicht']);
  assert.deepEqual(resolved.specComparison.uniqueKeys, ['Neu']);
});

test('Integration: Fehlerhafter LLM-Provider fällt still auf deterministische Gruppierung zurück', async (t) => {
  const { base, key } = await startApp(t, {
    CRAWL_EXTRACT_PROVIDER: 'local-cmd',
    CRAWL_EXTRACT_CMD: 'exit 1',
    SPEC_ALIGNMENT_DEBOUNCE_MS: '10',
  });

  const res = await postData(base, key, 'bike', {
    status: {}, journey: [], specs: [], generalNotes: '',
    items: [
      { name: 'Rad A', specs: 'Weight: 15 kg <br> Rahmen: Alu' },
      { name: 'Rad B', specs: 'Gewicht: 14 kg <br> rahmen: Carbon' },
    ],
  });
  assert.equal(res.status, 200);

  const doc = await waitFor(
    async () => {
      const d = await getData(base, key, 'bike');
      return d.specComparison ? d : null;
    },
    2000,
    'Fallback specComparison gespeichert'
  );
  assert.equal(doc.items[0].specs, 'Weight: 15 kg <br> Rahmen: Alu');
  assert.equal(doc.items[1].specs, 'Gewicht: 14 kg <br> rahmen: Carbon');
  assert.deepEqual(doc.specComparison.commonKeys, ['Rahmen']);
  assert.deepEqual(doc.specComparison.uniqueKeys, ['Weight', 'Gewicht']);
});
