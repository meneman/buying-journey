const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readFrontend(rel) {
  return fs.readFileSync(path.join(__dirname, '..', 'frontend', 'src', rel), 'utf8');
}

// Der MCP-Button bleibt oben immer sichtbar, führt ausgeloggt aber direkt auf
// `/login` — abgesichert über das wiederverwendbare LoginGate.
describe('LoginGate (MCP-Link + geschützte Routen)', () => {
  it('Gate leitet ausgeloggt direkt auf /login und rendert eingeloggt die Kinder', () => {
    const gate = readFrontend('components/LoginGate.tsx');
    assert.ok(gate.includes('useLoggedIn'), 'Gate muss den Login-Status auswerten');
    assert.ok(
      gate.includes("navigate('/login')"),
      'Gate muss ausgeloggt direkt auf /login weiterleiten'
    );
    assert.ok(gate.includes('{children}'), 'Gate muss eingeloggt die Kinder rendern');
  });

  it('/mcp liegt hinter dem Gate (kein öffentlicher Zugang, kein 401 im Lesepfad)', () => {
    const app = readFrontend('App.tsx');
    assert.ok(app.includes('<LoginGate>'), 'App muss das LoginGate verwenden');
    assert.match(
      app,
      /<LoginGate>[\s\S]*<Mcp \/>[\s\S]*<\/LoginGate>/,
      '/mcp muss innerhalb des LoginGate gerendert werden'
    );
    assert.ok(!app.includes("pathname === '/mcp' ||"), '/mcp darf keine ausgeloggte Ausnahme mehr sein');
  });

  it('MCP-Button im Header ist immer sichtbar (auch ausgeloggt)', () => {
    const header = readFrontend('components/layout/AppHeader.tsx');
    assert.ok(header.includes("navigate('/mcp')"), 'Header muss auf /mcp verlinken');
    const mcpAt = header.indexOf("navigate('/mcp')");
    const showNavAt = header.indexOf('showNav &&');
    assert.ok(
      showNavAt === -1 || mcpAt < showNavAt,
      'MCP-Button darf nicht hinter dem eingeloggten Navigations-Guard stecken'
    );
  });
});
