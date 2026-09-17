'use strict';
// Gemeinsame MCP-Konstanten für den stdio-Server (`server.js`) und den
// HTTP-Status-Endpunkt (`GET /api/mcp-status` in src/web/backend/server.js).
// Einzige Quelle für Name/Version/Protokoll + Tool-Liste (jeweils mit
// name, description UND inputSchema). CommonJS, keine Dependencies.

const SERVER_INFO = { name: 'bike-buying-journey', version: '1.0.0' };
const PROTOCOL_VERSION = '2024-11-05';

const ITEM_STATUSES = ['Thinking', 'Shortlisted', 'Test Ridden', 'Rejected', 'Bought'];

const TOOL_DEFS = [
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
    name: 'journey.crawl_link',
    description:
      'Lädt eine Produktseite headless und gibt Titel + Fließtext als JSON zurück (speichert nichts). Der Aufrufer extrahiert daraus Name, Preis und Specs und speichert sie danach mit journey.add_item.',
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

module.exports = { SERVER_INFO, PROTOCOL_VERSION, ITEM_STATUSES, TOOL_DEFS };
