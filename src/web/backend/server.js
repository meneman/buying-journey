const express = require('express');
const dotenv = require('dotenv');
const path = require('path');
const { makeRequest, parseMarkdown, serializeToMarkdown } = require('../../core');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const SB_API_BASE_URL = (process.env.SB_API_BASE_URL || 'https://notes.wohnli.com').replace(/\/$/, '');
const SB_AUTH_TOKEN = process.env.SB_AUTH_TOKEN;

app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Helper function to make HTTP requests (proxied to core client)
function httpRequest(urlStr, options = {}) {
  return makeRequest(urlStr, SB_AUTH_TOKEN, options);
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
  const journey = (req.query.journey || 'bike').replace(/[^a-zA-Z0-9.-]/g, '');
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
  const journey = (req.query.journey || 'bike').replace(/[^a-zA-Z0-9.-]/g, '');
  const url = `${SB_API_BASE_URL}/.fs/${journey}.buying-journey.md`;
  try {
    const data = req.body;
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

app.get('/api/feedback', async (req, res) => {
  const journey = (req.query.journey || 'bike').replace(/[^a-zA-Z0-9.-]/g, '');
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
  const journey = (req.query.journey || 'bike').replace(/[^a-zA-Z0-9.-]/g, '');
  const url = `${SB_API_BASE_URL}/.fs/${journey}.buying-journey-feedback.md`;
  try {
    const { content } = req.body;
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

// Start Server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
