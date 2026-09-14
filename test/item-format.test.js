const { test } = require('node:test');
const assert = require('node:assert/strict');

const { starsFromRating, specsToString } = require('../src/core/item-format.js');

test('starsFromRating converts 1-5 ratings to star strings', () => {
  assert.equal(starsFromRating(4), '⭐⭐⭐⭐');
  assert.equal(starsFromRating('3'), '⭐⭐⭐');
  assert.equal(starsFromRating(5), '⭐⭐⭐⭐⭐');
});

test('starsFromRating clamps and sanitizes bad input', () => {
  assert.equal(starsFromRating(0), '');
  assert.equal(starsFromRating(9), '⭐⭐⭐⭐⭐');
  assert.equal(starsFromRating(-2), '');
  assert.equal(starsFromRating('keine Angabe'), '');
  assert.equal(starsFromRating(undefined), '');
  assert.equal(starsFromRating(2.4), '⭐⭐');
});

test('specsToString joins label/value lists with <br>', () => {
  assert.equal(
    specsToString([{ label: 'Rahmen', value: 'Carbon' }, { label: 'Gewicht', value: '14.5 kg' }]),
    'Rahmen: Carbon <br> Gewicht: 14.5 kg'
  );
  assert.equal(specsToString([{ value: 'nur Wert' }]), 'nur Wert');
  assert.equal(specsToString([]), '');
});

test('specsToString passes strings through and rejects non-lists', () => {
  assert.equal(specsToString('schon ein String'), 'schon ein String');
  assert.equal(specsToString(null), '');
  assert.equal(specsToString(undefined), '');
  assert.equal(specsToString(42), '');
});

test('specsToString drops empty entries', () => {
  assert.equal(specsToString([null, {}, { label: '', value: '' }]), '');
});
