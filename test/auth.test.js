const { test } = require('node:test');
const assert = require('node:assert/strict');

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SERVER_PATH = '../src/web/backend/server.js';
const STORE_PATH = '../src/db/store.js';
const AUTH_PATH = '../src/web/backend/auth.js';

/** (Re)loads the server module with deterministic env and an isolated SQLite file. */
function loadServer(envOverrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bike-auth-test-'));
  for (const mod of [SERVER_PATH, STORE_PATH, AUTH_PATH]) {
    delete require.cache[require.resolve(mod)];
  }
  delete process.env.FRONTEND_DIST;
  Object.assign(
    process.env,
    {
      PORT: '0',
      DB_PATH: path.join(dir, 'app.db'),
      N8N_WEBHOOK_URL: '',
      SUPABASE_URL: '',
      SUPABASE_ANON_KEY: '',
      SUPABASE_PUBLISHABLE_KEY: '',
      AUTH_REQUIRED: '',
    },
    envOverrides
  );
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

test('ohne Auth-Konfiguration bleiben Daten-Routen öffentlich, /api/me meldet 401', async (t) => {
  const base = await startApp(t);
  const data = await fetch(`${base}/api/data?journey=bike`);
  assert.equal(data.status, 200);
  const journeys = await fetch(`${base}/api/journeys`);
  assert.equal(journeys.status, 200);

  const me = await fetch(`${base}/api/me`);
  assert.equal(me.status, 401);
  assert.equal(typeof (await me.json()).error, 'string');
});

test('AUTH_REQUIRED ohne Supabase-Konfiguration antwortet 503 statt still öffentlich', async (t) => {
  const base = await startApp(t, { AUTH_REQUIRED: 'true' });
  const data = await fetch(`${base}/api/data?journey=bike`);
  assert.equal(data.status, 503);
  assert.equal(typeof (await data.json()).error, 'string');
});

test('AUTH_REQUIRED mit Konfiguration weist anonyme Requests mit 401 ab (ohne Netz)', async (t) => {
  const base = await startApp(t, {
    AUTH_REQUIRED: 'true',
    SUPABASE_URL: 'https://epknwdxauctkdcwpsslh.supabase.co',
    SUPABASE_ANON_KEY: 'test-key-ohne-netz',
  });
  for (const url of ['/api/data?journey=bike', '/api/journeys', '/api/feedback?journey=bike']) {
    const res = await fetch(`${base}${url}`);
    assert.equal(res.status, 401, `erwartet 401 für ${url}`);
    assert.equal(typeof (await res.json()).error, 'string');
  }
  const me = await fetch(`${base}/api/me`);
  assert.equal(me.status, 401);
});

test('extractBearerToken parst nur saubere Bearer-Header', () => {
  const { extractBearerToken } = require(AUTH_PATH);
  assert.equal(extractBearerToken({ headers: { authorization: 'Bearer abc.def.ghi' } }), 'abc.def.ghi');
  assert.equal(extractBearerToken({ headers: { authorization: 'bearer xyz' } }), 'xyz');
  assert.equal(extractBearerToken({ headers: { authorization: 'Bearer  xyz  ' } }), 'xyz');
  assert.equal(extractBearerToken({ headers: {} }), null);
  assert.equal(extractBearerToken({ headers: { authorization: 'Token abc' } }), null);
  assert.equal(extractBearerToken({ headers: { authorization: 'Bearer ' } }), null);
  assert.equal(extractBearerToken({}), null);
});

test('isAuthConfigured/isAuthRequired folgen der Umgebung', () => {
  const saved = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY,
    AUTH_REQUIRED: process.env.AUTH_REQUIRED,
  };
  try {
    delete require.cache[require.resolve(AUTH_PATH)];
    const auth = require(AUTH_PATH);
    process.env.SUPABASE_URL = '';
    process.env.SUPABASE_ANON_KEY = '';
    process.env.SUPABASE_PUBLISHABLE_KEY = '';
    process.env.AUTH_REQUIRED = '';
    assert.equal(auth.isAuthConfigured(), false);
    assert.equal(auth.isAuthRequired(), false);

    process.env.SUPABASE_URL = 'https://epknwdxauctkdcwpsslh.supabase.co';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
    assert.equal(auth.isAuthConfigured(), true);

    process.env.AUTH_REQUIRED = 'true';
    assert.equal(auth.isAuthRequired(), true);
    process.env.AUTH_REQUIRED = '0';
    assert.equal(auth.isAuthRequired(), false);
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    delete require.cache[require.resolve(AUTH_PATH)];
  }
});
