// State management
let appState = {
    status: { phase: 'Planning', budget: '', targetDate: '' },
    journey: [],
    items: [],
    generalNotes: '',
    headers: ['Name', 'Price', 'Specs', 'Rating', 'Status', 'Notes', 'Link'],
    sectionTitle: 'Items Under Consideration'
};

// URL Parameters
const urlParams = new URLSearchParams(window.location.search);
const journey = urlParams.get('journey') || 'bike';

// DOM Elements
const productCountEl = document.getElementById('productCount');
const emptyStateEl = document.getElementById('emptyState');
const compareContainerEl = document.getElementById('compareContainer');
const compareTableEl = document.getElementById('compareTable');
const refreshBtn = document.getElementById('refreshBtn');
const syncStatusEl = document.getElementById('syncStatus');
const addProductBtn = document.getElementById('addProductBtn');

// Modal Elements
const productModal = document.getElementById('productModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const cancelModalBtn = document.getElementById('cancelModalBtn');
const productForm = document.getElementById('productForm');
const modalTitle = document.getElementById('modalTitle');
const editProductIndexEl = document.getElementById('editProductIndex');

// Toast Elements
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toastMessage');

// Initial Load
document.addEventListener('DOMContentLoaded', () => {
    // Load data
    fetchData();
    
    // Add Event Listeners
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
    refreshBtn.addEventListener('click', fetchData);
    
    // Modal controls
    addProductBtn.addEventListener('click', () => openProductModal());
    closeModalBtn.addEventListener('click', closeProductModal);
    if (cancelModalBtn) cancelModalBtn.addEventListener('click', closeProductModal);
    
    productForm.addEventListener('submit', handleProductFormSubmit);
}

// Fetch Data from Server
async function fetchData() {
    showSyncStatus('yellow', 'Lade Daten...');
    try {
        const response = await fetch(`/api/data?journey=${encodeURIComponent(journey)}`);
        if (!response.ok) throw new Error('Fehler beim Abrufen der Daten');
        
        appState = await response.json();
        
        // Ensure items array exists
        if (!appState.items) {
            appState.items = [];
        }
        
        // Render UI
        renderCompareTable();
        
        showSyncStatus('green', 'Mit SilverBullet synchronisiert');
        showToast('Daten erfolgreich geladen');
    } catch (error) {
        console.error(error);
        showSyncStatus('red', 'Verbindungsfehler');
        showToast('Fehler beim Laden der Daten!', 'alert-triangle');
    }
}

// Save Data to Server
async function saveData(message = 'Änderungen gespeichert') {
    showSyncStatus('yellow', 'Speichere in SilverBullet...');
    try {
        const response = await fetch(`/api/data?journey=${encodeURIComponent(journey)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(appState)
        });
        
        if (!response.ok) throw new Error('Fehler beim Speichern der Daten');
        
        showSyncStatus('green', 'Änderungen gespeichert');
        showToast(message);
    } catch (error) {
        console.error(error);
        showSyncStatus('red', 'Fehler beim Speichern');
        showToast('Speichern fehlgeschlagen!', 'alert-triangle');
    }
}

// Render dynamic Form inside Modal (Standard 7-column layout)
function generateModalForm() {
    const form = document.getElementById('productForm');
    form.innerHTML = ''; // Reset Form
    
    const hiddenIndex = document.createElement('input');
    hiddenIndex.type = 'hidden';
    hiddenIndex.id = 'editProductIndex';
    form.appendChild(hiddenIndex);
    
    const fields = [
        { key: 'name', label: 'Modell / Name *', type: 'text', placeholder: 'z.B. Canyon Ultimate CF 7', required: true },
        { key: 'price', label: 'Preis', type: 'text', placeholder: 'z.B. 2799€' },
        { key: 'status', label: 'Status', type: 'select' },
        { key: 'rating', label: 'Bewertung', type: 'rating' },
        { key: 'specs', label: 'Spezifikationen (Eine Eigenschaft pro Zeile)', type: 'textarea', placeholder: 'z.B.\nGewicht: 8.1 kg\nRahmen: Carbon\nSchaltung: Shimano 105 2x12' },
        { key: 'link', label: 'Produkt-Link / Webadresse', type: 'url', placeholder: 'https://...' },
        { key: 'notes', label: 'Erfahrungen / Vor- & Nachteile', type: 'notes_textarea', placeholder: 'Erste Eindrücke oder Notizen...' }
    ];
    
    fields.forEach(field => {
        const formGroup = document.createElement('div');
        formGroup.className = 'form-group';
        
        const label = document.createElement('label');
        label.setAttribute('for', `field_${field.key}`);
        label.textContent = field.label;
        formGroup.appendChild(label);
        
        let input;
        
        if (field.type === 'select') {
            input = document.createElement('select');
            input.id = `field_${field.key}`;
            input.className = 'form-control';
            
            const options = [
                { value: 'Thinking', label: 'In Erwägung' },
                { value: 'Shortlisted', label: 'Engere Auswahl' },
                { value: 'Test Ridden', label: 'Erprobt/Besichtigt' },
                { value: 'Rejected', label: 'Ausgeschieden' },
                { value: 'Bought', label: 'Gekauft! 🏆' }
            ];
            
            options.forEach(opt => {
                const option = document.createElement('option');
                option.value = opt.value;
                option.textContent = opt.label;
                input.appendChild(option);
            });
        } else if (field.type === 'rating') {
            input = document.createElement('div');
            input.className = 'star-rating-input';
            input.id = `field_${field.key}`;
            
            for (let i = 5; i >= 1; i--) {
                const radio = document.createElement('input');
                radio.type = 'radio';
                radio.id = `star${i}`;
                radio.name = 'rating';
                radio.value = i;
                
                const labelStar = document.createElement('label');
                labelStar.setAttribute('for', `star${i}`);
                labelStar.title = `${i} Sterne`;
                labelStar.innerHTML = '<i data-lucide="star"></i>';
                
                input.appendChild(radio);
                input.appendChild(labelStar);
            }
        } else if (field.type === 'textarea') {
            input = document.createElement('textarea');
            input.id = `field_${field.key}`;
            input.className = 'form-control textarea-modal';
            input.style.height = '140px';
            input.placeholder = field.placeholder;
        } else if (field.type === 'notes_textarea') {
            input = document.createElement('textarea');
            input.id = `field_${field.key}`;
            input.className = 'form-control textarea-modal';
            input.style.height = '80px';
            input.placeholder = field.placeholder;
        } else {
            input = document.createElement('input');
            input.type = field.type;
            input.id = `field_${field.key}`;
            input.className = 'form-control';
            input.placeholder = field.placeholder;
            if (field.required) input.required = true;
        }
        
        formGroup.appendChild(input);
        form.appendChild(formGroup);
    });
    
    // Footer actions
    const footer = document.createElement('div');
    footer.className = 'modal-footer';
    
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn btn-secondary';
    cancelBtn.textContent = 'Abbrechen';
    cancelBtn.addEventListener('click', closeProductModal);
    
    const saveBtn = document.createElement('button');
    saveBtn.type = 'submit';
    saveBtn.className = 'btn btn-primary';
    saveBtn.textContent = 'Speichern';
    
    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);
    form.appendChild(footer);
    
    lucide.createIcons();
}

// Render Comparison Table
function renderCompareTable() {
    const items = appState.items || [];
    productCountEl.textContent = items.length;
    
    // Update labels dynamically
    document.title = `JourneyPath — ${appState.sectionTitle || 'Vergleich'}`;
    document.querySelector('.title-with-count h2').textContent = appState.sectionTitle || 'Vergleich';
    addProductBtn.innerHTML = `<i data-lucide="plus"></i> Eintrag hinzufügen`;
    
    if (items.length === 0) {
        emptyStateEl.classList.remove('hidden');
        compareContainerEl.classList.add('hidden');
        lucide.createIcons();
        return;
    }
    
    emptyStateEl.classList.add('hidden');
    compareContainerEl.classList.remove('hidden');
    
    compareTableEl.innerHTML = '';
    
    // 1. Gather all unique specification keys across all products
    const uniqueSpecKeys = [];
    items.forEach(item => {
        if (item.specs) {
            const parts = item.specs.split(/<br\s*\/?>/i);
            parts.forEach(part => {
                const cleanPart = part.trim();
                const colonIndex = cleanPart.indexOf(':');
                if (colonIndex > 0) {
                    const key = cleanPart.substring(0, colonIndex).trim();
                    if (key && !uniqueSpecKeys.includes(key)) {
                        uniqueSpecKeys.push(key);
                    }
                }
            });
        }
    });
    
    // Helper to find a specific spec value from the combined Specs cell
    const findSpecValue = (item, key) => {
        if (!item.specs) return '—';
        const parts = item.specs.split(/<br\s*\/?>/i);
        const match = parts.find(p => {
            const colonIndex = p.indexOf(':');
            if (colonIndex > 0) {
                return p.substring(0, colonIndex).trim().toLowerCase() === key.toLowerCase();
            }
            return false;
        });
        if (match) {
            const colonIndex = match.indexOf(':');
            return match.substring(colonIndex + 1).trim();
        }
        return '—';
    };
    
    // 2. Build rows structure dynamically
    const attributes = [];
    
    // Base attributes
    attributes.push({
        label: 'Name',
        icon: 'compass',
        getValue: (item) => `<span class="compare-product-name">${escapeHTML(item.name || 'Unbenannt')}</span>`
    });
    
    attributes.push({
        label: 'Preis',
        icon: 'euro',
        getValue: (item) => `<span class="product-price">${escapeHTML(item.price || 'k.A.')}</span>`
    });
    
    attributes.push({
        label: 'Rating',
        icon: 'star',
        getValue: (item) => {
            const rating = parseRating(item.rating);
            let starsHtml = '<div class="rating-stars">';
            for (let i = 1; i <= 5; i++) {
                starsHtml += i <= rating ? '<i data-lucide="star"></i>' : '<i data-lucide="star" class="empty"></i>';
            }
            starsHtml += '</div>';
            return starsHtml;
        }
    });
    
    attributes.push({
        label: 'Status',
        icon: 'info',
        getValue: (item) => {
            const statusClass = (item.status || 'Thinking').toLowerCase().replace(/\s+/g, '-');
            const statusLabel = translateStatus(item.status);
            return `<span class="status-badge ${statusClass}">${escapeHTML(statusLabel)}</span>`;
        }
    });
    
    // Dynamic specifications attributes
    uniqueSpecKeys.forEach(key => {
        const keyLower = key.toLowerCase();
        let icon = 'info';
        if (keyLower === 'gewicht' || keyLower === 'weight') icon = 'scale';
        else if (keyLower === 'rahmen' || keyLower === 'frame') icon = 'layers';
        else if (keyLower === 'antrieb' || keyLower === 'schaltung' || keyLower === 'groupset') icon = 'cog';
        else if (keyLower === 'bremsen' || keyLower === 'brakes') icon = 'disc';
        else if (keyLower === 'laufräder' || keyLower === 'laufraeder' || keyLower === 'wheels' || keyLower === 'reifen' || keyLower === 'tires') icon = 'circle';
        else if (keyLower === 'reichweite' || keyLower === 'range') icon = 'zap';
        else if (keyLower === 'batterie' || keyLower === 'battery') icon = 'battery';
        else if (keyLower === 'leistung' || keyLower === 'power') icon = 'gauge';
        
        attributes.push({
            label: key,
            icon: icon,
            getValue: (item) => `<span class="compare-spec-text">${escapeHTML(findSpecValue(item, key))}</span>`
        });
    });
    
    // Remaining base attributes
    attributes.push({
        label: 'Erfahrungen',
        icon: 'sticky-note',
        getValue: (item) => `<div class="compare-notes">${escapeHTML(item.notes || 'Keine Notizen vorhanden.')}</div>`
    });
    
    // Actions Row
    attributes.push({
        label: 'Aktionen',
        icon: 'sliders',
        getValue: (item, index) => {
            const linkHtml = item.link 
                ? `<a href="${encodeURI(item.link)}" target="_blank" class="btn-link"><i data-lucide="external-link" style="width: 14px; height:14px;"></i> Details</a>`
                : '';
            return `
                <div class="compare-actions">
                    ${linkHtml}
                    <div class="card-actions">
                        <button class="btn btn-secondary btn-card" onclick="openProductModal(${index})" title="Bearbeiten">
                            <i data-lucide="edit-3" style="width:14px; height:14px;"></i> Bearbeiten
                        </button>
                        <button class="btn btn-secondary btn-card btn-delete" onclick="deleteProduct(${index})" title="Löschen">
                            <i data-lucide="trash-2" style="width:14px; height:14px;"></i>
                        </button>
                    </div>
                </div>
            `;
        }
    });
    
    // 3. Generate table HTML row by row
    attributes.forEach((attr, rowIndex) => {
        const tr = document.createElement('tr');
        
        // Header / Label cell
        const labelCell = document.createElement(rowIndex === 0 ? 'th' : 'td');
        labelCell.className = 'compare-label-cell';
        labelCell.innerHTML = `<div class="compare-label-content"><i data-lucide="${attr.icon}"></i> <span>${attr.label}</span></div>`;
        tr.appendChild(labelCell);
        
        // Product columns
        items.forEach((item, index) => {
            const cell = document.createElement(rowIndex === 0 ? 'th' : 'td');
            if (rowIndex === 0) {
                cell.className = 'compare-header-cell';
            } else {
                cell.className = 'compare-value-cell';
            }
            cell.innerHTML = attr.getValue(item, index);
            tr.appendChild(cell);
        });
        
        compareTableEl.appendChild(tr);
    });
    
    lucide.createIcons();
}

// Modal handling
window.openProductModal = function(index = null) {
    generateModalForm(); // Generate form dynamically first!
    
    const editProductIndexEl = document.getElementById('editProductIndex');
    const form = document.getElementById('productForm');
    form.reset();
    
    document.querySelectorAll('.star-rating-input input').forEach(input => input.checked = false);
    
    if (index !== null) {
        modalTitle.textContent = 'Eintrag bearbeiten';
        editProductIndexEl.value = index;
        
        const item = appState.items[index];
        
        const nameField = document.getElementById('field_name');
        const priceField = document.getElementById('field_price');
        const statusField = document.getElementById('field_status');
        const specsField = document.getElementById('field_specs');
        const linkField = document.getElementById('field_link');
        const notesField = document.getElementById('field_notes');
        
        if (nameField) nameField.value = item.name || '';
        if (priceField) priceField.value = item.price || '';
        if (statusField) statusField.value = item.status || 'Thinking';
        if (linkField) linkField.value = item.link || '';
        if (notesField) notesField.value = item.notes || '';
        
        if (specsField) {
            specsField.value = (item.specs || '').replace(/<br\s*\/?>/gi, '\n');
        }
        
        const rating = parseRating(item.rating);
        if (rating >= 1 && rating <= 5) {
            const radio = document.getElementById(`star${rating}`);
            if (radio) radio.checked = true;
        }
    } else {
        modalTitle.textContent = 'Eintrag hinzufügen';
        editProductIndexEl.value = '';
    }
    
    productModal.classList.remove('hidden');
    lucide.createIcons();
};

function closeProductModal() {
    productModal.classList.add('hidden');
}

function handleProductFormSubmit(e) {
    e.preventDefault();
    
    const editProductIndexEl = document.getElementById('editProductIndex');
    const indexStr = editProductIndexEl.value;
    
    const nameField = document.getElementById('field_name');
    const priceField = document.getElementById('field_price');
    const statusField = document.getElementById('field_status');
    const specsField = document.getElementById('field_specs');
    const linkField = document.getElementById('field_link');
    const notesField = document.getElementById('field_notes');
    
    const checkedRating = document.querySelector('.star-rating-input input:checked');
    const ratingValue = checkedRating ? parseInt(checkedRating.value) : 0;
    
    // Normalize newlines in specs to <br>
    const specsRaw = specsField ? specsField.value : '';
    const specsVal = specsRaw.split('\n').map(l => l.trim()).filter(l => l !== '').join(' <br> ');
    
    const itemData = {
        name: nameField ? nameField.value.trim() : 'Unbenannt',
        price: priceField ? priceField.value.trim() : '',
        status: statusField ? statusField.value : 'Thinking',
        rating: '⭐'.repeat(ratingValue),
        specs: specsVal,
        link: linkField ? linkField.value.trim() : '',
        notes: notesField ? notesField.value.trim() : ''
    };
    
    if (indexStr !== '') {
        const index = parseInt(indexStr);
        appState.items[index] = itemData;
        saveData('Eintrag aktualisiert');
    } else {
        appState.items.push(itemData);
        saveData('Neuer Eintrag hinzugefügt');
    }
    
    closeProductModal();
    renderCompareTable();
}

// Actions
window.deleteProduct = function(index) {
    if (confirm(`Möchtest du "${appState.items[index].name}" wirklich löschen?`)) {
        const name = appState.items[index].name;
        appState.items.splice(index, 1);
        renderCompareTable();
        saveData(`"${name}" gelöscht`);
    }
};

// Helpers
function parseRating(ratingStr) {
    if (!ratingStr) return 0;
    return (ratingStr.match(/⭐/g) || []).length || parseInt(ratingStr) || 0;
}

function translateStatus(status) {
    const translation = {
        'Thinking': 'In Erwägung',
        'Shortlisted': 'Engere Auswahl',
        'Test Ridden': 'Erprobt/Besichtigt',
        'Rejected': 'Ausgeschieden',
        'Bought': 'Gekauft! 🏆'
    };
    return translation[status] || status;
}

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
