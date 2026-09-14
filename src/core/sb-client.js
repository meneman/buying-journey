const https = require('https');
const http = require('http');
const { URL } = require('url');

// Default timeout (ms) so a hung SilverBullet server cannot hang our callers forever.
const DEFAULT_TIMEOUT_MS = 15000;

function makeRequest(urlStr, token, options = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(urlStr);
    const protocol = parsedUrl.protocol === 'https:' ? https : http;
    const headers = { ...options.headers };
    const method = options.method || 'GET';
    const timeoutMs = options.timeout ?? DEFAULT_TIMEOUT_MS;
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    headers['X-Sync-Mode'] = 'true';
    
    const reqOpts = {
      method,
      headers,
      host: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
    };
    
    const req = protocol.request(reqOpts, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const body = buffer.toString('utf8');
        resolve({
          statusCode: res.statusCode,
          statusMessage: res.statusMessage,
          headers: res.headers,
          body
        });
      });
    });
    
    req.on('error', (err) => reject(err));
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Request timed out after ${timeoutMs}ms`));
    });
    if (options.body !== undefined) {
      req.write(options.body);
    }
    req.end();
  });
}

module.exports = { makeRequest };
