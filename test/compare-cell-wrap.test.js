const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readFrontend(rel) {
  return fs.readFileSync(path.join(__dirname, '..', 'frontend', 'src', rel), 'utf8');
}

describe('Compare Tabelle: Zellbreite, Text-Wrap & ExpandableText', () => {
  it('Compare.tsx setzt TableCell-Breite auf max-w-[300px] mit Text-Wrap', () => {
    const compare = readFrontend('pages/Compare.tsx');
    assert.ok(
      compare.includes('max-w-[300px]'),
      'Compare.tsx muss max-w-[300px] für die Zellen definieren'
    );
    assert.ok(
      compare.includes('whitespace-normal'),
      'Compare.tsx muss whitespace-normal auf TableCell setzen, damit Text umbricht'
    );
    assert.ok(
      compare.includes('<ExpandableText'),
      'Compare.tsx muss ExpandableText verwenden'
    );
  });

  it('ExpandableText implementiert 3-Zeilen-Clamp mit .. Öffnen / Schließen Toggle', () => {
    const expandable = readFrontend('components/ExpandableText.tsx');
    assert.ok(
      expandable.includes('max-w-[300px]'),
      'ExpandableText muss max-w-[300px] haben'
    );
    assert.ok(
      expandable.includes('break-words'),
      'ExpandableText muss break-words haben'
    );
    assert.ok(
      expandable.includes('line-clamp-3'),
      'ExpandableText muss line-clamp-3 für 3-Zeilen-Begrenzung nutzen'
    );
    assert.ok(
      expandable.includes('.. Öffnen'),
      'ExpandableText muss „.. Öffnen" als Toggle-Label anbieten'
    );
    assert.ok(
      expandable.includes('Schließen'),
      'ExpandableText muss „Schließen" im aufgeklappten Zustand anbieten'
    );
    assert.ok(
      expandable.includes('scrollHeight'),
      'ExpandableText muss Überlauf dynamisch via scrollHeight messen'
    );
  });
});
