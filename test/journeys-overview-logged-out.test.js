const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Regressionstest für die ausgeloggte Kaufreisen-Übersicht:
// Ohne Login antworten /api/journey-configs und /api/journeys mit 401 — die
// Seite darf diese Endpunkte dann gar nicht erst aufrufen, sondern zeigt
// allgemeine Infos mit Weiterleitung zum Login.
const source = fs.readFileSync(
  path.join(__dirname, '..', 'frontend', 'src', 'pages', 'JourneysOverview.tsx'),
  'utf8'
);

describe('JourneysOverview (ausgeloggter Zustand)', () => {
  it('fetcht erst nach Login (Guard vor allen API-Aufrufen)', () => {
    const guard = source.indexOf('if (loading || !loggedIn) return');
    assert.notEqual(guard, -1, 'Erwartet einen Login-Guard im Lade-Effect');
    for (const call of ['fetchJourneyConfigs()', 'fetchJourneys()']) {
      const at = source.indexOf(call);
      assert.notEqual(at, -1, `Erwartet Aufruf ${call}`);
      assert.ok(
        guard < at,
        `${call} steht vor dem Login-Guard und würde ausgeloggt 401er produzieren`
      );
    }
  });

  it('lädt bei Login-Wechsel neu (loggedIn in den Effect-Deps)', () => {
    assert.match(source, /}, \[loading, loggedIn\]\)/, 'Effect-Deps müssen [loading, loggedIn] sein');
  });

  it('zeigt ausgeloggt allgemeine Infos mit Login-Weiterleitung statt "Meine Kaufreisen"', () => {
    const loggedOut = source.indexOf('if (!loggedIn)');
    assert.notEqual(loggedOut, -1, 'Erwartet einen ausgeloggten Render-Zweig');
    const tail = source.slice(loggedOut);
    assert.ok(tail.includes("navigate('/login')"), 'CTA muss zu /login führen');
    assert.ok(tail.includes('Neue Kaufreise'), 'CTA „Neue Kaufreise" muss ausgeloggt sichtbar sein');
    // „Meine Kaufreisen" gehört ausschließlich in den eingeloggten Zweig (nach dem Guard).
    const listHeading = source.indexOf('Meine Kaufreisen');
    assert.ok(
      listHeading > loggedOut,
      '„Meine Kaufreisen" darf nur im eingeloggten Zweig gerendert werden'
    );
  });
});
