// LLM-Provider-Aufrufschicht für serverseitige Hintergrund-Aufgaben (z.B.
// Property-Abgleich über `agy`, `remote-ai` und `local-cmd`).
//
// Alle Web-Crawling-/Puppeteer-/n8n-Pfade wurden im Rahmen des MCP-Client-First-
// Umbaus entfernt: Web-Recherche erledigt der MCP-Client selbst.
//
// Unterstützte Provider:
// - `agy` (Default, wenn das Binary im PATH steht): lokale Auswertung via
//   agy-CLI im Print-Mode (`--mode plan`, keine Tools, optional `--json-schema`).
//   Optional CRAWL_AGY_BIN / CRAWL_AGY_MODEL / CRAWL_AGY_EFFORT / CRAWL_AGY_TIMEOUT_MS.
// - `remote-ai`: POST JSON-Payload an CRAWL_REMOTE_URL, optional mit
//   `Authorization: Bearer <CRAWL_REMOTE_KEY>`.
// - `local-cmd`: CRAWL_EXTRACT_CMD bekommt das JSON-Payload über stdin;
//   stdout ist das Ergebnis-JSON.
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const CRAWL_TIMEOUT_MS = 60000;

function readEnv(name) {
  const value = process.env[name];
  return value === undefined || value === '' ? undefined : value;
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

/** Manche JSON-Antworten sind Array-gewrapt — erstes Element gewinnt. */
function unwrap(payload) {
  return Array.isArray(payload) ? payload[0] : payload;
}

function parseJsonObject(rawBody, source) {
  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    throw { status: 502, message: `${source} hat keine gültige JSON-Antwort geliefert.` };
  }
  const obj = unwrap(payload);
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    throw { status: 502, message: `${source} hat kein gültiges JSON-Objekt zurückgegeben.` };
  }
  return obj;
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
  if (structured && typeof structured === 'object' && !Array.isArray(structured)) {
    return structured;
  }
  try {
    return parseJsonObject(typeof envelope.response === 'string' ? envelope.response : '', 'agy');
  } catch {
    throw { status: 502, message: 'agy hat kein verwertbares JSON-Objekt zurückgegeben.' };
  }
}

async function fetchWithTimeout(url, options) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(CRAWL_TIMEOUT_MS) });
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
 * Shell-Interpolation dynamischer Inhalte.
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

const providers = {
  'remote-ai': {
    description: 'Remote-LLM per HTTP-JSON (CRAWL_REMOTE_URL, optional CRAWL_REMOTE_KEY als Bearer)',
    isConfigured: () => !!readEnv('CRAWL_REMOTE_URL'),
    async runJson({ task, journey = '', prompt, payload = {} }) {
      const endpoint = readEnv('CRAWL_REMOTE_URL');
      if (!endpoint) {
        throw { status: 501, code: 'NO_EXTRACTOR', message: 'CRAWL_REMOTE_URL ist nicht konfiguriert.' };
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
            ...(task ? { task } : {}),
            ...(journey ? { journey } : {}),
            ...(prompt ? { prompt } : {}),
            ...payload,
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
      return parseJsonObject(rawBody, 'Remote-AI');
    },
  },
  'agy': {
    description: 'Lokale LLM-Auswertung via agy-CLI (Print-Mode, ohne Tools, mit JSON-Schema)',
    isConfigured: () => !!findBinary(readEnv('CRAWL_AGY_BIN') || 'agy'),
    async runJson({ task, prompt, schemaPath }) {
      const bin = findBinary(readEnv('CRAWL_AGY_BIN') || 'agy');
      if (!bin) {
        throw { status: 501, code: 'NO_EXTRACTOR', message: 'agy ist nicht installiert (PATH) — CRAWL_AGY_BIN prüfen.' };
      }
      if (typeof prompt !== 'string' || !prompt.trim()) {
        throw { status: 400, message: 'Prompt ist erforderlich.' };
      }
      const timeoutRaw = Number(readEnv('CRAWL_AGY_TIMEOUT_MS'));
      const timeoutMs = Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? Math.floor(timeoutRaw) : 120000;
      const args = [
        '--mode', 'plan',
        '-p', prompt,
        '--output-format', 'json',
        ...(schemaPath ? ['--json-schema', schemaPath] : []),
        '--effort', readEnv('CRAWL_AGY_EFFORT') || 'low',
      ];
      const model = readEnv('CRAWL_AGY_MODEL');
      if (model) args.push('--model', model);
      const stdout = await runDirect(bin, args, { label: task ? `agy (${task})` : 'agy-Aufruf', timeoutMs });
      return parseAgyEnvelope(stdout);
    },
  },
  'local-cmd': {
    description: 'Lokale LLM-Auswertung auf dieser Maschine (CRAWL_EXTRACT_CMD, Inhalt via stdin-JSON)',
    isConfigured: () => !!readEnv('CRAWL_EXTRACT_CMD'),
    async runJson({ task, journey = '', prompt, payload = {} }) {
      const cmd = readEnv('CRAWL_EXTRACT_CMD');
      if (!cmd) {
        throw { status: 501, code: 'NO_EXTRACTOR', message: 'CRAWL_EXTRACT_CMD ist nicht konfiguriert.' };
      }
      const expanded = cmd.split('{journey}').join(journey);
      const stdout = await runCommand(expanded, {
        input: JSON.stringify({
          ...(task ? { task } : {}),
          ...(journey ? { journey } : {}),
          ...(prompt ? { prompt } : {}),
          ...payload,
        }),
        envExtra: { CRAWL_JOURNEY: journey },
        label: task ? `LLM-Kommando (${task})` : 'LLM-Kommando',
      });
      return parseJsonObject(stdout, 'Lokales LLM-Kommando');
    },
  },
};

const PROVIDER_PRIORITY = ['agy', 'remote-ai', 'local-cmd'];

function providerNames() {
  return Object.keys(providers);
}

/** Gibt den ersten konfigurierten LLM-Provider zurück (Priorität: agy, remote-ai, local-cmd), sonst null. */
function findConfiguredProvider() {
  for (const name of PROVIDER_PRIORITY) {
    if (providers[name] && providers[name].isConfigured()) return name;
  }
  return null;
}

/**
 * Löst den LLM-Provider auf (explizites Argument oder CRAWL_EXTRACT_PROVIDER /
 * CRAWL_PROVIDER). Ohne Vorgabe wird der erste konfigurierte Provider gewählt
 * (`null`, wenn kein Provider konfiguriert ist).
 */
function resolveProviderName(requested) {
  if (requested !== undefined && requested !== null && requested !== '') {
    const name = String(requested);
    if (!providers[name]) {
      throw { status: 400, message: `Unbekannter LLM-Provider "${name}" (bekannt: ${providerNames().join(', ')}).` };
    }
    return name;
  }
  const fromEnv = readEnv('CRAWL_EXTRACT_PROVIDER') || readEnv('CRAWL_PROVIDER');
  if (fromEnv && !providers[fromEnv]) {
    throw { status: 500, message: `LLM-Provider "${fromEnv}" ist unbekannt (bekannt: ${providerNames().join(', ')}).` };
  }
  if (fromEnv) return fromEnv;
  return findConfiguredProvider();
}

function extractorHint(providerName) {
  return providerName === 'local-cmd'
    ? 'CRAWL_EXTRACT_CMD ist nicht konfiguriert.'
    : providerName === 'agy'
      ? 'agy ist nicht installiert (PATH) — CRAWL_AGY_BIN prüfen.'
      : 'CRAWL_REMOTE_URL ist nicht konfiguriert.';
}

function listProviders() {
  const activeProvider = resolveProviderName();
  return providerNames().map((name) => ({
    stage: 'extract',
    name,
    description: providers[name].description,
    configured: providers[name].isConfigured(),
    active: name === activeProvider,
  }));
}

/**
 * Führt einen strukturierten JSON-LLM-Aufruf über den gewählten oder ersten
 * konfigurierten Provider aus. Wirft `{ status: 501, code: 'NO_EXTRACTOR' }`,
 * wenn kein Provider konfiguriert ist.
 */
async function runLlmJson({ task, journey = '', prompt, schemaPath, payload = {}, provider } = {}) {
  const providerName = resolveProviderName(provider);
  if (!providerName) {
    throw {
      status: 501,
      code: 'NO_EXTRACTOR',
      message: 'Kein LLM-Provider konfiguriert (agy, remote-ai oder local-cmd).',
    };
  }
  const impl = providers[providerName];
  if (!impl.isConfigured()) {
    throw { status: 501, code: 'NO_EXTRACTOR', message: extractorHint(providerName) };
  }
  const started = Date.now();
  const result = await impl.runJson({ task, journey, prompt, schemaPath, payload });
  return {
    result,
    provider: providerName,
    meta: { extractMs: Date.now() - started },
  };
}

module.exports = {
  CRAWL_TIMEOUT_MS,
  providers,
  providerNames,
  findConfiguredProvider,
  resolveProviderName,
  listProviders,
  runLlmJson,
  findBinary,
  parseAgyEnvelope,
  readEnv,
};
