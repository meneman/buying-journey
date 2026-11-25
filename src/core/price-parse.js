'use strict';
// Preis-Parser fuer DE-Formate plus Budget-Fallback.
// Eingabe: Anzeige-String wie "612,95 EUR", "1.189,95 EUR", "ab 249,00 EUR",
// "$ 1,299.00". Ausgabe: { amount: number|null, currency: 'EUR'|..., qualifier }.
// Waehrung wird auf ISO-Code normiert (EUR/USD/CHF/...), unbekannt -> ''.
// Qualifier erkennt ab/bis/ca./konfigurierbar/variante (case-insensitiv).

const SYMBOL_TO_ISO = { '€': 'EUR', $: 'USD', '£': 'GBP', '¥': 'JPY' };
const CODE_TO_ISO = { EUR: 'EUR', USD: 'USD', CHF: 'CHF', GBP: 'GBP', JPY: 'JPY' };
const QUALIFIERS = ['ab', 'bis', 'ca.', 'ca', 'konfigurierbar', 'variante', 'varianten'];

function normalizeCurrencyToken(token, fallbackCurrency) {
  if (!token) return normalizeCurrencyTokenFallback(fallbackCurrency);
  const t = String(token).trim();
  if (SYMBOL_TO_ISO[t]) return SYMBOL_TO_ISO[t];
  const upper = t.toUpperCase();
  if (CODE_TO_ISO[upper]) return CODE_TO_ISO[upper];
  return normalizeCurrencyTokenFallback(fallbackCurrency);
}

function normalizeCurrencyTokenFallback(fallbackCurrency) {
  if (!fallbackCurrency) return '';
  const f = String(fallbackCurrency).trim();
  if (SYMBOL_TO_ISO[f]) return SYMBOL_TO_ISO[f];
  const upper = f.toUpperCase();
  if (CODE_TO_ISO[upper]) return CODE_TO_ISO[upper];
  // Ein-Zeichen-Symbole sind bereits abgedeckt; sonst leer statt raten.
  if (upper.length === 3 && /^[A-Z]{3}$/.test(upper)) return upper;
  return '';
}

function detectQualifier(text) {
  if (!text) return '';
  const lower = String(text).toLowerCase();
  for (const q of QUALIFIERS) {
    const re = new RegExp(`(^|[^a-z])${q.replace('.', '\\.')}([^a-z]|$)`);
    if (re.test(lower)) return q.replace('ca', 'ca.');
  }
  return '';
}

function parseNumberToken(token) {
  if (!token) return null;
  let s = String(token).trim().replace(/\s/g, '');
  if (!s || /[^0-9.,]/.test(s)) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  let normalized;
  if (lastComma >= 0 && lastDot >= 0) {
    // Beide vorhanden: das spaetere Zeichen ist das Dezimaltrennzeichen.
    if (lastComma > lastDot) {
      normalized = s.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = s.replace(/,/g, '');
    }
  } else if (lastComma >= 0) {
    const after = s.length - lastComma - 1;
    if (after === 2) normalized = s.replace(/\./g, '').replace(',', '.');
    else if (after === 3 && s.split(',').length === 2) normalized = s.replace(/,/g, '');
    else normalized = s.replace(',', '.');
  } else if (lastDot >= 0) {
    const after = s.length - lastDot - 1;
    if (after === 3 && s.split('.').length === 2) {
      // Mehrdeutig ("1.299"): per Spec als Tausender lesen.
      normalized = s.replace(/\./g, '');
    } else {
      normalized = s;
    }
  } else {
    normalized = s;
  }
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

function parsePrice(display, fallbackCurrency) {
  if (display === undefined || display === null) {
    return { amount: null, currency: normalizeCurrencyTokenFallback(fallbackCurrency), qualifier: '' };
  }
  const text = String(display).trim();
  if (!text) {
    return { amount: null, currency: normalizeCurrencyTokenFallback(fallbackCurrency), qualifier: '' };
  }
  const qualifier = detectQualifier(text);
  // Zahl-Token: erste zusammenhaengende Zifferngruppe mit . und ,.
  const numMatch = text.match(/\d[\d.,\s]*\d|\d/);
  const amount = numMatch ? parseNumberToken(numMatch[0]) : null;
  // Waehrungs-Token: ISO-Code oder Symbol im Text.
  let currency = '';
  const codeMatch = text.match(/\b([A-Za-z]{3})\b/);
  if (codeMatch && CODE_TO_ISO[codeMatch[1].toUpperCase()]) {
    currency = codeMatch[1].toUpperCase();
  } else {
    const symMatch = text.match(/[€$£¥]/);
    if (symMatch) currency = SYMBOL_TO_ISO[symMatch[0]] || '';
    else currency = normalizeCurrencyTokenFallback(fallbackCurrency);
  }
  if (amount === null) {
    return { amount: null, currency: '', qualifier: '' };
  }
  return { amount, currency, qualifier };
}

function parseRatingStars(rating) {
  if (rating === undefined || rating === null) return 0;
  if (typeof rating === 'number') {
    const n = Math.round(rating);
    return Math.max(0, Math.min(5, n));
  }
  const s = String(rating);
  const stars = (s.match(/⭐/g) || []).length;
  if (stars > 0) return Math.max(0, Math.min(5, stars));
  const n = parseInt(s, 10);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(5, n));
}

module.exports = { parsePrice, parseRatingStars, normalizeCurrencyTokenFallback };
