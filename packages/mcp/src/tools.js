'use strict';
// Gemeinsame MCP-Konstanten für den stdio-Server (`server.js`) und den
// HTTP-Status-Endpunkt (`GET /api/mcp-status` in src/web/backend/server.js).
// Einzige Quelle für Name/Version/Protokoll + Tool-Liste (jeweils mit
// name, description UND inputSchema). CommonJS, keine Dependencies.

const SERVER_INFO = { name: 'bike-buying-journey', version: '1.0.0' };
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
      'Liest das komplette Dokument einer Buying Journey (Status, Logs, Items, Specs, Notizen, Feedback, Config mit Basis-Eigenschaften und Settings). Nur Lesen, legt nichts an.',
    inputSchema: {
      type: 'object',
      properties: { slug: { type: 'string', description: 'Journey-Kürzel, z.B. "bike"' } },
      required: ['slug'],
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
        rating: { type: 'number', description: 'Bewertung 0-5 (wird in ⭐-Format umgewandelt)', minimum: 0, maximum: 5 },
        status: { type: 'string', description: 'Status des Eintrags', enum: ITEM_STATUSES },
        notes: { type: 'string', description: 'Notizen zum Eintrag' },
        link: { type: 'string', description: 'Produkt-URL' },
        specs: {
          type: 'object',
          description: 'Freie technische Vergleichskriterien, z.B. {"weight": "15.8 kg"}',
          additionalProperties: { type: 'string' },
        },
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
  {
    name: 'journey.crawl_link',
    description:
      'Lädt eine Produktseite über das Backend und gibt Titel + Fließtext als JSON zurück (speichert nichts). Der Aufrufer extrahiert daraus Name, Preis und Specs und speichert sie danach mit journey.add_item.',
    inputSchema: {
      type: 'object',
      properties: {
        link: { type: 'string', description: 'Produkt-URL (http/https), z.B. Herstellerseite' },
        maxChars: {
          type: 'number',
          description: 'Maximale Textlänge (Default 15000, Maximum 50000)',
        },
      },
      required: ['link'],
    },
  },
  {
    name: 'journey.create_from_link',
    description:
      'Legt eine neue Buying Journey an und crawlt einen Initial-Link als erstes Produkt — mit KI-Provider (agy, remote-ai oder local-cmd) voll KI-gesteuert: Ohne "slug" kommt der Journey-Name aus der LLM-Benennung (z.B. ein Model-3-Link legt eine "elektro-auto"-Journey an, siehe src/agent/prompts/journey_naming_prompt.md), das Erstprodukt (Name, Preis, Specs, Notizen) aus der LLM-Extraktion. Ohne KI-Provider gibt es statt eines Fehlers einen markierten Offline-Rückfall (Titel + Link). Explizit übergebene Felder überschreiben die Extraktion. Legt nichts an, wenn der Slug existiert oder die Seite nicht lädt.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Journey-Kürzel der neuen Journey, z.B. "schraenke". Optional: wird sonst aus dem Produkt verallgemeinert.' },
        link: { type: 'string', description: 'Initiale Produkt-URL (http/https), wird als erstes Item übernommen' },
        maxChars: {
          type: 'number',
          description: 'Maximale Textlänge (Default 15000, Maximum 50000)',
        },
        name: { type: 'string', description: 'Produktname (Default: Seitentitel des Links)' },
        price: { type: 'string', description: 'Preis als Freitext, z.B. "1499€"' },
        rating: { type: 'number', description: 'Bewertung 0-5 (wird in ⭐-Format umgewandelt)', minimum: 0, maximum: 5 },
        status: { type: 'string', description: 'Status des Eintrags', enum: ITEM_STATUSES },
        notes: { type: 'string', description: 'Notizen zum Eintrag' },
        specs: {
          type: 'object',
          description: 'Freie technische Vergleichskriterien, z.B. {"weight": "15.8 kg"}',
          additionalProperties: { type: 'string' },
        },
      },
      required: ['link'],
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
