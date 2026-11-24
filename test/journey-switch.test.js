const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

async function getTargetPath() {
  const mod = await import('../frontend/src/lib/router-path.ts');
  return mod.targetPathForJourneySwitch;
}

function readFrontend(rel) {
  return fs.readFileSync(path.join(__dirname, '..', 'frontend', 'src', rel), 'utf8');
}

describe('JourneySwitcher Dropdown-Routing', () => {
  it('bleibt auf Dashboard, Vergleich, Feedback und Eigenschaften', async () => {
    const targetPath = await getTargetPath();
    assert.equal(targetPath('/'), '/');
    assert.equal(targetPath('/vergleich'), '/vergleich');
    assert.equal(targetPath('/eigenschaften'), '/eigenschaften');
    assert.equal(targetPath('/feedback'), '/feedback');
  });

  it('routet von Einstellungen immer auf Dashboard', async () => {
    const targetPath = await getTargetPath();
    assert.equal(targetPath('/einstellungen'), '/');
    assert.equal(targetPath('/einstellungen/'), '/');
  });

  it('routet von MCP oder Login auf Dashboard', async () => {
    const targetPath = await getTargetPath();
    assert.equal(targetPath('/mcp'), '/');
    assert.equal(targetPath('/login'), '/');
  });

  it('JourneySwitcher verwendet targetPathForJourneySwitch für das Ziel', () => {
    const switcher = readFrontend('components/layout/JourneySwitcher.tsx');
    assert.ok(
      switcher.includes('targetPathForJourneySwitch'),
      'JourneySwitcher muss targetPathForJourneySwitch importieren und nutzen'
    );
    assert.match(
      switcher,
      /targetPathForJourneySwitch\(pathname\)/,
      'JourneySwitcher muss den aktuellen pathname übergeben'
    );
    assert.match(
      switcher,
      /navigate\(`\$\{targetPath\}\?journey=\$\{encodeURIComponent\(next\)\}`\)/,
      'JourneySwitcher muss zu targetPath mit journey-Query-Param navigieren'
    );
  });
});
