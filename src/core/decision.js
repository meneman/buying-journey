'use strict';
// Deterministische Entscheidungshilfen: Scoring, Budget, Sortierung, Gruppierung.
// Kein LLM, keine versteckten Gewichte. Formel v1 ist im Spec fixiert und wird
// von Tests abgedeckt.
const { parsePrice, parseRatingStars } = require('./price-parse.js');

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

function findSpecValue(item, key) {
  const lower = String(key).toLowerCase();
  for (const part of parseSpecsParts(item && item.specs)) {
    if (part.k && part.k.toLowerCase() === lower) return part.v || '';
  }
  return '';
}

function hasSpecKey(item, key) {
  const v = findSpecValue(item, key);
  return v.trim() !== '';
}

function normalizeProsCons(value) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    const err = new Error('Pro/Contra muessen Arrays aus kurzen Strings sein.');
    err.code = 'INVALID_PROS_CONS';
    throw err;
  }
  if (value.length > 20) {
    const err = new Error('Maximal 20 Pro/Contra-Eintraege je Liste.');
    err.code = 'INVALID_PROS_CONS';
    throw err;
  }
  const seen = new Set();
  const out = [];
  for (const raw of value) {
    if (typeof raw !== 'string') {
      const err = new Error('Pro/Contra-Eintraege muessen Strings sein.');
      err.code = 'INVALID_PROS_CONS';
      throw err;
    }
    const t = raw.trim();
    if (!t) continue;
    if (t.length > 200) {
      const err = new Error('Pro/Contra-Eintraege duerfen max. 200 Zeichen haben.');
      err.code = 'INVALID_PROS_CONS';
      throw err;
    }
    const lower = t.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(t);
  }
  return out;
}

function parseProsConsJson(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function budgetAllows(budgetDisplay, priceAmount, priceCurrency, fallbackCurrency) {
  if (priceAmount === null || priceAmount === undefined) return null;
  const budget = parsePrice(budgetDisplay, fallbackCurrency);
  if (budget.amount === null) return null;
  // Unterschiedliche Waehrungen: kein Urteil statt falschem Urteil.
  if (budget.currency && priceCurrency && budget.currency !== priceCurrency) return null;
  return priceAmount <= budget.amount ? false : true;
}

function computePricePoints(items) {
  const amounts = items.map((i) => i.priceAmount).filter((a) => typeof a === 'number');
  if (amounts.length === 0) return new Map();
  const min = Math.min(...amounts);
  const max = Math.max(...amounts);
  const map = new Map();
  items.forEach((item) => {
    if (typeof item.priceAmount !== 'number') {
      map.set(item.name, 0);
      return;
    }
    if (max === min) {
      map.set(item.name, 20);
      return;
    }
    const pts = ((max - item.priceAmount) / (max - min)) * 20;
    map.set(item.name, Math.round(pts * 10) / 10);
  });
  return map;
}

function computeScoreForItem(item, ctx) {
  const rating = parseRatingStars(item.rating);
  const pros = Array.isArray(item.pros) ? item.pros.length : 0;
  const cons = Array.isArray(item.cons) ? item.cons.length : 0;
  const ratingPoints = 12 * rating;
  const prosConsPoints = 2 * (pros - cons);
  const pricePoints = ctx.pricePoints.get(item.name) ?? 0;
  let criteriaPoints = 0;
  const criteria = Array.isArray(ctx.criteria) ? ctx.criteria : [];
  if (criteria.length > 0) {
    for (const c of criteria) {
      const w = Math.max(1, Math.min(5, Number(c.weight) || 3));
      const key = String(c.key || '');
      if (!key) continue;
      const lower = key.toLowerCase();
      let hit = false;
      if (lower === 'price') hit = typeof item.priceAmount === 'number';
      else if (lower === 'rating') hit = rating > 0;
      else hit = hasSpecKey(item, key);
      if (hit) criteriaPoints += ((2 * w) / criteria.length) * 5;
    }
    criteriaPoints = Math.round(criteriaPoints * 10) / 10;
  }
  const raw = ratingPoints + prosConsPoints + pricePoints + criteriaPoints;
  const score = Math.max(0, Math.min(100, Math.round(raw * 10) / 10));
  return { score, breakdown: { ratingPoints, prosConsPoints, pricePoints, criteriaPoints } };
}

function buildReasons(item, scoreInfo, ctx) {
  const reasons = [];
  if (typeof item.priceAmount === 'number' && ctx.minPrice !== null && item.priceAmount === ctx.minPrice) {
    reasons.push('guenstigster Preis');
  }
  const rating = parseRatingStars(item.rating);
  if (rating >= 5) reasons.push('5 Sterne');
  else if (rating >= 4) reasons.push(`${rating} Sterne`);
  const pros = Array.isArray(item.pros) ? item.pros.length : 0;
  const cons = Array.isArray(item.cons) ? item.cons.length : 0;
  if (pros > 0 || cons > 0) reasons.push(`${pros} Pros, ${cons} Contra`);
  if (ctx.criteria && ctx.criteria.length > 0 && scoreInfo.breakdown.criteriaPoints > 0) {
    reasons.push('passt zu Kriterien');
  }
  return reasons.slice(0, 3);
}

module.exports = {
  parseSpecsParts,
  findSpecValue,
  hasSpecKey,
  normalizeProsCons,
  parseProsConsJson,
  budgetAllows,
  computePricePoints,
  computeScoreForItem,
  buildReasons,
};
