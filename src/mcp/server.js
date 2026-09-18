#!/usr/bin/env node
// MCP-Server (stdio) für Buying-Journey-Lese- und Schreibzugriff.
//
// Ruft ausschließlich die REST-API des Backends auf (kein Direkt-DB-Zugriff):
//   GET /api/journeys                  Existenzprüfung (verhindert stilles Anlegen)
//   POST /api/journeys                 Journey explizit anlegen (201, 409 bei Duplikat)
//   GET /api/data?journey=X            Status, Logs, Items, Specs, Notizen, Titel
//   POST /api/data?journey=X           Vollständiges Dokument zurückschreiben
//   GET /api/feedback?journey=X        Feedback-Text
//   GET /api/journey-config?journey=X  Basis-Eigenschaften + Settings
//
// Das Backend muss laufen. Basis-URL konfigurierbar:
//   MCP_BASE_URL=http://localhost:3000  (Default; sonst PORT, Default 3000)
// Auth (Pflicht — ein Key = ein User, nur dessen Daten sind sichtbar):
//   MCP_AUTH_TOKEN=bj_...  (langlebiger API-Key, siehe POST /api/api-keys
//   oder src/agent/scripts/create-api-key.js)
//
// Protokoll: newline-delimited JSON-RPC 2.0 auf stdin/stdout (MCP-Transport),
// Logs gehen nach stderr. Tools:
//   `journey.get`               Dokument lesen (legt nichts an)
//   `journey.add_item`          Produkt anlegen/aktualisieren (Upsert per Name)
//   `journey.crawl_link`        Produktseite headless laden (Titel + Text, speichert nichts)
//   `journey.create_from_link`  Neue Journey anlegen + Initial-Link als erstes Produkt crawlen
//                               (Slug optional — sonst LLM-Benennung; Erstprodukt per
//                               LLM-Extraktion, offline Titel + Link als markierter Rückfall)
// Unbekannter/leerer Slug und unerreichbares Backend liefern definierte
// Fehler, ohne etwas anzulegen oder zu schreiben.

const { SERVER_INFO, PROTOCOL_VERSION, ITEM_STATUSES, TOOL_DEFS } = require('./tools.js');

const BASE_URL =
  process.env.MCP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

// Langlebiger API-Key des Users (ein Key = ein User, siehe POST
// /api/api-keys bzw. src/agent/scripts/create-api-key.js). Er reist als
// Bearer-Token mit jedem Backend-Call — der MCP arbeitet damit
// ausschließlich im Namensraum dieses Users. Ohne Token antwortet das
// Backend 401 (siehe Fehlermeldung in getJson/postJson).
const AUTH_TOKEN = (process.env.MCP_AUTH_TOKEN || '').trim();

function authHeaders() {
  return AUTH_TOKEN ? { Authorization: `Bearer ${AUTH_TOKEN}` } : {};
}

function backendError(url, status, snippet) {
  if (status === 401 || status === 403) {
    return new Error(
      `Backend meldet HTTP ${status} für ${url}: Anmeldung fehlgeschlagen — ` +
        'MCP_AUTH_TOKEN prüfen (gültiger API-Key des Users als Bearer-Token erforderlich).'
    );
  }
  return new Error(`Backend antwortete mit HTTP ${status} für ${url}${snippet ? `: ${snippet}` : ''}`);
}

const FETCH_TIMEOUT_MS = 15000;
const CRAWL_GOTO_TIMEOUT_MS = 30000;
const CRAWL_DEFAULT_MAX_CHARS = 15000;
const CRAWL_MAX_CHARS_LIMIT = 50000;

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
  const res = await fetch(url, {
    headers: authHeaders(),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw backendError(url, res.status, '');
  }
  return res.json();
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    const snippet = await res.text().then((t) => t.slice(0, 300)).catch(() => '');
    throw backendError(url, res.status, snippet);
  }
  return res.json();
}

// Löst einen Crawl-Job (`POST /api/parse-text` → 202) per
// `GET /api/import-jobs/:id` auf: `done` liefert den Job mit Item, `errored`
// (Fetch, LLM, CONTENT_BLOCKED) wirft wie früher der synchrone POST.
async function awaitParseJob(jobId) {
  const started = Date.now();
  const timeoutMs = 5 * 60 * 1000;
  for (;;) {
    const job = await getJson(`${BASE_URL}/api/import-jobs/${encodeURIComponent(jobId)}`);
    if (job.status === 'done') return job;
    if (job.status === 'errored') {
      throw new Error(
        `KI-Extraktion des Produkts ist fehlgeschlagen: ${job.error || 'Unbekannter Fehler'}` +
        `${job.code ? ` (${job.code})` : ''}`
      );
    }
    if (Date.now() - started > timeoutMs) {
      throw new Error('KI-Extraktion des Produkts: Zeitüberschreitung beim Warten auf den Import-Job.');
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
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

// Prüft die optionalen Item-Felder (Preis/Notizen/Rating/Status/Specs) —
// gemeinsam genutzt von journey.add_item und journey.create_from_link, damit
// beide Tools dieselben Regeln melden.
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

// Zählt die ⭐-Bewertung aus POST /api/parse-text zurück auf 0-5.
function countStars(rating) {
  return (String(rating || '').match(/⭐/g) || []).length;
}

// Wandelt den "<br>"-Specs-String aus POST /api/parse-text in das
// Specs-Objekt von journey.add_item um (leere Schlüssel fallen raus).
function specsStringToObject(specs) {
  const out = {};
  if (!specs) return out;
  for (const part of String(specs).split(/<br\s*\/?>/i)) {
    const trim = part.trim();
    if (!trim) continue;
    const colon = trim.indexOf(':');
    if (colon <= 0) continue;
    const key = trim.slice(0, colon).trim().toLowerCase();
    const value = trim.slice(colon + 1).trim();
    if (key && value) out[key] = value;
  }
  return out;
}

// Prüft die Argumente von journey.create_from_link: nur der Link ist Pflicht,
// der Slug ist optional (Default: KI-Benennung per POST /api/suggest-journey).
// Explizit übergebene Item-Felder überschreiben die KI-Extraktion
// (POST /api/parse-text), alle Felder folgen den Regeln von journey.add_item.
function validateCreateFromLinkArgs(raw) {
  const args = (raw && raw.arguments) || {};
  let slug;
  if (args.slug !== undefined) {
    if (typeof args.slug !== 'string' || !args.slug.trim()) {
      throw invalidParams('Parameter "slug" muss ein nicht-leerer String sein.');
    }
    slug = sanitizeSlug(args.slug);
    if (!slug) {
      throw invalidParams('Parameter "slug" ergibt kein gültiges Journey-Kürzel (erlaubt: a-z, 0-9, ., -).');
    }
  }
  const { link, maxChars } = validateCrawlArgs({ arguments: args });
  let name;
  if (args.name !== undefined) {
    if (typeof args.name !== 'string' || !args.name.trim()) {
      throw invalidParams('Parameter "name" muss ein nicht-leerer String sein.');
    }
    name = args.name.trim();
  }
  const optional = validateOptionalItemFields(args);
  return { slug, link, maxChars, name, ...optional };
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

// Lädt eine Produktseite headless (Puppeteer, gleiche Optionen wie
// src/agent/scripts/crawl-and-extract.js) und gibt Titel + Fließtext zurück.
// Speichert nichts — der Aufrufer extrahiert daraus die Produktdaten (siehe
// src/agent/prompts/product_extraction_prompt.md) und ruft danach
// journey.add_item auf.
function validateCrawlArgs(raw) {
  const args = (raw && raw.arguments) || {};
  if (typeof args.link !== 'string' || !args.link.trim()) {
    throw invalidParams('Parameter "link" (nicht-leerer String) ist erforderlich.');
  }
  let url;
  try {
    url = new URL(args.link.trim());
  } catch {
    throw invalidParams('Parameter "link" ist keine gültige URL.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw invalidParams('Parameter "link" muss eine http(s)-URL sein.');
  }
  let maxChars = CRAWL_DEFAULT_MAX_CHARS;
  if (args.maxChars !== undefined) {
    const num = typeof args.maxChars === 'string' ? Number(args.maxChars) : args.maxChars;
    if (typeof num !== 'number' || !Number.isFinite(num) || num < 1) {
      throw invalidParams('Parameter "maxChars" muss eine positive Zahl sein.');
    }
    maxChars = Math.min(Math.floor(num), CRAWL_MAX_CHARS_LIMIT);
  }
  return { link: url.href, maxChars };
}

async function crawlPage(link) {
  let puppeteer;
  try {
    puppeteer = require('puppeteer');
  } catch {
    throw new Error('Puppeteer ist nicht installiert — Crawling ist nicht verfügbar.');
  }
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    await page.goto(link, { waitUntil: 'networkidle2', timeout: CRAWL_GOTO_TIMEOUT_MS });
    const title = await page.title();
    const text = await page.evaluate(() => document.body.innerText);
    return { title: title || '', text: text || '' };
  } finally {
    await browser.close();
  }
}

async function handleCrawlLink(params) {
  const { link, maxChars } = validateCrawlArgs(params);
  let crawled;
  try {
    crawled = await crawlPage(link);
  } catch (err) {
    throw new Error(`Seite konnte nicht geladen werden (${link}): ${err.message}`);
  }
  const truncated = crawled.text.length > maxChars;
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            url: link,
            title: crawled.title,
            text: truncated ? crawled.text.slice(0, maxChars) : crawled.text,
            truncated,
          },
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

// Gegenstück für journey.create_from_link: der Slug darf noch NICHT
// existieren (kein stilles Wiederverwenden, kein Überschreiben). Wirft mit
// klarer Nachricht bei unerreichbarem Backend oder belegtem Slug.
async function assertUnknownJourney(slug) {
  let journeys;
  try {
    journeys = await getJson(`${BASE_URL}/api/journeys`);
  } catch (err) {
    throw new Error(`Backend unter ${BASE_URL} ist nicht erreichbar: ${err.message}`);
  }
  if (Array.isArray(journeys) && journeys.includes(slug)) {
    throw new Error(
      `Journey "${slug}" existiert bereits — nutze journey.add_item, um ein Produkt hinzuzufügen.`
    );
  }
  return journeys;
}

// Legt eine neue Journey an und crawlt den Initial-Link als erstes Produkt.
// Alles KI-gesteuert: Ohne expliziten Slug kommt der Journey-Name aus der
// LLM-Benennung (POST /api/suggest-journey nach
// src/agent/prompts/journey_naming_prompt.md), das Erstprodukt aus der
// LLM-Extraktion (POST /api/parse-text nach
// src/agent/prompts/product_extraction_prompt.md). Explizit übergebene
// Felder überschreiben die Extraktion. Reihenfolge: erst crawlen, dann
// anlegen — schlägt der Crawl fehl, bleibt nichts zurück. Ohne KI-Provider
// (agy, remote-ai oder local-cmd) gibt es statt eines Fehlers einen ehrlich
// markierten Offline-Rückfall (Titel + Link, `ai: "fallback"`). Das Item
// übernimmt handleAddItem (Upsert-Regeln, Header).
async function handleCreateFromLink(params) {
  const { slug: givenSlug, link, maxChars, name: givenName, price, rating, status, notes, specs } =
    validateCreateFromLinkArgs(params);
  if (givenSlug) {
    await assertUnknownJourney(givenSlug);
  }
  let crawled;
  try {
    crawled = await crawlPage(link);
  } catch (err) {
    throw new Error(`Seite konnte nicht geladen werden (${link}): ${err.message}`);
  }
  const truncated = crawled.text.length > maxChars;
  const content = {
    title: String(crawled.title || ''),
    text: crawled.text.slice(0, maxChars),
  };
  let slug = givenSlug;
  let journeyName;
  let category;
  let slugSource = 'explicit';
  let namingProvider = null;
  if (!slug) {
    let suggested;
    try {
      suggested = await postJson(`${BASE_URL}/api/suggest-journey`, { url: link, ...content });
    } catch (err) {
      if (/nicht erreichbar|MCP_AUTH_TOKEN|Anmeldung fehlgeschlagen/.test(err.message)) throw err;
      throw new Error(`KI-Benennung der Journey ist fehlgeschlagen (${link}): ${err.message}`);
    }
    slug = sanitizeSlug(suggested.slug);
    if (!slug) {
      throw new Error('Benennung der Journey lieferte kein gültiges Journey-Kürzel.');
    }
    journeyName = suggested.name;
    category = suggested.category;
    namingProvider = suggested.provider || null;
    slugSource = namingProvider === 'fallback' ? 'fallback' : 'auto';
    await assertUnknownJourney(slug);
  }
  // Ohne KI-Provider (Benennung per Offline-Rückfall) keine Extraktion
  // versuchen — das Erstprodukt besteht dann nur aus Titel und Link.
  const offline = !givenSlug && namingProvider === 'fallback';
  let extracted = {};
  let extractProvider = offline ? 'fallback' : null;
  if (!offline) {
    try {
      // `?journey=` mitgeben: Der Extraktions-Prompt nennt die Kaufreise als
      // Kontext — ohne den Param fiele das Backend auf "bike" zurück und die
      // Extraktion würde in Richtung Fahrrad-Specs gezogen.
      const submitted = await postJson(
        `${BASE_URL}/api/parse-text?journey=${encodeURIComponent(slug)}`,
        { text: content.text, link },
      );
      // Seit der Crawl-Queue antwortet der POST sofort mit 202 (`{ jobId }`);
      // das Tool braucht das Item synchron und löst den Job per GET auf.
      const parsed = submitted && submitted.jobId && !submitted.item
        ? await awaitParseJob(submitted.jobId)
        : submitted;
      extracted = (parsed && parsed.item) || {};
      extractProvider = (parsed && parsed.provider) || null;
    } catch (err) {
      if (/NO_EXTRACTOR/.test(err.message)) {
        // Kein KI-Provider (aber Backend erreichbar): Offline-Erstprodukt
        // aus Titel und Link statt Fehler. Echte Fehler (Auth, Crawl-Block,
        // unerreichbares Backend) fallen unten durch und werfen.
        extracted = {};
        extractProvider = 'fallback';
      } else {
        throw new Error(`KI-Extraktion des Produkts ist fehlgeschlagen (${link}): ${err.message}`);
      }
    }
  }
  const name = givenName || String(extracted.name || '').trim() || content.title.trim();
  if (!name) {
    return toolResultError(
      'Seite lieferte keinen Titel — bitte Parameter "name" für das erste Produkt angeben.'
    );
  }
  try {
    const body = { slug };
    if (journeyName) body.name = journeyName;
    if (category) body.category = category;
    await postJson(`${BASE_URL}/api/journeys`, body);
  } catch (err) {
    if (/HTTP 409/.test(err.message)) {
      throw new Error(
        `Journey "${slug}" existiert bereits — nutze journey.add_item, um ein Produkt hinzuzufügen.`
      );
    }
    throw new Error(`Journey "${slug}" konnte nicht angelegt werden: ${err.message}`);
  }
  const itemArgs = { slug, name, link };
  if (price !== undefined) {
    itemArgs.price = price;
  } else if (extracted.price) {
    itemArgs.price = extracted.price;
  }
  if (rating !== undefined) {
    itemArgs.rating = rating;
  } else if (countStars(extracted.rating) > 0) {
    itemArgs.rating = countStars(extracted.rating);
  }
  if (status !== undefined) {
    itemArgs.status = status;
  } else if (ITEM_STATUSES.includes(extracted.status)) {
    itemArgs.status = extracted.status;
  }
  if (notes !== undefined) {
    itemArgs.notes = notes;
  } else if (extracted.notes) {
    itemArgs.notes = extracted.notes;
  }
  if (specs !== undefined) {
    itemArgs.specs = specs;
  } else {
    const extractedSpecs = specsStringToObject(extracted.specs);
    if (Object.keys(extractedSpecs).length > 0) {
      itemArgs.specs = extractedSpecs;
    }
  }
  const added = await handleAddItem({ name: 'journey.add_item', arguments: itemArgs });
  const addedOut = JSON.parse(added.content[0].text);
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            success: true,
            slug,
            name,
            created: true,
            item: addedOut.item,
            ...(journeyName ? { journeyName } : {}),
            ...(category ? { category } : {}),
            slugSource,
            ai: { naming: namingProvider, extraction: extractProvider },
            source: { url: link, title: crawled.title, truncated },
          },
          null,
          2
        ),
      },
    ],
  };
}

function toolResultError(message) {
  return { content: [{ type: 'text', text: `Fehler: ${message}` }], isError: true };
}

async function handleCall(params) {
  if (params && params.name === 'journey.create_from_link') {
    try {
      return await handleCreateFromLink(params);
    } catch (err) {
      if (err.code === -32602) throw err;
      return toolResultError(err.message);
    }
  }
  if (params && params.name === 'journey.add_item') {
    try {
      return await handleAddItem(params);
    } catch (err) {
      if (err.code === -32602) throw err;
      return toolResultError(err.message);
    }
  }
  if (params && params.name === 'journey.crawl_link') {
    try {
      return await handleCrawlLink(params);
    } catch (err) {
      if (err.code === -32602) throw err;
      return toolResultError(err.message);
    }
  }
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
