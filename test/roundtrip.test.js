const { test } = require('node:test');
const assert = require('node:assert/strict');

const { parseMarkdown } = require('../src/core/parser.js');
const { serializeToMarkdown } = require('../src/core/serializer.js');

function sampleData() {
  return {
    sectionTitle: 'Bikes Under Consideration',
    listTitle: 'Rahmengrößen',
    headers: ['Name', 'Price', 'Specs', 'Rating', 'Status', 'Notes', 'Link'],
    status: { phase: 'Planning', budget: '2500€', targetDate: '' },
    journey: [{ date: '2026-01-01', event: 'BIKE Buying Journey started.' }],
    items: [
      {
        name: 'Cube Kathmandu Pro',
        price: '1.499 €',
        specs: 'Rahmen: Carbon <br> Gewicht: 14.5 kg',
        rating: '⭐⭐⭐⭐',
        status: 'Thinking',
        notes: 'Solide Ausstattung',
        link: 'https://example.com/cube',
      },
    ],
    specs: [{ label: 'Größe', value: 'M (165-180 cm)' }],
    generalNotes: '- Erstmal vergleichen',
  };
}

test('round-trip preserves a plain document exactly', () => {
  const data = sampleData();
  const once = serializeToMarkdown(data, 'bike');
  const twice = serializeToMarkdown(parseMarkdown(once), 'bike');
  assert.equal(twice, once);
});

test('pipe characters in cells survive a round-trip', () => {
  const data = sampleData();
  data.items[0].notes = 'force | torque';
  data.items[0].specs = 'Drehmoment: 85 Nm | Peak: 100 Nm';
  const md = serializeToMarkdown(data, 'bike');
  // A raw pipe must not leak into the table structure unescaped …
  const tableRow = md.split('\n').find((line) => line.includes('Kathmandu'));
  assert.ok(tableRow, 'expected the item row in the output');
  const parsed = parseMarkdown(md);
  assert.equal(parsed.items[0].notes, 'force | torque');
  assert.equal(parsed.items[0].specs, 'Drehmoment: 85 Nm | Peak: 100 Nm');
  // … and re-serializing stays stable.
  assert.equal(serializeToMarkdown(parsed, 'bike'), md);
});

test('newlines in cells do not break the table', () => {
  const data = sampleData();
  data.items[0].notes = 'Zeile eins\nZeile zwei';
  const md = serializeToMarkdown(data, 'bike');
  const rowCount = md.split('\n').filter((line) => line.includes('Kathmandu')).length;
  assert.equal(rowCount, 1);
  const parsed = parseMarkdown(md);
  assert.equal(parsed.items.length, 1);
  assert.ok(parsed.items[0].notes.includes('Zeile eins'));
  assert.ok(parsed.items[0].notes.includes('Zeile zwei'));
});

test('serializer tolerates missing sections', () => {
  assert.doesNotThrow(() => serializeToMarkdown({}, 'bike'));
  assert.doesNotThrow(() => serializeToMarkdown({ items: [{ name: 'X' }] }, 'bike'));
  const parsed = parseMarkdown(serializeToMarkdown({}, 'bike'));
  assert.equal(parsed.items.length, 0);
});

test('rows without edge pipes map to the right columns', () => {
  const md = [
    '# 🚲 Bike Journey',
    '',
    '## 🚲 Bikes',
    'Name | Price | Specs | Rating | Status | Notes | Link',
    ':--- | :--- | :--- | :--- | :--- | :--- | :---',
    'Cube | 1000 € | leicht | ⭐⭐ | Thinking | top | https://example.com',
    '',
  ].join('\n');
  const parsed = parseMarkdown(md);
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].name, 'Cube');
  assert.equal(parsed.items[0].price, '1000 €');
  assert.equal(parsed.items[0].link, 'https://example.com');
});

test('escaped pipes parse back to literal pipes', () => {
  const md = [
    '# 🚲 Bike Journey',
    '',
    '## 🚲 Bikes',
    '| Name | Price | Specs | Rating | Status | Notes | Link |',
    '| :--- | :--- | :--- | :--- | :--- | :--- | :--- |',
    '| Cube | 1000 € | a \\| b | ⭐ | Thinking | x | https://example.com |',
    '',
  ].join('\n');
  const parsed = parseMarkdown(md);
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].specs, 'a | b');
});
