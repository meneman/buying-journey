#!/usr/bin/env node
// MCP-Server (stdio) für Buying-Journey-Lese- und Schreibzugriff.
//
// Ruft ausschließlich die REST-API des Backends auf (kein Direkt-DB-Zugriff):
//   GET /api/journeys                  Existenzprüfung (verhindert stilles Anlegen)
//   GET /api/journey-configs           Alle Journeys inkl. Basis-Config listen
//   POST /api/journeys                 Journey explizit anlegen (201, 409 bei Duplikat)
//   DELETE /api/journeys?journey=X     Journey löschen
//   GET /api/data?journey=X            Status, Logs, Items, Specs, Notizen, Titel
//   POST /api/data?journey=X           Vollständiges Dokument zurückschreiben
//   GET /api/feedback?journey=X        Feedback-Text
//   POST /api/feedback?journey=X       Feedback-Text speichern
//   GET /api/journey-config?journey=X  Basis-Eigenschaften + Settings
//   PUT /api/journey-config?journey=X  Basis-Eigenschaften + Settings aktualisieren
//
// Das Backend muss laufen. Basis-URL konfigurierbar:
//   MCP_BASE_URL=http://localhost:3000  (Default; sonst PORT, Default 3000)
// Auth (Pflicht — ein Key = ein User, nur dessen Daten sind sichtbar):
//   MCP_AUTH_TOKEN=bj_...  (langlebiger API-Key, siehe POST /api/api-keys
//   oder src/agent/scripts/create-api-key.js)
//
// Protokoll: newline-delimited JSON-RPC 2.0 auf stdin/stdout (MCP-Transport),
// Logs gehen nach stderr. Der MCP-Client erledigt Web-Recherche und Extraktion
// selbst und übergibt strukturierte Daten direkt an die CRUD-Tools (`journey.help`,
// `journey.list`, `journey.create`, `journey.update_config`, `journey.delete`,
// `journey.get`, `journey.add_item`, `journey.delete_item`, `journey.update_meta`,
// `journey.add_log`, `journey.delete_log`, `journey.set_spec`, `journey.delete_spec`,
// `journey.set_feedback`).
// Unbekannter/leerer Slug und unerreichbares Backend liefern definierte
// Fehler, ohne etwas anzulegen oder zu schreiben.

const {
  SERVER_INFO,
  PROTOCOL_VERSION,
  ITEM_STATUSES,
  PHASES,
  JOURNEY_CATEGORIES,
  CONFIG_FIELDS,
  TOOL_DEFS,
} = require('./tools.js');

const BASE_URL =
  process.env.MCP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

// Langlebiger API-Key des Users (ein Key = ein User, siehe POST
// /api/api-keys bzw. src/agent/scripts/create-api-key.js). Er reist als
// Bearer-Token mit jedem Backend-Call — der MCP arbeitet damit
// ausschließlich im Namensraum dieses Users. Ohne Token antwortet das
// Backend 401 (siehe Fehlermeldung in requestJson).
const AUTH_TOKEN = (process.env.MCP_AUTH_TOKEN || '').trim();

function authHeaders() {
  return AUTH_TOKEN ? { Authorization: `Bearer ${AUTH_TOKEN}` } : {};
}

function backendError(url, status, snippet) {
  let err;
  if (status === 401 || status === 403) {
    err = new Error(
      `Backend meldet HTTP ${status} für ${url}: Anmeldung fehlgeschlagen — ` +
        'MCP_AUTH_TOKEN prüfen (gültiger API-Key des Users als Bearer-Token erforderlich).'
    );
  } else {
    err = new Error(`Backend antwortete mit HTTP ${status} für ${url}${snippet ? `: ${snippet}` : ''}`);
  }
  err.status = status;
  return err;
}

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

async function requestJson(method, url, body) {
  let res;
  try {
    const headers = body !== undefined
      ? { 'Content-Type': 'application/json', ...authHeaders() }
      : authHeaders();
    res = await fetch(url, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    throw new Error(`Backend unter ${BASE_URL} ist nicht erreichbar: ${err.message}`);
  }
  if (!res.ok) {
    const snippet = await res.text().then((t) => t.slice(0, 300)).catch(() => '');
    throw backendError(url, res.status, snippet);
  }
  return res.json();
}

function getJson(url) {
  return requestJson('GET', url);
}

function postJson(url, body) {
  return requestJson('POST', url, body);
}

function putJson(url, body) {
  return requestJson('PUT', url, body);
}

function deleteJson(url) {
  return requestJson('DELETE', url);
}

// Wie `starsFromRating` in src/core/item-format.js: Zahl 0-5 -> ⭐-String.
function starsFromRating(rating) {
  const stars = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
  return '⭐'.repeat(stars);
}

// Zerlegt den "<br>"-Specs-String der REST-Darstellung in Key/Value-Paare plus
// Freitext-Zeilen — gleiche Konvention wie src/agent/scripts/add-item.js.
function parseSpecsString(specs) {
  const keyed = {};
  const freeText = [];
  if (!specs) return { keyed, freeText };
  for (const part of String(specs).split(/<br\s*\/?>/i)) {
    const trim = part.trim();
    if (!trim) continue;
    const colon = trim.indexOf(':');
    if (colon > 0) {
      keyed[trim.slice(0, colon).trim().toLowerCase()] = {
        originalKey: trim.slice(0, colon).trim(),
        value: trim.slice(colon + 1).trim(),
      };
    } else {
      freeText.push(trim);
    }
  }
  return { keyed, freeText };
}

function specsToWireString(keyed, freeText) {
  const lines = Object.keys(keyed).map((k) => `${keyed[k].originalKey}: ${keyed[k].value}`);
  for (const f of freeText) lines.push(f);
  return lines.join(' <br> ');
}

async function readJourney(slug) {
  await assertKnownJourney(slug);
  // Erst ab hier /api/data und /api/journey-config anfassen — vorher
  // anzufragen würde die Journey via ensureJourney stillschweigend anlegen.
  const [data, feedback, config] = await Promise.all([
    getJson(`${BASE_URL}/api/data?journey=${encodeURIComponent(slug)}`),
    getJson(`${BASE_URL}/api/feedback?journey=${encodeURIComponent(slug)}`),
    getJson(`${BASE_URL}/api/journey-config?journey=${encodeURIComponent(slug)}`),
  ]);
  return { slug, ...data, feedback: feedback && feedback.content, config };
}

function invalidParams(message) {
  const err = new Error(message);
  err.code = -32602;
  return err;
}

// Prüft die optionalen Item-Felder (Preis/Notizen/Rating/Status/Specs) für journey.add_item.
function validateOptionalItemFields(args) {
  for (const key of ['price', 'notes']) {
    if (args[key] !== undefined && typeof args[key] !== 'string') {
      throw invalidParams(`Parameter "${key}" muss ein String sein.`);
    }
  }
  let rating;
  if (args.rating !== undefined) {
    const num = typeof args.rating === 'string' ? Number(args.rating) : args.rating;
    if (typeof num !== 'number' || !Number.isFinite(num) || num < 0 || num > 5) {
      throw invalidParams('Parameter "rating" muss eine Zahl zwischen 0 und 5 sein.');
    }
    rating = num;
  }
  if (args.status !== undefined && !ITEM_STATUSES.includes(args.status)) {
    throw invalidParams(`Parameter "status" muss einer von ${ITEM_STATUSES.join(', ')} sein.`);
  }
  let specs;
  if (args.specs !== undefined) {
    if (!args.specs || typeof args.specs !== 'object' || Array.isArray(args.specs)) {
      throw invalidParams('Parameter "specs" muss ein Objekt mit String-Werten sein.');
    }
    specs = {};
    for (const [k, v] of Object.entries(args.specs)) {
      if (!k.trim()) throw invalidParams('Parameter "specs" enthält einen leeren Schlüssel.');
      if (typeof v !== 'string') throw invalidParams(`Spec "${k}" muss ein String sein.`);
      specs[k] = v;
    }
  }
  return { price: args.price, rating, status: args.status, notes: args.notes, specs };
}

// Prüft die Argumente von journey.add_item. Gibt normalisierte Werte zurück
// (slug/name getrimmt, optionale Strings/Objekte nur wenn gesetzt).
function validateAddItemArgs(raw) {
  const args = (raw && raw.arguments) || {};
  if (typeof args.slug !== 'string' || !args.slug.trim()) {
    throw invalidParams('Parameter "slug" (nicht-leerer String) ist erforderlich.');
  }
  const slug = sanitizeSlug(args.slug);
  if (!slug) {
    throw invalidParams('Parameter "slug" ergibt kein gültiges Journey-Kürzel (erlaubt: a-z, 0-9, ., -).');
  }
  if (typeof args.name !== 'string' || !args.name.trim()) {
    throw invalidParams('Parameter "name" (nicht-leerer String) ist erforderlich.');
  }
  const name = args.name.trim();
  if (args.link !== undefined && typeof args.link !== 'string') {
    throw invalidParams('Parameter "link" muss ein String sein.');
  }
  const optional = validateOptionalItemFields(args);
  return { slug, name, link: args.link, ...optional };
}

async function handleAddItem(params) {
  const { slug, name, price, rating, status, notes, link, specs } = validateAddItemArgs(params);
  await assertKnownJourney(slug);
  const data = await getJson(`${BASE_URL}/api/data?journey=${encodeURIComponent(slug)}`);
  data.items = Array.isArray(data.items) ? data.items : [];

  const existingIndex = data.items.findIndex(
    (i) => String(i && i.name ? i.name : '').toLowerCase() === name.toLowerCase()
  );
  const existingItem = existingIndex >= 0 ? data.items[existingIndex] : {};
  const { keyed, freeText } = parseSpecsString(existingItem.specs);

  // Übergebene Standardfelder übernehmen (auch leere Strings zum Löschen),
  // nicht übergebene Felder behalten ihren bisherigen Wert.
  const patch = { name };
  if (price !== undefined) patch.price = price;
  if (status !== undefined) patch.status = status;
  if (rating !== undefined) patch.rating = starsFromRating(rating);
  if (notes !== undefined) patch.notes = notes;
  if (link !== undefined) patch.link = link;

  // Specs mergen: gleiche Keys (case-insensitiv) überschreiben, neue Keys
  // kommen mit großgeschriebenem Anfangsbuchstaben dazu.
  if (specs !== undefined) {
    for (const [k, v] of Object.entries(specs)) {
      const lower = k.toLowerCase();
      const displayKey = keyed[lower] ? keyed[lower].originalKey : k.charAt(0).toUpperCase() + k.slice(1);
      keyed[lower] = { originalKey: displayKey, value: v };
    }
  }
  patch.specs = specsToWireString(keyed, freeText);

  let created;
  if (existingIndex >= 0) {
    created = false;
    data.items[existingIndex] = { ...existingItem, ...patch };
  } else {
    created = true;
    data.items.push(patch);
  }

  // Standard-Header wie add-item.js erzwingen.
  data.headers = ['Name', 'Price', 'Specs', 'Rating', 'Status', 'Notes', 'Link'];

  try {
    await postJson(`${BASE_URL}/api/data?journey=${encodeURIComponent(slug)}`, data);
  } catch (err) {
    if (err.message.includes('nicht erreichbar')) throw err;
    throw new Error(`Speichern in Journey "${slug}" ist fehlgeschlagen: ${err.message}`);
  }
  const item = created ? patch : data.items[existingIndex];
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          { success: true, slug, name, created, item },
          null,
          2
        ),
      },
    ],
  };
}

// Fragt die bekannten Journeys ab und prüft, ob der Slug existiert. Wirft mit
// klarer Nachricht bei unerreichbarem Backend oder unbekanntem Slug. Erst
// danach darf /api/data angefasst werden — vorher anzufragen würde die
// Journey via ensureJourney stillschweigend anlegen.
async function assertKnownJourney(slug) {
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
  return journeys;
}

function jsonResult(payload) {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
}

function toolResultError(message) {
  return { content: [{ type: 'text', text: `Fehler: ${message}` }], isError: true };
}

function requireSlug(args, paramName = 'slug') {
  const raw = args && args[paramName];
  if (typeof raw !== 'string' || !raw.trim()) {
    throw invalidParams(`Parameter "${paramName}" (nicht-leerer String) ist erforderlich.`);
  }
  const slug = sanitizeSlug(raw);
  if (!slug) {
    throw invalidParams(
      `Parameter "${paramName}" ergibt kein gültiges Journey-Kürzel (erlaubt: a-z, 0-9, ., -).`
    );
  }
  return slug;
}

function requireNonEmptyString(args, paramName) {
  const raw = args && args[paramName];
  if (typeof raw !== 'string' || !raw.trim()) {
    throw invalidParams(`Parameter "${paramName}" (nicht-leerer String) ist erforderlich.`);
  }
  return raw.trim();
}

function todayIsoDate() {
  return new Date().toISOString().split('T')[0];
}

// Gemeinsame Read-Modify-Write-Schleife für alle Schreibzugriffe auf
// `/api/data?journey=X`: prüft zuerst `assertKnownJourney` (kein stilles
// Anlegen bei Tippfehler) und speichert nur bei Erfolg.
async function mutateJourneyData(slug, transform) {
  await assertKnownJourney(slug);
  const data = await getJson(`${BASE_URL}/api/data?journey=${encodeURIComponent(slug)}`);
  const outcome = transform(data);
  try {
    await postJson(`${BASE_URL}/api/data?journey=${encodeURIComponent(slug)}`, data);
  } catch (err) {
    if (err.message.includes('nicht erreichbar') || err.status === 401 || err.status === 403) throw err;
    throw new Error(`Speichern in Journey "${slug}" ist fehlgeschlagen: ${err.message}`);
  }
  return outcome;
}

function handleHelp() {
  return jsonResult({
    server: SERVER_INFO,
    description:
      'JourneyPath verwaltet Kaufreisen (Journeys) mit Produktkandidaten, Vergleichs-Specs, Status/Budget, Reisetagebuch, journey-weiten Eigenschaften und Feedback. Der KI-Client recherchiert selbst und pflegt alle Daten strukturiert über diese Tools.',
    workflows: [
      '1. Überblick holen: `journey.list` zeigt vorhandene Kaufreisen; `journey.get` liest alle Details einer Journey.',
      '2. Neue Liste anlegen: `journey.create` legt eine Journey per Slug + optionalen Metadaten an; `journey.update_config` ändert Name/Kategorie/Währung/Überschriften.',
      '3. Produkte pflegen: `journey.add_item` legt Kandidaten an oder aktualisiert sie (Upsert nach Name) inkl. `specs`-Objekt; `journey.delete_item` entfernt ein Produkt.',
      '4. Reise begleiten: `journey.update_meta` aktualisiert Phase/Budget/Zieldatum/Notizen; `journey.add_log` / `journey.delete_log` pflegen das Tagebuch.',
      '5. Rahmenwerte & Feedback: `journey.set_spec` / `journey.delete_spec` verwalten journey-weite Eigenschaften (/eigenschaften); `journey.set_feedback` schreibt /feedback.',
    ],
    enums: {
      itemStatuses: ITEM_STATUSES,
      journeyPhases: PHASES,
      journeyCategories: JOURNEY_CATEGORIES,
    },
    conventions: {
      slug: 'Kleinbuchstaben, Ziffern, Punkt und Bindestrich (z.B. "gravel-bike", "laptop").',
      specs:
        'Objekt mit einheitlichen, klaren Schlüsselnamen je Journey, z.B. {"Gewicht": "8.2 kg", "Akku": "750 Wh"}. Einheitliche Keys ermöglichen den direkten Spaltenvergleich.',
      rating: 'Zahl von 0 bis 5 (wird automatisch in ⭐-Sterne umgewandelt).',
      date: 'ISO-Datum YYYY-MM-DD (Default bei journey.add_log: heutiges Datum).',
    },
    tools: TOOL_DEFS.map((t) => ({
      name: t.name,
      description: t.description,
      required: (t.inputSchema && t.inputSchema.required) || [],
      optional: Object.keys((t.inputSchema && t.inputSchema.properties) || {}).filter(
        (k) => !((t.inputSchema && t.inputSchema.required) || []).includes(k)
      ),
    })),
  });
}

async function handleList() {
  const journeys = await getJson(`${BASE_URL}/api/journey-configs`);
  return jsonResult({
    count: Array.isArray(journeys) ? journeys.length : 0,
    journeys,
  });
}

async function handleCreate(params) {
  const args = (params && params.arguments) || {};
  const slug = requireSlug(args);
  const body = { slug };
  const stringFields = [
    'name',
    'description',
    'category',
    'currency',
    'phase',
    'budget',
    'targetDate',
    'generalNotes',
    'sectionTitle',
    'listTitle',
  ];
  for (const key of stringFields) {
    if (args[key] !== undefined) {
      if (typeof args[key] !== 'string') {
        throw invalidParams(`Parameter "${key}" muss ein String sein.`);
      }
      body[key] = args[key];
    }
  }
  if (body.phase !== undefined && !PHASES.includes(body.phase)) {
    throw invalidParams(`Parameter "phase" muss einer von ${PHASES.join(', ')} sein.`);
  }
  try {
    const res = await postJson(`${BASE_URL}/api/journeys`, body);
    return jsonResult({ success: true, slug: res.slug, created: true });
  } catch (err) {
    if (err.status === 409) {
      throw new Error(`Journey "${slug}" existiert bereits — nutze journey.update_config oder journey.add_item.`);
    }
    throw err;
  }
}

async function handleUpdateConfig(params) {
  const args = (params && params.arguments) || {};
  const slug = requireSlug(args);
  const patch = {};
  for (const key of CONFIG_FIELDS) {
    if (args[key] !== undefined) {
      if (typeof args[key] !== 'string') {
        throw invalidParams(`Parameter "${key}" muss ein String sein.`);
      }
      patch[key] = args[key];
    }
  }
  if (Object.keys(patch).length === 0) {
    throw invalidParams(
      `Mindestens eines der Felder (${CONFIG_FIELDS.join(', ')}) muss angegeben werden.`
    );
  }
  await assertKnownJourney(slug);
  const res = await putJson(`${BASE_URL}/api/journey-config?journey=${encodeURIComponent(slug)}`, patch);
  return jsonResult({ success: true, slug, config: res.config });
}

async function handleDelete(params) {
  const args = (params && params.arguments) || {};
  const slug = requireSlug(args);
  try {
    await deleteJson(`${BASE_URL}/api/journeys?journey=${encodeURIComponent(slug)}`);
    return jsonResult({ success: true, slug, deleted: true });
  } catch (err) {
    if (err.status === 404) {
      throw new Error(`Unbekannte Journey "${slug}".`);
    }
    throw err;
  }
}

async function handleDeleteItem(params) {
  const args = (params && params.arguments) || {};
  const slug = requireSlug(args);
  const name = requireNonEmptyString(args, 'name');
  const outcome = await mutateJourneyData(slug, (data) => {
    data.items = Array.isArray(data.items) ? data.items : [];
    const idx = data.items.findIndex(
      (i) => String(i && i.name ? i.name : '').toLowerCase() === name.toLowerCase()
    );
    if (idx < 0) {
      throw new Error(`Produkt "${name}" wurde in Journey "${slug}" nicht gefunden.`);
    }
    const [removed] = data.items.splice(idx, 1);
    return { deleted: removed.name, remainingCount: data.items.length };
  });
  return jsonResult({ success: true, slug, ...outcome });
}

async function handleUpdateMeta(params) {
  const args = (params && params.arguments) || {};
  const slug = requireSlug(args);
  const hasField = ['phase', 'budget', 'targetDate', 'generalNotes'].some((k) => args[k] !== undefined);
  if (!hasField) {
    throw invalidParams(
      'Mindestens einer der Parameter "phase", "budget", "targetDate" oder "generalNotes" ist erforderlich.'
    );
  }
  for (const key of ['phase', 'budget', 'targetDate', 'generalNotes']) {
    if (args[key] !== undefined && typeof args[key] !== 'string') {
      throw invalidParams(`Parameter "${key}" muss ein String sein.`);
    }
  }
  if (args.phase !== undefined && !PHASES.includes(args.phase)) {
    throw invalidParams(`Parameter "phase" muss einer von ${PHASES.join(', ')} sein.`);
  }
  const outcome = await mutateJourneyData(slug, (data) => {
    data.status = data.status && typeof data.status === 'object' ? data.status : {};
    if (args.phase !== undefined) data.status.phase = args.phase;
    if (args.budget !== undefined) data.status.budget = args.budget;
    if (args.targetDate !== undefined) data.status.targetDate = args.targetDate;
    if (args.generalNotes !== undefined) data.generalNotes = args.generalNotes;
    return { status: data.status, generalNotes: data.generalNotes };
  });
  return jsonResult({ success: true, slug, ...outcome });
}

async function handleAddLog(params) {
  const args = (params && params.arguments) || {};
  const slug = requireSlug(args);
  const event = requireNonEmptyString(args, 'event');
  let date = todayIsoDate();
  if (args.date !== undefined) {
    if (typeof args.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(args.date.trim())) {
      throw invalidParams('Parameter "date" muss im Format YYYY-MM-DD angegeben werden.');
    }
    date = args.date.trim();
  }
  const outcome = await mutateJourneyData(slug, (data) => {
    data.journey = Array.isArray(data.journey) ? data.journey : [];
    const entry = { date, event };
    data.journey = [...data.journey, entry].sort((a, b) =>
      String(b && b.date ? b.date : '').localeCompare(String(a && a.date ? a.date : ''))
    );
    return { entry, totalLogs: data.journey.length };
  });
  return jsonResult({ success: true, slug, ...outcome });
}

async function handleDeleteLog(params) {
  const args = (params && params.arguments) || {};
  const slug = requireSlug(args);
  let index;
  if (args.index !== undefined) {
    const num = typeof args.index === 'string' ? Number(args.index) : args.index;
    if (typeof num !== 'number' || !Number.isInteger(num) || num < 0) {
      throw invalidParams('Parameter "index" muss eine ganze Zahl >= 0 sein.');
    }
    index = num;
  }
  let event;
  if (args.event !== undefined) {
    event = requireNonEmptyString(args, 'event');
  }
  let date;
  if (args.date !== undefined) {
    if (typeof args.date !== 'string' || !args.date.trim()) {
      throw invalidParams('Parameter "date" muss ein nicht-leerer String sein.');
    }
    date = args.date.trim();
  }
  if (index === undefined && event === undefined) {
    throw invalidParams('Entweder "index" oder "event" muss zum Löschen eines Tagebucheintrags angegeben werden.');
  }
  const outcome = await mutateJourneyData(slug, (data) => {
    data.journey = Array.isArray(data.journey) ? data.journey : [];
    let removeIdx = -1;
    if (index !== undefined) {
      if (index >= data.journey.length) {
        throw new Error(
          `Tagebuch-Index ${index} existiert in Journey "${slug}" nicht (Anzahl: ${data.journey.length}).`
        );
      }
      removeIdx = index;
    } else {
      removeIdx = data.journey.findIndex((entry) => {
        if (!entry) return false;
        const matchesEvent = String(entry.event || '').trim().toLowerCase() === event.toLowerCase();
        const matchesDate = date === undefined || String(entry.date || '').trim() === date;
        return matchesEvent && matchesDate;
      });
      if (removeIdx < 0) {
        throw new Error(`Kein passender Tagebucheintrag in Journey "${slug}" gefunden.`);
      }
    }
    const [removed] = data.journey.splice(removeIdx, 1);
    return { deleted: removed, remainingCount: data.journey.length };
  });
  return jsonResult({ success: true, slug, ...outcome });
}

async function handleSetSpec(params) {
  const args = (params && params.arguments) || {};
  const slug = requireSlug(args);
  const label = requireNonEmptyString(args, 'label');
  if (typeof args.value !== 'string') {
    throw invalidParams('Parameter "value" (String) ist erforderlich.');
  }
  const value = args.value.trim();
  const outcome = await mutateJourneyData(slug, (data) => {
    data.specs = Array.isArray(data.specs) ? data.specs : [];
    const idx = data.specs.findIndex(
      (s) => String(s && s.label ? s.label : '').toLowerCase() === label.toLowerCase()
    );
    const created = idx < 0;
    const spec = { label: created ? label : data.specs[idx].label, value };
    if (created) {
      data.specs.push(spec);
    } else {
      data.specs[idx] = spec;
    }
    return { created, spec, totalSpecs: data.specs.length };
  });
  return jsonResult({ success: true, slug, ...outcome });
}

async function handleDeleteSpec(params) {
  const args = (params && params.arguments) || {};
  const slug = requireSlug(args);
  const label = requireNonEmptyString(args, 'label');
  const outcome = await mutateJourneyData(slug, (data) => {
    data.specs = Array.isArray(data.specs) ? data.specs : [];
    const idx = data.specs.findIndex(
      (s) => String(s && s.label ? s.label : '').toLowerCase() === label.toLowerCase()
    );
    if (idx < 0) {
      throw new Error(`Eigenschaft "${label}" wurde in Journey "${slug}" nicht gefunden.`);
    }
    const [removed] = data.specs.splice(idx, 1);
    return { deleted: removed.label, remainingCount: data.specs.length };
  });
  return jsonResult({ success: true, slug, ...outcome });
}

async function handleSetFeedback(params) {
  const args = (params && params.arguments) || {};
  const slug = requireSlug(args);
  if (typeof args.content !== 'string') {
    throw invalidParams('Parameter "content" (String) ist erforderlich.');
  }
  await assertKnownJourney(slug);
  await postJson(`${BASE_URL}/api/feedback?journey=${encodeURIComponent(slug)}`, {
    content: args.content,
  });
  return jsonResult({ success: true, slug, length: args.content.length });
}

const TOOL_HANDLERS = {
  'journey.help': () => handleHelp(),
  'journey.list': () => handleList(),
  'journey.create': (params) => handleCreate(params),
  'journey.update_config': (params) => handleUpdateConfig(params),
  'journey.delete': (params) => handleDelete(params),
  'journey.get': async (params) => {
    const slug = requireSlug((params && params.arguments) || {});
    return jsonResult(await readJourney(slug));
  },
  'journey.add_item': (params) => handleAddItem(params),
  'journey.delete_item': (params) => handleDeleteItem(params),
  'journey.update_meta': (params) => handleUpdateMeta(params),
  'journey.add_log': (params) => handleAddLog(params),
  'journey.delete_log': (params) => handleDeleteLog(params),
  'journey.set_spec': (params) => handleSetSpec(params),
  'journey.delete_spec': (params) => handleDeleteSpec(params),
  'journey.set_feedback': (params) => handleSetFeedback(params),
};

async function handleCall(params) {
  const toolName = params && params.name;
  const handler = toolName && Object.prototype.hasOwnProperty.call(TOOL_HANDLERS, toolName)
    ? TOOL_HANDLERS[toolName]
    : null;
  if (!handler) {
    throw invalidParams(`Unbekanntes Tool: ${toolName}`);
  }
  try {
    return await handler(params);
  } catch (err) {
    if (err.code === -32602) throw err;
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
      return { tools: TOOL_DEFS };
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
