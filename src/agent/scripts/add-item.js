const { getData, saveData } = require('./utils.js');
const { starsFromRating } = require('../../core');

const args = process.argv.slice(2);
const params = {};

for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    const key = args[i].slice(2);
    let val = true;
    if (args[i+1] && !args[i+1].startsWith('--')) {
      val = args[i+1];
      i++;
    }
    params[key] = val;
  }
}

const name = params.name;
const journey = params.journey || 'bike';

if (!name) {
  console.error('❌ Fehler: Parameter --name ist erforderlich.');
  console.error('Verwendung: node add-item.js --name "Modellname" [--journey "bike"] [--price "Preis"] [--rating SterneAnzahl] [--status "Thinking|Shortlisted|Test Ridden|Rejected|Bought"] [weitere Attribute...]');
  process.exit(1);
}

async function main() {
  try {
    const data = await getData(journey);
    
    // Check if item already exists
    const existingIndex = data.items.findIndex(i => i.name.toLowerCase() === name.toLowerCase());
    
    const existingItem = existingIndex >= 0 ? data.items[existingIndex] : {};
    
    // Parse existing specs for merging
    const existingSpecs = {};
    const freeTextSpecs = [];
    
    if (existingItem.specs) {
      const parts = existingItem.specs.split(/<br\s*\/?>/i);
      parts.forEach(p => {
        const trimP = p.trim();
        if (!trimP) return;
        const colonIndex = trimP.indexOf(':');
        if (colonIndex > 0) {
          const k = trimP.substring(0, colonIndex).trim().toLowerCase();
          const v = trimP.substring(colonIndex + 1).trim();
          existingSpecs[k] = { originalKey: trimP.substring(0, colonIndex).trim(), value: v };
        } else {
          freeTextSpecs.push(trimP);
        }
      });
    }
    
    // Gather standard keys
    const itemData = {
      name: name
    };
    
    if (params.price !== undefined) itemData.price = params.price;
    if (params.status !== undefined) itemData.status = params.status;
    if (params.rating !== undefined) {
      itemData.rating = starsFromRating(params.rating);
    }
    if (params.notes !== undefined) itemData.notes = params.notes;
    if (params.link !== undefined) itemData.link = params.link;
    
    // Any extra keys are treated as specifications
    const standardKeys = ['name', 'price', 'rating', 'status', 'notes', 'link', 'journey', 'specs'];
    
    Object.keys(params).forEach(key => {
      if (standardKeys.includes(key)) return;
      
      const val = params[key];
      const keyLower = key.toLowerCase();
      const displayKey = key.charAt(0).toUpperCase() + key.slice(1);
      existingSpecs[keyLower] = { originalKey: displayKey, value: val };
    });
    
    // Handle explicit --specs parameter if provided (overwrites specs list)
    if (params.specs !== undefined) {
      itemData.specs = params.specs.replace(/\r?\n/g, ' <br> ');
    } else {
      // Reassemble the specs list
      const specLines = [];
      Object.keys(existingSpecs).forEach(k => {
        specLines.push(`${existingSpecs[k].originalKey}: ${existingSpecs[k].value}`);
      });
      freeTextSpecs.forEach(f => specLines.push(f));
      itemData.specs = specLines.join(' <br> ');
    }
    
    if (existingIndex >= 0) {
      // Update existing
      console.log(`Eintrag "${name}" gefunden. Aktualisiere Daten...`);
      data.items[existingIndex] = {
        ...data.items[existingIndex],
        ...Object.fromEntries(Object.entries(itemData).filter(([_, v]) => v !== ''))
      };
    } else {
      // Add new
      console.log(`Füge neuen Eintrag "${name}" hinzu...`);
      data.items.push(itemData);
    }
    
    // Force standard 7 headers
    data.headers = ['Name', 'Price', 'Specs', 'Rating', 'Status', 'Notes', 'Link'];
    
    await saveData(data, journey);
    console.log(`✅ Erfolgreich in der Kaufreise "${journey}" gespeichert!`);
  } catch (error) {
    console.error('❌ Fehler beim Speichern des Eintrags:', error.message);
    process.exit(1);
  }
}

main();
