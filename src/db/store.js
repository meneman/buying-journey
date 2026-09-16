// SQLite-backed storage for buying journeys.
//
// Data model: a fixed relational core (journeys, logs, items) plus a schemaless
// JSON1 column `items.specs` for the heterogeneous per-journey attributes
// (bike: frame/weight/groupset …; laptop: cpu/ram/ssd …; EV: range/battery …).
// Specs are stored as a JSON array of {"k": key|null, "v": value} pairs so that
// order and free-text entries survive, and queried with json_each/json_extract.
//
// The REST wire format keeps the legacy "<br>"-joined specs string, so the
// frontend works unchanged; conversion happens here at the storage boundary.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

// Load .env for CLI usage (server.js loads dotenv itself; harmless if repeated).
try {
  require('dotenv').config();
} catch {
  /* dotenv is optional here */
}

const DEFAULT_DB_PATH = path.join(__dirname, '..', '..', 'data', 'app.db');

function resolveDbPath(explicit) {
  return explicit || process.env.DB_PATH || DEFAULT_DB_PATH;
}

function defaultJourneyRow(slug) {
  const isBike = slug === 'bike';
  return {
    slug,
    // Basis-Eigenschaften: Anzeigename startet als Slug, Kategorie bleibt leer
    // (Frontend leitet das Icon dann vom Slug ab), Währung mit €-Default.
    name: slug,
    description: '',
    category: '',
    currency: '€',
    section_title: isBike ? 'Bikes Under Consideration' : `${slug.toUpperCase()}s Under Consideration`,
    list_title: isBike ? 'Rahmengrößen' : 'Spezifikationen',
    phase: 'Planning',
    budget: isBike ? '2500€' : '',
    target_date: '',
    general_notes: `- Research ${slug} brands and models\n- Compare options`,
    feedback: '# 💬 Feedback & Erfahrungsberichte\n\n- Hier persönliche Meinungen und Erfahrungsberichte eintragen...',
  };
}

// Basis-Eigenschaften + Anzeige-Settings einer Journey (Config-Ressource).
// Maximallängen schützen vor versehentlichen Riesen-Strings; die API meldet
// Überschreitungen mit 400 statt still zu kürzen.
const CONFIG_LIMITS = {
  name: 80,
  description: 500,
  category: 40,
  currency: 10,
  sectionTitle: 120,
  listTitle: 120,
};

// Spaltenname in `journeys` je Config-Feld (camelCase der API -> snake_case).
const CONFIG_COLUMNS = {
  name: 'name',
  description: 'description',
  category: 'category',
  currency: 'currency',
  sectionTitle: 'section_title',
  listTitle: 'list_title',
};

function normalizeConfigField(key, value) {
  const trimmed = value.trim();
  if (key === 'category') return trimmed.toLowerCase();
  return trimmed;
}

// --- Specs conversion: wire string ("Key: Value <br> free text") <-> JSON array ---

function specsStringToJson(specs) {
  if (!specs) return '[]';
  if (typeof specs !== 'string') return '[]';
  const parts = specs
    .split(/<br\s*\/?>/i)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((part) => {
      const colon = part.indexOf(':');
      if (colon > 0) {
        return { k: part.slice(0, colon).trim(), v: part.slice(colon + 1).trim() };
      }
      return { k: null, v: part };
    });
  return JSON.stringify(parts);
}

function specsJsonToString(jsonText) {
  if (!jsonText) return '';
  let parts;
  try {
    parts = JSON.parse(jsonText);
  } catch {
    return String(jsonText);
  }
  if (!Array.isArray(parts)) return '';
  return parts
    .filter((p) => p && typeof p.v === 'string')
    .map((p) => (p.k ? `${p.k}: ${p.v}` : p.v))
    .join(' <br> ');
}

function openDatabase(dbPathExplicit) {
  const dbPath = resolveDbPath(dbPathExplicit);
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON');
  if (dbPath !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL');
  }

  // Per-User-Trennung: Jede Journey gehört genau einer Identität (owner_id —
  // Supabase-User-ID oder API-Key-User). Altdaten ohne Owner werden verworfen
  // (Benutzer-Entscheidung): Existiert die Tabelle noch im alten Schema ohne
  // owner_id, werden alle Journey-Tabellen gedroppt und im neuen Schema
  // (zusammengesetzter Schlüssel (owner_id, slug)) neu angelegt. Kindzeilen
  // verschwinden dabei per DROP mit — es bleibt nichts Verwaistes zurück.
  const legacyColumns = new Set(
    db.prepare(`PRAGMA table_info(journeys)`).all().map((c) => c.name)
  );
  if (legacyColumns.size > 0 && !legacyColumns.has('owner_id')) {
    db.exec(`
      DROP TABLE IF EXISTS items;
      DROP TABLE IF EXISTS journey_specs;
      DROP TABLE IF EXISTS journey_logs;
      DROP TABLE IF EXISTS journeys;
    `);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS journeys (
      owner_id TEXT NOT NULL,
      slug TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '',
      currency TEXT NOT NULL DEFAULT '',
      section_title TEXT NOT NULL DEFAULT 'Items Under Consideration',
      list_title TEXT NOT NULL DEFAULT 'Spezifikationen',
      phase TEXT NOT NULL DEFAULT 'Planning',
      budget TEXT NOT NULL DEFAULT '',
      target_date TEXT NOT NULL DEFAULT '',
      general_notes TEXT NOT NULL DEFAULT '',
      feedback TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (owner_id, slug)
    );
    CREATE TABLE IF NOT EXISTS journey_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id TEXT NOT NULL,
      journey_slug TEXT NOT NULL,
      date TEXT NOT NULL DEFAULT '',
      event TEXT NOT NULL DEFAULT '',
      position INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (owner_id, journey_slug) REFERENCES journeys(owner_id, slug) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS journey_specs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id TEXT NOT NULL,
      journey_slug TEXT NOT NULL,
      label TEXT NOT NULL DEFAULT '',
      value TEXT NOT NULL DEFAULT '',
      position INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (owner_id, journey_slug) REFERENCES journeys(owner_id, slug) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id TEXT NOT NULL,
      journey_slug TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT 'Unbenannt',
      price TEXT NOT NULL DEFAULT '',
      rating TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Thinking',
      notes TEXT NOT NULL DEFAULT '',
      link TEXT NOT NULL DEFAULT '',
      specs TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(specs)),
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (owner_id, journey_slug) REFERENCES journeys(owner_id, slug) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key_hash TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_used TEXT NOT NULL DEFAULT '',
      revoked INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_logs_journey ON journey_logs (owner_id, journey_slug, position);
    CREATE INDEX IF NOT EXISTS idx_specs_journey ON journey_specs (owner_id, journey_slug, position);
    CREATE INDEX IF NOT EXISTS idx_items_journey ON items (owner_id, journey_slug, position);
    CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys (key_hash);
    CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys (user_id);
  `);

  // Legt die Journey im Namensraum des Owners an (still, sofern fehlend).
  // Fremde Namensräume bleiben unberührt — gleiche Slugs verschiedener
  // User sind unabhängige Journeys.
  function ensureOwnedJourney(slug, owner) {
    const row = defaultJourneyRow(slug);
    db.prepare(
        `INSERT INTO journeys (owner_id, slug, name, description, category, currency, section_title, list_title, phase, budget, target_date, general_notes, feedback)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (owner_id, slug) DO NOTHING`
      )
      .run(
        owner,
        row.slug,
        row.name,
        row.description,
        row.category,
        row.currency,
        row.section_title,
        row.list_title,
        row.phase,
        row.budget,
        row.target_date,
        row.general_notes,
        row.feedback
      );
  }

  function rowToConfig(r) {
    return {
      slug: r.slug,
      name: r.name || r.slug,
      description: r.description || '',
      category: r.category || '',
      currency: r.currency || '',
      sectionTitle: r.section_title,
      listTitle: r.list_title,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  // Alle Funktionen in diesem Abschnitt sind owner-scoped: Der erste
  // Parameter `owner` (Supabase-User-ID oder API-Key-User) begrenzt jede
  // Abfrage auf den eigenen Namensraum. Fremde Journeys sind unsichtbar —
  // Aufrufer melden sie wie unbekannte Slugs.
  function requireOwner(owner) {
    if (typeof owner !== 'string' || !owner.trim()) {
      const err = new Error('Owner (User-ID) ist erforderlich.');
      err.code = 'OWNER_REQUIRED';
      throw err;
    }
    return owner;
  }

  function listJourneys(owner) {
    requireOwner(owner);
    return db
      .prepare('SELECT slug FROM journeys WHERE owner_id = ? ORDER BY slug')
      .all(owner)
      .map((r) => r.slug);
  }

  // Alle Journey-Configs für die Startseite (slug-sortiert, ohne Items/Logs —
  // keine N+1 Detail-Calls nötig).
  function listJourneyConfigs(owner) {
    requireOwner(owner);
    return db
      .prepare('SELECT * FROM journeys WHERE owner_id = ? ORDER BY slug')
      .all(owner)
      .map(rowToConfig);
  }

  // Basis-Eigenschaften + Settings einer Journey lesen (legt sie bei Bedarf
  // wie GET /api/data mit Defaults an).
  function getJourneyConfig(slug, owner) {
    requireOwner(owner);
    ensureOwnedJourney(slug, owner);
    return rowToConfig(
      db.prepare('SELECT * FROM journeys WHERE owner_id = ? AND slug = ?').get(owner, slug)
    );
  }

  // Partielles Config-Update: nur bekannte Felder, alle als String, Längen
  // begrenzt (CONFIG_LIMITS). Unbekannte Felder wirft CODE 'CONFIG_UNKNOWN_FIELD',
  // Typ-/Längenfehler 'CONFIG_INVALID' — die API mappt beides auf 400.
  function saveJourneyConfig(slug, owner, patch) {
    requireOwner(owner);
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      const err = new Error('Config-Patch muss ein Objekt sein.');
      err.code = 'CONFIG_INVALID';
      throw err;
    }
    const keys = Object.keys(patch);
    if (keys.length === 0) {
      const err = new Error('Config-Patch darf nicht leer sein.');
      err.code = 'CONFIG_INVALID';
      throw err;
    }
    ensureOwnedJourney(slug, owner);
    const sets = [];
    const values = [];
    for (const key of keys) {
      if (!Object.prototype.hasOwnProperty.call(CONFIG_COLUMNS, key)) {
        const err = new Error(`Unbekanntes Config-Feld "${key}".`);
        err.code = 'CONFIG_UNKNOWN_FIELD';
        throw err;
      }
      const raw = patch[key];
      if (typeof raw !== 'string') {
        const err = new Error(`Config-Feld "${key}" muss ein String sein.`);
        err.code = 'CONFIG_INVALID';
        throw err;
      }
      const normalized = normalizeConfigField(key, raw);
      if (normalized.length > CONFIG_LIMITS[key]) {
        const err = new Error(
          `Config-Feld "${key}" ist zu lang (max. ${CONFIG_LIMITS[key]} Zeichen).`
        );
        err.code = 'CONFIG_INVALID';
        throw err;
      }
      sets.push(`${CONFIG_COLUMNS[key]} = ?`);
      values.push(normalized);
    }
    db.prepare(
      `UPDATE journeys SET ${sets.join(', ')}, updated_at = datetime('now') WHERE owner_id = ? AND slug = ?`
    ).run(...values, owner, slug);
    return getJourneyConfig(slug, owner);
  }

  // Explicit creation (used by POST /api/journeys): inserts a new journey row
  // with defaults plus the given optional fields. Unlike ensureJourney, this
  // never silently keeps an existing row — a duplicate slug throws with code
  // 'JOURNEY_EXISTS'. The slug is expected pre-normalized (lowercase, safe
  // chars); validation happens at the API boundary.
  function createJourney(slug, owner, fields = {}) {
    requireOwner(owner);
    const row = defaultJourneyRow(slug);
    if (fields.name !== undefined) row.name = fields.name;
    if (fields.description !== undefined) row.description = fields.description;
    if (fields.category !== undefined) row.category = fields.category.trim().toLowerCase();
    if (fields.currency !== undefined) row.currency = fields.currency;
    if (fields.phase !== undefined) row.phase = fields.phase;
    if (fields.budget !== undefined) row.budget = fields.budget;
    if (fields.targetDate !== undefined) row.target_date = fields.targetDate;
    if (fields.generalNotes !== undefined) row.general_notes = fields.generalNotes;
    if (fields.sectionTitle !== undefined) row.section_title = fields.sectionTitle;
    if (fields.listTitle !== undefined) row.list_title = fields.listTitle;
    const exists = db
      .prepare('SELECT 1 FROM journeys WHERE owner_id = ? AND slug = ?')
      .get(owner, slug);
    if (exists) {
      const err = new Error(`Journey "${slug}" existiert bereits.`);
      err.code = 'JOURNEY_EXISTS';
      throw err;
    }
    db.prepare(
      `INSERT INTO journeys (owner_id, slug, name, description, category, currency, section_title, list_title, phase, budget, target_date, general_notes, feedback)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      owner,
      row.slug,
      row.name,
      row.description,
      row.category,
      row.currency,
      row.section_title,
      row.list_title,
      row.phase,
      row.budget,
      row.target_date,
      row.general_notes,
      row.feedback
    );
    return slug;
  }

  function getJourneyData(slug, owner) {
    requireOwner(owner);
    ensureOwnedJourney(slug, owner);
    const j = db
      .prepare('SELECT * FROM journeys WHERE owner_id = ? AND slug = ?')
      .get(owner, slug);
    // node:sqlite returns rows with a null prototype — normalize to plain
    // objects so the API shape is stable and deep-comparable.
    const journey = db
      .prepare(
        'SELECT date, event FROM journey_logs WHERE owner_id = ? AND journey_slug = ? ORDER BY position, id'
      )
      .all(owner, slug)
      .map((r) => ({ date: r.date, event: r.event }));
    const items = db
      .prepare(
        'SELECT name, price, rating, status, notes, link, specs FROM items WHERE owner_id = ? AND journey_slug = ? ORDER BY position, id'
      )
      .all(owner, slug)
      .map((item) => ({
        name: item.name,
        price: item.price,
        rating: item.rating,
        status: item.status,
        notes: item.notes,
        link: item.link,
        specs: specsJsonToString(item.specs),
      }));
    const specs = db
      .prepare(
        'SELECT label, value FROM journey_specs WHERE owner_id = ? AND journey_slug = ? ORDER BY position, id'
      )
      .all(owner, slug)
      .map((r) => ({ label: r.label, value: r.value }));
    return {
      status: { phase: j.phase, budget: j.budget, targetDate: j.target_date },
      journey,
      items,
      specs,
      generalNotes: j.general_notes,
      headers: ['Name', 'Price', 'Specs', 'Rating', 'Status', 'Notes', 'Link'],
      sectionTitle: j.section_title,
      listTitle: j.list_title,
    };
  }

  // Full-document replace (mirrors the old whole-file markdown writes).
  function saveJourneyData(slug, owner, data) {
    requireOwner(owner);
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('Journey data must be an object.');
    }
    ensureOwnedJourney(slug, owner);
    const status = data.status || {};
    db.exec('BEGIN');
    try {
      db.prepare(
        `UPDATE journeys SET section_title = ?, list_title = ?, phase = ?, budget = ?,
         target_date = ?, general_notes = ?, updated_at = datetime('now') WHERE owner_id = ? AND slug = ?`
      ).run(
        data.sectionTitle || 'Items Under Consideration',
        data.listTitle || 'Spezifikationen',
        status.phase || 'Planning',
        status.budget || '',
        status.targetDate || '',
        data.generalNotes || '',
        owner,
        slug
      );
      db.prepare('DELETE FROM journey_logs WHERE owner_id = ? AND journey_slug = ?').run(owner, slug);
      const insertLog = db.prepare(
        'INSERT INTO journey_logs (owner_id, journey_slug, date, event, position) VALUES (?, ?, ?, ?, ?)'
      );
      (data.journey || []).forEach((entry, i) => {
        insertLog.run(owner, slug, entry.date || '', entry.event || '', i);
      });
      db.prepare('DELETE FROM journey_specs WHERE owner_id = ? AND journey_slug = ?').run(owner, slug);
      const insertSpec = db.prepare(
        'INSERT INTO journey_specs (owner_id, journey_slug, label, value, position) VALUES (?, ?, ?, ?, ?)'
      );
      (data.specs || []).forEach((spec, i) => {
        insertSpec.run(owner, slug, spec.label || '', spec.value || '', i);
      });
      db.prepare('DELETE FROM items WHERE owner_id = ? AND journey_slug = ?').run(owner, slug);
      const insertItem = db.prepare(
        `INSERT INTO items (owner_id, journey_slug, name, price, rating, status, notes, link, specs, position)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, json(?), ?)`
      );
      (data.items || []).forEach((item, i) => {
        insertItem.run(
          owner,
          slug,
          item.name || 'Unbenannt',
          item.price || '',
          item.rating || '',
          item.status || 'Thinking',
          item.notes || '',
          item.link || '',
          specsStringToJson(item.specs),
          i
        );
      });
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }

  function getFeedback(slug, owner) {
    requireOwner(owner);
    ensureOwnedJourney(slug, owner);
    return db
      .prepare('SELECT feedback FROM journeys WHERE owner_id = ? AND slug = ?')
      .get(owner, slug).feedback;
  }

  function saveFeedback(slug, owner, content) {
    requireOwner(owner);
    if (typeof content !== 'string') {
      throw new Error('Feedback content must be a string.');
    }
    ensureOwnedJourney(slug, owner);
    db.prepare(
      "UPDATE journeys SET feedback = ?, updated_at = datetime('now') WHERE owner_id = ? AND slug = ?"
    ).run(content, owner, slug);
  }

  // Example JSON1 access: all values stored under one spec key within a journey.
  function specValues(slug, owner, key) {
    requireOwner(owner);
    return db
      .prepare(
        `SELECT items.name AS name, json_extract(j.value, '$.v') AS value
         FROM items, json_each(items.specs) AS j
         WHERE items.owner_id = ?
           AND items.journey_slug = ?
           AND lower(json_extract(j.value, '$.k')) = lower(?)
         ORDER BY items.position, items.id`
      )
      .all(owner, slug, key)
      .map((r) => ({ name: r.name, value: r.value }));
  }

  // --- Langlebige API-Keys (MCP-Auth, ein Key = ein User) ---
  //
  // Der Klartext-Key (`bj_` + 64 Hex-Zeichen) wird genau einmal bei der
  // Erzeugung zurückgegeben und danach nie wieder lesbar gespeichert — in
  // der DB liegt nur der SHA-256-Hash. Prüfung daher per Hash-Vergleich.
  function hashApiKey(plaintext) {
    return crypto.createHash('sha256').update(String(plaintext), 'utf8').digest('hex');
  }

  function isApiKeyFormat(token) {
    return typeof token === 'string' && /^bj_[0-9a-fA-F]{64}$/.test(token.trim());
  }

  // Erzeugt einen Key für `userId` und gibt den Klartext genau einmal zurück.
  // Wer den Key verliert, widerruft ihn und erzeugt einen neuen.
  function createApiKey(userId, name) {
    if (typeof userId !== 'string' || !userId.trim()) {
      const err = new Error('userId (nicht-leerer String) ist erforderlich.');
      err.code = 'API_KEY_USER_INVALID';
      throw err;
    }
    const cleanName = String(name ?? '').trim().slice(0, 80);
    const key = `bj_${crypto.randomBytes(32).toString('hex')}`;
    const info = db
      .prepare('INSERT INTO api_keys (key_hash, user_id, name) VALUES (?, ?, ?)')
      .run(hashApiKey(key), userId.trim(), cleanName);
    return { id: Number(info.lastInsertRowid), key, userId: userId.trim(), name: cleanName };
  }

  function listApiKeys(userId) {
    requireOwner(userId);
    return db
      .prepare(
        'SELECT id, name, created_at, last_used FROM api_keys WHERE user_id = ? AND revoked = 0 ORDER BY id'
      )
      .all(userId);
  }

  // Widerruft einen Key des eigenen Users. Fremde Key-IDs melden `false`
  // (kein Unterschied zu "gibt es nicht" — keine Aufzählungshilfe).
  function revokeApiKey(userId, id) {
    requireOwner(userId);
    const info = db
      .prepare('UPDATE api_keys SET revoked = 1 WHERE id = ? AND user_id = ? AND revoked = 0')
      .run(Number(id), userId);
    return info.changes > 0;
  }

  // Löst einen Klartext-Key zur Owner-Identität auf (oder null). Aktualisiert
  // bei Treffer `last_used`. Formatfremde Tokens kosten keine DB-Abfrage.
  function findApiKeyOwner(plaintext) {
    if (!isApiKeyFormat(plaintext)) return null;
    const row = db
      .prepare('SELECT id, user_id, name FROM api_keys WHERE key_hash = ? AND revoked = 0')
      .get(hashApiKey(plaintext.trim()));
    if (!row) return null;
    db.prepare('UPDATE api_keys SET last_used = datetime(\'now\') WHERE id = ?').run(row.id);
    return { userId: row.user_id, name: row.name, keyId: row.id };
  }

  function close() {
    db.close();
  }

  return {
    path: dbPath,
    listJourneys,
    listJourneyConfigs,
    getJourneyConfig,
    saveJourneyConfig,
    createJourney,
    getJourneyData,
    saveJourneyData,
    getFeedback,
    saveFeedback,
    specValues,
    hashApiKey,
    isApiKeyFormat,
    createApiKey,
    listApiKeys,
    revokeApiKey,
    findApiKeyOwner,
    close,
  };
}

module.exports = { openDatabase, specsStringToJson, specsJsonToString, resolveDbPath };
