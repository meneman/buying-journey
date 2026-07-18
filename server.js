const express = require('express');
const dotenv = require('dotenv');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const SB_API_BASE_URL = (process.env.SB_API_BASE_URL || 'https://notes.wohnli.com').replace(/\/$/, '');
const SB_AUTH_TOKEN = process.env.SB_AUTH_TOKEN;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper function to make HTTP requests
function httpRequest(urlStr, options = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(urlStr);
    const protocol = parsedUrl.protocol === 'https:' ? https : http;
    const headers = { ...options.headers };
    const method = options.method || 'GET';
    
    if (SB_AUTH_TOKEN) {
      headers['Authorization'] = `Bearer ${SB_AUTH_TOKEN}`;
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
    
    if (options.body !== undefined) {
      req.write(options.body);
    }
    req.end();
  });
}

// Resolve emoji based on journey type
function getJourneyEmoji(journey) {
  const j = (journey || '').toLowerCase();
  if (j.includes('bike') || j.includes('fahrrad') || j.includes('rad') || j.includes('rennrad') || j.includes('gravel')) return '🚲';
  if (j.includes('ev') || j.includes('car') || j.includes('auto') || j.includes('tesla') || j.includes('vehicle')) return '🚗';
  if (j.includes('laptop') || j.includes('computer') || j.includes('pc') || j.includes('notebook') || j.includes('macbook')) return '💻';
  if (j.includes('wohnung') || j.includes('haus') || j.includes('apartment') || j.includes('house') || j.includes('miete')) return '🏠';
  return '📦';
}

// Markdown parser
function parseMarkdown(md) {
  const data = {
    status: { phase: 'Planning', budget: '', targetDate: '' },
    journey: [],
    items: [],
    specs: [],
    generalNotes: '',
    headers: ['Name', 'Price', 'Specs', 'Rating', 'Status', 'Notes', 'Link'],
    sectionTitle: 'Items Under Consideration',
    listTitle: 'Spezifikationen'
  };
  
  if (!md) return data;
  
  // Normalize newlines
  const normalizedMd = md.replace(/\r\n/g, '\n');
  
  // Split by markdown second-level headers "##"
  const sections = normalizedMd.split(/\n##\s+/);
  
  sections.forEach((section, index) => {
    // Part 0 is the main title section (before the first ##)
    if (index === 0) return;
    
    const lines = section.split('\n');
    const headerLine = lines[0].trim();
    const content = lines.slice(1).join('\n').trim();
    
    // Remove leading emoji / icons from header label
    const cleanHeader = headerLine.replace(/^[^\w\s\däöüÄÖÜß]+\s*/, '').trim();
    const headerLower = cleanHeader.toLowerCase();
    
    if (headerLower.includes('status')) {
      const statusLines = content.split('\n');
      for (let line of statusLines) {
        const phaseMatch = line.match(/-\s+\*\*Phase\*\*:\s*(.*)/i) || line.match(/Phase:\s*(.*)/i);
        const budgetMatch = line.match(/-\s+\*\*Budget\*\*:\s*(.*)/i) || line.match(/Budget:\s*(.*)/i);
        const dateMatch = line.match(/-\s+\*\*Target Date\*\*:\s*(.*)/i) || line.match(/Target Date:\s*(.*)/i);
        
        if (phaseMatch) data.status.phase = phaseMatch[1].trim();
        if (budgetMatch) data.status.budget = budgetMatch[1].trim();
        if (dateMatch) data.status.targetDate = dateMatch[1].trim();
      }
    } else if (headerLower.includes('journey log') || headerLower.includes('tagebuch')) {
      const logLines = content.split('\n');
      for (let line of logLines) {
        const logMatch = line.match(/^\s*-\s+\*\*(.*?)\*\*:\s*(.*)/);
        if (logMatch) {
          data.journey.push({
            date: logMatch[1].trim(),
            event: logMatch[2].trim()
          });
        } else if (line.trim().startsWith('-') && line.trim().length > 1) {
          data.journey.push({
            date: '',
            event: line.replace(/^\s*-\s*/, '').trim()
          });
        }
      }
    } else if (headerLower.includes('general notes') || headerLower.includes('notizen')) {
      data.generalNotes = content;
    } else if (headerLower.includes('rahmengrößen') || headerLower.includes('spezifikationen') || headerLower.includes('eigenschaften') || headerLower.includes('properties')) {
      data.listTitle = cleanHeader;
      const specLines = content.split('\n');
      for (let line of specLines) {
        const match = line.match(/^\s*-\s+\*\*(.*?)\*\*:\s*(.*)/);
        if (match) {
          data.specs.push({
            label: match[1].trim(),
            value: match[2].trim()
          });
        }
      }
    } else {
      if (content.includes('|')) {
        data.sectionTitle = cleanHeader;
        const tableLines = content.split('\n');
        let rawHeaders = [];
        
        for (let line of tableLines) {
          if (line.includes('|') && line.includes(':---')) continue;
          
          if (line.includes('|') && rawHeaders.length === 0) {
            rawHeaders = line.split('|').map(h => h.trim()).filter((h, i, arr) => i > 0 && i < arr.length - 1);
            continue;
          }
          
          if (line.includes('|')) {
            const parts = line.split('|').map(p => p.trim()).filter((p, i, arr) => i > 0 && i < arr.length - 1);
            if (parts.length >= rawHeaders.length) {
              const item = {};
              const specParts = [];
              
              rawHeaders.forEach((header, index) => {
                const key = header.toLowerCase().replace(/[^a-z0-9]/g, '');
                let value = parts[index] || '';
                if (key === 'link' && value) {
                  const linkMatch = value.match(/\[.*?\]\((.*?)\)/);
                  if (linkMatch) {
                    value = linkMatch[1];
                  }
                }
                
                if (key === 'name') {
                  item.name = value;
                } else if (key === 'price' || key === 'preis') {
                  item.price = value;
                } else if (key === 'rating' || key === 'bewertung') {
                  item.rating = value;
                } else if (key === 'status') {
                  item.status = value;
                } else if (key === 'notes' || key === 'notizen') {
                  item.notes = value;
                } else if (key === 'link') {
                  item.link = value;
                } else if (key === 'specs' || key === 'spezifikationen') {
                  item.specs = value;
                } else {
                  if (value && value !== 'k.A.' && value !== '—') {
                    specParts.push(`${header}: ${value}`);
                  }
                }
              });
              
              if (specParts.length > 0) {
                const combinedSpecs = specParts.join(' <br> ');
                if (item.specs) {
                  item.specs += ' <br> ' + combinedSpecs;
                } else {
                  item.specs = combinedSpecs;
                }
              }
              
              if (!item.name) item.name = 'Unbenannt';
              if (!item.specs) item.specs = '';
              
              data.items.push(item);
            }
          }
        }
      }
    }
  });
  
  return data;
}

// Markdown Serializer
function serializeToMarkdown(data, journey = 'bike') {
  const emoji = getJourneyEmoji(journey);
  let md = `# ${emoji} ${data.sectionTitle || 'Kauf'} Journey\n\n`;
  
  md += `## 🎯 Status\n`;
  md += `- **Phase**: ${data.status.phase || 'Planning'}\n`;
  md += `- **Budget**: ${data.status.budget || ''}\n`;
  md += `- **Target Date**: ${data.status.targetDate || ''}\n\n`;
  
  md += `## 🗺️ Journey Log\n`;
  for (let entry of data.journey) {
    if (entry.date) {
      md += `- **${entry.date}**: ${entry.event}\n`;
    } else {
      md += `- ${entry.event}\n`;
    }
  }
  md += `\n`;
  
  md += `## ${emoji} ${data.sectionTitle || 'Items Under Consideration'}\n`;
  const headers = ['Name', 'Price', 'Specs', 'Rating', 'Status', 'Notes', 'Link'];
  md += `| ${headers.join(' | ')} |\n`;
  md += `| ${headers.map(() => ':---').join(' | ')} |\n`;
  for (let item of data.items) {
    const rowParts = headers.map(header => {
      const key = header.toLowerCase().replace(/[^a-z0-9]/g, '');
      let value = item[key] || '';
      
      if (key === 'specs' && value) {
        value = value.replace(/\r?\n/g, ' <br> ');
      }
      
      if (key === 'link' && value) {
        return `[Link](${value})`;
      }
      return value;
    });
    md += `| ${rowParts.join(' | ')} |\n`;
  }
  md += `\n`;
  
  if (data.specs && data.specs.length > 0) {
    md += `## 📏 ${data.listTitle || 'Spezifikationen'}\n`;
    for (let spec of data.specs) {
      md += `- **${spec.label}**: ${spec.value}\n`;
    }
    md += `\n`;
  }
  
  md += `## 📝 General Notes\n`;
  md += `${data.generalNotes || ''}\n`;
  
  return md;
}

// API Routes
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
