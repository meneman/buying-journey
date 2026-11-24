const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

async function loadGrouping() {
  return import('../frontend/src/lib/spec-grouping.ts');
}

function readFrontend(rel) {
  return fs.readFileSync(path.join(__dirname, '..', 'frontend', 'src', rel), 'utf8');
}

describe('Compare Spec-Gruppierung & UI-Bereiche', () => {
  it('trennt nicht bei < 2 Items und fällt bei >= 2 Items deterministisch (case-insensitiv) zurück', async () => {
    const { groupSpecKeys } = await loadGrouping();

    const single = groupSpecKeys([{ name: 'A', specs: 'Weight: 10 kg <br> Rahmen: Alu' }]);
    assert.equal(single.split, false);
    assert.deepEqual(single.allKeys, ['Weight', 'Rahmen']);

    const fallback = groupSpecKeys([
      { name: 'A', specs: 'Gewicht: 15 kg <br> Akku: 500 Wh' },
      { name: 'B', specs: 'gewicht: 14 kg <br> Farbe: Blau' },
    ]);
    assert.equal(fallback.split, true);
    assert.deepEqual(fallback.commonKeys, ['Gewicht']);
    assert.deepEqual(fallback.uniqueKeys, ['Akku', 'Farbe']);
  });

  it('nutzt Backend-specComparison und ergänzt lokal fehlende Keys deterministisch', async () => {
    const { groupSpecKeys } = await loadGrouping();
    const grouped = groupSpecKeys(
      [
        { name: 'A', specs: 'Rahmen: Alu <br> Gewicht: 15 kg <br> LokalNeu: X' },
        { name: 'B', specs: 'Rahmen: Carbon <br> Gewicht: 14 kg' },
      ],
      { commonKeys: ['Gewicht', 'Rahmen', 'Veraltet'], uniqueKeys: [] }
    );
    assert.equal(grouped.split, true);
    assert.deepEqual(grouped.commonKeys, ['Gewicht', 'Rahmen']);
    assert.deepEqual(grouped.uniqueKeys, ['LokalNeu']);
  });

  it('Compare.tsx rendert beide beschrifteten Bereiche und journey-data-context behandelt property-sync', () => {
    const compare = readFrontend('pages/Compare.tsx');
    assert.ok(compare.includes('Gemeinsame Eigenschaften'));
    assert.ok(compare.includes('Weitere / Einzel-Eigenschaften'));
    assert.ok(compare.includes('data.specComparison'));

    const ctx = readFrontend('lib/journey-data-context.tsx');
    assert.ok(ctx.includes('property-sync'));
  });
});
