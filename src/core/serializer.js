const { getJourneyEmoji } = require('./parser.js');

// Markdown Serializer
function serializeToMarkdown(data, journey = 'bike') {
  const emoji = getJourneyEmoji(journey);
  let md = `# ${emoji} ${data.sectionTitle || 'Kauf'} Journey\n\n`;
  
  md += `## 🎯 Status\n`;
  md += `- **Phase**: ${data.status.phase || 'Planning'}\n`;
  md += `- **Budget**: ${data.status.budget || ''}\n`;
  md += `- **Target Date**: ${data.status.targetDate || ''}\n\n`;
  
  md += `## 🗺️ Journey Log\n`;
  for (let entry of data.journey) {
    if (entry.date) {
      md += `- **${entry.date}**: ${entry.event}\n`;
    } else {
      md += `- ${entry.event}\n`;
    }
  }
  md += `\n`;
  
  md += `## ${emoji} ${data.sectionTitle || 'Items Under Consideration'}\n`;
  const headers = ['Name', 'Price', 'Specs', 'Rating', 'Status', 'Notes', 'Link'];
  md += `| ${headers.join(' | ')} |\n`;
  md += `| ${headers.map(() => ':---').join(' | ')} |\n`;
  for (let item of data.items) {
    const rowParts = headers.map(header => {
      const key = header.toLowerCase().replace(/[^a-z0-9]/g, '');
      let value = item[key] || '';
      
      if (key === 'specs' && value) {
        value = value.replace(/\r?\n/g, ' <br> ');
      }
      
      if (key === 'link' && value) {
        return `[Link](${value})`;
      }
      return value;
    });
    md += `| ${rowParts.join(' | ')} |\n`;
  }
  md += `\n`;
  
  if (data.specs && data.specs.length > 0) {
    md += `## 📏 ${data.listTitle || 'Spezifikationen'}\n`;
    for (let spec of data.specs) {
      md += `- **${spec.label}**: ${spec.value}\n`;
    }
    md += `\n`;
  }
  
  md += `## 📝 General Notes\n`;
  md += `${data.generalNotes || ''}\n`;
  
  return md;
}

module.exports = { serializeToMarkdown };
