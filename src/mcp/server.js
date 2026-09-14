#!/usr/bin/env node
// MCP-Server (stdio) für Buying-Journey-Lesezugriff.
//
// Ruft ausschließlich die REST-API des Backends auf (kein Direkt-DB-Zugriff):
//   GET /api/journeys            Existenzprüfung (verhindert stilles Anlegen)
//   GET /api/data?journey=X      Status, Logs, Items, Specs, Notizen, Titel
//   GET /api/feedback?journey=X  Feedback-Text
//
// Das Backend muss laufen. Basis-URL konfigurierbar:
//   MCP_BASE_URL=http://localhost:3000  (Default; sonst PORT, Default 3000)
//
// Protokoll: newline-delimited JSON-RPC 2.0 auf stdin/stdout (MCP-Transport),
// Logs gehen nach stderr. Einziger Tool: `journey.get` mit `{ slug }`.
// Unbekannter/leerer Slug und unerreichbares Backend liefern definierte
// Fehler, ohne etwas anzulegen oder zu schreiben.

const BASE_URL =
  process.env.MCP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

const SERVER_INFO = { name: 'bike-buying-journey', version: '1.0.0' };
const PROTOCOL_VERSION = '2024-11-05';
const FETCH_TIMEOUT_MS = 15000;

// Wie das Backend (`getJourney` in src/web/backend/server.js): unsichere
// Zeichen raus. Anders als dort gibt es hier KEINEN 'bike'-Fallback — ein
// leerer Slug ist ein Fehler. Kleinschreibung wie `normalizeJourneySlug`.
function sanitizeSlug(raw) {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.-]/g, '');
}

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) {
    throw new Error(`Backend antwortete mit HTTP ${res.status} für ${url}`);
  }
  return res.json();
}

async function readJourney(slug) {
  let journeys;
  try {
    journeys = await getJson(`${BASE_URL}/api/journeys`);
  } catch (err) {
    throw new Error(`Backend unter ${BASE_URL} ist nicht erreichbar: ${err.message}`);
  }
  if (!Array.isArray(journeys) || !journeys.includes(slug)) {
    throw new Error(
      `Unbekannte Journey "${slug}". Bekannte Slugs: ${Array.isArray(journeys) ? journeys.join(', ') : 'unbekannt'}.`
    );
  }
  // Erst ab hier /api/data anfassen — vorher anzufragen würde die Journey
  // via ensureJourney stillschweigend anlegen.
  const [data, feedback] = await Promise.all([
    getJson(`${BASE_URL}/api/data?journey=${encodeURIComponent(slug)}`),
    getJson(`${BASE_URL}/api/feedback?journey=${encodeURIComponent(slug)}`),
  ]);
  return { slug, ...data, feedback: feedback && feedback.content };
}

const TOOL_DEF = {
  name: 'journey.get',
  description:
    'Liest das komplette Dokument einer Buying Journey (Status, Logs, Items, Specs, Notizen, Feedback). Nur Lesen, legt nichts an.',
  inputSchema: {
    type: 'object',
    properties: { slug: { type: 'string', description: 'Journey-Kürzel, z.B. "bike"' } },
    required: ['slug'],
  },
};

function toolResultError(message) {
  return { content: [{ type: 'text', text: `Fehler: ${message}` }], isError: true };
}

async function handleCall(params) {
  if (!params || params.name !== 'journey.get') {
    const err = new Error(`Unbekanntes Tool: ${params && params.name}`);
    err.code = -32602;
    throw err;
  }
  const rawSlug = params.arguments && params.arguments.slug;
  if (typeof rawSlug !== 'string' || !rawSlug.trim()) {
    const err = new Error('Parameter "slug" (nicht-leerer String) ist erforderlich.');
    err.code = -32602;
    throw err;
  }
  const slug = sanitizeSlug(rawSlug);
  if (!slug) {
    const err = new Error(
      'Parameter "slug" ergibt kein gültiges Journey-Kürzel (erlaubt: a-z, 0-9, ., -).'
    );
    err.code = -32602;
    throw err;
  }
  try {
    const doc = await readJourney(slug);
    return { content: [{ type: 'text', text: JSON.stringify(doc, null, 2) }] };
  } catch (err) {
    return toolResultError(err.message);
  }
}

async function handleMessage(msg) {
  if (msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    const err = new Error('Ungültiger JSON-RPC-Request.');
    err.code = -32600;
    throw err;
  }
  switch (msg.method) {
    case 'initialize':
      return {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      };
    case 'ping':
      return {};
    case 'tools/list':
      return { tools: [TOOL_DEF] };
    case 'tools/call':
      return handleCall(msg.params);
    default: {
      if (msg.method.startsWith('notifications/')) return undefined;
      const err = new Error(`Unbekannte Methode: ${msg.method}`);
      err.code = -32601;
      throw err;
    }
  }
}

function respond(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
}

function respondError(id, code, message) {
  process.stdout.write(
    `${JSON.stringify({ jsonrpc: '2.0', id: id ?? null, error: { code, message } })}\n`
  );
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let idx;
  while ((idx = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      respondError(null, -32700, 'Ungültiges JSON.');
      continue;
    }
    const isNotification = msg.id === undefined || msg.id === null;
    handleMessage(msg).then(
      (result) => {
        if (!isNotification) respond(msg.id, result === undefined ? {} : result);
      },
      (err) => {
        if (!isNotification) respondError(msg.id, err.code || -32603, err.message);
      }
    );
  }
});
process.stdin.on('end', () => process.exit(0));
