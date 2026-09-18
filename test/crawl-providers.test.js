const { test } = require('node:test');
const assert = require('node:assert/strict');

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PROVIDERS_PATH = '../src/web/backend/crawl-providers.js';
const SERVER_PATH = '../src/web/backend/server.js';
const STORE_PATH = '../src/db/store.js';

function loadProviders() {
  delete require.cache[require.resolve(PROVIDERS_PATH)];
  return require(PROVIDERS_PATH);
}

const ENV_KEYS = [
  'CRAWL_PROVIDER',
  'CRAWL_EXTRACT_PROVIDER',
  'CRAWL_FETCH_PROVIDER',
  'CRAWL_FETCH_CMD',
  'CRAWL_EXTRACT_CMD',
  'CRAWL_REMOTE_URL',
  'CRAWL_REMOTE_KEY',
  'CRAWL_MAX_CHARS',
  'CRAWL_AGY_BIN',
  'CRAWL_AGY_MODEL',
  'CRAWL_AGY_EFFORT',
  'CRAWL_AGY_TIMEOUT_MS',
  'CRAWL_DIRECT_MIN_CHARS',
  'CRAWL_HEADLESS_TIMEOUT_MS',
  'N8N_WEBHOOK_URL',
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
function clearCrawlEnv() {
  for (const k of ENV_KEYS) delete process.env[k];
}

test('validateLink akzeptiert http(s) und weist Rest mit 400 ab', () => {
  const snap = snapshotEnv();
  try {
    const cp = loadProviders();
    assert.ok(cp.validateLink('https://example.com/produkt'));
    assert.ok(cp.validateLink('http://example.com/'));
    for (const bad of [undefined, null, '', 42, {}, 'keine-url', 'ftp://example.com/x']) {
      assert.throws(() => cp.validateLink(bad), (err) => err && err.status === 400, `erwartet 400 für ${String(bad)}`);
    }
  } finally {
    restoreEnv(snap);
  }
});

test('toJourneyItem mappt Rohdaten aufs App-Format mit Defaults', () => {
  const snap = snapshotEnv();
  try {
    const cp = loadProviders();
    assert.deepEqual(
      cp.toJourneyItem(
        { name: 'Cube', price: '1499€', specs: [{ label: 'Rahmen', value: 'Alu' }], rating: 4, status: 'Shortlisted', notes: 'top', link: 'https://shop.example/cube' },
        'https://fallback.example',
      ),
      {
        name: 'Cube',
        price: '1499€',
        specs: 'Rahmen: Alu',
        rating: '⭐⭐⭐⭐',
        status: 'Shortlisted',
        notes: 'top',
        link: 'https://shop.example/cube',
      },
    );
    // Defaults: leere Felder, Thinking-Status, Fallback-Link.
    assert.deepEqual(cp.toJourneyItem({ name: 'Namenlos' }, 'https://fallback.example'), {
      name: 'Namenlos',
      price: '',
      specs: '',
      rating: '',
      status: 'Thinking',
      notes: '',
      link: 'https://fallback.example',
    });
  } finally {
    restoreEnv(snap);
  }
});

test('resolveProviderName: Default agy/n8n, Env-Override, unbekannt -> Fehler', () => {
  const snap = snapshotEnv();
  const origPath = process.env.PATH;
  try {
    clearCrawlEnv();
    let cp = loadProviders();
    // Default hängt vom agy-Binary ab (Maschine mit/ohne agy).
    assert.equal(cp.resolveProviderName(), cp.providers['agy'].isConfigured() ? 'agy' : 'n8n');
    assert.equal(cp.resolveProviderName('remote-ai'), 'remote-ai');
    assert.equal(cp.resolveProviderName('agy'), 'agy');
    assert.throws(() => cp.resolveProviderName('gibts-nicht'), (err) => err && err.status === 400);

    process.env.CRAWL_PROVIDER = 'local-cmd';
    cp = loadProviders();
    assert.equal(cp.resolveProviderName(), 'local-cmd');

    // CRAWL_EXTRACT_PROVIDER sticht CRAWL_PROVIDER (Legacy-Alias).
    process.env.CRAWL_EXTRACT_PROVIDER = 'remote-ai';
    assert.equal(cp.resolveProviderName(), 'remote-ai');

    process.env.CRAWL_EXTRACT_PROVIDER = 'gibts-nicht';
    assert.throws(() => cp.resolveProviderName(), (err) => err && err.status === 500);

    // Ohne agy im PATH fällt der Default auf n8n zurück.
    delete process.env.CRAWL_EXTRACT_PROVIDER;
    delete process.env.CRAWL_PROVIDER;
    process.env.PATH = '/nonexistent-dir-no-agy-here';
    assert.equal(cp.providers['agy'].isConfigured(), false);
    assert.equal(cp.resolveProviderName(), 'n8n');
  } finally {
    process.env.PATH = origPath;
    restoreEnv(snap);
  }
});

test('resolveFetcherName: Default direct, Override, unbekannt -> Fehler', () => {
  const snap = snapshotEnv();
  try {
    clearCrawlEnv();
    const cp = loadProviders();
    assert.equal(cp.resolveFetcherName(), 'direct');
    assert.equal(cp.resolveFetcherName('local-cmd'), 'local-cmd');
    assert.throws(() => cp.resolveFetcherName('gibts-nicht'), (err) => err && err.status === 400);

    process.env.CRAWL_FETCH_PROVIDER = 'local-cmd';
    assert.equal(cp.resolveFetcherName(), 'local-cmd');

    process.env.CRAWL_FETCH_PROVIDER = 'gibts-nicht';
    assert.throws(() => cp.resolveFetcherName(), (err) => err && err.status === 500);
  } finally {
    restoreEnv(snap);
  }
});

test('listProviders meldet Extraktoren und Fetcher mit Stufe und Status', () => {
  const snap = snapshotEnv();
  try {
    clearCrawlEnv();
    const cp = loadProviders();
    const list = cp.listProviders();
    assert.deepEqual(
      list.map((p) => `${p.stage}:${p.name}`),
      ['extract:n8n', 'extract:remote-ai', 'extract:agy', 'extract:local-cmd', 'fetch:direct', 'fetch:headless', 'fetch:local-cmd'],
    );
    // direct ist immer konfiguriert, der Rest ohne Env/Binary nicht (headless,
    // wenn Puppeteer installiert ist).
    assert.equal(list.find((p) => p.name === 'direct').configured, true);
    assert.equal(list.find((p) => p.name === 'headless').configured, cp.fetchers['headless'].isConfigured());
    assert.ok(list.filter((p) => !['direct', 'agy', 'headless'].includes(p.name)).every((p) => p.configured === false));
    assert.equal(list.find((p) => p.name === 'agy').configured, cp.providers['agy'].isConfigured());
    // Aktiver Extraktor = agy wenn verfügbar, sonst n8n.
    const expectedActive = cp.providers['agy'].isConfigured() ? 'agy' : 'n8n';
    assert.equal(list.find((p) => p.stage === 'extract' && p.active).name, expectedActive);
    assert.equal(list.find((p) => p.name === 'direct').active, true);
  } finally {
    restoreEnv(snap);
  }
});

test('Pipeline: Parse-Tool (local-cmd) + LLM-Auswertung (local-cmd via stdin)', async () => {
  const snap = snapshotEnv();
  try {
    clearCrawlEnv();
    // Parse-Stub: liefert Content-JSON auf stdout …
    process.env.CRAWL_FETCH_CMD = `printf '%s' '{"title":"Stub-Seite","text":"Cube Kathmandu Pro 1499 Euro"}'`;
    // … Auswertungs-Stub: liest Content-JSON von stdin, liefert Produkt-JSON.
    process.env.CRAWL_EXTRACT_CMD = `cat >/dev/null; printf '%s' '{"name":"Stub-Bike","price":"999€"}'`;
    const cp = loadProviders();
    const { raw, provider, fetcher } = await cp.crawlProduct({
      url: 'https://example.com/bike',
      journey: 'bike',
      provider: 'local-cmd',
      fetcher: 'local-cmd',
    });
    assert.equal(provider, 'local-cmd');
    assert.equal(fetcher, 'local-cmd');
    assert.equal(raw.name, 'Stub-Bike');
    assert.equal(cp.toJourneyItem(raw, 'https://example.com/bike').price, '999€');
  } finally {
    restoreEnv(snap);
  }
});

test('Pipeline: direct-Fetch (gemockt) + Remote-AI (gemockt) mit Titel+Text', async () => {
  const snap = snapshotEnv();
  const realFetch = globalThis.fetch;
  try {
    clearCrawlEnv();
    process.env.CRAWL_REMOTE_URL = 'https://llm.example/extract';
    let seenBody = null;
    globalThis.fetch = async (url, options) => {
      if (String(url) === 'https://llm.example/extract') {
        seenBody = JSON.parse(options.body);
        return new Response(JSON.stringify({ name: 'AI-Bike', price: '123€' }), { status: 200 });
      }
      // Inhalt über der Fallback-Schwelle, damit direct genommen wird.
      const filler = 'Leichtes Trekkingrad mit Shimano Deore Schaltung. '.repeat(60);
      return new Response(
        `<html><head><title>Shop-Bike</title></head><body><h1>Cube</h1><p>Preis 123 Euro. ${filler}</p></body></html>`,
        { status: 200, headers: { 'Content-Type': 'text/html' } },
      );
    };
    const cp = loadProviders();
    const { raw, provider, fetcher } = await cp.crawlProduct({
      url: 'https://example.com/bike',
      journey: 'bike',
      provider: 'remote-ai',
    });
    assert.equal(provider, 'remote-ai');
    assert.equal(fetcher, 'direct');
    assert.equal(raw.name, 'AI-Bike');
    // Die LLM bekommt geparsten Inhalt, nicht die rohe URL-Antwort.
    assert.equal(seenBody.title, 'Shop-Bike');
    assert.ok(seenBody.text.includes('Cube'));
    assert.ok(!seenBody.text.includes('<h1>'));
  } finally {
    globalThis.fetch = realFetch;
    restoreEnv(snap);
  }
});

test('parseAgyEnvelope nutzt structured_output, sonst response-Fallback', () => {
  const snap = snapshotEnv();
  try {
    const cp = loadProviders();
    // Primärquelle: structured_output (echte Hüllkurven-Form).
    const product = cp.parseAgyEnvelope(JSON.stringify({
      status: 'SUCCESS',
      response: '{"name":"X"}garbage',
      structured_output: { name: 'Agy-Bike', price: '777€', rating: 0, status: 'Thinking', notes: '', link: 'https://example.com/bike' },
    }));
    assert.equal(product.name, 'Agy-Bike');
    assert.equal(product.price, '777€');
    // Fallback: sauberes Produkt-JSON im response-Text.
    const fallback = cp.parseAgyEnvelope(JSON.stringify({
      status: 'SUCCESS',
      response: '{"name":"Fallback-Bike"}',
    }));
    assert.equal(fallback.name, 'Fallback-Bike');
    // Fehlerfälle: kein Erfolg, Müll, Produkt ohne Name.
    assert.throws(() => cp.parseAgyEnvelope('kein-json'), (err) => err && err.status === 502);
    assert.throws(() => cp.parseAgyEnvelope(JSON.stringify({ status: 'FAILED' })), (err) => err && err.status === 502);
    assert.throws(
      () => cp.parseAgyEnvelope(JSON.stringify({ status: 'SUCCESS', response: 'nur Text' })),
      (err) => err && err.status === 502,
    );
  } finally {
    restoreEnv(snap);
  }
});

test('buildAgyPrompt bettet URL, Journey und Inhalt ohne Tools ein', () => {
  const snap = snapshotEnv();
  try {
    const cp = loadProviders();
    const prompt = cp.buildAgyPrompt('https://example.com/bike', 'bike', { title: 'Shop', text: 'Cube 1499' });
    assert.ok(prompt.includes('keine Tools'));
    assert.ok(prompt.includes('https://example.com/bike'));
    assert.ok(prompt.includes('bike'));
    assert.ok(prompt.includes('Cube 1499'));
  } finally {
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

test('Pipeline: direct-Fetch (gemockt) + agy-Extraktion (Fake-Binary)', async () => {
  const snap = snapshotEnv();
  const origPath = process.env.PATH;
  const realFetch = globalThis.fetch;
  const prevArgsDump = process.env.AGY_ARGS_DUMP;
  try {
    clearCrawlEnv();
    // Fake-agy: zeichnet argv auf und antwortet mit fester Hüllkurve
    // (JSON als Datei, damit kein Shell-Quoting nötig ist).
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bike-agy-e2e-'));
    fs.writeFileSync(path.join(dir, 'envelope.json'), JSON.stringify({
      status: 'SUCCESS',
      response: '',
      structured_output: { name: 'Agy-Bike', price: '777€', specs: '', rating: 0, status: 'Thinking', notes: '', link: 'https://example.com/bike' },
    }));
    fs.writeFileSync(path.join(dir, 'agy'), '#!/bin/sh\necho "$@" > "$AGY_ARGS_DUMP"\ncat "$AGY_ENVELOPE"\n');
    fs.chmodSync(path.join(dir, 'agy'), 0o755);
    process.env.PATH = `${dir}${path.delimiter}${origPath}`;
    process.env.AGY_ARGS_DUMP = path.join(dir, 'args.txt');
    process.env.AGY_ENVELOPE = path.join(dir, 'envelope.json');
    // Realistisch lange Seite (deutlich über der Fallback-Schwelle), damit
    // der direct-Fetch hier genommen und kein Headless-Browser gestartet wird.
    const filler = 'Leichtes Trekkingrad mit Shimano Deore Schaltung. '.repeat(60);
    globalThis.fetch = async () => new Response(
      `<html><head><title>Shop-Bike</title></head><body><h1>Cube Kathmandu Pro</h1><p>${filler}</p></body></html>`,
      { status: 200, headers: { 'Content-Type': 'text/html' } },
    );
    const cp = loadProviders();
    assert.equal(cp.providers['agy'].isConfigured(), true);
    const { raw, provider, fetcher } = await cp.crawlProduct({
      url: 'https://example.com/bike',
      journey: 'bike',
      provider: 'agy',
    });
    assert.equal(provider, 'agy');
    assert.equal(fetcher, 'direct');
    assert.equal(raw.name, 'Agy-Bike');
    assert.equal(cp.toJourneyItem(raw, 'https://example.com/bike').price, '777€');
    // Aufrufkonvention: plan-Mode, kein Edit, JSON-Schema aus dem Repo.
    const argv = fs.readFileSync(path.join(dir, 'args.txt'), 'utf8');
    assert.ok(argv.includes('--mode plan'));
    assert.ok(argv.includes('--json-schema'));
    assert.ok(argv.includes('crawl-product-schema.json'));
    assert.ok(argv.includes('Cube'));
  } finally {
    globalThis.fetch = realFetch;
    process.env.PATH = origPath;
    if (prevArgsDump === undefined) delete process.env.AGY_ARGS_DUMP;
    else process.env.AGY_ARGS_DUMP = prevArgsDump;
    delete process.env.AGY_ENVELOPE;
    restoreEnv(snap);
  }
});

test('crawlProduct wirft 501, wenn Stufe nicht konfiguriert ist', async () => {
  const snap = snapshotEnv();
  try {
    clearCrawlEnv();
    const cp = loadProviders();
    // Extraktor ohne Config …
    await assert.rejects(
      cp.crawlProduct({ url: 'https://example.com/bike', journey: 'bike', provider: 'remote-ai' }),
      (err) => err && err.status === 501,
    );
    // … und ebenso ein unkonfiguriertes Parse-Tool (Extraktor ist konfiguriert).
    process.env.CRAWL_REMOTE_URL = 'https://llm.example/extract';
    await assert.rejects(
      cp.crawlProduct({ url: 'https://example.com/bike', journey: 'bike', provider: 'remote-ai', fetcher: 'local-cmd' }),
      (err) => err && err.status === 501,
    );
    // Legacy-Extraktor ohne N8N_URL bleibt 500 (explizit gewählt, da der
    // Default auf Maschinen mit agy-Binary sonst agy wäre).
    delete process.env.CRAWL_REMOTE_URL;
    await assert.rejects(
      cp.crawlProduct({ url: 'https://example.com/bike', journey: 'bike', provider: 'n8n' }),
      (err) => err && err.status === 500,
    );
  } finally {
    restoreEnv(snap);
  }
});

test('crawlProduct über n8n (gemockter Webhook) bleibt kombiniert ohne Fetch-Stufe', async () => {
  const snap = snapshotEnv();
  const realFetch = globalThis.fetch;
  try {
    clearCrawlEnv();
    process.env.N8N_WEBHOOK_URL = 'https://n8n.example/hook';
    globalThis.fetch = async () => new Response(JSON.stringify([{ name: 'N8n-Bike', price: '123€' }]), { status: 200 });
    const cp = loadProviders();
    // Explizit n8n: der Default wäre auf Maschinen mit agy-Binary agy.
    const { raw, provider, fetcher } = await cp.crawlProduct({ url: 'https://example.com/bike', journey: 'bike', provider: 'n8n' });
    assert.equal(provider, 'n8n');
    assert.equal(fetcher, null);
    assert.equal(raw.name, 'N8n-Bike');
  } finally {
    globalThis.fetch = realFetch;
    restoreEnv(snap);
  }
});

// HTTP-Verträge der neuen/geänderten Routen (kompakter Harness wie server.test.js).

function loadServer(envOverrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bike-crawl-test-'));
  for (const mod of [SERVER_PATH, STORE_PATH, PROVIDERS_PATH]) {
    delete require.cache[require.resolve(mod)];
  }
  delete process.env.FRONTEND_DIST;
  const dbPath = path.join(dir, 'app.db');
  Object.assign(process.env, { PORT: '0', DB_PATH: dbPath, N8N_WEBHOOK_URL: '' }, envOverrides);
  // Crawl-Env deterministisch zurücksetzen, dann Overrides anwenden.
  for (const k of ENV_KEYS.filter((k) => k !== 'N8N_WEBHOOK_URL')) {
    if (!(k in envOverrides)) delete process.env[k];
  }
  return { server: require(SERVER_PATH), dbPath };
}

const dbByBase = new Map();
async function startApp(t, envOverrides) {
  const { server, dbPath } = loadServer(envOverrides);
  const httpServer = await new Promise((resolve) => {
    const s = server.app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${httpServer.address().port}`;
  dbByBase.set(base, dbPath);
  t.after(() => {
    dbByBase.delete(base);
    httpServer.closeAllConnections();
    httpServer.close();
    server.closeDatabase();
  });
  return base;
}

function testKey(base, user = 'anna') {
  const { openDatabase } = require(STORE_PATH);
  const store = openDatabase(dbByBase.get(base));
  try {
    return store.createApiKey(user, 'crawl-test-key').key;
  } finally {
    store.close();
  }
}

test('GET /api/crawl-providers listet Extraktoren und Fetcher mit Stufe', async (t) => {
  const base = await startApp(t);
  const res = await fetch(`${base}/api/crawl-providers`, {
    headers: { Authorization: `Bearer ${testKey(base)}` },
  });
  assert.equal(res.status, 200);
  const list = await res.json();
  assert.deepEqual(
    list.map((p) => `${p.stage}:${p.name}`),
    ['extract:n8n', 'extract:remote-ai', 'extract:agy', 'extract:local-cmd', 'fetch:direct', 'fetch:headless', 'fetch:local-cmd'],
  );
});

test('POST /api/import-link weist unbekannte Stufen mit 400 ab', async (t) => {
  const base = await startApp(t);
  const key = testKey(base);
  for (const body of [
    { link: 'https://example.com/bike', provider: 'gibts-nicht' },
    { link: 'https://example.com/bike', provider: 'remote-ai', fetcher: 'gibts-nicht' },
  ]) {
    const res = await fetch(`${base}/api/import-link?journey=bike`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
    });
    assert.equal(res.status, 400, `erwartet 400 für ${JSON.stringify(body)}`);
  }
});

test('buildAgyPrompt fordert Vergleichseigenschaften im Label-Wert-Format', () => {
  const snap = snapshotEnv();
  try {
    const cp = loadProviders();
    const prompt = cp.buildAgyPrompt('https://example.com/auto', 'e-auto', { title: 'Shop', text: 'Model 3 Reichweite 513 km' });
    assert.ok(prompt.includes('keine Tools'));
    assert.ok(prompt.includes('Vergleichseigenschaften'));
    assert.ok(prompt.includes('Label: Wert'));
    assert.ok(prompt.includes('<br>'));
  } finally {
    restoreEnv(snap);
  }
});

test('crawlProduct fällt bei dünnem direct-Text auf headless zurück (Meta meldet es)', async () => {
  const snap = snapshotEnv();
  const realFetch = globalThis.fetch;
  try {
    clearCrawlEnv();
    // direct liefert nur eine JS-Hülle ohne Text (Tesla-Fall) …
    globalThis.fetch = async () => new Response(
      '<html><head><title>Access Denied</title></head><body><div id="root"></div></body></html>',
      { status: 200, headers: { 'Content-Type': 'text/html' } },
    );
    // … Auswertung per Stub, Headless-Browser per Stub (kein echtes Chrome in Tests).
    process.env.CRAWL_EXTRACT_CMD = `cat >/dev/null; printf '%s' '{"name":"Stub-Auto","price":"39990€","specs":"Reichweite (WLTP): 513 km <br> Akku: 60 kWh"}'`;
    const cp = loadProviders();
    let headlessUrl = null;
    const origHeadless = cp.fetchers['headless'].fetch;
    cp.fetchers['headless'].fetch = async (url) => {
      headlessUrl = url;
      return { title: 'Model 3', text: 'Tesla Model 3 Reichweite 513 km Preis 39990 Euro. '.repeat(60) };
    };
    try {
      const { raw, provider, fetcher, meta } = await cp.crawlProduct({
        url: 'https://example.com/model3',
        journey: 'e-auto',
        provider: 'local-cmd',
      });
      assert.equal(headlessUrl, 'https://example.com/model3');
      assert.equal(fetcher, 'headless');
      assert.equal(meta.fallbackFrom, 'direct');
      assert.equal(provider, 'local-cmd');
      assert.equal(raw.name, 'Stub-Auto');
      assert.ok(meta.textChars > 1000);
      assert.ok(meta.fetchMs >= 0 && meta.extractMs >= 0);
      assert.equal(cp.toJourneyItem(raw, 'https://example.com/model3').specs, 'Reichweite (WLTP): 513 km <br> Akku: 60 kWh');
    } finally {
      cp.fetchers['headless'].fetch = origHeadless;
    }
  } finally {
    globalThis.fetch = realFetch;
    restoreEnv(snap);
  }
});

test('crawlProduct meldet CONTENT_BLOCKED, wenn nur ein Name ohne Preis/Specs herauskommt', async () => {
  const snap = snapshotEnv();
  try {
    clearCrawlEnv();
    // Block-Seite: Extraktor findet nur einen Namen (Tesla-Fall).
    process.env.CRAWL_FETCH_CMD = `printf '%s' '{"title":"Seite","text":"${'Inhalt mit Substanz. '.repeat(80)}"}'`;
    process.env.CRAWL_EXTRACT_CMD = `cat >/dev/null; printf '%s' '{"name":"Nur-Name","notes":"Access Denied"}'`;
    const cp = loadProviders();
    const err = await cp.crawlProduct({
      url: 'https://example.com/model3',
      journey: 'e-auto',
      provider: 'local-cmd',
      fetcher: 'local-cmd',
    }).then(() => null, (e) => e);
    assert.ok(err, 'erwartet einen Fehler statt namenlosem Item');
    assert.equal(err.status, 502);
    assert.equal(err.code, 'CONTENT_BLOCKED');
  } finally {
    restoreEnv(snap);
  }
});

test('crawlProduct mit explizitem fetcher headless nutzt ihn direkt (ohne Fallback-Flag)', async () => {
  const snap = snapshotEnv();
  try {
    clearCrawlEnv();
    process.env.CRAWL_EXTRACT_CMD = `cat >/dev/null; printf '%s' '{"name":"Stub-Auto","price":"39990€"}'`;
    const cp = loadProviders();
    const origHeadless = cp.fetchers['headless'].fetch;
    cp.fetchers['headless'].fetch = async () => ({ title: 'T', text: 'Inhalt '.repeat(300) });
    try {
      const { fetcher, meta } = await cp.crawlProduct({
        url: 'https://example.com/model3',
        journey: 'e-auto',
        provider: 'local-cmd',
        fetcher: 'headless',
      });
      assert.equal(fetcher, 'headless');
      assert.equal(meta.fallbackFrom, null);
      assert.ok(meta.textChars >= 2000);
    } finally {
      cp.fetchers['headless'].fetch = origHeadless;
    }
  } finally {
    restoreEnv(snap);
  }
});

// Wartet per `GET /api/import-jobs/:id` auf einen fertigen Job (`done` oder
// `errored`) — der `POST` antwortet nur mit 202, die Arbeit läuft im Worker.
async function waitForJob(base, jobId, key, timeoutMs = 15000) {
  const start = Date.now();
  for (;;) {
    const res = await fetch(`${base}/api/import-jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    assert.equal(res.status, 200, `GET /api/import-jobs/${jobId} unerwartet ${res.status}`);
    const job = await res.json();
    if (job.status !== 'in progress') return job;
    if (Date.now() - start > timeoutMs) throw new Error(`Timeout beim Warten auf Job ${jobId}`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

test('POST /api/parse-text parst eingefügten Inhalt ohne Fetch-Stufe', async (t) => {
  const base = await startApp(t, {
    CRAWL_EXTRACT_CMD: `cat >/dev/null; printf '%s' '{"name":"Paste-Auto","price":"39990€","specs":"Reichweite: 513 km"}'`,
  });
  const key = testKey(base);
  const res = await fetch(`${base}/api/parse-text?journey=e-auto`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      text: '<html><head><title>x</title><script>var a=1;</script></head><body><h1>Tesla Model 3</h1></body></html>',
      link: 'https://example.com/model3',
      provider: 'local-cmd',
    }),
  });
  assert.equal(res.status, 202);
  const created = await res.json();
  assert.equal(created.status, 'in progress');
  const job = await waitForJob(base, created.jobId, key);
  assert.equal(job.status, 'done');
  assert.equal(job.item.name, 'Paste-Auto');
  assert.equal(job.item.link, 'https://example.com/model3');
  assert.equal(job.provider, 'local-cmd');
  assert.ok(job.meta && typeof job.meta.extractMs === 'number');
});

test('POST /api/import-link meldet CONTENT_BLOCKED als errored-Job', async (t) => {
  const base = await startApp(t, {
    CRAWL_FETCH_CMD: `printf '%s' '{"title":"Seite","text":"${'Inhalt mit Substanz. '.repeat(80)}"}'`,
    CRAWL_EXTRACT_CMD: `cat >/dev/null; printf '%s' '{"name":"Nur-Name"}'`,
  });
  const key = testKey(base);
  const res = await fetch(`${base}/api/import-link?journey=bike`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ link: 'https://example.com/bike', provider: 'local-cmd', fetcher: 'local-cmd' }),
  });
  assert.equal(res.status, 202);
  const created = await res.json();
  const job = await waitForJob(base, created.jobId, key);
  assert.equal(job.status, 'errored');
  assert.equal(job.code, 'CONTENT_BLOCKED');
  assert.ok(typeof job.error === 'string' && job.error.length > 0);
});

test('POST /api/parse-text weist leeren Text und kombinierte Provider ab', async (t) => {
  const base = await startApp(t, {
    CRAWL_EXTRACT_CMD: `cat >/dev/null; printf '%s' '{"name":"X"}'`,
    N8N_WEBHOOK_URL: 'https://n8n.example/hook',
  });
  const key = testKey(base);
  for (const [payload, expected] of [
    [{ text: '   ' }, 400],
    [{}, 400],
    [{ text: 'Inhalt', provider: 'n8n' }, 400],
    [{ text: 'Inhalt', provider: 'gibts-nicht' }, 400],
  ]) {
    const res = await fetch(`${base}/api/parse-text?journey=bike`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(payload),
    });
    assert.equal(res.status, expected, `erwartet ${expected} für ${JSON.stringify(payload)}`);
  }
});

test('POST /api/parse-text meldet fehlenden Extraktor mit Code NO_EXTRACTOR', async (t) => {
  const base = await startApp(t, { N8N_WEBHOOK_URL: 'https://n8n.example/hook' });
  const key = testKey(base);
  const res = await fetch(`${base}/api/parse-text?journey=bike`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ text: 'Inhalt', provider: 'n8n' }),
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.code, 'NO_EXTRACTOR');
});

test('POST /api/import-link liefert Item plus Meta (Provider, Stufen, Zeiten)', async (t) => {
  const base = await startApp(t, {
    CRAWL_FETCH_CMD: `printf '%s' '{"title":"Stub-Seite","text":"${'Vergleichstext mit Inhalt. '.repeat(80)}"}'`,
    CRAWL_EXTRACT_CMD: `cat >/dev/null; printf '%s' '{"name":"Stub-Bike","price":"999€","specs":"Rahmen: Alu"}'`,
  });
  const key = testKey(base);
  const res = await fetch(`${base}/api/import-link?journey=bike`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ link: 'https://example.com/bike', provider: 'local-cmd', fetcher: 'local-cmd' }),
  });
  assert.equal(res.status, 202);
  const created = await res.json();
  assert.equal(typeof created.jobId, 'string');
  assert.equal(created.status, 'in progress');
  assert.equal(typeof created.position, 'number');
  assert.equal(typeof created.queueLength, 'number');
  const job = await waitForJob(base, created.jobId, key);
  assert.equal(job.status, 'done');
  assert.equal(job.item.name, 'Stub-Bike');
  assert.equal(job.provider, 'local-cmd');
  assert.equal(job.fetcher, 'local-cmd');
  assert.ok(job.meta && typeof job.meta.fetchMs === 'number' && typeof job.meta.extractMs === 'number');
  assert.ok(job.meta.textChars > 1000);
});

test('GET /api/import-jobs/:id antwortet 404 bei unbekanntem Job und fremdem Owner', async (t) => {
  const base = await startApp(t, {
    CRAWL_EXTRACT_CMD: `cat >/dev/null; printf '%s' '{"name":"Job-Bike","price":"111€","specs":"Rahmen: Alu"}'`,
  });
  const anna = testKey(base, 'anna');
  const benni = testKey(base, 'benni');
  // Unbekannte ID …
  const unknown = await fetch(`${base}/api/import-jobs/gibts-nicht`, {
    headers: { Authorization: `Bearer ${anna}` },
  });
  assert.equal(unknown.status, 404);
  // … und Annas Job aus Bennis Sicht (Owner-isoliert, verhält sich wie unbekannt).
  const created = await (
    await fetch(`${base}/api/parse-text?journey=bike`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${anna}` },
      body: JSON.stringify({ text: 'Reichweite 513 km Preis 39990 Euro', provider: 'local-cmd' }),
    })
  ).json();
  const foreign = await fetch(`${base}/api/import-jobs/${created.jobId}`, {
    headers: { Authorization: `Bearer ${benni}` },
  });
  assert.equal(foreign.status, 404);
  // Eigener Owner liest dagegen (wartend oder fertig — beides 200).
  const own = await fetch(`${base}/api/import-jobs/${created.jobId}`, {
    headers: { Authorization: `Bearer ${anna}` },
  });
  assert.equal(own.status, 200);
});

test('buildJourneyNamingPrompt lädt die Prompt-Datei und bettet den Inhalt ein', () => {
  const snap = snapshotEnv();
  try {
    const cp = loadProviders();
    const prompt = cp.buildJourneyNamingPrompt('https://example.com/model3', { title: 'T', text: 'X' });
    // Anweisung aus src/agent/prompts/journey_naming_prompt.md (Beispiel dort) …
    assert.ok(prompt.includes('Elektro-Auto'));
    // … plus der übergebene Seiteninhalt als JSON.
    assert.ok(prompt.includes('https://example.com/model3'));
    assert.ok(prompt.includes('"title":"T"'));
    assert.ok(prompt.includes('"text":"X"'));
  } finally {
    restoreEnv(snap);
  }
});

test('parseNamingObject leitet Slug ab und weist Leeres mit 502 ab', () => {
  const snap = snapshotEnv();
  try {
    const cp = loadProviders();
    assert.deepEqual(
      cp.parseNamingObject({ slug: 'elektro-auto', name: 'Elektro-Auto', category: 'AUTO' }, 'stub'),
      { slug: 'elektro-auto', name: 'Elektro-Auto', category: 'auto' },
    );
    // Fehlender Slug wird aus dem Namen abgeleitet (Umlaute als ae/oe/ue).
    assert.equal(cp.parseNamingObject({ name: 'Kopfhörer' }, 'stub').slug, 'kopfhoerer');
    for (const bad of [null, 'Text', [], {}, { name: '   ' }, { slug: 'x' }]) {
      assert.throws(() => cp.parseNamingObject(bad, 'stub'), (err) => err && err.status === 502);
    }
    assert.throws(() => cp.parseNamingJson('kein-json', 'stub'), (err) => err && err.status === 502);
  } finally {
    restoreEnv(snap);
  }
});

test('suggestJourneyCategory benennt per Naming-Prompt (local-cmd-Stub)', async () => {
  const snap = snapshotEnv();
  try {
    clearCrawlEnv();
    process.env.CRAWL_EXTRACT_CMD = `cat >/dev/null; printf '%s' '{"slug":"elektro-auto","name":"Elektro-Auto","category":"auto"}'`;
    const cp = loadProviders();
    const { naming, provider, meta } = await cp.suggestJourneyCategory({
      url: 'https://example.com/model3',
      title: 'Tesla Model 3',
      text: 'Reichweite (WLTP): 513 km',
      provider: 'local-cmd',
    });
    assert.deepEqual(naming, { slug: 'elektro-auto', name: 'Elektro-Auto', category: 'auto' });
    assert.equal(provider, 'local-cmd');
    assert.ok(meta && typeof meta.extractMs === 'number');
  } finally {
    restoreEnv(snap);
  }
});

test('suggestJourneyCategory validiert Eingaben und Provider', async () => {
  const snap = snapshotEnv();
  try {
    clearCrawlEnv();
    process.env.N8N_WEBHOOK_URL = 'https://n8n.example/hook';
    const cp = loadProviders();
    // Weder Titel noch Text …
    await assert.rejects(
      cp.suggestJourneyCategory({ url: 'https://example.com/x', title: '  ', text: '' }),
      (err) => err && err.status === 400,
    );
    // … noch ungültige URL oder unbekannter Provider.
    await assert.rejects(
      cp.suggestJourneyCategory({ url: 'ftp://example.com/x', title: 'T', text: '' }),
      (err) => err && err.status === 400,
    );
    await assert.rejects(
      cp.suggestJourneyCategory({ url: 'https://example.com/x', title: 'T', text: '', provider: 'gibts-nicht' }),
      (err) => err && err.status === 400,
    );
    // n8n ist kombiniert und nicht naming-fähig → 501.
    await assert.rejects(
      cp.suggestJourneyCategory({ url: 'https://example.com/x', title: 'T', text: '', provider: 'n8n' }),
      (err) => err && err.status === 501,
    );
  } finally {
    restoreEnv(snap);
  }
});

test('suggestJourneyCategory fällt ohne KI-Provider auf Titelbasis zurück', async () => {
  const snap = snapshotEnv();
  try {
    clearCrawlEnv();
    process.env.CRAWL_EXTRACT_PROVIDER = 'n8n';
    process.env.N8N_WEBHOOK_URL = 'https://n8n.example/hook';
    const cp = loadProviders();
    const { naming, provider } = await cp.suggestJourneyCategory({
      url: 'https://example.com/model3',
      title: 'Tesla Model 3 Highland',
      text: 'Reichweite (WLTP): 513 km',
    });
    assert.equal(provider, 'fallback');
    assert.deepEqual(naming, { slug: 'tesla-model-3', name: 'Tesla Model 3', category: '' });
  } finally {
    restoreEnv(snap);
  }
});

test('POST /api/suggest-journey liefert Slug, Name und Kategorie', async (t) => {
  const base = await startApp(t, {
    CRAWL_EXTRACT_CMD: `cat >/dev/null; printf '%s' '{"slug":"elektro-auto","name":"Elektro-Auto","category":"auto"}'`,
  });
  const key = testKey(base);
  const res = await fetch(`${base}/api/suggest-journey`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      url: 'https://example.com/model3',
      title: 'Tesla Model 3',
      text: 'Reichweite (WLTP): 513 km',
      provider: 'local-cmd',
    }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.slug, 'elektro-auto');
  assert.equal(body.name, 'Elektro-Auto');
  assert.equal(body.category, 'auto');
  assert.equal(body.provider, 'local-cmd');
});

test('POST /api/suggest-journey weist fehlende URL und n8n mit Status ab', async (t) => {
  const base = await startApp(t, { N8N_WEBHOOK_URL: 'https://n8n.example/hook' });
  const key = testKey(base);
  const noUrl = await fetch(`${base}/api/suggest-journey`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ title: 'T', text: 'X' }),
  });
  assert.equal(noUrl.status, 400);
  const noContent = await fetch(`${base}/api/suggest-journey`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ url: 'https://example.com/x', title: ' ', text: '' }),
  });
  assert.equal(noContent.status, 400);
  const combined = await fetch(`${base}/api/suggest-journey`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ url: 'https://example.com/x', title: 'T', provider: 'n8n' }),
  });
  assert.equal(combined.status, 501);
});
