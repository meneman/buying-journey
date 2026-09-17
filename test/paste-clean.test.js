const { test } = require('node:test');
const assert = require('node:assert/strict');

const { cleanPastedContent } = require('../src/core/paste-clean.js');

test('reiner Text wird normalisiert (Whitespace kollabieren, trimmen)', () => {
  assert.equal(cleanPastedContent('  Tesla   Model 3\n\nReichweite   513 km  '), 'Tesla Model 3 Reichweite 513 km');
  assert.equal(cleanPastedContent(''), '');
  assert.equal(cleanPastedContent('   \n  '), '');
  assert.equal(cleanPastedContent(null), '');
  assert.equal(cleanPastedContent(42), '');
});

test('HTML: head, Skripte, Styles und Kommentare fliegen raus, Body-Text bleibt', () => {
  const html = `<!DOCTYPE html><html><head><title>Shop</title><meta name="x" content="y">
    <style>.a{color:red}</style><script>var a=1;</script></head>
    <body><!-- Kommentar --><h1>Model 3</h1><p>Reichweite 513 km</p><script>track();</script></body></html>`;
  const out = cleanPastedContent(html);
  assert.ok(out.includes('Model 3'), `Titelinhalt fehlt: ${out}`);
  assert.ok(out.includes('Reichweite 513 km'), `Body fehlt: ${out}`);
  assert.ok(!out.includes('track();'), `Skript überlebt: ${out}`);
  assert.ok(!out.includes('.a{color:red}'), `Style überlebt: ${out}`);
  assert.ok(!out.includes('Kommentar'), `Kommentar überlebt: ${out}`);
  assert.ok(!out.includes('<'), `Tags überleben: ${out}`);
});

test('Blockseiten-HTML liefert den sichtbaren Fehlertext (für ehrliche Notes)', () => {
  const out = cleanPastedContent('<html><head><title>Access Denied</title></head><body><h1>Access Denied</h1></body></html>');
  assert.ok(out.includes('Access Denied'), `Fehlertext fehlt: ${out}`);
});

test('maxChars kappt lange Eingaben', () => {
  const long = 'Wort '.repeat(1000);
  assert.ok(cleanPastedContent(long, 100).length <= 100);
  assert.equal(cleanPastedContent('kurz', 100), 'kurz');
});
