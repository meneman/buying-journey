// CrawlProvider-Interface: zweistufige Pipeline für den Produkt-Crawl per URL.
//
// Stufe 1 — Inhalt parsen (Fetcher `fetch(url) -> { title, text }`):
// - `direct` (Default, ohne Konfiguration): Backend lädt die Seite selbst und
//   extrahiert Titel + Fließtext (auf CRAWL_MAX_CHARS begrenzt).
// - `headless`: Puppeteer rendert JavaScript (JS-Seiten, Bot-Schutz wie bei
//   Tesla). Konfiguriert = Paket installiert; Timeout via
//   CRAWL_HEADLESS_TIMEOUT_MS. Dient zugleich als Auto-Fallback für `direct`
//   (siehe CRAWL_DIRECT_MIN_CHARS unten).
// - `local-cmd`: externes Parse-Tool auf dieser Maschine (z.B. Skript in einer
//   tmux-Session) via CRAWL_FETCH_CMD. URL/Journey als Platzhalter
//   {url}/{journey} sowie Env CRAWL_URL/CRAWL_JOURNEY; stdout ist
//   `{ "title"?, "text" }` als JSON (oder reiner Text als Fallback).
//
// Stufe 2 — Inhalt mit LLM auswerten (Extraktor `extract(content) -> rawProduct`):
// - `agy` (Default, wenn das Binary im PATH steht): lokale Auswertung via
//   agy-CLI im Print-Mode (`--mode plan`, keine Tools, Antwort via
//   --json-schema erzwungen). Optional CRAWL_AGY_BIN/-MODEL/-EFFORT/
//   -TIMEOUT_MS.
// - `remote-ai`: POST { url, journey, title, text } an CRAWL_REMOTE_URL,
//   optional mit `Authorization: Bearer [REDACTED]`.
// - `local-cmd`: CRAWL_EXTRACT_CMD bekommt `{ url, journey, title, text }` als
//   JSON über stdin (+ Env wie oben); stdout ist das Produkt-JSON.
// - `n8n` (Fallback ohne agy-Binary, kompatibel zu bisher): kombinierter
//   Legacy-Provider — POST { url, journey } an N8N_WEBHOOK_URL, crawlt selbst,
//   Stufe 1 entfällt.
//
// `POST /api/import-link` ruft `crawlProduct({ url, journey, provider,
// fetcher })`. `provider` wählt den Extraktor (oder CRAWL_PROVIDER /
// CRAWL_EXTRACT_PROVIDER, Default "agy" wenn verfügbar, sonst "n8n"),
// `fetcher` das Parse-Tool (oder CRAWL_FETCH_PROVIDER, Default "direct").
// Neue Stufen-Provider hier registrieren — Route und Frontend
// (`GET /api/crawl-providers`) übernehmen sie automatisch (Einträge tragen
// `stage: "fetch" | "extract"`).
//
// `POST /api/suggest-journey` ruft `suggestJourneyCategory({ url, title,
// text, provider })`: Benennung ohne Fetch-Stufe — der Aufrufer liefert
// bereits geparsten Inhalt, die Verallgemeinerung folgt mit naming-fähigem
// Provider ("agy", "remote-ai", "local-cmd") immer
// src/agent/prompts/journey_naming_prompt.md, sonst ehrlich markierter
// Offline-Rückfall (`provider: "fallback"`).
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { starsFromRating, specsToString } = require('../../core/item-format.js');
const { cleanPastedContent } = require('../../core/paste-clean.js');

const CRAWL_TIMEOUT_MS = 60000;
const DEFAULT_MAX_CHARS = 20000;
const AGY_SCHEMA_PATH = path.join(__dirname, 'crawl-product-schema.json');
const AGY_NAMING_SCHEMA_PATH = path.join(__dirname, 'journey-naming-schema.json');
// Ein Prompt, eine Quelle: Die Journey-Benennung folgt immer
// src/agent/prompts/journey_naming_prompt.md (keine Keyword-Heuristik).
const JOURNEY_NAMING_PROMPT_PATH = path.join(__dirname, '..', '..', 'agent', 'prompts', 'journey_naming_prompt.md');
// Liefert der direct-Fetch weniger sichtbaren Text als diese Schwelle (oder
// schlägt fehl), wird headless nachgeladen, sofern verfügbar (JS-Seiten,
// Bot-Schutz wie bei Tesla). Über CRAWL_DIRECT_MIN_CHARS tunbar.
const DEFAULT_MIN_DIRECT_CHARS = 1000;

function readMinDirectChars() {
  const raw = Number(readEnv('CRAWL_DIRECT_MIN_CHARS'));
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : DEFAULT_MIN_DIRECT_CHARS;
}

/** Eine Logzeile pro Import-Stufe (stdout des Backends): kein Inhalt, nur Kennzahlen. */
function crawlLog(stage, details) {
  console.log(`[crawl] ${stage} ${details}`);
}

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return String(url).slice(0, 80);
  }
}

function readEnv(name) {
  const value = process.env[name];
  return value === undefined || value === '' ? undefined : value;
}

function readMaxChars() {
  const raw = Number(readEnv('CRAWL_MAX_CHARS'));
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_MAX_CHARS;
}

/** Validiert einen Link-Kandidaten. Wirft { status, message } bei 400. */
function validateLink(link) {
  if (!link || typeof link !== 'string') {
    throw { status: 400, message: 'Feld "link" ist erforderlich.' };
  }
  let parsed;
  try {
    parsed = new URL(link);
  } catch {
    throw { status: 400, message: 'Ungültige URL.' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw { status: 400, message: 'Nur http(s)-URLs werden unterstützt.' };
  }
  return parsed;
}

/** Manche JSON-Antworten sind Array-gewrapt — erstes Element gewinnt. */
function unwrap(payload) {
  return Array.isArray(payload) ? payload[0] : payload;
}

function parseProductJson(rawBody, source) {
  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    throw { status: 502, message: `${source} hat keine gültige JSON-Antwort geliefert.` };
  }
  const product = unwrap(payload);
  if (!product || !product.name) {
    throw { status: 502, message: `${source} hat kein verwertbares Produkt zurückgegeben.` };
  }
  return product;
}

/** Mappt das rohe Extraktor-Produkt auf das JourneyItem-Format der App. */
function toJourneyItem(productData, fallbackLink) {
  return {
    name: productData.name,
    price: productData.price || '',
    specs: specsToString(productData.specs),
    rating: starsFromRating(productData.rating),
    status: productData.status || 'Thinking',
    notes: productData.notes || '',
    link: productData.link || fallbackLink,
  };
}

async function fetchWithTimeout(url, options) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(CRAWL_TIMEOUT_MS) });
  return response;
}

/** Führt ein Shell-Kommando aus und gibt stdout zurück (Fehler als {status,message}). */
function runCommand(cmd, { input, envExtra, label }) {
  return new Promise((resolve, reject) => {
    const child = execFile(
      'sh',
      ['-c', cmd],
      {
        timeout: CRAWL_TIMEOUT_MS,
        maxBuffer: 4 * 1024 * 1024,
        env: { ...process.env, ...envExtra },
      },
      (error, stdout, stderr) => {
        if (error) {
          if (error.killed) {
            reject({ status: 504, message: `Zeitüberschreitung beim ${label}.` });
            return;
          }
          reject({ status: 502, message: `${label} fehlgeschlagen: ${String((stderr || error.message)).slice(0, 300)}` });
          return;
        }
        resolve(String(stdout));
      },
    );
    if (input !== undefined) {
      child.stdin.write(input);
      child.stdin.end();
    }
  });
}

/**
 * Führt ein Binary direkt (ohne Shell) mit argv aus — keine
 * Shell-Interpolation dynamischer Inhalte (Prompt mit Seiten-Text).
 */
function runDirect(file, args, { label, timeoutMs }) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        if (error.killed) {
          reject({ status: 504, message: `Zeitüberschreitung beim ${label}.` });
          return;
        }
        reject({ status: 502, message: `${label} fehlgeschlagen: ${String((stderr || error.message)).slice(0, 300)}` });
        return;
      }
      resolve(String(stdout));
    });
  });
}

/** Sucht ein Binary im PATH (ohne Subprozess). */
function findBinary(name) {
  const dirs = String(process.env.PATH || '').split(path.delimiter);
  for (const dir of dirs) {
    if (!dir) continue;
    const candidate = path.join(dir, name);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      const stat = fs.statSync(candidate);
      if (stat.isFile()) return candidate;
    } catch {
      // Weiter suchen.
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// agy-Extraktor (lokale LLM-Auswertung via agy-CLI im Print-Mode)
// ---------------------------------------------------------------------------

function buildAgyPrompt(url, journey, content) {
  return [
    'Nutze keine Tools, rufe keine Tools auf. Antworte direkt mit AUSSCHLIESSLICH dem JSON-Objekt.',
    `Extrahiere das Produkt aus dem Seiteninhalt der Kaufreise "${journey}".`,
    'Feldregeln: name (Pflicht, Produktname wie vom Händler inkl. Variante), price (aktueller Preis mit',
    'Währung, z.B. "1499€", sonst ""), rating (0-5 als Zahl nach Textlage, sonst 0), status immer "Thinking",',
    'notes (1-2 Sätze: was ist das für ein Produkt, wichtigste Stärken/Schwächen laut Seite, sonst ""), link aus url.',
    'specs (3-6 wichtigste Vergleichseigenschaften der Kategorie, Format "Label: Wert", verbunden mit " <br> ",',
    'z.B. "Reichweite (WLTP): 513 km <br> Akku: 60 kWh <br> Leistung: 283 PS"; sonst "").',
    `Seiteninhalt: ${JSON.stringify({ url, title: content.title, text: content.text })}`,
  ].join(' ');
}

/**
 * Baut den Journey-Naming-Prompt: Die Anweisung kommt immer aus
 * src/agent/prompts/journey_naming_prompt.md, angehängt der Seiteninhalt.
 * Wirft { status, message } bei 500, wenn die Prompt-Datei fehlt.
 */
function buildJourneyNamingPrompt(url, content) {
  let instructions;
  try {
    instructions = fs.readFileSync(JOURNEY_NAMING_PROMPT_PATH, 'utf8');
  } catch {
    throw { status: 500, message: 'Journey-Naming-Prompt fehlt (src/agent/prompts/journey_naming_prompt.md).' };
  }
  return `${instructions}\n\nSeiteninhalt: ${JSON.stringify({ url, title: content.title, text: content.text })}`;
}

/** Wandelt einen menschenlesbaren Kategorienamen in ein gültiges Journey-Kürzel um. */
function slugifyJourneySlug(raw) {
  return String(raw ?? '')
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9.-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '');
}

/**
 * Prüft ein Naming-Objekt ({ slug, name, category }) — fehlender Slug wird
 * aus dem Namen abgeleitet. Wirft { status, message } bei 502.
 */
function parseNamingObject(naming, source) {
  if (!naming || typeof naming !== 'object' || Array.isArray(naming)) {
    throw { status: 502, message: `${source} hat keine verwertbare Journey-Benennung zurückgegeben.` };
  }
  if (typeof naming.name !== 'string' || !naming.name.trim()) {
    throw { status: 502, message: `${source} hat keine verwertbare Journey-Benennung zurückgegeben.` };
  }
  const name = naming.name.trim().slice(0, 80);
  const slug = slugifyJourneySlug(naming.slug) || slugifyJourneySlug(naming.name) || 'produkte';
  const category = typeof naming.category === 'string' ? naming.category.trim().toLowerCase().slice(0, 40) : '';
  return { slug, name, category };
}

/** Parst eine rohe Naming-JSON-Antwort (Array-gewrapt ok). Wirft { status, message } bei 502. */
function parseNamingJson(rawBody, source) {
  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    throw { status: 502, message: `${source} hat keine gültige JSON-Antwort geliefert.` };
  }
  return parseNamingObject(unwrap(payload), source);
}

/**
 * Parst die `--output-format json`-Hüllkurve von agy. Primärquelle ist
 * `structured_output` (via --json-schema erzwungen), Fallback das
 * `response`-Textfeld. Wirft { status, message } bei 502.
 */
function parseAgyEnvelope(stdout) {
  let envelope;
  try {
    envelope = JSON.parse(stdout);
  } catch {
    throw { status: 502, message: 'agy hat keine gültige JSON-Antwort geliefert.' };
  }
  if (!envelope || envelope.status !== 'SUCCESS') {
    throw { status: 502, message: `agy meldet keinen Erfolg (${(envelope && envelope.status) || 'unbekannt'}).` };
  }
  const structured = envelope.structured_output;
  if (structured && typeof structured === 'object' && structured.name) {
    return structured;
  }
  try {
    return parseProductJson(typeof envelope.response === 'string' ? envelope.response : '', 'agy');
  } catch {
    throw { status: 502, message: 'agy hat kein verwertbares Produkt zurückgegeben.' };
  }
}

// ---------------------------------------------------------------------------
// Stufe 1: Fetcher (URL -> { title, text })
// ---------------------------------------------------------------------------

function htmlToText(html) {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = (titleMatch ? titleMatch[1] : '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const text = html
    .replace(/<script[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return { title, text };
}

const fetchers = {
  'direct': {
    description: 'Backend lädt die Seite selbst (eingebaut, ohne Konfiguration)',
    isConfigured: () => true,
    async fetch(url) {
      let response;
      try {
        response = await fetchWithTimeout(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JourneyPath/1.0)' } });
      } catch (error) {
        if (error && error.name === 'TimeoutError') {
          throw { status: 504, message: 'Zeitüberschreitung beim Laden der Seite.' };
        }
        throw { status: 502, message: `Seite konnte nicht geladen werden: ${error.message}` };
      }
      if (!response.ok) {
        throw { status: 502, message: `Seite antwortet ${response.status}.` };
      }
      const contentType = response.headers.get('content-type') || '';
      if (!/text|html|xml/i.test(contentType)) {
        throw { status: 502, message: `Nur HTML/Text-Seiten werden unterstützt (${contentType || 'unbekannt'}).` };
      }
      const { title, text } = htmlToText(await response.text());
      if (!text) {
        throw { status: 502, message: 'Die Seite enthält keinen verwertbaren Text.' };
      }
      return { title, text: text.slice(0, readMaxChars()) };
    },
  },
  'headless': {
    description: 'Headless-Browser (Puppeteer, rendert JavaScript; für JS-Seiten und Bot-Schutz)',
    isConfigured: () => {
      try {
        require('puppeteer');
        return true;
      } catch {
        return false;
      }
    },
    async fetch(url) {
      let puppeteer;
      try {
        puppeteer = require('puppeteer');
      } catch {
        throw { status: 501, message: 'Puppeteer ist nicht installiert — Headless-Crawl ist nicht verfügbar.' };
      }
      const timeoutRaw = Number(readEnv('CRAWL_HEADLESS_TIMEOUT_MS'));
      const timeoutMs = Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? Math.floor(timeoutRaw) : CRAWL_TIMEOUT_MS;
      let browser;
      try {
        browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
      } catch (error) {
        throw { status: 502, message: `Headless-Browser startet nicht: ${error.message}` };
      }
      try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });
        await page.setUserAgent(
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        );
        await page.goto(url, { waitUntil: 'networkidle2', timeout: timeoutMs });
        const title = String((await page.title()) || '').replace(/\s+/g, ' ').trim();
        const innerText = await page.evaluate(() => (document.body ? document.body.innerText : ''));
        const text = String(innerText || '').replace(/\s+/g, ' ').trim();
        if (!text) {
          throw { status: 502, message: 'Der Headless-Crawl lieferte keinen verwertbaren Text.' };
        }
        return { title, text: text.slice(0, readMaxChars()) };
      } catch (error) {
        if (error && typeof error.status === 'number') throw error;
        if (error && error.name === 'TimeoutError') {
          throw { status: 504, message: 'Zeitüberschreitung beim headless Laden der Seite.' };
        }
        throw { status: 502, message: `Headless-Crawl fehlgeschlagen: ${(error && error.message) || error}` };
      } finally {
        await browser.close().catch(() => {});
      }
    },
  },
  'local-cmd': {
    description: 'Externes Parse-Tool auf dieser Maschine (CRAWL_FETCH_CMD, z.B. tmux-Session)',
    isConfigured: () => !!readEnv('CRAWL_FETCH_CMD'),
    async fetch(url, journey) {
      const cmd = readEnv('CRAWL_FETCH_CMD');
      if (!cmd) {
        throw { status: 501, message: 'CRAWL_FETCH_CMD ist nicht konfiguriert.' };
      }
      const expanded = cmd.split('{url}').join(url).split('{journey}').join(journey);
      const stdout = await runCommand(expanded, {
        envExtra: { CRAWL_URL: url, CRAWL_JOURNEY: journey },
        label: 'Parse-Tool',
      });
      // Vertrag: `{ "title"?, "text" }` — reiner Text wird als `text` genommen.
      let content;
      try {
        content = JSON.parse(stdout);
        content = unwrap(content);
      } catch {
        content = { title: '', text: stdout };
      }
      const text = typeof content.text === 'string' ? content.text.trim() : '';
      if (!text) {
        throw { status: 502, message: 'Das Parse-Tool hat keinen verwertbaren Text geliefert.' };
      }
      return {
        title: typeof content.title === 'string' ? content.title.trim() : '',
        text: text.slice(0, readMaxChars()),
      };
    },
  },
};

function fetcherNames() {
  return Object.keys(fetchers);
}

/** Löst das Parse-Tool auf (Request-Override oder CRAWL_FETCH_PROVIDER, Default "direct"). */
function resolveFetcherName(requested) {
  if (requested !== undefined && requested !== null && requested !== '') {
    const name = String(requested);
    if (!fetchers[name]) {
      throw { status: 400, message: `Unbekanntes Parse-Tool "${name}" (bekannt: ${fetcherNames().join(', ')}).` };
    }
    return name;
  }
  const fromEnv = readEnv('CRAWL_FETCH_PROVIDER');
  if (fromEnv && !fetchers[fromEnv]) {
    throw { status: 500, message: `CRAWL_FETCH_PROVIDER "${fromEnv}" ist unbekannt (bekannt: ${fetcherNames().join(', ')}).` };
  }
  return fromEnv || 'direct';
}

// ---------------------------------------------------------------------------
// Stufe 2: Extraktoren (Content -> Rohprodukt)
// ---------------------------------------------------------------------------

const providers = {
  'n8n': {
    description: 'n8n-Webhook, kombiniert (N8N_WEBHOOK_URL, crawlt selbst)',
    combined: true,
    isConfigured: () => !!readEnv('N8N_WEBHOOK_URL'),
    async crawl(url, journey) {
      const webhook = readEnv('N8N_WEBHOOK_URL');
      if (!webhook) {
        throw { status: 500, message: 'N8N_WEBHOOK_URL ist nicht konfiguriert.' };
      }
      let response;
      try {
        response = await fetchWithTimeout(webhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, journey }),
        });
      } catch (error) {
        if (error && error.name === 'TimeoutError') {
          throw { status: 504, message: 'Zeitüberschreitung beim Warten auf n8n.' };
        }
        throw error;
      }
      const rawBody = await response.text();
      if (!response.ok) {
        throw { status: 502, message: `n8n-Fehler (${response.status}): ${rawBody.slice(0, 300)}` };
      }
      return parseProductJson(rawBody, 'n8n');
    },
  },
  'remote-ai': {
    description: 'Remote-LLM per HTTP-JSON (CRAWL_REMOTE_URL, optional CRAWL_REMOTE_KEY als Bearer)',
    isConfigured: () => !!readEnv('CRAWL_REMOTE_URL'),
    async extract(url, journey, content) {
      const endpoint = readEnv('CRAWL_REMOTE_URL');
      if (!endpoint) {
        throw { status: 501, message: 'CRAWL_REMOTE_URL ist nicht konfiguriert.' };
      }
      const apiKey = readEnv('CRAWL_REMOTE_KEY');
      let response;
      try {
        response = await fetchWithTimeout(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          },
          body: JSON.stringify({ url, journey, title: content.title, text: content.text }),
        });
      } catch (error) {
        if (error && error.name === 'TimeoutError') {
          throw { status: 504, message: 'Zeitüberschreitung beim Warten auf die Remote-AI.' };
        }
        throw error;
      }
      const rawBody = await response.text();
      if (!response.ok) {
        throw { status: 502, message: `Remote-AI-Fehler (${response.status}): ${rawBody.slice(0, 300)}` };
      }
      return parseProductJson(rawBody, 'Remote-AI');
    },
    async suggestJourney(url, content) {
      const endpoint = readEnv('CRAWL_REMOTE_URL');
      if (!endpoint) {
        throw { status: 501, message: 'CRAWL_REMOTE_URL ist nicht konfiguriert.' };
      }
      const apiKey = readEnv('CRAWL_REMOTE_KEY');
      let response;
      try {
        response = await fetchWithTimeout(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          },
          body: JSON.stringify({
            task: 'journey-naming',
            url,
            title: content.title,
            text: content.text,
            prompt: buildJourneyNamingPrompt(url, content),
          }),
        });
      } catch (error) {
        if (error && error.name === 'TimeoutError') {
          throw { status: 504, message: 'Zeitüberschreitung beim Warten auf die Remote-AI.' };
        }
        throw error;
      }
      const rawBody = await response.text();
      if (!response.ok) {
        throw { status: 502, message: `Remote-AI-Fehler (${response.status}): ${rawBody.slice(0, 300)}` };
      }
      return parseNamingJson(rawBody, 'Remote-AI');
    },
  },
  'agy': {
    description: 'Lokale LLM-Auswertung via agy-CLI (Print-Mode, ohne Tools, mit JSON-Schema)',
    isConfigured: () => !!findBinary(readEnv('CRAWL_AGY_BIN') || 'agy'),
    async extract(url, journey, content) {
      const bin = findBinary(readEnv('CRAWL_AGY_BIN') || 'agy');
      if (!bin) {
        throw { status: 501, message: 'agy ist nicht installiert (PATH) — CRAWL_AGY_BIN prüfen.' };
      }
      const timeoutRaw = Number(readEnv('CRAWL_AGY_TIMEOUT_MS'));
      const timeoutMs = Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? Math.floor(timeoutRaw) : 120000;
      const args = [
        '--mode', 'plan',
        '-p', buildAgyPrompt(url, journey, content),
        '--output-format', 'json',
        '--json-schema', AGY_SCHEMA_PATH,
        '--effort', readEnv('CRAWL_AGY_EFFORT') || 'low',
      ];
      const model = readEnv('CRAWL_AGY_MODEL');
      if (model) args.push('--model', model);
      const stdout = await runDirect(bin, args, { label: 'agy-Extraktion', timeoutMs });
      return parseAgyEnvelope(stdout);
    },
    async suggestJourney(url, content) {
      const bin = findBinary(readEnv('CRAWL_AGY_BIN') || 'agy');
      if (!bin) {
        throw { status: 501, message: 'agy ist nicht installiert (PATH) — CRAWL_AGY_BIN prüfen.' };
      }
      const timeoutRaw = Number(readEnv('CRAWL_AGY_TIMEOUT_MS'));
      const timeoutMs = Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? Math.floor(timeoutRaw) : 120000;
      const args = [
        '--mode', 'plan',
        '-p', buildJourneyNamingPrompt(url, content),
        '--output-format', 'json',
        '--json-schema', AGY_NAMING_SCHEMA_PATH,
        '--effort', readEnv('CRAWL_AGY_EFFORT') || 'low',
      ];
      const model = readEnv('CRAWL_AGY_MODEL');
      if (model) args.push('--model', model);
      const stdout = await runDirect(bin, args, { label: 'agy-Naming', timeoutMs });
      return parseNamingObject(parseAgyEnvelope(stdout), 'agy');
    },
  },
  'local-cmd': {
    description: 'Lokale LLM-Auswertung auf dieser Maschine (CRAWL_EXTRACT_CMD, Inhalt via stdin-JSON)',
    isConfigured: () => !!readEnv('CRAWL_EXTRACT_CMD'),
    async extract(url, journey, content) {
      const cmd = readEnv('CRAWL_EXTRACT_CMD');
      if (!cmd) {
        throw { status: 501, message: 'CRAWL_EXTRACT_CMD ist nicht konfiguriert.' };
      }
      const expanded = cmd.split('{url}').join(url).split('{journey}').join(journey);
      const stdout = await runCommand(expanded, {
        input: JSON.stringify({ url, journey, title: content.title, text: content.text }),
        envExtra: { CRAWL_URL: url, CRAWL_JOURNEY: journey, CRAWL_TITLE: content.title },
        label: 'LLM-Kommando',
      });
      return parseProductJson(stdout, 'Lokales LLM-Kommando');
    },
    async suggestJourney(url, content) {
      const cmd = readEnv('CRAWL_EXTRACT_CMD');
      if (!cmd) {
        throw { status: 501, message: 'CRAWL_EXTRACT_CMD ist nicht konfiguriert.' };
      }
      const expanded = cmd.split('{url}').join(url).split('{journey}').join('');
      const stdout = await runCommand(expanded, {
        input: JSON.stringify({
          task: 'journey-naming',
          url,
          title: content.title,
          text: content.text,
          prompt: buildJourneyNamingPrompt(url, content),
        }),
        envExtra: { CRAWL_URL: url, CRAWL_JOURNEY: '', CRAWL_TITLE: content.title },
        label: 'LLM-Kommando (Naming)',
      });
      return parseNamingJson(stdout, 'Lokales LLM-Kommando');
    },
  },
};

function providerNames() {
  return Object.keys(providers);
}

/**
 * Löst den Extraktor auf (Request-Override oder
 * CRAWL_EXTRACT_PROVIDER/CRAWL_PROVIDER). Default: "agy", wenn das Binary
 * verfügbar ist, sonst "n8n" (kombinierter Legacy-Provider).
 */
function resolveProviderName(requested) {
  if (requested !== undefined && requested !== null && requested !== '') {
    const name = String(requested);
    if (!providers[name]) {
      throw { status: 400, message: `Unbekannter Crawl-Provider "${name}" (bekannt: ${providerNames().join(', ')}).` };
    }
    return name;
  }
  const fromEnv = readEnv('CRAWL_EXTRACT_PROVIDER') || readEnv('CRAWL_PROVIDER');
  if (fromEnv && !providers[fromEnv]) {
    throw { status: 500, message: `Crawl-Provider "${fromEnv}" ist unbekannt (bekannt: ${providerNames().join(', ')}).` };
  }
  if (fromEnv) return fromEnv;
  return providers['agy'].isConfigured() ? 'agy' : 'n8n';
}

/** Für `GET /api/crawl-providers` (Frontend-Dropdowns + Doku). */
function listProviders() {
  const activeProvider = resolveProviderName();
  const activeFetcher = resolveFetcherName();
  return [
    ...providerNames().map((name) => ({
      stage: 'extract',
      name,
      description: providers[name].description,
      configured: providers[name].isConfigured(),
      active: name === activeProvider,
    })),
    ...fetcherNames().map((name) => ({
      stage: 'fetch',
      name,
      description: fetchers[name].description,
      configured: fetchers[name].isConfigured(),
      active: name === activeFetcher,
    })),
  ];
}

/**
 * Synchrone Vorab-Prüfung für `POST /api/import-link` (Single Source of Truth):
 * Link-Format, Stufen-Namen und Konfiguration — alles billig prüfbar, ohne
 * Fetch/LLM. Die Route antwortet bei Fehlern sofort (400/500/501); nur valide
 * Aufträge werden Queue-Jobs. `crawlProduct` nutzt denselben Prolog, damit
 * Direktaufrufe (Worker, Tests) identisch validieren.
 */
function checkImportLinkReady({ url, provider, fetcher }) {
  validateLink(url);
  // Beide Stufen-Namen zuerst auflösen: ungültige Request-Werte antworten 400,
  // noch bevor fehlende Konfiguration (500/501) geprüft wird.
  const extractorName = resolveProviderName(provider);
  const fetcherName = resolveFetcherName(fetcher);
  const extractor = providers[extractorName];
  if (!extractor.isConfigured()) {
    throw { status: extractorName === 'n8n' ? 500 : 501, message: extractorHint(extractorName) };
  }
  if (!extractor.combined) {
    const fetcherImpl = fetchers[fetcherName];
    if (!fetcherImpl.isConfigured()) {
      throw { status: 501, message: fetcherName === 'local-cmd' ? 'CRAWL_FETCH_CMD ist nicht konfiguriert.' : 'Das Parse-Tool ist nicht verfügbar.' };
    }
  }
  return { url, extractorName, fetcherName };
}

/**
 * Crawlt eine Produkt-URL in zwei Stufen (Inhalt parsen, dann mit LLM
 * auswerten) und gibt Rohprodukt, Stufen-Namen und Meta (Zeiten, Größen,
 * Fallback) zurück. Nur der kombinierte Legacy-Extraktor `n8n` crawlt selbst
 * (Stufe 1 entfällt, `fetcher: null`). Das Item-Mapping (`toJourneyItem`)
 * macht der Aufrufer.
 *
 * Fallback: Schlägt der Default-Fetcher `direct` fehl oder liefert weniger
 * sichtbaren Text als CRAWL_DIRECT_MIN_CHARS (JS-Seiten, Bot-Schutz), wird
 * automatisch `headless` nachgeladen, sofern verfügbar. Explizit gewählte
 * Fetcher fallen nicht zurück — deren Fehler gehen direkt an den Aufrufer.
 */
async function crawlProduct({ url, journey, provider, fetcher }) {
  const { extractorName, fetcherName } = checkImportLinkReady({ url, provider, fetcher });
  const extractor = providers[extractorName];
  const started = Date.now();
  const host = hostOf(url);
  if (extractor.combined) {
    crawlLog('start', `host=${host} journey=${journey} extractor=${extractorName} (kombiniert, ohne Fetch-Stufe)`);
    const raw = await extractor.crawl(url, journey);
    const extractMs = Date.now() - started;
    crawlLog('extract', `host=${host} provider=${extractorName} ms=${extractMs} felder=${presentFields(raw)}`);
    return { raw, provider: extractorName, fetcher: null, meta: baseMeta(host, null, 0, 0, 0, extractMs) };
  }
  // Fetcher-Konfiguration ist via checkImportLinkReady bereits geprüft.
  const fetcherImpl = fetchers[fetcherName];
  crawlLog('start', `host=${host} journey=${journey} extractor=${extractorName} fetcher=${fetcherName}`);
  const fetchStarted = Date.now();
  let content;
  let usedFetcher = fetcherName;
  let fallbackFrom = null;
  if (fetcherName === 'direct' && fetchers['headless'].isConfigured()) {
    const minChars = readMinDirectChars();
    try {
      content = await fetcherImpl.fetch(url, journey);
      if (content.text.length < minChars) {
        crawlLog('fetch', `host=${host} fetcher=direct text=${content.text.length}ch < ${minChars} (dünn) -> fallback headless`);
        content = await fetchers['headless'].fetch(url, journey);
        usedFetcher = 'headless';
        fallbackFrom = 'direct';
      }
    } catch (error) {
      crawlLog('fetch', `host=${host} fetcher=direct FEHLER (${(error && error.status) || '?'}: ${(error && error.message) || error}) -> fallback headless`);
      content = await fetchers['headless'].fetch(url, journey);
      usedFetcher = 'headless';
      fallbackFrom = 'direct';
    }
  } else {
    content = await fetcherImpl.fetch(url, journey);
  }
  const fetchMs = Date.now() - fetchStarted;
  crawlLog('fetch', `host=${host} fetcher=${usedFetcher}${fallbackFrom ? ` (fallback von ${fallbackFrom})` : ''} titel=${content.title.length}ch text=${content.text.length}ch ms=${fetchMs}`);
  const extractStarted = Date.now();
  const raw = await extractor.extract(url, journey, content);
  const extractMs = Date.now() - extractStarted;
  crawlLog('extract', `host=${host} provider=${extractorName} ms=${extractMs} felder=${presentFields(raw)}`);
  assertUsableContent(raw, host);
  return { raw, provider: extractorName, fetcher: usedFetcher, meta: baseMeta(host, fallbackFrom, content.title.length, content.text.length, fetchMs, extractMs) };
}

/**
 * Nur ein Name ohne Preis und Specs heißt: Die Seite hat keinen verwertbaren
 * Produktinhalt geliefert (Bot-Schutz, leere JS-Hülle — Tesla-Fall). Das ist
 * kein Item, sondern der manuelle Content-Fallback (Code CONTENT_BLOCKED,
 * das Frontend legt einen markierten Platzhalter an).
 */
function assertUsableContent(raw, host) {
  const price = typeof raw?.price === 'string' ? raw.price.trim() : '';
  const specs = raw?.specs;
  const hasSpecs = typeof specs === 'string' ? specs.trim() !== '' : Array.isArray(specs) && specs.length > 0;
  if (!price && !hasSpecs) {
    crawlLog('extract', `host=${host} INHALT LEER (nur Name) -> CONTENT_BLOCKED`);
    throw {
      status: 502,
      code: 'CONTENT_BLOCKED',
      message: 'Die Seite lieferte keinen verwertbaren Produktinhalt (möglicherweise Bot-Schutz) — bitte Inhalt manuell einfügen.',
    };
  }
}

/**
 * Synchrone Vorab-Prüfung für `POST /api/parse-text` (Single Source of Truth):
 * Text/Link-Format, Extraktor-Name und Konfiguration — alles billig prüfbar,
 * ohne LLM. Die Route antwortet bei Fehlern sofort (400/500/501); nur valide
 * Aufträge werden Queue-Jobs. `parseProductText` nutzt denselben Prolog, damit
 * Direktaufrufe (Worker, Tests) identisch validieren.
 */
function checkParseTextReady({ text, link, provider }) {
  if (typeof text !== 'string' || !text.trim()) {
    throw { status: 400, message: 'Feld "text" (nicht-leerer String) ist erforderlich.' };
  }
  if (link !== undefined && typeof link !== 'string') {
    throw { status: 400, message: 'Feld "link" muss ein String sein.' };
  }
  const extractorName = resolveProviderName(provider);
  const extractor = providers[extractorName];
  if (!extractor.isConfigured()) {
    throw { status: extractorName === 'n8n' ? 500 : 501, code: 'NO_EXTRACTOR', message: extractorHint(extractorName) };
  }
  if (extractor.combined) {
    throw { status: 400, code: 'NO_EXTRACTOR', message: 'Der kombinierte Provider "n8n" crawlt selbst — für eingefügten Text "agy", "remote-ai" oder "local-cmd" wählen.' };
  }
  const cleaned = cleanPastedContent(text, readMaxChars());
  if (!cleaned) {
    throw { status: 400, message: 'Der eingefügte Inhalt enthält keinen verwertbaren Text.' };
  }
  return { text, link: typeof link === 'string' ? link : '', extractorName, cleaned };
}

/**
 * Parst manuell eingefügten Seiteninhalt (Fallback, wenn der Auto-Crawl
 * blockiert war) mit dem gewählten Extraktor — ohne Fetch-Stufe. Der Inhalt
 * wird per `cleanPastedContent` getrimmt (Head/Skripte/Styles raus) und auf
 * CRAWL_MAX_CHARS gekappt. Kombinierte Extraktoren (n8n) können das nicht
 * (sie crawlen selbst) und antworten 400.
 */
async function parseProductText({ text, link, journey, provider }) {
  const { extractorName, cleaned } = checkParseTextReady({ text, link, provider });
  const cleanLink = typeof link === 'string' ? link : '';
  const extractor = providers[extractorName];
  const started = Date.now();
  crawlLog('parse-text', `journey=${journey} extractor=${extractorName} roh=${text.length}ch bereinigt=${cleaned.length}ch`);
  const raw = await extractor.extract(cleanLink, journey, { title: '', text: cleaned });
  const extractMs = Date.now() - started;
  crawlLog('extract', `host=paste provider=${extractorName} ms=${extractMs} felder=${presentFields(raw)}`);
  assertUsableContent(raw, 'paste');
  return { raw, provider: extractorName, meta: baseMeta('paste', null, 0, cleaned.length, 0, extractMs) };
}

/**
 * Benennt eine Journey (kein Fetch, kein Speichern): Der Aufrufer liefert
 * { url, title, text } (z.B. aus dem MCP-Crawl). Mit naming-fähigem Provider
 * ("agy", "remote-ai", "local-cmd") folgt die Verallgemeinerung immer
 * src/agent/prompts/journey_naming_prompt.md. Ohne KI-Provider (Default
 * "n8n" kann nicht benennen) gibt es statt eines Fehlers einen ehrlich
 * markierten Offline-Rückfall (`provider: "fallback"`, Kürzel aus dem
 * Titel) — nur wenn `provider` nicht explizit verlangt wurde. Wirft
 * { status, message } bei 400/500/501/502.
 */
async function suggestJourneyCategory({ url, title, text, provider }) {
  validateLink(url);
  const cleanTitle = typeof title === 'string' ? title : '';
  const cleanText = typeof text === 'string' ? text : '';
  if (!cleanTitle.trim() && !cleanText.trim()) {
    throw { status: 400, message: 'Felder "title"/"text": mindestens eines muss Inhalt haben.' };
  }
  const requested = provider !== undefined && provider !== null && provider !== '';
  const extractorName = resolveProviderName(provider);
  const extractor = providers[extractorName];
  const capable = typeof extractor.suggestJourney === 'function';
  if (!capable && !requested) {
    const words = cleanTitle.split(/\s+/).filter(Boolean).slice(0, 3);
    const name = words.join(' ').slice(0, 80) || 'Produkte';
    const slug = slugifyJourneySlug(words.join(' ')) || 'produkte';
    crawlLog('naming', `host=${hostOf(url)} provider=fallback slug=${slug} (kein LLM konfiguriert)`);
    return {
      naming: { slug, name, category: '' },
      provider: 'fallback',
      meta: { host: hostOf(url), titleChars: cleanTitle.length, textChars: cleanText.length, extractMs: 0 },
    };
  }
  if (!extractor.isConfigured()) {
    throw { status: extractorName === 'n8n' ? 500 : 501, message: extractorHint(extractorName) };
  }
  if (!capable) {
    throw { status: 501, message: `Crawl-Provider "${extractorName}" unterstützt keine KI-Benennung — "agy", "remote-ai" oder "local-cmd" wählen.` };
  }
  const started = Date.now();
  const content = { title: cleanTitle, text: cleanText.slice(0, readMaxChars()) };
  const naming = await extractor.suggestJourney(url, content);
  const extractMs = Date.now() - started;
  crawlLog('naming', `host=${hostOf(url)} provider=${extractorName} slug=${naming.slug} ms=${extractMs}`);
  if (!naming.slug) {
    throw { status: 502, message: 'Die KI-Benennung lieferte kein gültiges Journey-Kürzel.' };
  }
  return {
    naming,
    provider: extractorName,
    meta: { host: hostOf(url), titleChars: content.title.length, textChars: content.text.length, extractMs },
  };
}

/** Hinweis bei fehlender Extraktor-Konfiguration (für crawlProduct und parseProductText). */
function extractorHint(extractorName) {
  return extractorName === 'n8n'
    ? 'N8N_WEBHOOK_URL ist nicht konfiguriert.'
    : extractorName === 'local-cmd'
      ? 'CRAWL_EXTRACT_CMD ist nicht konfiguriert.'
      : extractorName === 'agy'
        ? 'agy ist nicht installiert (PATH) — CRAWL_AGY_BIN prüfen.'
        : 'CRAWL_REMOTE_URL ist nicht konfiguriert.';
}

/** Welche Produktfelder die Extraktion geliefert hat (für Logs, ohne Inhalte). */
function presentFields(raw) {
  if (!raw || typeof raw !== 'object') return 'keine';
  return ['name', 'price', 'specs', 'rating', 'notes']
    .filter((key) => raw[key] !== undefined && raw[key] !== '' && raw[key] !== 0)
    .join(',') || 'nur-name-oder-leer';
}

function baseMeta(host, fallbackFrom, titleChars, textChars, fetchMs, extractMs) {
  return { host, fallbackFrom, titleChars, textChars, fetchMs, extractMs };
}

module.exports = {
  CRAWL_TIMEOUT_MS,
  DEFAULT_MAX_CHARS,
  AGY_SCHEMA_PATH,
  providers,
  providerNames,
  resolveProviderName,
  fetchers,
  fetcherNames,
  resolveFetcherName,
  listProviders,
  validateLink,
  checkImportLinkReady,
  checkParseTextReady,
  crawlProduct,
  parseProductText,
  suggestJourneyCategory,
  toJourneyItem,
  findBinary,
  buildAgyPrompt,
  buildJourneyNamingPrompt,
  parseAgyEnvelope,
  parseNamingObject,
  parseNamingJson,
  slugifyJourneySlug,
};
