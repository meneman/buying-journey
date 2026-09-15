// Data access for the CLI agent scripts. Talks directly to the local SQLite
// database (same store as the backend) — no running server required.
const { openDatabase } = require('../../db/store.js');

let store = null;
function getStore() {
  if (!store) store = openDatabase();
  return store;
}

// Get unified data (same JourneyData shape as the /api/data endpoint).
async function getData(journey = 'bike') {
  return getStore().getJourneyData(journey);
}

// Save unified data.
async function saveData(data, journey = 'bike') {
  getStore().saveJourneyData(journey, data);
  console.log('Saved data to SQLite.');
}

module.exports = {
  getData,
  saveData,
};
