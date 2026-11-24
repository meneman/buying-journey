const { test } = require('node:test');
const assert = require('node:assert/strict');

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PROVIDERS_PATH = '../src/web/backend/crawl-providers.js';

function loadProviders() {
  delete require.cache[require.resolve(PROVIDERS_PATH)];
  return require(PROVIDERS_PATH);
}

const ENV_KEYS = [
  'CRAWL_PROVIDER',
  'CRAWL_EXTRACT_PROVIDER',
  'CRAWL_EXTRACT_CMD',
  'CRAWL_REMOTE_URL',
  'CRAWL_REMOTE_KEY',
  'CRAWL_AGY_BIN',
  'CRAWL_AGY_MODEL',
  'CRAWL_AGY_EFFORT',
  'CRAWL_AGY_TIMEOUT_MS',
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
function clearLlmEnv() {
  for (const k of ENV_KEYS) delete process.env[k];
}

test('providerNames enthält nur LLM-Provider (kein n8n, keine Crawl-Fetcher)', () => {
  const cp = loadProviders();
  assert.deepEqual(cp.providerNames(), ['remote-ai', 'agy', 'local-cmd']);
  assert.equal(cp.fetchers, undefined);
  assert.equal(cp.crawlProduct, undefined);
  assert.equal(cp.fetchProductContent, undefined);
});

test('resolveProviderName: Priorität agy > remote-ai > local-cmd, Env-Override, null ohne Config', () => {
  const snap = snapshotEnv();
  const origPath = process.env.PATH;
  try {
    clearLlmEnv();
    process.env.PATH = '/nonexistent-dir-no-agy-here';
    let cp = loadProviders();
    assert.equal(cp.providers['agy'].isConfigured(), false);
    assert.equal(cp.resolveProviderName(), null);

    // local-cmd konfiguriert -> gewählt
    process.env.CRAWL_EXTRACT_CMD = 'cat';
    assert.equal(cp.resolveProviderName(), 'local-cmd');

    // remote-ai schlägt local-cmd bei Auto-Erkennung
    process.env.CRAWL_REMOTE_URL = 'https://llm.example/run';
    assert.equal(cp.resolveProviderName(), 'remote-ai');

    // expliziter Override
    assert.equal(cp.resolveProviderName('agy'), 'agy');
    assert.equal(cp.resolveProviderName('local-cmd'), 'local-cmd');
    assert.throws(() => cp.resolveProviderName('n8n'), (err) => err && err.status === 400);
    assert.throws(() => cp.resolveProviderName('gibts-nicht'), (err) => err && err.status === 400);

    // CRAWL_EXTRACT_PROVIDER sticht CRAWL_PROVIDER
    process.env.CRAWL_PROVIDER = 'local-cmd';
    assert.equal(cp.resolveProviderName(), 'local-cmd');
    process.env.CRAWL_EXTRACT_PROVIDER = 'remote-ai';
    assert.equal(cp.resolveProviderName(), 'remote-ai');

    process.env.CRAWL_EXTRACT_PROVIDER = 'gibts-nicht';
    assert.throws(() => cp.resolveProviderName(), (err) => err && err.status === 500);
  } finally {
    process.env.PATH = origPath;
    restoreEnv(snap);
  }
});

test('listProviders listet genau die drei LLM-Provider mit Konfigurationsstatus', () => {
  const snap = snapshotEnv();
  const origPath = process.env.PATH;
  try {
    clearLlmEnv();
    process.env.PATH = '/nonexistent-dir-no-agy-here';
    process.env.CRAWL_REMOTE_URL = 'https://llm.example/run';
    const cp = loadProviders();
    const list = cp.listProviders();
    assert.deepEqual(
      list.map((p) => `${p.stage}:${p.name}`),
      ['extract:remote-ai', 'extract:agy', 'extract:local-cmd'],
    );
    assert.equal(list.find((p) => p.name === 'remote-ai').configured, true);
    assert.equal(list.find((p) => p.name === 'remote-ai').active, true);
    assert.equal(list.find((p) => p.name === 'agy').configured, false);
    assert.equal(list.find((p) => p.name === 'local-cmd').configured, false);
  } finally {
    process.env.PATH = origPath;
    restoreEnv(snap);
  }
});

test('findBinary findet Ausführbares im PATH und meldet sonst null', () => {
  const snap = snapshotEnv();
  const origPath = process.env.PATH;
  try {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bike-agy-bin-'));
    fs.writeFileSync(path.join(dir, 'mein-tool'), '#!/bin/sh\n');
    fs.chmodSync(path.join(dir, 'mein-tool'), 0o755);
    process.env.PATH = `${dir}${path.delimiter}${origPath}`;
    const cp = loadProviders();
    assert.equal(cp.findBinary('mein-tool'), path.join(dir, 'mein-tool'));
    assert.equal(cp.findBinary('gibt-es-sicher-nicht-xyz'), null);
  } finally {
    process.env.PATH = origPath;
    restoreEnv(snap);
  }
});

test('parseAgyEnvelope nutzt structured_output, sonst response-Fallback', () => {
  const cp = loadProviders();
  const obj = cp.parseAgyEnvelope(JSON.stringify({
    status: 'SUCCESS',
    response: '{"ignored":true}',
    structured_output: { commonKeys: ['Gewicht'], uniqueKeys: ['Farbe'] },
  }));
  assert.deepEqual(obj, { commonKeys: ['Gewicht'], uniqueKeys: ['Farbe'] });

  const fallback = cp.parseAgyEnvelope(JSON.stringify({
    status: 'SUCCESS',
    response: '{"ok":true}',
  }));
  assert.deepEqual(fallback, { ok: true });

  assert.throws(() => cp.parseAgyEnvelope('kein-json'), (err) => err && err.status === 502);
  assert.throws(() => cp.parseAgyEnvelope(JSON.stringify({ status: 'FAILED' })), (err) => err && err.status === 502);
  assert.throws(
    () => cp.parseAgyEnvelope(JSON.stringify({ status: 'SUCCESS', response: 'nur Text' })),
    (err) => err && err.status === 502,
  );
});

test('runLlmJson wirft 501 NO_EXTRACTOR, wenn kein Provider konfiguriert ist', async () => {
  const snap = snapshotEnv();
  const origPath = process.env.PATH;
  try {
    clearLlmEnv();
    process.env.PATH = '/nonexistent-dir-no-agy-here';
    const cp = loadProviders();
    await assert.rejects(
      cp.runLlmJson({ task: 'spec-alignment', prompt: 'Prüfe Keys' }),
      (err) => err && err.status === 501 && err.code === 'NO_EXTRACTOR',
    );
    await assert.rejects(
      cp.runLlmJson({ task: 'spec-alignment', prompt: 'Prüfe Keys', provider: 'remote-ai' }),
      (err) => err && err.status === 501 && err.code === 'NO_EXTRACTOR',
    );
  } finally {
    process.env.PATH = origPath;
    restoreEnv(snap);
  }
});

test('runLlmJson über local-cmd sendet JSON per stdin und parst stdout', async () => {
  const snap = snapshotEnv();
  const origPath = process.env.PATH;
  try {
    clearLlmEnv();
    process.env.PATH = `/nonexistent-dir-no-agy-here${path.delimiter}${origPath}`;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bike-local-llm-'));
    const captured = path.join(dir, 'stdin.json');
    process.env.CRAWL_EXTRACT_CMD = `cat > "${captured}"; printf '%s' '{"canonical":{"Weight":"Gewicht"}}'`;
    const cp = loadProviders();
    const { result, provider, meta } = await cp.runLlmJson({
      task: 'spec-alignment',
      journey: 'bike',
      prompt: 'Vereinheitliche Specs',
      payload: { keys: ['Weight', 'Gewicht'] },
      provider: 'local-cmd',
    });
    assert.equal(provider, 'local-cmd');
    assert.equal(typeof meta.extractMs, 'number');
    assert.deepEqual(result, { canonical: { Weight: 'Gewicht' } });
    const sent = JSON.parse(fs.readFileSync(captured, 'utf8'));
    assert.equal(sent.task, 'spec-alignment');
    assert.equal(sent.journey, 'bike');
    assert.deepEqual(sent.keys, ['Weight', 'Gewicht']);
  } finally {
    process.env.PATH = origPath;
    restoreEnv(snap);
  }
});

test('runLlmJson über remote-ai postet JSON und wertet Antwort aus', async () => {
  const snap = snapshotEnv();
  const realFetch = globalThis.fetch;
  try {
    clearLlmEnv();
    process.env.CRAWL_REMOTE_URL = 'https://llm.example/json';
    process.env.CRAWL_REMOTE_KEY = 'secret-token';
    let seen = null;
    globalThis.fetch = async (url, options) => {
      seen = { url, headers: options.headers, body: JSON.parse(options.body) };
      return new Response(JSON.stringify({ commonKeys: ['Gewicht'] }), { status: 200 });
    };
    const cp = loadProviders();
    const { result, provider } = await cp.runLlmJson({
      task: 'spec-alignment',
      journey: 'bike',
      prompt: 'Prüfe Keys',
      payload: { items: ['A', 'B'] },
      provider: 'remote-ai',
    });
    assert.equal(provider, 'remote-ai');
    assert.deepEqual(result, { commonKeys: ['Gewicht'] });
    assert.equal(seen.url, 'https://llm.example/json');
    assert.equal(seen.headers.Authorization, 'Bearer secret-token');
    assert.equal(seen.body.task, 'spec-alignment');
    assert.deepEqual(seen.body.items, ['A', 'B']);
  } finally {
    globalThis.fetch = realFetch;
    restoreEnv(snap);
  }
});

test('runLlmJson über agy ruft Binary im plan-Mode mit optionalem JSON-Schema auf', async () => {
  const snap = snapshotEnv();
  const origPath = process.env.PATH;
  const prevDump = process.env.AGY_ARGS_DUMP;
  try {
    clearLlmEnv();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bike-agy-run-'));
    const schemaFile = path.join(dir, 'schema.json');
    fs.writeFileSync(schemaFile, '{"type":"object"}');
    fs.writeFileSync(path.join(dir, 'envelope.json'), JSON.stringify({
      status: 'SUCCESS',
      response: '',
      structured_output: { commonKeys: ['Akku'], uniqueKeys: [] },
    }));
    fs.writeFileSync(path.join(dir, 'agy'), '#!/bin/sh\necho "$@" > "$AGY_ARGS_DUMP"\ncat "$AGY_ENVELOPE"\n');
    fs.chmodSync(path.join(dir, 'agy'), 0o755);
    process.env.PATH = `${dir}${path.delimiter}${origPath}`;
    process.env.AGY_ARGS_DUMP = path.join(dir, 'args.txt');
    process.env.AGY_ENVELOPE = path.join(dir, 'envelope.json');
    const cp = loadProviders();
    const { result, provider } = await cp.runLlmJson({
      task: 'spec-alignment',
      prompt: 'Analysiere Specs',
      schemaPath: schemaFile,
      provider: 'agy',
    });
    assert.equal(provider, 'agy');
    assert.deepEqual(result, { commonKeys: ['Akku'], uniqueKeys: [] });
    const argv = fs.readFileSync(path.join(dir, 'args.txt'), 'utf8');
    assert.ok(argv.includes('--mode plan'));
    assert.ok(argv.includes('--json-schema'));
    assert.ok(argv.includes(schemaFile));
  } finally {
    process.env.PATH = origPath;
    if (prevDump === undefined) delete process.env.AGY_ARGS_DUMP;
    else process.env.AGY_ARGS_DUMP = prevDump;
    delete process.env.AGY_ENVELOPE;
    restoreEnv(snap);
  }
});
