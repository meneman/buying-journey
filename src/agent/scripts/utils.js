// Data access for the CLI agent scripts. Talks directly to the local SQLite
// database (same store as the backend) — no running server required.
//
// Owner-Trennung: Jeder Aufruf braucht den User (`owner`), dessen Namensraum
// gelesen/geschrieben wird — gleiche Slugs verschiedener User sind
// unabhängige Journeys.
const { openDatabase } = require('../../db/store.js');

let store = null;
function getStore() {
  if (!store) store = openDatabase();
  return store;
}

function requireOwner(owner) {
  const clean = typeof owner === 'string' ? owner.trim() : '';
  if (!clean) {
    throw new Error('User fehlt: --user <user-id> angeben (z.B. --user jakob).');
  }
  return clean;
}

// Get unified data (same JourneyData shape as the /api/data endpoint).
async function getData(journey = 'bike', owner) {
  return getStore().getJourneyData(journey, requireOwner(owner));
}

// Save unified data.
async function saveData(data, journey = 'bike', owner) {
  getStore().saveJourneyData(journey, requireOwner(owner), data);
  console.log('Saved data to SQLite.');
}

module.exports = {
  getData,
  saveData,
};
