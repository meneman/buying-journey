'use strict';
// Gemeinsame MCP-Konstanten für den stdio-Server (`server.js`) und den
// HTTP-Status-Endpunkt (`GET /api/mcp-status` in src/web/backend/server.js).
// Einzige Quelle für Name/Version/Protokoll + Tool-Liste (jeweils mit
// name, description UND inputSchema). CommonJS, keine Dependencies.

const SERVER_INFO = { name: 'journey-path', version: '1.0.0' };
const PROTOCOL_VERSION = '2024-11-05';

const ITEM_STATUSES = ['Thinking', 'Shortlisted', 'Test Ridden', 'Rejected', 'Bought'];
const PHASES = ['Planning', 'Researching', 'Test Riding', 'Comparing', 'Decision', 'Purchased'];
const JOURNEY_CATEGORIES = ['fahrrad', 'e-auto', 'laptop', 'haushalt', 'immobilie', 'sonstiges'];
const CONFIG_FIELDS = ['name', 'description', 'category', 'currency', 'sectionTitle', 'listTitle'];

const TOOL_DEFS = [
  {
    name: 'journey.help',
    description:
      'Zeigt eine kompakte Anleitung zu allen verfügbaren MCP-Tools, typischen Arbeitsabläufen, gültigen Status-/Phasen-Werten und Konventionen für Produkt-Specs.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'journey.list',
    description:
      'Listet alle vorhandenen Buying Journeys des angemeldeten Users (Slug, Name, Kategorie, Beschreibung). Nur Lesen.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'journey.create',
    description:
      'Legt eine neue Buying Journey ohne URL-Crawl an. Slug ist Pflicht; Name, Kategorie, Beschreibung, Währung, Phase, Budget, Zieldatum und Notizen sind optional.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Eindeutiges Journey-Kürzel, z.B. "laptop" oder "gravel-bike"' },
        name: { type: 'string', description: 'Anzeigename der Kaufreise' },
        description: { type: 'string', description: 'Kurzbeschreibung / Suchkriterien' },
        category: { type: 'string', description: `Kategorie, z.B. ${JOURNEY_CATEGORIES.join(', ')}` },
        currency: { type: 'string', description: 'Währungssymbol, z.B. "€"' },
        phase: { type: 'string', description: 'Aktuelle Kauf-Phase', enum: PHASES },
        budget: { type: 'string', description: 'Budgetrahmen als Freitext, z.B. "2500€"' },
        targetDate: { type: 'string', description: 'Zieldatum im Format YYYY-MM-DD' },
        generalNotes: { type: 'string', description: 'Allgemeine Notizen / Kriterien (Markdown)' },
        sectionTitle: { type: 'string', description: 'Überschrift der Produktliste' },
        listTitle: { type: 'string', description: 'Überschrift der journey-weiten Eigenschaften' },
      },
      required: ['slug'],
    },
  },
  {
    name: 'journey.update_config',
    description:
      'Aktualisiert Basis-Eigenschaften und Anzeige-Einstellungen einer bestehenden Buying Journey partiell (legt keine neue Journey an).',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Journey-Kürzel, z.B. "bike"' },
        name: { type: 'string', description: 'Anzeigename der Kaufreise' },
        description: { type: 'string', description: 'Kurzbeschreibung' },
        category: { type: 'string', description: `Kategorie, z.B. ${JOURNEY_CATEGORIES.join(', ')}` },
        currency: { type: 'string', description: 'Währungssymbol, z.B. "€"' },
        sectionTitle: { type: 'string', description: 'Überschrift der Produktliste' },
        listTitle: { type: 'string', description: 'Überschrift der journey-weiten Eigenschaften' },
      },
      required: ['slug'],
    },
  },
  {
    name: 'journey.delete',
    description:
      'Löscht eine Buying Journey des Users unwiderruflich inklusive aller zugehörigen Produkte, Tagebucheinträge und Eigenschaften.',
    inputSchema: {
      type: 'object',
      properties: { slug: { type: 'string', description: 'Journey-Kürzel der zu löschenden Journey' } },
      required: ['slug'],
    },
  },
  {
    name: 'journey.get',
    description:
      'Liest eine Buying Journey (Status, Logs, Items, Specs, Notizen, Feedback, Config, Kriterien). Ohne Optionen Voll-Dokument; mit status/search/sort/limit/offset/fields selektiv filtern. Nur Lesen, legt nichts an.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Journey-Kürzel, z.B. "bike"' },
        status: { type: 'string', description: 'Status-Filter, z.B. "Thinking" (mehrere per Komma)' },
        search: { type: 'string', description: 'Substring-Suche ueber Name, Notizen, Specs' },
        sort: { type: 'string', description: 'Sortierung', enum: ['position', 'price', 'rating', 'name'] },
        dir: { type: 'string', description: 'Richtung', enum: ['asc', 'desc'] },
        limit: { type: 'number', description: 'Max. Items 1..200', minimum: 1, maximum: 200 },
        offset: { type: 'number', description: 'Offset >= 0', minimum: 0 },
        fields: { type: 'string', description: 'Kommaliste, z.B. "items,status"' },
        includeSpecComparison: { type: 'boolean', description: 'specComparison mitschicken' },
        includeFeedback: { type: 'boolean', description: 'Feedback mitschicken' },
        includeConfig: { type: 'boolean', description: 'Config mitschicken' },
      },
      required: ['slug'],
    },
  },
  {
    name: 'journey.compare',
    description:
      'Vergleicht alle (oder gefilterte) Produkte einer Journey: Preisspanne, Scores, gemeinsame vs. einzelne Eigenschaften, Luecken. Lesend, schreibt nichts.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Journey-Kürzel, z.B. "bike"' },
        status: { type: 'string', description: 'Status-Filter, z.B. "Thinking"' },
        sort: { type: 'string', description: 'Sortierung', enum: ['position', 'price', 'rating', 'name'] },
        dir: { type: 'string', description: 'Richtung', enum: ['asc', 'desc'] },
      },
      required: ['slug'],
    },
  },
  {
    name: 'journey.shortlist',
    description:
      'Top-N nach deterministischem Score (Rating, Preis, Pro/Contra, Kriterien) plus Budget-Urteil. Lesend, aendert keinen Status.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Journey-Kürzel, z.B. "bike"' },
        n: { type: 'number', description: 'Anzahl 1..10 (Default 3)', minimum: 1, maximum: 10 },
        status: { type: 'string', description: 'Status-Filter (Default alle ausser Rejected)' },
      },
      required: ['slug'],
    },
  },
  {
    name: 'journey.price_history',
    description: 'Preisverlauf eines Produkts (neueste zuerst). Lesend.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Journey-Kürzel, z.B. "bike"' },
        name: { type: 'string', description: 'Produktname' },
        limit: { type: 'number', description: 'Max. Eintraege 1..100 (Default 20)', minimum: 1, maximum: 100 },
      },
      required: ['slug', 'name'],
    },
  },
  {
    name: 'journey.set_criteria',
    description: 'Gewichtet ein Vergleichskriterium (Spec-Key oder price|rating) mit 1..5.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Journey-Kürzel, z.B. "bike"' },
        key: { type: 'string', description: 'Kriterien-Key, z.B. "Gewicht" oder "price"' },
        weight: { type: 'number', description: 'Gewicht 1..5', minimum: 1, maximum: 5 },
      },
      required: ['slug', 'key', 'weight'],
    },
  },
  {
    name: 'journey.delete_criteria',
    description: 'Entfernt ein Vergleichskriterium.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Journey-Kürzel, z.B. "bike"' },
        key: { type: 'string', description: 'Kriterien-Key' },
      },
      required: ['slug', 'key'],
    },
  },
  {
    name: 'journey.add_item',
    description:
      'Legt ein Produkt in einer Buying Journey an oder aktualisiert es (Upsert anhand des Namens, Groß-/Kleinschreibung wird ignoriert). Legt keine neue Journey an.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Journey-Kürzel, z.B. "bike"' },
        name: { type: 'string', description: 'Produktname (Pflicht, legt die Upsert-Identität fest)' },
        price: { type: 'string', description: 'Preis als Freitext, z.B. "1499€"' },
        priceAmount: { type: 'number', description: 'Strukturierter Betrag (gewinnt ueber Parser)' },
        priceCurrency: { type: 'string', description: 'ISO-Code, z.B. "EUR"' },
        priceQualifier: { type: 'string', description: 'Qualifier, z.B. "ab"' },
        rating: { type: 'number', description: 'Bewertung 0-5 (wird in ⭐-Format umgewandelt)', minimum: 0, maximum: 5 },
        status: { type: 'string', description: 'Status des Eintrags', enum: ITEM_STATUSES },
        notes: { type: 'string', description: 'Notizen zum Eintrag' },
        link: { type: 'string', description: 'Produkt-URL' },
        specs: {
          type: 'object',
          description: 'Freie technische Vergleichskriterien, z.B. {"weight": "15.8 kg"}',
          additionalProperties: { type: 'string' },
        },
        pros: { type: 'array', description: 'Pro-Liste (max. 20 x 200 Zeichen)', items: { type: 'string' } },
        cons: { type: 'array', description: 'Contra-Liste (max. 20 x 200 Zeichen)', items: { type: 'string' } },
      },
      required: ['slug', 'name'],
    },
  },
  {
    name: 'journey.delete_item',
    description:
      'Entfernt ein Produkt anhand seines Namens (case-insensitiv) aus einer bestehenden Buying Journey.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Journey-Kürzel, z.B. "bike"' },
        name: { type: 'string', description: 'Name des zu löschenden Produkts' },
      },
      required: ['slug', 'name'],
    },
  },
  {
    name: 'journey.update_meta',
    description:
      'Aktualisiert Status-Metadaten (Phase, Budget, Zieldatum) und/oder allgemeine Notizen einer bestehenden Buying Journey.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Journey-Kürzel, z.B. "bike"' },
        phase: { type: 'string', description: 'Aktuelle Kauf-Phase', enum: PHASES },
        budget: { type: 'string', description: 'Budgetrahmen als Freitext, z.B. "2500€"' },
        targetDate: { type: 'string', description: 'Zieldatum im Format YYYY-MM-DD (leer "" zum Löschen)' },
        generalNotes: { type: 'string', description: 'Allgemeine Notizen / Kriterien (Markdown)' },
      },
      required: ['slug'],
    },
  },
  {
    name: 'journey.add_log',
    description:
      'Fügt einen Meilenstein-Eintrag ins Reisetagebuch einer Buying Journey ein und sortiert chronologisch (neueste zuerst).',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Journey-Kürzel, z.B. "bike"' },
        event: { type: 'string', description: 'Beschreibung des Ereignisses, z.B. "Probefahrt gemacht"' },
        date: { type: 'string', description: 'Datum im Format YYYY-MM-DD (Default: heute)' },
      },
      required: ['slug', 'event'],
    },
  },
  {
    name: 'journey.delete_log',
    description:
      'Entfernt einen Tagebucheintrag aus einer Buying Journey — entweder per 0-basiertem Index (wie in journey.get) oder per event-Text (optional mit date).',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Journey-Kürzel, z.B. "bike"' },
        index: { type: 'number', description: '0-basierter Index des Eintrags aus journey.get', minimum: 0 },
        event: { type: 'string', description: 'Exakter Ereignistext (case-insensitiv), falls kein Index angegeben ist' },
        date: { type: 'string', description: 'Optionales Datum (YYYY-MM-DD) zur Eingrenzung bei Suche per event' },
      },
      required: ['slug'],
    },
  },
  {
    name: 'journey.set_spec',
    description:
      'Legt eine journey-weite Eigenschaft (Seite /eigenschaften, z.B. Rahmengröße oder gewünschte Reichweite) an oder aktualisiert sie (Upsert nach label).',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Journey-Kürzel, z.B. "bike"' },
        label: { type: 'string', description: 'Bezeichnung der Eigenschaft (Upsert-Schlüssel)' },
        value: { type: 'string', description: 'Wert der Eigenschaft' },
      },
      required: ['slug', 'label', 'value'],
    },
  },
  {
    name: 'journey.delete_spec',
    description:
      'Entfernt eine journey-weite Eigenschaft anhand ihres Labels (case-insensitiv) aus einer bestehenden Buying Journey.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Journey-Kürzel, z.B. "bike"' },
        label: { type: 'string', description: 'Label der zu löschenden Eigenschaft' },
      },
      required: ['slug', 'label'],
    },
  },
  {
    name: 'journey.set_feedback',
    description:
      'Speichert den Markdown-Text der Feedback- und Erfahrungsberichte-Seite (/feedback) einer bestehenden Buying Journey.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Journey-Kürzel, z.B. "bike"' },
        content: { type: 'string', description: 'Vollständiger Markdown-Inhalt für /feedback' },
      },
      required: ['slug', 'content'],
    },
  },
];

module.exports = {
  SERVER_INFO,
  PROTOCOL_VERSION,
  ITEM_STATUSES,
  PHASES,
  JOURNEY_CATEGORIES,
  CONFIG_FIELDS,
  TOOL_DEFS,
};
