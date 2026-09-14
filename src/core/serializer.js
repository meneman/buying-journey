const { getJourneyEmoji } = require('./parser.js');

// Escapes one markdown-table cell: newlines become the `<br>` storage marker
// (the parser keeps them literally, the frontend converts them back for editing)
// and pipes are backslash-escaped so they cannot shift columns.
function escapeCell(value) {
  return String(value ?? '').replace(/\r?\n/g, ' <br> ').replace(/\|/g, '\\|');
}

// Markdown Serializer (tolerates partial data so README/CLI defaults never throw)
function serializeToMarkdown(data, journey = 'bike') {
  const safe = data || {};
  const status = safe.status || {};
  const emoji = getJourneyEmoji(journey);
  let md = `# ${emoji} ${safe.sectionTitle || 'Kauf'} Journey\n\n`;

  md += `## 🎯 Status\n`;
  md += `- **Phase**: ${status.phase || 'Planning'}\n`;
  md += `- **Budget**: ${status.budget || ''}\n`;
  md += `- **Target Date**: ${status.targetDate || ''}\n\n`;

  md += `## 🗺️ Journey Log\n`;
  for (let entry of safe.journey || []) {
    const event = entry.event || '';
    if (entry.date) {
      md += `- **${entry.date}**: ${event}\n`;
    } else {
      md += `- ${event}\n`;
    }
  }
  md += `\n`;

  md += `## ${emoji} ${safe.sectionTitle || 'Items Under Consideration'}\n`;
  const headers = ['Name', 'Price', 'Specs', 'Rating', 'Status', 'Notes', 'Link'];
  md += `| ${headers.join(' | ')} |\n`;
  md += `| ${headers.map(() => ':---').join(' | ')} |\n`;
  for (let item of safe.items || []) {
    const rowParts = headers.map(header => {
      const key = header.toLowerCase().replace(/[^a-z0-9]/g, '');
      const value = escapeCell(item[key]);

      if (key === 'link' && value) {
        return `[Link](${value})`;
      }
      return value;
    });
    md += `| ${rowParts.join(' | ')} |\n`;
  }
  md += `\n`;

  if (safe.specs && safe.specs.length > 0) {
    md += `## 📏 ${safe.listTitle || 'Spezifikationen'}\n`;
    for (let spec of safe.specs) {
      md += `- **${spec.label || ''}**: ${spec.value || ''}\n`;
    }
    md += `\n`;
  }
  
  md += `## 📝 General Notes\n`;
  md += `${data.generalNotes || ''}\n`;
  
  return md;
}

module.exports = { serializeToMarkdown };
