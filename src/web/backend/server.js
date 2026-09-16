const express = require('express');
const dotenv = require('dotenv');
const path = require('path');
const { openDatabase } = require('../../db/store.js');
const { optionalAuth, requireUser } = require('./auth.js');
const { starsFromRating, specsToString } = require('../../core/item-format.js');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;
const FRONTEND_DIST = process.env.FRONTEND_DIST || path.join(__dirname, '../../../frontend/dist');

// SQLite storage (file from DB_PATH, default ./data/app.db). No network, no sync.
const store = openDatabase();

// Pflicht-Gate für alle Daten-Routen: API-Key oder Supabase-JWT als
// Bearer-Token. Die Owner-Trennung (req.user.id) funktioniert nur mit
// Identität — anonyme Zugriffe antworten 401, unabhängig von AUTH_REQUIRED.
const needUser = requireUser(store);

app.use(express.json({ limit: '1mb' }));

// Malformed JSON and oversized payloads must also answer JSON, not the HTML
// error page body-parser sends by default.
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Ungültiges JSON im Request-Body.' });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request-Body ist zu groß (Limit: 1mb).' });
  }
  next(err);
});
app.use(express.static(FRONTEND_DIST));

app.get('/api/config', (req, res) => {
  res.json({ storage: 'sqlite' });
});

// MCP-Status für die `/mcp`-Seite im Frontend (read-only, öffentlich wie
// `/api/config`, damit die Anleitung auch ausgeloggt lesbar bleibt):
// Name/Version/Protokoll + Tool-Liste aus `src/mcp/tools.js` (gleiche Quelle
// wie `tools/list` des stdio-Servers). Der Browser kann kein stdio-JSON-RPC
// sprechen, daher dient dieser Endpunkt als HTTP-Quelle der Tool-Liste; ein
// erfolgreicher Fetch bedeutet zugleich "Backend erreichbar".
const {
  SERVER_INFO: MCP_SERVER_INFO,
  PROTOCOL_VERSION: MCP_PROTOCOL_VERSION,
  TOOL_DEFS: MCP_TOOL_DEFS,
} = require('../../mcp/tools.js');

app.get('/api/mcp-status', (req, res) => {
  const rawPort = process.env.PORT;
  const parsedPort = Number(rawPort);
  const port = rawPort !== undefined && rawPort !== '' && Number.isFinite(parsedPort) ? parsedPort : 3000;
  const baseUrl = process.env.MCP_BASE_URL || `http://localhost:${port}`;
  res.json({
    server: MCP_SERVER_INFO,
    protocolVersion: MCP_PROTOCOL_VERSION,
    tools: MCP_TOOL_DEFS.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
    serverFile: path.resolve(__dirname, '../../mcp/server.js'),
    port,
    baseUrl,
  });
});

// Aktueller Nutzer aus dem Supabase-JWT (Bearer-Token). 200 mit { user },
// sonst 401 — immer optional ausgewertet, damit die Antwort stabil bleibt,
// egal ob AUTH_REQUIRED gesetzt ist.
app.get('/api/me', optionalAuth, (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Nicht angemeldet (Bearer-Token fehlt oder ist ungültig).' });
  }
  res.json({ user: req.user });
});

// Sanitizes the journey query param. Never throws: repeated params arrive as an
// array (first one wins) and anything that sanitizes to nothing falls back to 'bike'.
function getJourney(req) {
  const raw = req.query ? req.query.journey : undefined;
  const first = Array.isArray(raw) ? raw[0] : raw;
  const cleaned = String(first ?? 'bike').replace(/[^a-zA-Z0-9.-]/g, '');
  return cleaned || 'bike';
}

// SSE-Live-Updates pro Journey (nur `GET /api/data`-Inhalt, kein Polling):
// Clients subscriben `GET /api/data/events?journey=X`, der Browser
// reconnectet automatisch per `retry:` (kein manueller Reload als Dauerlösung).
// Scope: nur `POST /api/data` broadcastet an die Clients derselben Journey
// *desselben Owners* (Schlüssel `owner/slug` — kein User sieht fremde
// Updates). `POST /api/feedback`, `PUT /api/journey-config`,
// `POST /api/journeys` und `POST /api/import-link` (speichert nichts selbst)
// bleiben bewusst draußen.
const journeySseClients = new Map(); // "owner/slug" -> Set<ServerResponse>

function sseChannel(owner, slug) {
  return `${owner}/${slug}`;
}

function broadcastJourneyUpdate(owner, slug) {
  const clients = journeySseClients.get(sseChannel(owner, slug));
  if (!clients || clients.size === 0) return;
  const payload = JSON.stringify({ slug, updatedAt: new Date().toISOString() });
  const message = `event: journey-updated\ndata: ${payload}\n\n`;
  for (const client of [...clients]) {
    try {
      client.write(message);
    } catch {
      // Tote Verbindung: wird beim nächsten `close` aufgeräumt.
    }
  }
}

// API Routes (User-Layer: needUser verlangt API-Key oder Supabase-JWT;
// jede Abfrage läuft im Namensraum von req.user.id — fremde Journeys sind
// unsichtbar und verhalten sich wie unbekannte Slugs).
app.get('/api/journeys', needUser, (req, res) => {
  try {
    res.json(store.listJourneys(req.user.id));
  } catch (error) {
    console.error('API GET Journeys Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// API-Key-Verwaltung (langlebige MCP-Tokens, ein Key = ein User):
// Anlegen/Listen/Widerrufen jeweils nur für die eigene Identität. Der
// Klartext-Key erscheint genau einmal in der 201-Antwort von POST.
app.post('/api/api-keys', needUser, (req, res) => {
  try {
    const name = req.body && req.body.name !== undefined ? String(req.body.name) : '';
    if (name.length > 80) {
      return res.status(400).json({ error: 'Feld "name" ist zu lang (max. 80 Zeichen).' });
    }
    const created = store.createApiKey(req.user.id, name);
    res.status(201).json({ success: true, id: created.id, key: created.key, name: created.name });
  } catch (error) {
    console.error('API POST Api-Keys Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/api-keys', needUser, (req, res) => {
  try {
    res.json(store.listApiKeys(req.user.id));
  } catch (error) {
    console.error('API GET Api-Keys Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/api-keys/:id', needUser, (req, res) => {
  try {
    const revoked = store.revokeApiKey(req.user.id, req.params.id);
    if (!revoked) {
      return res.status(404).json({ error: 'API-Key nicht gefunden.' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('API DELETE Api-Keys Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Normalizes a candidate journey slug the same way as the frontend
// (`frontend/src/lib/journey-id.ts`): lowercase, safe chars only.
function normalizeJourneySlug(raw) {
  return String(raw ?? '').trim().toLowerCase().replace(/[^a-z0-9.-]/g, '');
}

// Explicit journey creation (no lazy-create via GET /api/data): the slug is
// required, optionals are plain strings (name, description, category,
// currency, phase, budget, targetDate, generalNotes, sectionTitle,
// listTitle). Answers 201 with the normalized slug, 409 when the slug
// already exists, 400 for missing/invalid input.
app.post('/api/journeys', needUser, (req, res) => {
  try {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ error: 'Request-Body muss ein JSON-Objekt mit Feld "slug" sein.' });
    }
    if (typeof body.slug !== 'string') {
      return res.status(400).json({ error: 'Feld "slug" (String) ist erforderlich.' });
    }
    const slug = normalizeJourneySlug(body.slug);
    if (!slug) {
      return res.status(400).json({ error: 'Feld "slug" ergibt kein gültiges Journey-Kürzel (erlaubt: a-z, 0-9, ., -).' });
    }
    const fields = {};
    for (const key of ['name', 'description', 'category', 'currency', 'phase', 'budget', 'targetDate', 'generalNotes', 'sectionTitle', 'listTitle']) {
      if (body[key] !== undefined) {
        if (typeof body[key] !== 'string') {
          return res.status(400).json({ error: `Feld "${key}" muss ein String sein.` });
        }
        fields[key] = body[key];
      }
    }
    try {
      store.createJourney(slug, req.user.id, fields);
    } catch (err) {
      if (err && err.code === 'JOURNEY_EXISTS') {
        return res.status(409).json({ error: err.message });
      }
      throw err;
    }
    res.status(201).json({ success: true, slug });
  } catch (error) {
    console.error('API POST Journeys Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Basis-Eigenschaften + Settings aller Journeys für die Startseite
// (slug-sortiert, ohne Items/Logs — keine N+1 Detail-Calls nötig).
app.get('/api/journey-configs', needUser, (req, res) => {
  try {
    res.json(store.listJourneyConfigs(req.user.id));
  } catch (error) {
    console.error('API GET Journey-Configs Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Basis-Eigenschaften + Settings einer Journey lesen (lazy-create mit
// Defaults wie GET /api/data) bzw. partiell schreiben. Erlaubte Felder:
// name, description, category, currency, sectionTitle, listTitle — alle als
// String, Längen begrenzt (siehe store CONFIG_LIMITS). Antworten: GET 200 mit
// dem Config-Objekt; PUT 200 mit {success, config}; 400 bei leerem,
// nicht-Objekt-, unbekanntem, nicht-String- oder zu langem Patch.
app.get('/api/journey-config', needUser, (req, res) => {
  const journey = getJourney(req);
  try {
    res.json(store.getJourneyConfig(journey, req.user.id));
  } catch (error) {
    console.error('API GET Journey-Config Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/journey-config', needUser, (req, res) => {
  const journey = getJourney(req);
  try {
    const config = store.saveJourneyConfig(journey, req.user.id, req.body);
    res.json({ success: true, config });
  } catch (error) {
    if (error && (error.code === 'CONFIG_INVALID' || error.code === 'CONFIG_UNKNOWN_FIELD')) {
      return res.status(400).json({ error: error.message });
    }
    console.error('API PUT Journey-Config Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/data', needUser, (req, res) => {
  const journey = getJourney(req);
  try {
    res.json(store.getJourneyData(journey, req.user.id));
  } catch (error) {
    console.error('API GET Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/data/events', needUser, (req, res) => {
  const journey = getJourney(req);
  const channel = sseChannel(req.user.id, journey);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  // Reconnect-Backoff für den Browser (gilt auch nach Backend-Neustart).
  res.write('retry: 5000\n');
  res.write(`event: ready\ndata: ${JSON.stringify({ slug: journey })}\n\n`);

  let clients = journeySseClients.get(channel);
  if (!clients) {
    clients = new Set();
    journeySseClients.set(channel, clients);
  }
  clients.add(res);

  // Proxys schließen idle Streams gerne — Kommentar als Heartbeat.
  // Mehrere offene Tabs haben je einen eigenen Stream (je ein Toast).
  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch {
      // Wird beim `close` aufgeräumt.
    }
  }, 25000);
  if (heartbeat.unref) heartbeat.unref();

  const cleanup = () => {
    clearInterval(heartbeat);
    const current = journeySseClients.get(channel);
    if (current) {
      current.delete(res);
      if (current.size === 0) journeySseClients.delete(channel);
    }
    try {
      res.end();
    } catch {
      // Bereits geschlossen.
    }
  };
  req.on('close', cleanup);
});

app.post('/api/data', needUser, (req, res) => {
  const journey = getJourney(req);
  try {
    const data = req.body;
    if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'Request-Body muss ein nicht-leeres JSON-Objekt sein.' });
    }
    store.saveJourneyData(journey, req.user.id, data);
    broadcastJourneyUpdate(req.user.id, journey);
    res.json({ success: true });
  } catch (error) {
    console.error('API POST Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Sends a product URL to the n8n crawler and returns the extracted item
app.post('/api/import-link', needUser, async (req, res) => {
  const journey = getJourney(req);
  const { link } = req.body || {};

  if (!link || typeof link !== 'string') {
    return res.status(400).json({ error: 'Feld "link" ist erforderlich.' });
  }
  let parsedLink;
  try {
    parsedLink = new URL(link);
  } catch {
    return res.status(400).json({ error: 'Ungültige URL.' });
  }
  if (parsedLink.protocol !== 'http:' && parsedLink.protocol !== 'https:') {
    return res.status(400).json({ error: 'Nur http(s)-URLs werden unterstützt.' });
  }
  if (!N8N_WEBHOOK_URL) {
    return res.status(500).json({ error: 'N8N_WEBHOOK_URL ist nicht konfiguriert.' });
  }

  try {
    const n8nResponse = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: link, journey }),
      signal: AbortSignal.timeout(60000),
    });

    const rawBody = await n8nResponse.text();
    if (!n8nResponse.ok) {
      return res.status(502).json({ error: `n8n-Fehler (${n8nResponse.status}): ${rawBody.slice(0, 300)}` });
    }

    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return res.status(502).json({ error: 'n8n hat keine gültige JSON-Antwort geliefert.' });
    }
    // n8n webhook responses are sometimes wrapped in an array
    const productData = Array.isArray(payload) ? payload[0] : payload;

    if (!productData || !productData.name) {
      return res.status(502).json({ error: 'n8n hat kein verwertbares Produkt zurückgegeben.' });
    }

    const item = {
      name: productData.name,
      price: productData.price || '',
      specs: specsToString(productData.specs),
      rating: starsFromRating(productData.rating),
      status: productData.status || 'Thinking',
      notes: productData.notes || '',
      link: productData.link || link,
    };

    res.json({ item });
  } catch (error) {
    console.error('API Import-Link Error:', error);
    if (error.name === 'TimeoutError') {
      return res.status(504).json({ error: 'Zeitüberschreitung beim Warten auf n8n.' });
    }
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/feedback', needUser, (req, res) => {
  const journey = getJourney(req);
  try {
    res.json({ content: store.getFeedback(journey, req.user.id) });
  } catch (error) {
    console.error('API GET Feedback Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/feedback', needUser, (req, res) => {
  const journey = getJourney(req);
  try {
    const content = req.body ? req.body.content : undefined;
    if (typeof content !== 'string') {
      return res.status(400).json({ error: 'Feld "content" (String) ist erforderlich.' });
    }
    store.saveFeedback(journey, req.user.id, content);
    res.json({ success: true });
  } catch (error) {
    console.error('API POST Feedback Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// SPA fallback: let the React router handle any other GET route
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(FRONTEND_DIST, 'index.html'), (err) => {
    if (err && !res.headersSent) {
      res.status(404).json({ error: 'Frontend wurde noch nicht gebaut (frontend/dist fehlt).' });
    }
  });
});

// Start Server only when run directly (requiring this module has no side effects,
// which keeps it usable from tests and other tooling).
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT} (SQLite: ${store.path})`);
  });
}

function closeDatabase() {
  store.close();
}

module.exports = { app, getJourney, closeDatabase, broadcastJourneyUpdate, journeySseClients };
