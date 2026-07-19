const feedbackGridEl = document.getElementById('feedbackGrid');
const feedbackCountEl = document.getElementById('feedbackCount');
const refreshBtn = document.getElementById('refreshBtn');
const syncStatusEl = document.getElementById('syncStatus');

// URL Parameters
const urlParams = new URLSearchParams(window.location.search);
const journey = urlParams.get('journey') || 'bike';

// Toast Elements
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toastMessage');

// Initial Load
document.addEventListener('DOMContentLoaded', () => {
    fetchFeedback();
    setupEventListeners();
    
    // Update navigation
    updateNavLinks();
});

// Update Nav Links to preserve journey query parameter
function updateNavLinks() {
    document.querySelectorAll('.header-nav .nav-link').forEach(link => {
        const href = link.getAttribute('href');
        if (href) {
            const cleanHref = href.split('?')[0];
            link.setAttribute('href', `${cleanHref}?journey=${encodeURIComponent(journey)}`);
        }
    });
    
    // Update SilverBullet link
    const sbBtn = document.querySelector('.header-actions a.btn-secondary');
    if (sbBtn) {
        sbBtn.setAttribute('href', `https://notes.wohnli.com/${encodeURIComponent(journey)}.buying-journey`);
    }
}

// Setup Events
function setupEventListeners() {
    // Sync button
    refreshBtn.addEventListener('click', fetchFeedback);
}

// Fetch Feedback Markdown
async function fetchFeedback() {
    showSyncStatus('yellow', 'Lade Feedback...');
    try {
        const response = await fetch(`/api/feedback?journey=${encodeURIComponent(journey)}`);
        if (!response.ok) throw new Error('Fehler beim Abrufen der Feedback-Daten');
        
        const data = await response.json();
        const content = data.content || '';
        
        renderFeedback(content);
        
        showSyncStatus('green', 'Mit SilverBullet synchronisiert');
        showToast('Feedback erfolgreich geladen');
    } catch (error) {
        console.error(error);
        showSyncStatus('red', 'Verbindungsfehler');
        showToast('Fehler beim Laden des Feedbacks!', 'alert-triangle');
    }
}

// Parse and render the Markdown file content as person-based cards
function renderFeedback(markdown) {
    feedbackGridEl.innerHTML = '';
    
    if (!markdown) {
        feedbackGridEl.innerHTML = '<p class="text-muted">Kein Feedback vorhanden.</p>';
        feedbackCountEl.textContent = '0';
        return;
    }
    
    // Split by heading starting with "## "
    const sections = markdown.split(/\n## /);
    const feedbackUnits = [];
    
    sections.forEach((section, index) => {
        if (index === 0) return; // Ignore first part (H1 title)
        
        const lines = section.split('\n');
        const headingLine = lines[0].trim();
        const contentLines = lines.slice(1);
        
        const personName = headingLine.replace(/Feedback von\s+/i, '').trim();
        const contentMarkdown = contentLines.join('\n').trim();
        
        if (personName) {
            feedbackUnits.push({
                name: personName,
                content: contentMarkdown
            });
        }
    });
    
    feedbackCountEl.textContent = feedbackUnits.length;
    
    if (feedbackUnits.length === 0) {
        feedbackGridEl.innerHTML = '<p class="text-muted">Keine Feedback-Einheiten gefunden.</p>';
        return;
    }
    
    feedbackUnits.forEach(unit => {
        const card = document.createElement('div');
        card.className = 'feedback-card card';
        
        const parsedHtml = parseMarkdownToHTML(unit.content);
        
        card.innerHTML = `
            <div class="feedback-card-header">
                <div class="feedback-user-info">
                    <div class="feedback-user-avatar">
                        <i data-lucide="user"></i>
                    </div>
                    <h3 class="feedback-user-name">${escapeHTML(unit.name)}</h3>
                </div>
            </div>
            <div class="feedback-card-body markdown-content">
                ${parsedHtml}
            </div>
        `;
        
        feedbackGridEl.appendChild(card);
    });
    
    lucide.createIcons();
}

// Simple Markdown parser supporting nested lists
function parseMarkdownToHTML(md) {
    if (!md) return '<p class="text-muted">Kein Inhalt...</p>';
    
    let html = md;
    
    // Escape HTML tags to prevent XSS
    html = html
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
        
    // Normalize newlines
    html = html.replace(/\r\n/g, '\n');
    
    // Process headers (H3) if any are nested inside the card (e.g. ### Marken)
    html = html.replace(/^### (.*?)$/gm, '<h3>$1</h3>');
    
    // Process bold (**text**)
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Process bullet points and nested lists
    const lines = html.split('\n');
    let listStack = [];
    let result = [];
    
    lines.forEach(line => {
        const cleanLine = line.trim();
        if (!cleanLine) return;
        
        const listMatch = line.match(/^(\s*)(?:-|\*)\s+(.*)$/);
        
        if (listMatch) {
            const spaces = listMatch[1].length;
            const content = listMatch[2];
            const level = Math.floor(spaces / 2);
            
            while (listStack.length > level) {
                result.push(listStack.pop());
            }
            
            while (listStack.length < level) {
                result.push('<ul class="preview-sublist">');
                listStack.push('</ul>');
            }
            
            if (level === 0 && listStack.length === 0) {
                result.push('<ul class="preview-list">');
                listStack.push('</ul>');
            }
            
            result.push(`<li>${content}</li>`);
        } else {
            while (listStack.length > 0) {
                result.push(listStack.pop());
            }
            
            if (!cleanLine.startsWith('<h') && !cleanLine.startsWith('<ul') && !cleanLine.startsWith('</ul') && !cleanLine.startsWith('<li')) {
                result.push(`<p>${line}</p>`);
            } else {
                result.push(line);
            }
        }
    });
    
    while (listStack.length > 0) {
        result.push(listStack.pop());
    }
    
    return result.join('\n');
}

// Helpers
function escapeHTML(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function showSyncStatus(color, text) {
    const dot = syncStatusEl.querySelector('.status-dot');
    const textEl = syncStatusEl.querySelector('.status-text');
    
    dot.className = `status-dot ${color}`;
    textEl.textContent = text;
}

function showToast(message, icon = 'info') {
    toastMessage.textContent = message;
    
    const iconEl = toast.querySelector('.toast-icon');
    if (iconEl) {
        iconEl.setAttribute('data-lucide', icon);
    }
    lucide.createIcons();
    
    toast.classList.remove('hidden');
    
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}
