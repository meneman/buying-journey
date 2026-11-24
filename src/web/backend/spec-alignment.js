// Serverseitiger KI-Abgleich für Item-Properties (`specs`):
// 1. Synonyme Spec-Keys über einen konfigurierten LLM-Provider vereinheitlichen.
// 2. Gemeinsame (bei allen Items befüllte) vs. Einzel-Eigenschaften ermitteln.
// 3. Stiller Fallback auf deterministische case-insensitive Gruppierung, falls
//    kein LLM-Provider konfiguriert ist, < 2 Items vorliegen oder der LLM-Call
//    fehlschlägt.
const fs = require('node:fs');
const path = require('node:path');
const { runLlmJson, resolveProviderName, providers } = require('./crawl-providers.js');

const PROMPT_PATH = path.join(__dirname, '..', '..', 'agent', 'prompts', 'spec_alignment_prompt.md');
const SCHEMA_PATH = path.join(__dirname, 'spec-alignment-schema.json');

let cachedPromptTemplate = null;
function loadPromptTemplate() {
  if (cachedPromptTemplate === null) {
    cachedPromptTemplate = fs.readFileSync(PROMPT_PATH, 'utf8');
  }
  return cachedPromptTemplate;
}

/** Zerlegt den `<br>`-getrennten Specs-String in `{ k, v }`-Paare. */
function parseSpecsParts(specs) {
  if (!specs || typeof specs !== 'string') return [];
  return specs
    .split(/<br\s*\/?>/i)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((part) => {
      const colon = part.indexOf(':');
      if (colon > 0) {
        return { k: part.slice(0, colon).trim(), v: part.slice(colon + 1).trim() };
      }
      return { k: null, v: part };
    });
}

function serializeSpecsParts(parts) {
  return parts
    .filter((p) => p && typeof p.v === 'string')
    .map((p) => (p.k ? `${p.k}: ${p.v}` : p.v))
    .join(' <br> ');
}

/** Prüft, ob mindestens ein Item überhaupt benannte Key-Value-Specs trägt. */
function hasAnyKeyedSpecs(items) {
  if (!Array.isArray(items)) return false;
  for (const item of items) {
    for (const part of parseSpecsParts(item && item.specs)) {
      if (part.k) return true;
    }
  }
  return false;
}

/**
 * Deterministische Gruppierung nach exakt/case-insensitiv gleichen Keys.
 * `commonKeys` enthält alle Keys, die bei jedem Item nicht-leer befüllt sind;
 * `uniqueKeys` enthält alle übrigen Keys. Reihenfolge folgt dem ersten Auftreten.
 */
function computeDeterministicSpecComparison(items, { updatedAt } = {}) {
  const list = Array.isArray(items) ? items : [];
  const keyOrder = [];
  const displayByLower = new Map();
  const filledItemsByLower = new Map();

  list.forEach((item, index) => {
    for (const part of parseSpecsParts(item && item.specs)) {
      if (!part.k) continue;
      const lower = part.k.toLowerCase();
      if (!displayByLower.has(lower)) {
        displayByLower.set(lower, part.k);
        filledItemsByLower.set(lower, new Set());
        keyOrder.push(lower);
      }
      if (part.v && part.v.trim() !== '') {
        filledItemsByLower.get(lower).add(index);
      }
    }
  });

  const commonKeys = [];
  const uniqueKeys = [];
  const total = list.length;
  for (const lower of keyOrder) {
    const label = displayByLower.get(lower);
    const count = filledItemsByLower.get(lower).size;
    if (total > 0 && count === total) {
      commonKeys.push(label);
    } else {
      uniqueKeys.push(label);
    }
  }

  return {
    commonKeys,
    uniqueKeys,
    ...(typeof updatedAt === 'string' ? { updatedAt } : {}),
  };
}

/**
 * Extrahiert ein validiertes `lower(from) -> canonicalKey`-Mapping aus der
 * LLM-Antwort (`keyMappings`-Array oder `keyMap`/`canonical`-Objekt). Nur Keys,
 * die tatsächlich in `items` vorkommen, werden akzeptiert; ungültige Ziel-Keys
 * (leer oder mit Trennzeichen) werden verworfen.
 */
function extractKeyMappings(items, llmResult) {
  const existingKeys = new Set();
  for (const item of items) {
    for (const part of parseSpecsParts(item && item.specs)) {
      if (part.k) existingKeys.add(part.k.toLowerCase());
    }
  }

  const pairs = [];
  if (llmResult && Array.isArray(llmResult.keyMappings)) {
    for (const entry of llmResult.keyMappings) {
      if (entry && typeof entry.from === 'string' && typeof entry.to === 'string') {
        pairs.push([entry.from, entry.to]);
      }
    }
  } else if (llmResult && typeof llmResult === 'object') {
    const mapObj = llmResult.keyMap || llmResult.canonical;
    if (mapObj && typeof mapObj === 'object' && !Array.isArray(mapObj)) {
      for (const [from, to] of Object.entries(mapObj)) {
        if (typeof to === 'string') pairs.push([from, to]);
      }
    }
  }

  const canonicalByLower = new Map();
  for (const [rawFrom, rawTo] of pairs) {
    const fromLower = rawFrom.trim().toLowerCase();
    const to = rawTo.trim();
    if (!fromLower || !existingKeys.has(fromLower)) continue;
    if (!to || to.includes(':') || /<br/i.test(to)) continue;
    canonicalByLower.set(fromLower, to);
  }
  return canonicalByLower;
}

/**
 * Wendet das Synonym-Mapping auf alle Items an: Reihenfolge, Werte und
 * Freitext-Einträge bleiben erhalten; doppelte kanonische Keys innerhalb
 * desselben Items werden zusammengeführt (erster nicht-leerer Wert gewinnt).
 */
function applyKeyMappingsToItems(items, canonicalByLower) {
  const updatedSpecsByIndex = [];
  let changedSpecs = false;

  for (const item of items) {
    const original = (item && item.specs) || '';
    if (!canonicalByLower || canonicalByLower.size === 0) {
      updatedSpecsByIndex.push(original);
      continue;
    }

    const parts = parseSpecsParts(original);
    const out = [];
    const seenKeyIndex = new Map();

    for (const part of parts) {
      if (!part.k) {
        out.push(part);
        continue;
      }
      const mapped = canonicalByLower.get(part.k.toLowerCase()) || part.k;
      const mappedLower = mapped.toLowerCase();
      if (seenKeyIndex.has(mappedLower)) {
        const idx = seenKeyIndex.get(mappedLower);
        if (!out[idx].v && part.v) {
          out[idx].v = part.v;
        }
      } else {
        seenKeyIndex.set(mappedLower, out.length);
        out.push({ k: mapped, v: part.v });
      }
    }

    const serialized = serializeSpecsParts(out);
    if (serialized !== original) {
      changedSpecs = true;
    }
    updatedSpecsByIndex.push(serialized);
  }

  return { updatedSpecsByIndex, changedSpecs };
}

/**
 * Sortiert `keys` nach der vom LLM vorgeschlagenen Reihenfolge (case-insensitiv)
 * und behält alle übrigen Keys in ihrer deterministischen Reihenfolge.
 */
function orderKeysByPreference(keys, preferred) {
  if (!Array.isArray(preferred) || preferred.length === 0) return keys;
  const byLower = new Map(keys.map((k) => [k.toLowerCase(), k]));
  const ordered = [];
  const used = new Set();
  for (const p of preferred) {
    if (typeof p !== 'string') continue;
    const lower = p.trim().toLowerCase();
    if (byLower.has(lower) && !used.has(lower)) {
      ordered.push(byLower.get(lower));
      used.add(lower);
    }
  }
  for (const k of keys) {
    const lower = k.toLowerCase();
    if (!used.has(lower)) {
      ordered.push(k);
      used.add(lower);
    }
  }
  return ordered;
}

function buildSpecAlignmentPrompt({ journey, items }) {
  const template = loadPromptTemplate();
  const compactItems = items.map((item, index) => ({
    index,
    name: (item && item.name) || `Item ${index + 1}`,
    specs: parseSpecsParts(item && item.specs)
      .filter((p) => p.k)
      .map((p) => ({ key: p.k, value: p.v })),
  }));
  return `${template.trim()}\n\n## Journey Data\n\n\`\`\`json\n${JSON.stringify({ journey, items: compactItems }, null, 2)}\n\`\`\`\n`;
}

/** Prüft sicher, ob überhaupt ein nutzbarer LLM-Provider konfiguriert ist. */
function findUsableLlmProvider(requested) {
  try {
    const name = resolveProviderName(requested);
    if (!name) return null;
    const impl = providers[name];
    return impl && impl.isConfigured() ? name : null;
  } catch {
    return null;
  }
}

/**
 * Führt den Property-Abgleich für eine Journey aus. Schlägt der LLM-Call fehl
 * oder ist kein Provider konfiguriert, greift der stille deterministische Fallback.
 */
async function alignJourneySpecs({
  journey,
  items,
  provider,
  runLlm = runLlmJson,
  now = () => new Date().toISOString(),
} = {}) {
  const list = Array.isArray(items) ? items : [];
  const updatedAt = now();

  if (list.length < 2 || !hasAnyKeyedSpecs(list)) {
    return {
      updatedSpecsByIndex: list.map((item) => (item && item.specs) || ''),
      changedSpecs: false,
      specComparison: computeDeterministicSpecComparison(list, { updatedAt }),
      usedLlm: false,
    };
  }

  const usableProvider = findUsableLlmProvider(provider);
  if (!usableProvider) {
    return {
      updatedSpecsByIndex: list.map((item) => (item && item.specs) || ''),
      changedSpecs: false,
      specComparison: computeDeterministicSpecComparison(list, { updatedAt }),
      usedLlm: false,
    };
  }

  try {
    const prompt = buildSpecAlignmentPrompt({ journey, items: list });
    const payload = {
      items: list.map((item, index) => ({
        index,
        name: (item && item.name) || `Item ${index + 1}`,
        specs: parseSpecsParts(item && item.specs).filter((p) => p.k),
      })),
    };
    const { result, provider: usedProvider } = await runLlm({
      task: 'spec-alignment',
      journey,
      prompt,
      schemaPath: SCHEMA_PATH,
      payload,
      provider: usableProvider,
    });

    const canonicalByLower = extractKeyMappings(list, result);
    const { updatedSpecsByIndex, changedSpecs } = applyKeyMappingsToItems(list, canonicalByLower);
    const mappedItems = list.map((item, index) => ({ ...item, specs: updatedSpecsByIndex[index] }));
    const deterministic = computeDeterministicSpecComparison(mappedItems, { updatedAt });

    return {
      updatedSpecsByIndex,
      changedSpecs,
      specComparison: {
        commonKeys: orderKeysByPreference(deterministic.commonKeys, result && result.commonKeys),
        uniqueKeys: orderKeysByPreference(deterministic.uniqueKeys, result && result.uniqueKeys),
        updatedAt,
      },
      usedLlm: true,
      provider: usedProvider,
    };
  } catch (err) {
    console.warn(
      `[spec-alignment] LLM-Abgleich für "${journey}" fehlgeschlagen, stiller Fallback:`,
      err && err.message ? err.message : err,
    );
    return {
      updatedSpecsByIndex: list.map((item) => (item && item.specs) || ''),
      changedSpecs: false,
      specComparison: computeDeterministicSpecComparison(list, { updatedAt }),
      usedLlm: false,
    };
  }
}

module.exports = {
  PROMPT_PATH,
  SCHEMA_PATH,
  parseSpecsParts,
  serializeSpecsParts,
  hasAnyKeyedSpecs,
  computeDeterministicSpecComparison,
  extractKeyMappings,
  applyKeyMappingsToItems,
  buildSpecAlignmentPrompt,
  findUsableLlmProvider,
  alignJourneySpecs,
};
