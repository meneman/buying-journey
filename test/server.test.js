const { test } = require('node:test');
const assert = require('node:assert/strict');

const SERVER_PATH = '../src/web/backend/server.js';
const SB_URL = 'http://127.0.0.1:1';

/** (Re)loads the server module with deterministic env, without touching the network. */
function loadServer(envOverrides = {}) {
  const key = require.resolve(SERVER_PATH);
  delete require.cache[key];
  delete process.env.FRONTEND_DIST;
  Object.assign(process.env, {
    PORT: '0',
    SB_API_BASE_URL: SB_URL,
    SB_AUTH_TOKEN: 'test-token',
    N8N_WEBHOOK_URL: '',
  }, envOverrides);
  return require(SERVER_PATH);
}

async function startApp(t, envOverrides) {
  const { app } = loadServer(envOverrides);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  t.after(() => {
    server.closeAllConnections();
    server.close();
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

test('GET /api/config reports the configured SilverBullet URL', async (t) => {
  const base = await startApp(t);
  const res = await fetch(`${base}/api/config`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { silverBulletUrl: SB_URL });
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
