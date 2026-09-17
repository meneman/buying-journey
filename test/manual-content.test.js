const { test } = require('node:test');
const assert = require('node:assert/strict');

async function manualContent() {
  return import('../frontend/src/lib/manual-content.ts');
}

function apiError(message, status, code) {
  const error = new Error(message);
  if (status !== undefined) error.status = status;
  if (code !== undefined) error.code = code;
  return error;
}

test('placeholderForBlockedLink baut bei CONTENT_BLOCKED (Tesla-Fall) einen markierten Platzhalter', async () => {
  const { placeholderForBlockedLink, MANUAL_CONTENT_NOTE } = await manualContent();
  // Fehlerform wie aus api.ts request() bei 502 + code CONTENT_BLOCKED.
  const blocked = apiError(
    'Die Seite lieferte keinen verwertbaren Produktinhalt (möglicherweise Bot-Schutz) — bitte Inhalt manuell einfügen.',
    502,
    'CONTENT_BLOCKED'
  );
  const placeholder = placeholderForBlockedLink('https://www.tesla.com/model3', blocked);
  assert.ok(placeholder);
  assert.equal(placeholder.link, 'https://www.tesla.com/model3');
  assert.equal(placeholder.needsContent, true);
  assert.equal(placeholder.notes, MANUAL_CONTENT_NOTE);
  assert.equal(placeholder.status, 'Thinking');
  assert.match(placeholder.name, /tesla\.com/);
  assert.equal(placeholder.price, '');
  assert.equal(placeholder.specs, '');
});

test('placeholderForBlockedLink übernimmt den Formular-Status (ProductDialog-Flow)', async () => {
  const { placeholderForBlockedLink } = await manualContent();
  const placeholder = placeholderForBlockedLink('https://example.com/bike', apiError('Crawl hängt', 504), 'Waiting');
  assert.ok(placeholder);
  assert.equal(placeholder.status, 'Waiting');
  assert.equal(placeholder.needsContent, true);
});

test('placeholderForBlockedLink legt bei 400 (Eingabefehler) und ohne Status nichts an', async () => {
  const { placeholderForBlockedLink } = await manualContent();
  assert.equal(placeholderForBlockedLink('https://example.com/bike', apiError('Ungültige URL.', 400)), null);
  assert.equal(placeholderForBlockedLink('https://example.com/bike', new Error('Backend offline')), null);
  assert.equal(placeholderForBlockedLink('https://example.com/bike', null), null);
});

test('mergeParsedContent übernimmt geparste Felder und löscht das needsContent-Flag (Paste-Modal)', async () => {
  const { mergeParsedContent, placeholderForBlockedLink } = await manualContent();
  const current = placeholderForBlockedLink('https://www.tesla.com/model3', apiError('Blockiert', 502, 'CONTENT_BLOCKED'));
  assert.ok(current);
  const merged = mergeParsedContent(current, {
    name: 'Tesla Model 3',
    price: '39990€',
    specs: 'Reichweite: 513 km',
    rating: '⭐⭐⭐⭐',
    notes: 'Probefahrt offen',
    link: '',
  });
  assert.equal(merged.name, 'Tesla Model 3');
  assert.equal(merged.price, '39990€');
  assert.equal(merged.specs, 'Reichweite: 513 km');
  assert.equal(merged.link, 'https://www.tesla.com/model3');
  assert.equal('needsContent' in merged, false);
});

test('mergeParsedContent fällt auf Platzhalter-Name und -Link zurück', async () => {
  const { mergeParsedContent } = await manualContent();
  const merged = mergeParsedContent(
    { name: 'model3 · tesla.com', price: '', specs: '', rating: '', status: 'Thinking', notes: '', link: '', needsContent: true },
    { name: '', price: '', specs: '', rating: '', notes: '', link: 'https://www.tesla.com/model3' }
  );
  assert.equal(merged.name, 'model3 · tesla.com');
  assert.equal(merged.link, 'https://www.tesla.com/model3');
  assert.equal('needsContent' in merged, false);
});
