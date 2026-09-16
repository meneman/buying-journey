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
  const dbPath = path.join(dir, 'app.db');
  Object.assign(
    process.env,
    {
      PORT: '0',
      DB_PATH: dbPath,
      N8N_WEBHOOK_URL: '',
      SUPABASE_URL: '',
      SUPABASE_ANON_KEY: '',
      SUPABASE_PUBLISHABLE_KEY: '',
      AUTH_REQUIRED: '',
    },
    envOverrides
  );
  return { server: require(SERVER_PATH), dbPath };
}

const dbByBase = new Map();

async function startApp(t, envOverrides) {
  const { server, dbPath } = loadServer(envOverrides);
  const { app, closeDatabase } = server;
  const httpServer = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${httpServer.address().port}`;
  dbByBase.set(base, dbPath);
  t.after(() => {
    dbByBase.delete(base);
    httpServer.closeAllConnections();
    httpServer.close();
    closeDatabase();
  });
  return base;
}

/** Legt einen API-Key für `user` in der DB dieses Test-Backends an. */
function apiKey(base, user = 'anna', name = 'test-key') {
  const { openDatabase } = require(STORE_PATH);
  const store = openDatabase(dbByBase.get(base));
  try {
    return store.createApiKey(user, name).key;
  } finally {
    store.close();
  }
}

function authFetch(base, urlPath, key, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (key !== undefined) headers.Authorization = `Bearer ${key}`;
  return fetch(`${base}${urlPath}`, { ...options, headers });
}

test('ohne Token antworten Daten-Routen 401 (auch ohne Supabase-Konfiguration), /api/me meldet 401', async (t) => {
  const base = await startApp(t);
  for (const url of ['/api/data?journey=bike', '/api/journeys', '/api/feedback?journey=bike']) {
    const res = await fetch(`${base}${url}`);
    assert.equal(res.status, 401, `erwartet 401 für ${url}`);
    assert.equal(typeof (await res.json()).error, 'string');
  }

  const me = await fetch(`${base}/api/me`);
  assert.equal(me.status, 401);
  assert.equal(typeof (await me.json()).error, 'string');
});

test('API-Key-Auth funktioniert ohne Supabase-Konfiguration (401 nur ohne/bei falschem Key)', async (t) => {
  const base = await startApp(t, { AUTH_REQUIRED: 'true' });
  const anon = await fetch(`${base}/api/data?journey=bike`);
  assert.equal(anon.status, 401);

  const wrongFormat = await authFetch(base, '/api/data?journey=bike', 'falscher-key');
  assert.equal(wrongFormat.status, 401);
  const unknownKey = await authFetch(base, '/api/data?journey=bike', `bj_${'c'.repeat(64)}`);
  assert.equal(unknownKey.status, 401);

  const key = apiKey(base, 'anna');
  const ok = await authFetch(base, '/api/data?journey=bike', key);
  assert.equal(ok.status, 200);
  const journeys = await (await authFetch(base, '/api/journeys', key)).json();
  assert.deepEqual(journeys, ['bike']);
});

test('API-Key-Lifecycle per REST: anlegen, listen, widerrufen', async (t) => {
  const base = await startApp(t);
  const seed = apiKey(base, 'anna', 'Seed');
  const headers = { Authorization: `Bearer ${seed}`, 'Content-Type': 'application/json' };

  const created = await fetch(`${base}/api/api-keys`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: 'Muse MCP' }),
  });
  assert.equal(created.status, 201);
  const body = await created.json();
  assert.equal(body.success, true);
  assert.ok(/^bj_[0-9a-f]{64}$/.test(body.key), 'Klartext-Key hat das erwartete Format');
  assert.equal(typeof body.id, 'number');

  const listed = await (await fetch(`${base}/api/api-keys`, { headers })).json();
  assert.deepEqual(listed.map((k) => k.name).sort(), ['Muse MCP', 'Seed']);
  assert.ok(listed.every((k) => !('key' in k) && !('key_hash' in k)), 'kein Klartext/Hash in der Liste');

  const revoked = await fetch(`${base}/api/api-keys/${body.id}`, { method: 'DELETE', headers });
  assert.equal(revoked.status, 200);

  const dead = await fetch(`${base}/api/data?journey=bike`, {
    headers: { Authorization: `Bearer ${body.key}` },
  });
  assert.equal(dead.status, 401, 'widerrufener Key muss 401 liefern');

  const foreign = await fetch(`${base}/api/api-keys/999999`, { method: 'DELETE', headers });
  assert.equal(foreign.status, 404);
});

test('User sehen nur eigene Journeys: gleiche Slugs sind getrennt', async (t) => {
  const base = await startApp(t);
  const anna = apiKey(base, 'anna');
  const benni = apiKey(base, 'benni');

  const save = await authFetch(base, '/api/data?journey=bike', anna, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status: {}, journey: [], specs: [], generalNotes: '',
      items: [{ name: 'Annas Rad', price: '999€', status: 'Thinking' }],
    }),
  });
  assert.equal(save.status, 200);

  // Benni sieht leere Liste und leeres Dokument — nichts von Anna.
  assert.deepEqual(await (await authFetch(base, '/api/journeys', benni)).json(), []);
  assert.deepEqual((await (await authFetch(base, '/api/data?journey=bike', benni)).json()).items, []);

  // Bennis Schreiben auf denselben Slug lässt Annas Daten unberührt.
  const saveBenni = await authFetch(base, '/api/data?journey=bike', benni, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status: {}, journey: [], specs: [], generalNotes: '',
      items: [{ name: 'Bennis Rad', price: '1€', status: 'Thinking' }],
    }),
  });
  assert.equal(saveBenni.status, 200);
  assert.deepEqual(
    (await (await authFetch(base, '/api/data?journey=bike', anna)).json()).items.map((i) => i.name),
    ['Annas Rad']
  );
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
