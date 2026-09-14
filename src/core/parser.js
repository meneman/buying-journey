// Resolve emoji based on journey type
function getJourneyEmoji(journey) {
  const j = (journey || '').toLowerCase();
  if (j.includes('bike') || j.includes('fahrrad') || j.includes('rad') || j.includes('rennrad') || j.includes('gravel')) return '🚲';
  if (j.includes('ev') || j.includes('car') || j.includes('auto') || j.includes('tesla') || j.includes('vehicle')) return '🚗';
  if (j.includes('laptop') || j.includes('computer') || j.includes('pc') || j.includes('notebook') || j.includes('macbook')) return '💻';
  if (j.includes('wohnung') || j.includes('haus') || j.includes('apartment') || j.includes('house') || j.includes('miete')) return '🏠';
  return '📦';
}

// Splits one markdown-table line into cells: divides on unescaped pipes only,
// drops blank edge cells from leading/trailing pipes (tolerating rows without
// edge pipes from hand-edited notes) and restores `\|` to literal pipes.
function splitRow(line) {
  const cells = line.split(/(?<!\\)\|/).map((cell) => cell.trim());
  if (cells.length > 0 && cells[0] === '') cells.shift();
  if (cells.length > 0 && cells[cells.length - 1] === '') cells.pop();
  return cells.map((cell) => cell.replace(/\\\|/g, '|'));
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
            rawHeaders = splitRow(line);
            continue;
          }

          if (line.includes('|')) {
            const parts = splitRow(line);
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

module.exports = { getJourneyEmoji, parseMarkdown };
