// State management
let appState = {
    status: { phase: 'Planning', budget: '', targetDate: '' },
    journey: [],
    items: [],
    specs: [],
    generalNotes: '',
    headers: ['Name', 'Price', 'Specs', 'Rating', 'Status', 'Notes', 'Link'],
    sectionTitle: 'Items Under Consideration',
    listTitle: 'Spezifikationen'
};

// URL Parameters
const urlParams = new URLSearchParams(window.location.search);
const journey = urlParams.get('journey') || 'bike';

// Debounce timer for auto-saving
let saveTimeout = null;

// DOM Elements
const currentPhaseEl = document.getElementById('currentPhase');
const budgetEl = document.getElementById('budget');
const targetDateEl = document.getElementById('targetDate');
const generalNotesEl = document.getElementById('generalNotes');
const productGridEl = document.getElementById('productGrid');
const productCountEl = document.getElementById('productCount');
const emptyStateEl = document.getElementById('emptyState');
const timelineEl = document.getElementById('timeline');
const addLogForm = document.getElementById('addLogForm');
const newEventTextEl = document.getElementById('newEventText');
const newEventDateEl = document.getElementById('newEventDate');
const refreshBtn = document.getElementById('refreshBtn');
const syncStatusEl = document.getElementById('syncStatus');
const addProductBtn = document.getElementById('addProductBtn');

// Modal Elements
const productModal = document.getElementById('productModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const cancelModalBtn = document.getElementById('cancelModalBtn');
const productForm = document.getElementById('productForm');

// Toast Elements
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toastMessage');

// Initial Load
document.addEventListener('DOMContentLoaded', () => {
    // Set default date for new event to today
    newEventDateEl.value = new Date().toISOString().split('T')[0];
    
    // Load data
    fetchData();
    
    // Add Event Listeners
    setupEventListeners();
    
    // Update navigation urls
    updateNavLinks();
    
    // Setup Sidebar Collapse
    setupSidebarCollapses();
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
    // Sync buttons
    refreshBtn.addEventListener('click', fetchData);
    
    // Auto-save listeners
    currentPhaseEl.addEventListener('change', () => {
        appState.status.phase = currentPhaseEl.value;
        triggerAutoSave();
    });
    
    budgetEl.addEventListener('input', () => {
        appState.status.budget = budgetEl.value;
        triggerAutoSave();
    });
    
    targetDateEl.addEventListener('change', () => {
        appState.status.targetDate = targetDateEl.value;
        triggerAutoSave();
    });
    
    generalNotesEl.addEventListener('input', () => {
        appState.generalNotes = generalNotesEl.value;
        triggerAutoSave();
    });
    
    // Form submission for new event
    addLogForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const date = newEventDateEl.value;
        const text = newEventTextEl.value.trim();
        
        if (text) {
            appState.journey.push({ date, event: text });
            appState.journey.sort((a, b) => b.date.localeCompare(a.date));
            
            newEventTextEl.value = '';
            renderJourney();
            saveData('Tagebuch aktualisiert');
        }
    });
    
    // Modal controls
    addProductBtn.addEventListener('click', () => openProductModal());
    closeModalBtn.addEventListener('click', closeProductModal);
    if (cancelModalBtn) cancelModalBtn.addEventListener('click', closeProductModal);
    
    productForm.addEventListener('submit', handleProductFormSubmit);
}

// Setup Sidebar Collapses
function setupSidebarCollapses() {
    const layout = document.querySelector('.app-layout');
    const leftBtn = document.getElementById('collapseLeftBtn');
    const rightBtn = document.getElementById('collapseRightBtn');
    const panelLeft = document.getElementById('panelLeft');
    const panelRight = document.getElementById('panelRight');
    
    if (leftBtn && panelLeft) {
        leftBtn.addEventListener('click', () => {
            layout.classList.toggle('left-collapsed');
            panelLeft.classList.toggle('collapsed');
            const icon = leftBtn.querySelector('i');
            if (layout.classList.contains('left-collapsed')) {
                icon.setAttribute('data-lucide', 'chevron-right');
                leftBtn.title = "Ausklappen";
            } else {
                icon.setAttribute('data-lucide', 'chevron-left');
                leftBtn.title = "Einklappen";
            }
            if (window.lucide) window.lucide.createIcons();
        });
    }
    
    if (rightBtn && panelRight) {
        rightBtn.addEventListener('click', () => {
            layout.classList.toggle('right-collapsed');
            panelRight.classList.toggle('collapsed');
            const icon = rightBtn.querySelector('i');
            if (layout.classList.contains('right-collapsed')) {
                icon.setAttribute('data-lucide', 'chevron-left');
                rightBtn.title = "Ausklappen";
            } else {
                icon.setAttribute('data-lucide', 'chevron-right');
                rightBtn.title = "Einklappen";
            }
            if (window.lucide) window.lucide.createIcons();
        });
    }
}

// Fetch Data from Server
async function fetchData() {
    showSyncStatus('yellow', 'Lade Daten...');
    try {
        const response = await fetch(`/api/data?journey=${encodeURIComponent(journey)}`);
        if (!response.ok) throw new Error('Fehler beim Abrufen der Daten');
        
        appState = await response.json();
        
        // Render UI
        renderStatus();
        renderProducts();
        renderJourney();
        renderGeneralNotes();
        
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

// Trigger Debounced Auto-save
function triggerAutoSave(longDebounce = false) {
    const indicator = document.getElementById('notesSaveIndicator');
    if (indicator) indicator.textContent = 'Schreibe...';
    
    if (saveTimeout) clearTimeout(saveTimeout);
    
    const delay = longDebounce ? 1500 : 500;
    saveTimeout = setTimeout(() => {
        saveData().then(() => {
            if (indicator) indicator.textContent = 'Automatisch gespeichert';
        });
    }, delay);
}

// Render status inputs
function renderStatus() {
    currentPhaseEl.value = appState.status.phase || 'Planning';
    budgetEl.value = appState.status.budget || '';
    targetDateEl.value = appState.status.targetDate || '';
}

// Render General Notes
function renderGeneralNotes() {
    generalNotesEl.value = appState.generalNotes || '';
}

// Render Journey timeline
function renderJourney() {
    timelineEl.innerHTML = '';
    
    if (!appState.journey || appState.journey.length === 0) {
        timelineEl.innerHTML = '<p class="text-muted" style="font-size: 0.85rem;">Noch keine Einträge vorhanden.</p>';
        return;
    }
    
    appState.journey.forEach((entry, index) => {
        const item = document.createElement('div');
        item.className = 'timeline-item';
        
        let formattedDate = entry.date;
        if (entry.date) {
            try {
                const parts = entry.date.split('-');
                if (parts.length === 3) {
                    formattedDate = `${parts[2]}.${parts[1]}.${parts[0]}`;
                }
            } catch (e) {}
        }
        
        item.innerHTML = `
            <div class="timeline-dot"></div>
            <div class="timeline-date">
                ${formattedDate}
                <button class="btn-delete btn-icon-only" style="width: 16px; height: 16px; border:none; background:none; padding:0; margin-left:8px;" onclick="deleteJourneyEntry(${index})" title="Eintrag löschen">
                    <i data-lucide="trash-2" style="width: 12px; height: 12px;"></i>
                </button>
            </div>
            <div class="timeline-content">${escapeHTML(entry.event)}</div>
        `;
        
        timelineEl.appendChild(item);
    });
    
    lucide.createIcons();
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

// Render Product Cards
function renderProducts() {
    productGridEl.innerHTML = '';
    
    const items = appState.items || [];
    productCountEl.textContent = items.length;
    
    // Update titles dynamically
    document.title = `JourneyPath — ${appState.sectionTitle || 'Kaufreise'}`;
    document.querySelector('.title-with-count h2').textContent = appState.sectionTitle || 'Produkte im Vergleich';
    addProductBtn.innerHTML = `<i data-lucide="plus"></i> Eintrag hinzufügen`;
    
    if (items.length === 0) {
        emptyStateEl.classList.remove('hidden');
        productGridEl.classList.add('hidden');
        lucide.createIcons();
        return;
    }
    
    emptyStateEl.classList.add('hidden');
    productGridEl.classList.remove('hidden');
    
    items.forEach((item, index) => {
        const card = document.createElement('div');
        card.className = 'product-card card';
        
        // Rating HTML
        const rating = parseRating(item.rating);
        let starsHtml = '';
        for (let i = 1; i <= 5; i++) {
            if (i <= rating) {
                starsHtml += '<i data-lucide="star"></i>';
            } else {
                starsHtml += '<i data-lucide="star" class="empty"></i>';
            }
        }
        
        // Link HTML
        const linkHtml = item.link 
            ? `<a href="${encodeURI(item.link)}" target="_blank" class="btn-link"><i data-lucide="external-link" style="width: 14px; height:14px;"></i> Details</a>`
            : '';
            
        // Status badge
        const statusClass = (item.status || 'Thinking').toLowerCase().replace(/\s+/g, '-');
        const statusLabel = translateStatus(item.status);
        
        // Render specs dynamically from <br> split
        let specsHtml = '';
        if (item.specs) {
            const parts = item.specs.split(/<br\s*\/?>/i);
            parts.forEach(part => {
                const cleanPart = part.trim();
                if (!cleanPart) return;
                
                const colonIndex = cleanPart.indexOf(':');
                if (colonIndex > 0) {
                    const key = cleanPart.substring(0, colonIndex).trim();
                    const val = cleanPart.substring(colonIndex + 1).trim();
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
                    
                    specsHtml += `
                        <div class="spec-item" title="${escapeHTML(key)}">
                            <i data-lucide="${icon}"></i> 
                            <span><strong>${escapeHTML(key)}:</strong> ${escapeHTML(val)}</span>
                        </div>
                    `;
                } else {
                    specsHtml += `
                        <div class="spec-item full-width" title="Info">
                            <i data-lucide="check-circle-2"></i> 
                            <span>${escapeHTML(cleanPart)}</span>
                        </div>
                    `;
                }
            });
        }
        
        card.innerHTML = `
            <div class="product-card-header">
                <div>
                    <h3 class="product-title">${escapeHTML(item.name)}</h3>
                    <div class="product-price">${escapeHTML(item.price || 'k.A.')}</div>
                </div>
                <span class="status-badge ${statusClass}">${escapeHTML(statusLabel)}</span>
            </div>
            
            <div class="product-card-body">
                <div class="rating-stars">
                    ${starsHtml}
                </div>
                <div class="product-specs-detail">
                    ${specsHtml}
                </div>
                <p class="product-notes">${escapeHTML(item.notes || 'Keine Notizen vorhanden.')}</p>
            </div>
            
            <div class="product-card-footer">
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
        
        productGridEl.appendChild(card);
    });
    
    lucide.createIcons();
}

// Modal handling
window.openProductModal = function(index = null) {
    generateModalForm(); // Generate form inputs dynamically
    
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
    renderProducts();
}

// Actions
window.deleteProduct = function(index) {
    if (confirm(`Möchtest du "${appState.items[index].name}" wirklich löschen?`)) {
        const name = appState.items[index].name;
        appState.items.splice(index, 1);
        renderProducts();
        saveData(`"${name}" gelöscht`);
    }
};

window.deleteJourneyEntry = function(index) {
    if (confirm('Eintrag aus dem Reisetagebuch löschen?')) {
        appState.journey.splice(index, 1);
        renderJourney();
        saveData('Eintrag gelöscht');
    }
};

// Helper Functions
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
