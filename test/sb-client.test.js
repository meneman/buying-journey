const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { makeRequest } = require('../src/core/sb-client.js');

async function startServer(handler, t) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  return `http://127.0.0.1:${server.address().port}`;
}

test('resolves status, body and headers of a successful response', async (t) => {
  const base = await startServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/markdown' });
    res.end('# hello');
  }, t);
  const response = await makeRequest(`${base}/.fs/bike.buying-journey.md`, 'secret');
  assert.equal(response.statusCode, 200);
  assert.equal(response.body, '# hello');
  assert.ok(response.headers['content-type'].includes('text/markdown'));
});

test('rejects when the connection fails', async () => {
  await assert.rejects(makeRequest('http://127.0.0.1:1/.fs/x.md', '', { timeout: 1000 }));
});

test('rejects when the server never responds', { timeout: 5000 }, async (t) => {
  const base = await startServer(() => {
    // Intentionally never respond.
  }, t);
  await assert.rejects(makeRequest(base, '', { timeout: 150 }), /timed out/i);
});
