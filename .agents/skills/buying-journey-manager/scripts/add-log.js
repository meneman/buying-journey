const { getData, saveData } = require('./utils.js');

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

const event = params.event;
const date = params.date || new Date().toISOString().split('T')[0];
const journey = params.journey || 'bike';

if (!event) {
  console.error('❌ Fehler: Parameter --event ist erforderlich.');
  console.error('Verwendung: node add-log.js --event "Ereignis" [--journey "bike"] [--date "YYYY-MM-DD"]');
  process.exit(1);
}

async function main() {
  try {
    const data = await getData(journey);
    
    console.log(`Füge Tagebucheintrag zu "${journey}" hinzu: [${date}] ${event}`);
    
    data.journey.push({
      date,
      event
    });
    
    // Sort log by date descending
    data.journey.sort((a, b) => b.date.localeCompare(a.date));
    
    await saveData(data, journey);
    console.log(`✅ Erfolgreich im Reisetagebuch von "${journey}" gespeichert!`);
  } catch (error) {
    console.error('❌ Fehler beim Speichern des Tagebucheintrags:', error.message);
    process.exit(1);
  }
}

main();
