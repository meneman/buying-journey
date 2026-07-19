const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

// Load environment variables
const envPath = path.resolve(__dirname, '../../../.env');
const env = {};
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf-8');
  content.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || '';
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
      env[key] = value;
    }
  });
}

const SB_API_BASE_URL = env.SB_API_BASE_URL || 'https://notes.wohnli.com';
const SB_AUTH_TOKEN = env.SB_AUTH_TOKEN || '';

// Resolve emoji based on journey type
function getJourneyEmoji(journey) {
  const j = (journey || '').toLowerCase();
  if (j.includes('bike') || j.includes('fahrrad') || j.includes('rad') || j.includes('rennrad') || j.includes('gravel')) return '🚲';
  if (j.includes('ev') || j.includes('car') || j.includes('auto') || j.includes('tesla') || j.includes('vehicle')) return '🚗';
  if (j.includes('laptop') || j.includes('computer') || j.includes('pc') || j.includes('notebook') || j.includes('macbook')) return '💻';
  if (j.includes('wohnung') || j.includes('haus') || j.includes('apartment') || j.includes('house') || j.includes('miete')) return '🏠';
  return '📦';
}

// Markdown parser (generic)
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
  
  const normalizedMd = md.replace(/\r\n/g, '\n');
  
  // Split by markdown second-level headers "##"
  const sections = normalizedMd.split(/\n##\s+/);
  
  sections.forEach((section, index) => {
    // Part 0 is the main title section
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
          data.journey.push({ date: logMatch[1].trim(), event: logMatch[2].trim() });
        } else if (line.trim().startsWith('-') && line.trim().length > 1) {
          data.journey.push({ date: '', event: line.replace(/^\s*-\s*/, '').trim() });
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

// Helper to make local server requests
function makeLocalRequest(path, method, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: env.PORT || 1337,
      path: path,
      method: method,
      headers: { 'Content-Type': 'application/json' }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 300) {
          reject(new Error(`Local server returned ${res.statusCode}: ${data}`));
        } else {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve(data);
          }
        }
      });
    });
    
    req.on('error', (err) => reject(err));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// Helper to make SilverBullet requests
function makeSilverBulletRequest(url, method, body = null) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const headers = {
      'Authorization': `Bearer ${SB_AUTH_TOKEN}`,
      'X-Sync-Mode': 'true'
    };
    if (body) {
      headers['Content-Type'] = 'text/markdown';
    }
    
    const req = client.request(url, {
      method: method,
      headers: headers
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          statusMessage: res.statusMessage,
          body: data
        });
      });
    });
    
    req.on('error', (err) => reject(err));
    if (body) req.write(body);
    req.end();
  });
}

// Get unified data
async function getData(journey = 'bike') {
  try {
    return await makeLocalRequest(`/api/data?journey=${encodeURIComponent(journey)}`, 'GET');
  } catch (localError) {
    console.log('Local server not responding. Accessing SilverBullet API directly...');
    const url = `${SB_API_BASE_URL}/.fs/${journey}.buying-journey.md`;
    const response = await makeSilverBulletRequest(url, 'GET');
    if (response.statusCode === 404) {
      return {
        status: { phase: 'Planning', budget: '', targetDate: '' },
        journey: [],
        items: [],
        specs: [],
        generalNotes: ''
      };
    }
    if (response.statusCode !== 200) {
      throw new Error(`SilverBullet API error ${response.statusCode}: ${response.statusMessage}`);
    }
    return parseMarkdown(response.body);
  }
}

// Save unified data
async function saveData(data, journey = 'bike') {
  try {
    await makeLocalRequest(`/api/data?journey=${encodeURIComponent(journey)}`, 'POST', data);
    console.log('Saved data to local server.');
  } catch (localError) {
    console.log('Local server not responding. Writing to SilverBullet API directly...');
    const url = `${SB_API_BASE_URL}/.fs/${journey}.buying-journey.md`;
    const markdown = serializeToMarkdown(data, journey);
    const response = await makeSilverBulletRequest(url, 'PUT', markdown);
    if (response.statusCode >= 300) {
      throw new Error(`SilverBullet API error ${response.statusCode}: ${response.statusMessage}`);
    }
    console.log('Saved data to SilverBullet successfully.');
  }
}

module.exports = {
  getData,
  saveData,
  parseMarkdown,
  serializeToMarkdown
};
