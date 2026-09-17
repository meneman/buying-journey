// Bereinigt eingefügten Seiteninhalt für das LLM-Parsing ( manueller
// Content-Fallback, POST /api/parse-text ): Entfernt unnötige Hüll-Elemente
// (head, Skripte, Styles, Kommentare) und normalisiert Whitespace. Reine
// String-Operationen, keine DOM-Abhängigkeit — läuft in Node und Tests.
function cleanPastedContent(raw, maxChars) {
  if (typeof raw !== 'string') return '';
  let text = raw;
  if (/<html|<\s*head|<\s*body/i.test(text)) {
    text = text
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<\s*head[\s\S]*?<\s*\/\s*head\s*>/gi, ' ')
      .replace(/<\s*script[\s\S]*?<\s*\/\s*script\s*>/gi, ' ')
      .replace(/<\s*style[\s\S]*?<\s*\/\s*style\s*>/gi, ' ')
      .replace(/<\s*noscript[\s\S]*?<\s*\/\s*noscript\s*>/gi, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }
  text = text.replace(/\s+/g, ' ').trim();
  if (typeof maxChars === 'number' && Number.isFinite(maxChars) && maxChars >= 0) {
    return text.slice(0, Math.floor(maxChars));
  }
  return text;
}

module.exports = { cleanPastedContent };
