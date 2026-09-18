#!/usr/bin/env node
// Test-Stub als "LLM" für CRAWL_EXTRACT_CMD: liest das stdin-JSON und
// antwortet deterministisch — Naming ({ task: 'journey-naming' }) oder
// Produkt-Extraktion ({ journey, ... }). Kein echtes LLM, nur damit Tests
// die komplette KI-Pipeline (Prompt bauen → aufrufen → parsen) durchlaufen.
//
// Ist LLM_STUB_LOG gesetzt, wird jede Anfrage als JSON-Zeile angehängt —
// so können Tests prüfen, was die Pipeline dem "LLM" tatsächlich schickt
// (z.B. ob der Journey-Kontext stimmt).
'use strict';

const fs = require('node:fs');

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  input += chunk;
});
process.stdin.on('end', () => {
  let payload = {};
  try {
    payload = JSON.parse(input);
  } catch {
    payload = {};
  }
  if (process.env.LLM_STUB_LOG) {
    try {
      fs.appendFileSync(process.env.LLM_STUB_LOG, `${JSON.stringify(payload)}\n`);
    } catch {
      // Logging ist optional — ein Schreibfehler darf den Stub nicht kippen.
    }
  }
  const haystack = `${payload.title || ''}\n${payload.text || ''}\n${payload.url || ''}`;
  const isTesla = /tesla|model 3|wltp/i.test(haystack);
  const isBike = /testrad|rahmen|fahrrad|bike/i.test(haystack);

  if (payload.task === 'journey-naming') {
    if (isTesla) return out({ slug: 'elektro-auto', name: 'Elektro-Auto', category: 'auto' });
    if (isBike) return out({ slug: 'bike', name: 'Fahrrad', category: 'fahrrad' });
    return out({ slug: 'produkte', name: 'Produkte', category: '' });
  }

  // Produkt-Extraktion (Vertrag wie CRAWL_EXTRACT_CMD: Produkt-JSON mit mind. name).
  const link = typeof payload.url === 'string' ? payload.url : '';
  if (isTesla) {
    return out({
      name: 'Tesla Model 3',
      price: '42990€',
      specs: 'Reichweite (WLTP): 513 km <br> Akku: 60 kWh <br> Leistung: 283 PS',
      rating: 4,
      status: 'Thinking',
      notes: 'Elektrische Limousine mit hoher Reichweite.',
      link,
    });
  }
  if (isBike) {
    return out({
      name: 'MCP Testrad Pro',
      price: '1299€',
      specs: 'Rahmen: Aluminium <br> Gewicht: 14.2 kg',
      rating: 0,
      status: 'Thinking',
      notes: 'Leichtes Testrad mit Aluminiumrahmen.',
      link,
    });
  }
  return out({ name: String(payload.title || 'Unbenannt'), price: '', specs: '', rating: 0, status: 'Thinking', notes: '', link });
});

function out(obj) {
  process.stdout.write(JSON.stringify(obj));
}
