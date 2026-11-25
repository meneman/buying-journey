const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parsePrice, parseRatingStars } = require('../src/core/price-parse.js');

test('parsePrice versteht DE-Formate', () => {
  assert.deepEqual(parsePrice('612,95 €', '€'), { amount: 612.95, currency: 'EUR', qualifier: '' });
  assert.deepEqual(parsePrice('644,90€', ''), { amount: 644.9, currency: 'EUR', qualifier: '' });
  assert.deepEqual(parsePrice('1.189,95 €', ''), { amount: 1189.95, currency: 'EUR', qualifier: '' });
  const ab = parsePrice('ab 249,00 € (konfigurierbar)', '€');
  assert.equal(ab.amount, 249);
  assert.equal(ab.currency, 'EUR');
  assert.equal(ab.qualifier, 'ab');
  assert.deepEqual(parsePrice('$ 1,299.00', '€'), { amount: 1299, currency: 'USD', qualifier: '' });
});

test('parsePrice Mehrdeutiges und Negativfaelle', () => {
  assert.equal(parsePrice('1.299', '').amount, 1299);
  assert.deepEqual(parsePrice('konfigurierbar', '€'), { amount: null, currency: '', qualifier: '' });
  assert.deepEqual(parsePrice('', '€'), { amount: null, currency: 'EUR', qualifier: '' });
  assert.deepEqual(parsePrice('???', ''), { amount: null, currency: '', qualifier: '' });
});

test('parseRatingStars zaehlt Sterne und Zahlen', () => {
  assert.equal(parseRatingStars('⭐⭐⭐⭐'), 4);
  assert.equal(parseRatingStars('⭐⭐⭐⭐⭐'), 5);
  assert.equal(parseRatingStars('3'), 3);
  assert.equal(parseRatingStars(4), 4);
  assert.equal(parseRatingStars(''), 0);
});
