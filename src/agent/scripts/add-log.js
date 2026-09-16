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
const user = typeof params.user === 'string' ? params.user.trim() : '';

if (!event) {
  console.error('❌ Fehler: Parameter --event ist erforderlich.');
  console.error('Verwendung: node add-log.js --user "jakob" --event "Ereignis" [--journey "bike"] [--date "YYYY-MM-DD"]');
  process.exit(1);
}

if (!user) {
  console.error('❌ Fehler: Parameter --user ist erforderlich (Owner-Trennung, z.B. --user jakob).');
  process.exit(1);
}

async function main() {
  try {
    const data = await getData(journey, user);
    data.journey = data.journey || [];

    console.log(`Füge Tagebucheintrag zu "${journey}" hinzu: [${date}] ${event}`);

    data.journey.push({
      date,
      event
    });

    // Sort log by date descending (dateless entries sort last, never crash)
    data.journey.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    
    await saveData(data, journey, user);
    console.log(`✅ Erfolgreich im Reisetagebuch von "${journey}" (User "${user}") gespeichert!`);
  } catch (error) {
    console.error('❌ Fehler beim Speichern des Tagebucheintrags:', error.message);
    process.exit(1);
  }
}

main();
