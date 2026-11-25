const express = require('express');
const dotenv = require('dotenv');
const path = require('path');
const { openDatabase } = require('../../db/store.js');
const { optionalAuth, requireUser } = require('./auth.js');
const { createCrawlQueue, readQueueConcurrency, readAlignmentDebounceMs } = require('./crawl-queue.js');
const {
  alignJourneySpecs,
  computeDeterministicSpecComparison,
  hasAnyKeyedSpecs,
  findUsableLlmProvider,
} = require('./spec-alignment.js');
const { parsePrice, parseRatingStars } = require('../../core/price-parse.js');
const {
  parseSpecsParts,
  findSpecValue,
  computePricePoints,
  computeScoreForItem,
  buildReasons,
  budgetAllows,
} = require('../../core/decision.js');
const { ITEM_STATUSES } = require('../../mcp/tools.js');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const FRONTEND_DIST = process.env.FRONTEND_DIST || path.join(__dirname, '../../../frontend/dist');

// SQLite storage (file from DB_PATH, default ./data/app.db). No network, no sync.
const store = openDatabase();
const specQueue = createCrawlQueue({ concurrency: readQueueConcurrency() });

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
    packageName: '@journey-path/mcp',
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
// Scope: `POST /api/data` broadcastet an die Clients derselben Journey
// *desselben Owners* (Schlüssel `owner/slug` — kein User sieht fremde
// Updates). `POST /api/feedback`, `PUT /api/journey-config` und
// `POST /api/journeys` bleiben bewusst draußen.
const journeySseClients = new Map(); // "owner/slug" -> Set<ServerResponse>

function sseChannel(owner, slug) {
  return `${owner}/${slug}`;
}

// `extra` hängt optionale Event-Felder an; der `POST /api/data`-Pfad ruft ohne
// `extra` auf und bleibt `{slug, updatedAt}`.
function broadcastJourneyUpdate(owner, slug, extra) {
  const clients = journeySseClients.get(sseChannel(owner, slug));
  if (!clients || clients.size === 0) return;
  const payload = JSON.stringify({ slug, updatedAt: new Date().toISOString(), ...extra });
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

// Explicit journey deletion (no fallback to 'bike'): requires `?journey=X`.
// Answers 200 {success, slug}, 404 when unknown for this owner, 400 when
// missing/invalid.
app.delete('/api/journeys', needUser, (req, res) => {
  try {
    const raw = req.query ? req.query.journey : undefined;
    const first = Array.isArray(raw) ? raw[0] : raw;
    if (typeof first !== 'string' || !first.trim()) {
      return res.status(400).json({ error: 'Query-Parameter "journey" ist erforderlich.' });
    }
    const slug = normalizeJourneySlug(first);
    if (!slug) {
      return res.status(400).json({ error: 'Query-Parameter "journey" ergibt kein gültiges Journey-Kürzel (erlaubt: a-z, 0-9, ., -).' });
    }
    const deleted = store.deleteJourney(slug, req.user.id);
    if (!deleted) {
      return res.status(404).json({ error: `Journey "${slug}" nicht gefunden.` });
    }
    res.json({ success: true, slug });
  } catch (error) {
    console.error('API DELETE Journeys Error:', error);
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

const VALID_SORTS = ['position', 'price', 'rating', 'name'];
const VALID_FIELDS = ['items', 'status', 'specs', 'journey', 'generalNotes', 'feedback', 'config', 'headers', 'sectionTitle', 'listTitle', 'specComparison', 'criteria', 'pagination'];

function parseStatusFilter(raw) {
  if (raw === undefined) return null;
  const list = Array.isArray(raw) ? raw : String(raw).split(',');
  const out = list.map((s) => String(s).trim()).filter(Boolean);
  for (const s of out) {
    if (!ITEM_STATUSES.includes(s)) {
      const err = new Error(`Unbekannter Status "${s}". Erlaubt: ${ITEM_STATUSES.join(', ')}.`);
      err.code = 'INVALID_STATUS';
      throw err;
    }
  }
  return out;
}

function parseSortParams(query) {
  const sort = query.sort !== undefined ? String(query.sort) : 'position';
  if (!VALID_SORTS.includes(sort)) {
    const err = new Error(`Unbekannte Sortierung "${sort}". Erlaubt: ${VALID_SORTS.join(', ')}.`);
    err.code = 'INVALID_SORT';
    throw err;
  }
  const dir = query.dir !== undefined ? String(query.dir).toLowerCase() : 'asc';
  if (dir !== 'asc' && dir !== 'desc') {
    const err = new Error('Parameter "dir" muss "asc" oder "desc" sein.');
    err.code = 'INVALID_SORT';
    throw err;
  }
  return { sort, dir };
}

function sortItems(items, sort, dir) {
  const mult = dir === 'desc' ? -1 : 1;
  const withIndex = items.map((item, idx) => ({ item, idx }));
  withIndex.sort((a, b) => {
    let cmp = 0;
    if (sort === 'price') {
      const av = typeof a.item.priceAmount === 'number' ? a.item.priceAmount : null;
      const bv = typeof b.item.priceAmount === 'number' ? b.item.priceAmount : null;
      if (av === null && bv === null) cmp = a.idx - b.idx;
      else if (av === null) cmp = 1;
      else if (bv === null) cmp = -1;
      else cmp = av - bv;
    } else if (sort === 'rating') {
      cmp = parseRatingStars(a.item.rating) - parseRatingStars(b.item.rating);
    } else if (sort === 'name') {
      cmp = String(a.item.name || '').toLowerCase().localeCompare(String(b.item.name || '').toLowerCase());
    } else {
      cmp = a.idx - b.idx;
    }
    if (cmp !== 0) return cmp * mult;
    return (a.idx - b.idx) * 1;
  });
  return withIndex.map((x) => x.item);
}

function applyItemFilters(items, { status, search, sort, dir }) {
  let out = Array.isArray(items) ? [...items] : [];
  if (status && status.length > 0) {
    out = out.filter((i) => status.includes(i.status || 'Thinking'));
  }
  if (search) {
    const q = String(search).toLowerCase();
    out = out.filter((i) => {
      const hay = [i.name, i.notes, i.price, i.link, i.specs].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }
  if (sort && sort !== 'position') out = sortItems(out, sort, dir);
  else if (dir === 'desc') out = [...out].reverse();
  return out;
}

function buildComparePayload(doc, owner, journey, opts = {}) {
  const criteria = Array.isArray(doc.criteria) ? doc.criteria : [];
  const items = (Array.isArray(doc.items) ? doc.items : []).map((i) => ({
    ...i,
    pros: Array.isArray(i.pros) ? i.pros : [],
    cons: Array.isArray(i.cons) ? i.cons : [],
  }));
  const pricePoints = computePricePoints(items);
  const amounts = items.map((i) => i.priceAmount).filter((a) => typeof a === 'number');
  const priceRange = amounts.length > 0
    ? { min: Math.min(...amounts), max: Math.max(...amounts), currency: (items.find((i) => typeof i.priceAmount === 'number') || {}).priceCurrency || '' }
    : null;
  const minPrice = amounts.length > 0 ? Math.min(...amounts) : null;
  const withScore = items.map((item) => {
    const scoreInfo = computeScoreForItem(item, { pricePoints, criteria });
    const reasons = buildReasons(item, scoreInfo, { minPrice, criteria });
    const overBudget = budgetAllows(doc.status && doc.status.budget, item.priceAmount, item.priceCurrency, doc.configCurrency || '');
    return { item, score: scoreInfo.score, breakdown: scoreInfo.breakdown, reasons, overBudget };
  });
  // Gruppierung: specComparison bevorzugen, sonst deterministisch.
  const keyOrder = [];
  const displayByLower = new Map();
  const filledByLower = new Map();
  items.forEach((item, index) => {
    for (const part of parseSpecsParts(item.specs)) {
      if (!part.k) continue;
      const lower = part.k.toLowerCase();
      if (!displayByLower.has(lower)) {
        displayByLower.set(lower, part.k);
        filledByLower.set(lower, new Set());
        keyOrder.push(lower);
      }
      if (String(part.v || '').trim() !== '') filledByLower.get(lower).add(index);
    }
  });
  const total = items.length;
  const assigned = new Set();
  const commonKeys = [];
  const uniqueKeys = [];
  const comp = doc.specComparison;
  if (comp && Array.isArray(comp.commonKeys)) {
    for (const raw of comp.commonKeys) {
      const lower = String(raw).toLowerCase();
      if (displayByLower.has(lower) && !assigned.has(lower)) {
        commonKeys.push(displayByLower.get(lower));
        assigned.add(lower);
      }
    }
  }
  if (comp && Array.isArray(comp.uniqueKeys)) {
    for (const raw of comp.uniqueKeys) {
      const lower = String(raw).toLowerCase();
      if (displayByLower.has(lower) && !assigned.has(lower)) {
        uniqueKeys.push(displayByLower.get(lower));
        assigned.add(lower);
      }
    }
  }
  for (const lower of keyOrder) {
    if (assigned.has(lower)) continue;
    if (total > 0 && filledByLower.get(lower).size === total) commonKeys.push(displayByLower.get(lower));
    else uniqueKeys.push(displayByLower.get(lower));
    assigned.add(lower);
  }
  const valueByKey = (key) => {
    const values = {};
    for (const s of withScore) {
      const v = findSpecValue(s.item, key);
      values[s.item.name] = v || '—';
    }
    return values;
  };
  const common = (total >= 2 ? commonKeys : keyOrder.map((l) => displayByLower.get(l))).map((key) => ({ key, values: valueByKey(key) }));
  const unique = total >= 2 ? uniqueKeys.map((key) => ({ key, values: valueByKey(key) })) : [];
  const missing = items
    .map((item) => {
      const missingKeys = [...commonKeys, ...uniqueKeys].filter((k) => !String(findSpecValue(item, k) || '').trim());
      return missingKeys.length > 0 ? { item: item.name, missingKeys } : null;
    })
    .filter(Boolean);
  return {
    slug: journey,
    totalItems: items.length,
    returnedItems: items.length,
    sort: { by: opts.sort || 'position', dir: opts.dir || 'asc' },
    priceRange,
    items: withScore.map((s) => ({
      name: s.item.name,
      price: s.item.price,
      priceAmount: s.item.priceAmount,
      priceCurrency: s.item.priceCurrency,
      priceQualifier: s.item.priceQualifier,
      rating: parseRatingStars(s.item.rating),
      status: s.item.status,
      pros: s.item.pros,
      cons: s.item.cons,
      score: s.score,
      breakdown: s.breakdown,
      reasons: s.reasons,
      overBudget: s.overBudget,
    })),
    common,
    unique,
    missing,
    ...(doc.specComparison ? { specComparison: doc.specComparison } : {}),
  };
}

app.get('/api/data', needUser, (req, res) => {
  const journey = getJourney(req);
  try {
    const q = req.query || {};
    const hasFilter = q.status !== undefined || q.search !== undefined || q.sort !== undefined
      || q.dir !== undefined || q.limit !== undefined || q.offset !== undefined
      || q.fields !== undefined || q.includeSpecComparison !== undefined || q.includeLogs !== undefined
      || q.includeSpecs !== undefined || q.includeFeedback !== undefined || q.includeConfig !== undefined;
    const doc = store.getJourneyData(journey, req.user.id);
    if (!hasFilter) {
      res.json(doc);
      return;
    }
    const status = parseStatusFilter(q.status);
    const search = q.search !== undefined ? String(q.search) : '';
    const { sort, dir } = parseSortParams(q);
    let limit = null;
    let offset = 0;
    if (q.limit !== undefined) {
      limit = Number(q.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
        const err = new Error('Parameter "limit" muss eine ganze Zahl 1..200 sein.');
        err.code = 'INVALID_LIMIT';
        throw err;
      }
    }
    if (q.offset !== undefined) {
      offset = Number(q.offset);
      if (!Number.isInteger(offset) || offset < 0) {
        const err = new Error('Parameter "offset" muss eine ganze Zahl >= 0 sein.');
        err.code = 'INVALID_OFFSET';
        throw err;
      }
    }
    let fields = null;
    if (q.fields !== undefined) {
      fields = String(q.fields).split(',').map((s) => s.trim()).filter(Boolean);
      for (const f of fields) {
        if (!VALID_FIELDS.includes(f)) {
          const err = new Error(`Unbekanntes Feld "${f}". Erlaubt: ${VALID_FIELDS.join(', ')}.`);
          err.code = 'INVALID_FIELDS';
          throw err;
        }
      }
    }
    const filtered = applyItemFilters(doc.items, { status, search, sort, dir });
    const total = filtered.length;
    const paged = limit !== null ? filtered.slice(offset, offset + limit) : filtered.slice(offset);
    const out = { slug: journey, pagination: { total, returned: paged.length, limit: limit ?? total, offset } };
    const want = (name, flag) => {
      if (fields) return fields.includes(name);
      if (flag !== undefined) {
        const v = String(flag).toLowerCase();
        return v === '1' || v === 'true' || v === 'yes';
      }
      // Defaults ohne fields: alles ausser feedback/config wie bisher.
      return !['feedback', 'config'].includes(name);
    };
    if (!fields || fields.includes('items')) out.items = paged;
    if (want('status')) out.status = doc.status;
    if (want('journey', q.includeLogs)) out.journey = doc.journey;
    if (want('specs', q.includeSpecs)) out.specs = doc.specs;
    if (want('generalNotes')) out.generalNotes = doc.generalNotes;
    if (want('feedback', q.includeFeedback)) {
      out.feedback = store.getFeedback(journey, req.user.id);
    }
    if (want('config', q.includeConfig)) out.config = store.getJourneyConfig(journey, req.user.id);
    if (want('headers')) out.headers = doc.headers;
    if (want('sectionTitle')) out.sectionTitle = doc.sectionTitle;
    if (want('listTitle')) out.listTitle = doc.listTitle;
    if (want('specComparison', q.includeSpecComparison)) {
      if (doc.specComparison) out.specComparison = doc.specComparison;
    }
    if (!fields || fields.includes('criteria')) out.criteria = doc.criteria || [];
    res.json(out);
  } catch (error) {
    if (error && error.code && String(error.code).startsWith('INVALID')) {
      return res.status(400).json({ error: error.message, code: error.code });
    }
    if (error && (error.code === 'INVALID_LIMIT' || error.code === 'INVALID_OFFSET')) {
      return res.status(400).json({ error: error.message, code: error.code });
    }
    console.error('API GET Error:', error);
    res.status(500).json({ error: error.message });
  }
});

function requireJourneyParam(req) {
  const raw = req.query ? req.query.journey : undefined;
  const first = Array.isArray(raw) ? raw[0] : raw;
  if (typeof first !== 'string' || !first.trim()) {
    const err = new Error('Query-Parameter "journey" ist erforderlich.');
    err.code = 'INVALID_SLUG';
    throw err;
  }
  const cleaned = String(first).trim().toLowerCase().replace(/[^a-z0-9.-]/g, '');
  if (!cleaned) {
    const err = new Error('Query-Parameter "journey" ergibt kein gueltiges Kuerzel.');
    err.code = 'INVALID_SLUG';
    throw err;
  }
  return cleaned;
}

function journeyExists(slug, owner) {
  return store.listJourneys(owner).includes(slug);
}

// Vergleichs-Antwort: lesend, kein Lazy-Create, kein SSE, kein Abgleich-Trigger.
app.get('/api/compare', needUser, (req, res) => {
  try {
    const slug = requireJourneyParam(req);
    if (!journeyExists(slug, req.user.id)) {
      return res.status(404).json({ error: `Journey "${slug}" nicht gefunden.`, code: 'JOURNEY_NOT_FOUND' });
    }
    const q = req.query || {};
    const status = parseStatusFilter(q.status);
    const { sort, dir } = parseSortParams(q);
    const doc = store.getJourneyData(slug, req.user.id);
    const filteredItems = applyItemFilters(doc.items, { status, search: '', sort, dir });
    const payload = buildComparePayload({ ...doc, items: filteredItems }, req.user.id, slug, { sort, dir });
    res.json(payload);
  } catch (error) {
    if (error && error.code && (String(error.code).startsWith('INVALID') || error.code === 'JOURNEY_NOT_FOUND')) {
      const statusCode = error.code === 'JOURNEY_NOT_FOUND' ? 404 : 400;
      return res.status(statusCode).json({ error: error.message, code: error.code });
    }
    console.error('API GET Compare Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Shortlist: Top-N nach Score, lesend, schreibt keinen Status.
app.get('/api/shortlist', needUser, (req, res) => {
  try {
    const slug = requireJourneyParam(req);
    if (!journeyExists(slug, req.user.id)) {
      return res.status(404).json({ error: `Journey "${slug}" nicht gefunden.`, code: 'JOURNEY_NOT_FOUND' });
    }
    const q = req.query || {};
    let n = 3;
    if (q.n !== undefined) {
      n = Number(q.n);
      if (!Number.isInteger(n) || n < 1 || n > 10) {
        return res.status(400).json({ error: 'Parameter "n" muss eine ganze Zahl 1..10 sein.', code: 'INVALID_LIMIT' });
      }
    }
    let status = null;
    if (q.status !== undefined) {
      status = parseStatusFilter(q.status);
    } else {
      status = ITEM_STATUSES.filter((s) => s !== 'Rejected');
    }
    const doc = store.getJourneyData(slug, req.user.id);
    const filtered = applyItemFilters(doc.items, { status, search: '', sort: 'position', dir: 'asc' });
    const payload = buildComparePayload({ ...doc, items: filtered }, req.user.id, slug, { sort: 'position', dir: 'asc' });
    const ranked = [...payload.items].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const ap = typeof a.priceAmount === 'number' ? a.priceAmount : Number.POSITIVE_INFINITY;
      const bp = typeof b.priceAmount === 'number' ? b.priceAmount : Number.POSITIVE_INFINITY;
      if (ap !== bp) return ap - bp;
      if (b.rating !== a.rating) return b.rating - a.rating;
      return String(a.name).localeCompare(String(b.name));
    });
    res.json({ slug, n, total: payload.items.length, items: ranked.slice(0, n), priceRange: payload.priceRange });
  } catch (error) {
    if (error && error.code && String(error.code).startsWith('INVALID')) {
      return res.status(400).json({ error: error.message, code: error.code });
    }
    console.error('API GET Shortlist Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/criteria', needUser, (req, res) => {
  try {
    const slug = requireJourneyParam(req);
    if (!journeyExists(slug, req.user.id)) {
      return res.status(404).json({ error: `Journey "${slug}" nicht gefunden.`, code: 'JOURNEY_NOT_FOUND' });
    }
    res.json({ slug, criteria: store.getCriteria(slug, req.user.id) });
  } catch (error) {
    if (error && error.code === 'INVALID_SLUG') {
      return res.status(400).json({ error: error.message, code: error.code });
    }
    console.error('API GET Criteria Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/criteria', needUser, (req, res) => {
  try {
    const slug = requireJourneyParam(req);
    if (!journeyExists(slug, req.user.id)) {
      return res.status(404).json({ error: `Journey "${slug}" nicht gefunden.`, code: 'JOURNEY_NOT_FOUND' });
    }
    const body = req.body || {};
    if (typeof body.key !== 'string' || !body.key.trim()) {
      return res.status(400).json({ error: 'Feld "key" (String) ist erforderlich.', code: 'INVALID_CRITERIA' });
    }
    try {
      const result = store.setCriteria(slug, req.user.id, body.key, body.weight);
      broadcastJourneyUpdate(req.user.id, slug);
      res.json({ success: true, slug, ...result });
    } catch (err) {
      if (err && err.code === 'INVALID_CRITERIA') {
        return res.status(400).json({ error: err.message, code: err.code });
      }
      throw err;
    }
  } catch (error) {
    if (error && (error.code === 'INVALID_SLUG' || error.code === 'JOURNEY_NOT_FOUND')) {
      const statusCode = error.code === 'JOURNEY_NOT_FOUND' ? 404 : 400;
      return res.status(statusCode).json({ error: error.message, code: error.code });
    }
    console.error('API POST Criteria Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/criteria', needUser, (req, res) => {
  try {
    const slug = requireJourneyParam(req);
    if (!journeyExists(slug, req.user.id)) {
      return res.status(404).json({ error: `Journey "${slug}" nicht gefunden.`, code: 'JOURNEY_NOT_FOUND' });
    }
    const raw = req.query ? req.query.key : undefined;
    const key = Array.isArray(raw) ? raw[0] : raw;
    if (typeof key !== 'string' || !key.trim()) {
      return res.status(400).json({ error: 'Query-Parameter "key" ist erforderlich.', code: 'INVALID_CRITERIA' });
    }
    const deleted = store.deleteCriteria(slug, req.user.id, key);
    if (!deleted) {
      return res.status(404).json({ error: `Kriterium "${key}" nicht gefunden.`, code: 'CRITERION_NOT_FOUND' });
    }
    broadcastJourneyUpdate(req.user.id, slug);
    res.json({ success: true, slug, deleted: key });
  } catch (error) {
    if (error && (error.code === 'INVALID_SLUG' || error.code === 'INVALID_CRITERIA')) {
      return res.status(400).json({ error: error.message, code: error.code });
    }
    console.error('API DELETE Criteria Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/price-history', needUser, (req, res) => {
  try {
    const slug = requireJourneyParam(req);
    if (!journeyExists(slug, req.user.id)) {
      return res.status(404).json({ error: `Journey "${slug}" nicht gefunden.`, code: 'JOURNEY_NOT_FOUND' });
    }
    const raw = req.query ? req.query.name : undefined;
    const name = Array.isArray(raw) ? raw[0] : raw;
    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Query-Parameter "name" ist erforderlich.', code: 'INVALID_PARAMS' });
    }
    const limit = req.query && req.query.limit !== undefined ? Number(req.query.limit) : 20;
    try {
      const history = store.getPriceHistory(slug, req.user.id, name, limit);
      res.json({ slug, name, history });
    } catch (err) {
      if (err && err.code === 'ITEM_NOT_FOUND') {
        return res.status(404).json({ error: err.message, code: err.code });
      }
      throw err;
    }
  } catch (error) {
    if (error && (error.code === 'INVALID_SLUG' || error.code === 'INVALID_PARAMS')) {
      return res.status(400).json({ error: error.message, code: error.code });
    }
    console.error('API GET Price-History Error:', error);
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
    const owner = req.user.id;
    const before = store.getItemsSnapshot(journey, owner);
    const nextItems = Array.isArray(data.items) ? data.items : [];
    const nextHash = store.computeItemsHash(nextItems);
    const itemsChanged = before.hash !== nextHash;
    const source = req.query && typeof req.query.source === 'string' && req.query.source === 'mcp' ? 'mcp' : 'ui';

    try {
      store.saveJourneyData(journey, owner, data, { preserveSpecComparison: !itemsChanged, source });
    } catch (err) {
      if (err && err.code === 'INVALID_PROS_CONS') {
        return res.status(400).json({ error: err.message, code: err.code });
      }
      throw err;
    }

    if (itemsChanged && nextItems.length >= 2 && hasAnyKeyedSpecs(nextItems)) {
      const provider = findUsableLlmProvider();
      if (!provider) {
        // Stiller deterministischer Fallback ohne LLM-Provider und ohne Extra-SSE.
        const deterministic = computeDeterministicSpecComparison(nextItems, {
          updatedAt: new Date().toISOString(),
        });
        store.applySpecAlignment(journey, owner, {
          expectedItemsHash: nextHash,
          specComparison: deterministic,
        });
      } else {
        const itemsCopy = nextItems.map((item) => ({ ...item }));
        specQueue.scheduleDebounced({
          key: sseChannel(owner, journey),
          owner,
          journey,
          kind: 'property-sync',
          debounceMs: readAlignmentDebounceMs(),
          spec: { expectedHash: nextHash, items: itemsCopy },
          run: async ({ expectedHash, items }, { isLatest }) => {
            const aligned = await alignJourneySpecs({ journey, items });
            if (!isLatest()) return { skipped: true };
            const commit = store.applySpecAlignment(journey, owner, {
              expectedItemsHash: expectedHash,
              updatedSpecsByIndex: aligned.updatedSpecsByIndex,
              specComparison: aligned.specComparison,
            });
            if (commit.applied && (aligned.usedLlm || commit.changedSpecs)) {
              broadcastJourneyUpdate(owner, journey, { reason: 'property-sync' });
            }
            return { applied: commit.applied, usedLlm: aligned.usedLlm, changedSpecs: commit.changedSpecs };
          },
        });
      }
    }

    broadcastJourneyUpdate(owner, journey);
    res.json({ success: true });
  } catch (error) {
    console.error('API POST Error:', error);
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
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.get('*', (req, res) => {
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
    const { isAuthConfigured } = require('./auth.js');
    console.log(
      `Server running on http://localhost:${PORT} (SQLite: ${store.path}, Supabase-Auth: ${
        isAuthConfigured() ? 'aktiv' : 'NICHT konfiguriert'
      })`
    );
  });
}

function closeDatabase() {
  specQueue.dispose();
  store.close();
}

module.exports = { app, getJourney, closeDatabase, broadcastJourneyUpdate, journeySseClients };
