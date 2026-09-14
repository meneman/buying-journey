const express = require('express');
const dotenv = require('dotenv');
const path = require('path');
const { makeRequest, parseMarkdown, serializeToMarkdown, starsFromRating, specsToString } = require('../../core');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const SB_API_BASE_URL = (process.env.SB_API_BASE_URL || 'https://notes.wohnli.com').replace(/\/$/, '');
const SB_AUTH_TOKEN = process.env.SB_AUTH_TOKEN;
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;
const FRONTEND_DIST = process.env.FRONTEND_DIST || path.join(__dirname, '../../../frontend/dist');

app.use(express.json({ limit: '1mb' }));

// Malformed JSON and oversized payloads must also answer JSON, not the HTML
// error page body-parser sends by default.
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Ungültiges JSON im Request-Body.' });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request-Body ist zu groß (Limit: 1mb).' });
  }
  next(err);
});
app.use(express.static(FRONTEND_DIST));

app.get('/api/config', (req, res) => {
  res.json({ silverBulletUrl: SB_API_BASE_URL });
});

// Helper function to make HTTP requests (proxied to core client)
function httpRequest(urlStr, options = {}) {
  return makeRequest(urlStr, SB_AUTH_TOKEN, options);
}

// Sanitizes the journey query param. Never throws: repeated params arrive as an
// array (first one wins) and anything that sanitizes to nothing falls back to 'bike'.
function getJourney(req) {
  const raw = req.query ? req.query.journey : undefined;
  const first = Array.isArray(raw) ? raw[0] : raw;
  const cleaned = String(first ?? 'bike').replace(/[^a-zA-Z0-9.-]/g, '');
  return cleaned || 'bike';
}

// API Routes
app.get('/api/journeys', async (req, res) => {
  try {
    const response = await httpRequest(`${SB_API_BASE_URL}/.fs`);
    if (response.statusCode !== 200) {
      return res.status(response.statusCode).json({ error: `SilverBullet error: ${response.statusMessage}` });
    }
    const files = JSON.parse(response.body);
    const journeys = files
      .map(f => f.name)
      .filter(name => name.endsWith('.buying-journey.md'))
      .map(name => name.slice(0, -'.buying-journey.md'.length));
    
    // Ensure 'bike' is in the list
    if (!journeys.includes('bike')) {
      journeys.unshift('bike');
    }
    res.json(journeys);
  } catch (error) {
    console.error('API GET Journeys Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/data', async (req, res) => {
  const journey = getJourney(req);
  const url = `${SB_API_BASE_URL}/.fs/${journey}.buying-journey.md`;
  try {
    const response = await httpRequest(url);
    if (response.statusCode === 404) {
      console.log(`${journey}.buying-journey.md note not found on SilverBullet. Initializing default...`);
      const isBike = journey === 'bike';
      const defaultData = {
        sectionTitle: isBike ? 'Bikes Under Consideration' : `${journey.toUpperCase()}s Under Consideration`,
        listTitle: isBike ? 'Rahmengrößen' : 'Spezifikationen',
        headers: ['Name', 'Price', 'Specs', 'Rating', 'Status', 'Notes', 'Link'],
        status: { phase: 'Planning', budget: '2500€', targetDate: '' },
        journey: [
          { date: new Date().toISOString().split('T')[0], event: `${journey.toUpperCase()} Buying Journey started.` }
        ],
        items: [],
        specs: [],
        generalNotes: `- Research ${journey} brands and models\n- Compare options`
      };
      
      // Save default to SB to bootstrap the note
      const markdown = serializeToMarkdown(defaultData, journey);
      await httpRequest(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/markdown' },
        body: markdown
      });
      
      return res.json(defaultData);
    }
    
    if (response.statusCode !== 200) {
      return res.status(response.statusCode).json({ error: `SilverBullet error: ${response.statusMessage}` });
    }
    
    const parsedData = parseMarkdown(response.body);
    res.json(parsedData);
  } catch (error) {
    console.error('API GET Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/data', async (req, res) => {
  const journey = getJourney(req);
  const url = `${SB_API_BASE_URL}/.fs/${journey}.buying-journey.md`;
  try {
    const data = req.body;
    if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'Request-Body muss ein nicht-leeres JSON-Objekt sein.' });
    }
    const markdown = serializeToMarkdown(data, journey);
    
    const response = await httpRequest(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/markdown' },
      body: markdown
    });
    
    if (response.statusCode >= 300) {
      return res.status(response.statusCode).json({ error: `SilverBullet error: ${response.statusMessage}` });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('API POST Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Sends a product URL to the n8n crawler and returns the extracted item
app.post('/api/import-link', async (req, res) => {
  const journey = getJourney(req);
  const { link } = req.body || {};

  if (!link || typeof link !== 'string') {
    return res.status(400).json({ error: 'Feld "link" ist erforderlich.' });
  }
  let parsedLink;
  try {
    parsedLink = new URL(link);
  } catch {
    return res.status(400).json({ error: 'Ungültige URL.' });
  }
  if (parsedLink.protocol !== 'http:' && parsedLink.protocol !== 'https:') {
    return res.status(400).json({ error: 'Nur http(s)-URLs werden unterstützt.' });
  }
  if (!N8N_WEBHOOK_URL) {
    return res.status(500).json({ error: 'N8N_WEBHOOK_URL ist nicht konfiguriert.' });
  }

  try {
    const n8nResponse = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: link, journey }),
      signal: AbortSignal.timeout(60000),
    });

    const rawBody = await n8nResponse.text();
    if (!n8nResponse.ok) {
      return res.status(502).json({ error: `n8n-Fehler (${n8nResponse.status}): ${rawBody.slice(0, 300)}` });
    }

    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return res.status(502).json({ error: 'n8n hat keine gültige JSON-Antwort geliefert.' });
    }
    // n8n webhook responses are sometimes wrapped in an array
    const productData = Array.isArray(payload) ? payload[0] : payload;

    if (!productData || !productData.name) {
      return res.status(502).json({ error: 'n8n hat kein verwertbares Produkt zurückgegeben.' });
    }

    const item = {
      name: productData.name,
      price: productData.price || '',
      specs: specsToString(productData.specs),
      rating: starsFromRating(productData.rating),
      status: productData.status || 'Thinking',
      notes: productData.notes || '',
      link: productData.link || link,
    };

    res.json({ item });
  } catch (error) {
    console.error('API Import-Link Error:', error);
    if (error.name === 'TimeoutError') {
      return res.status(504).json({ error: 'Zeitüberschreitung beim Warten auf n8n.' });
    }
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/feedback', async (req, res) => {
  const journey = getJourney(req);
  const url = `${SB_API_BASE_URL}/.fs/${journey}.buying-journey-feedback.md`;
  try {
    const response = await httpRequest(url);
    if (response.statusCode === 404) {
      const defaultContent = `# 💬 Feedback & Erfahrungsberichte\n\n- Hier persönliche Meinungen und Erfahrungsberichte eintragen...`;
      await httpRequest(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/markdown' },
        body: defaultContent
      });
      return res.json({ content: defaultContent });
    }
    
    if (response.statusCode !== 200) {
      return res.status(response.statusCode).json({ error: `SilverBullet error: ${response.statusMessage}` });
    }
    
    res.json({ content: response.body });
  } catch (error) {
    console.error('API GET Feedback Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/feedback', async (req, res) => {
  const journey = getJourney(req);
  const url = `${SB_API_BASE_URL}/.fs/${journey}.buying-journey-feedback.md`;
  try {
    const content = req.body ? req.body.content : undefined;
    if (typeof content !== 'string') {
      return res.status(400).json({ error: 'Feld "content" (String) ist erforderlich.' });
    }
    const response = await httpRequest(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/markdown' },
      body: content
    });
    
    if (response.statusCode >= 300) {
      return res.status(response.statusCode).json({ error: `SilverBullet error: ${response.statusMessage}` });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('API POST Feedback Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// SPA fallback: let the React router handle any other GET route
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(FRONTEND_DIST, 'index.html'), (err) => {
    if (err && !res.headersSent) {
      res.status(404).json({ error: 'Frontend wurde noch nicht gebaut (frontend/dist fehlt).' });
    }
  });
});

// Start Server only when run directly (requiring this module has no side effects,
// which keeps it usable from tests and other tooling).
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

module.exports = { app, getJourney };
