// State management
let appState = {
    status: { phase: 'Planning', budget: '', targetDate: '' },
    journey: [],
    items: [],
    specs: [],
    generalNotes: '',
    listTitle: 'Spezifikationen'
};

// URL Parameters
const urlParams = new URLSearchParams(window.location.search);
const journey = urlParams.get('journey') || 'bike';

// DOM Elements
const specsGridEl = document.getElementById('specsGrid');
const specCountEl = document.getElementById('specCount');
const emptyStateEl = document.getElementById('emptyState');
const refreshBtn = document.getElementById('refreshBtn');
const syncStatusEl = document.getElementById('syncStatus');
const addSpecBtn = document.getElementById('addSpecBtn');

// Modal Elements
const specModal = document.getElementById('specModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const cancelModalBtn = document.getElementById('cancelModalBtn');
const specForm = document.getElementById('specForm');
const modalTitle = document.getElementById('modalTitle');
const editSpecIndexEl = document.getElementById('editSpecIndex');
const specBrandEl = document.getElementById('specBrand');
const specValueEl = document.getElementById('specValue');

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
    // Sync buttons
    refreshBtn.addEventListener('click', fetchData);
    
    // Modal controls
    addSpecBtn.addEventListener('click', () => openSpecModal());
    closeModalBtn.addEventListener('click', closeSpecModal);
    cancelModalBtn.addEventListener('click', closeSpecModal);
    
    specForm.addEventListener('submit', handleSpecFormSubmit);
}

// Fetch Data from Server
async function fetchData() {
    showSyncStatus('yellow', 'Lade Daten...');
    try {
        const response = await fetch(`/api/data?journey=${encodeURIComponent(journey)}`);
        if (!response.ok) throw new Error('Fehler beim Abrufen der Daten');
        
        appState = await response.json();
        
        // Ensure specs array exists
        if (!appState.specs) {
            appState.specs = [];
        }
        
        // Render UI
        renderSpecs();
        
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

// Render Specs Grid
function renderSpecs() {
    specsGridEl.innerHTML = '';
    
    const specs = appState.specs || [];
    specCountEl.textContent = specs.length;
    
    // Update labels dynamically
    const titleText = appState.listTitle || 'Spezifikationen';
    document.title = `JourneyPath — ${titleText}`;
    document.querySelector('.title-with-count h2').textContent = titleText;
    addSpecBtn.innerHTML = `<i data-lucide="plus"></i> Eintrag hinzufügen`;
    
    // Adjust modal labels based on title
    const brandLabel = document.getElementById('specLabel');
    const valueLabel = document.getElementById('valueLabel');
    if (brandLabel) brandLabel.textContent = journey === 'bike' ? 'Hersteller / Marke *' : 'Eigenschaft *';
    if (valueLabel) valueLabel.textContent = journey === 'bike' ? 'Rahmengröße *' : 'Wert *';
    
    if (specs.length === 0) {
        emptyStateEl.classList.remove('hidden');
        specsGridEl.classList.add('hidden');
        
        document.querySelector('#emptyState h3').textContent = `Noch keine Einträge hinterlegt`;
        document.querySelector('#emptyState p').textContent = `Hinterlege wichtige Eigenschaften für diese Kaufreise, um sie schnell parat zu haben.`;
        document.querySelector('#emptyState button').textContent = `Eintrag erstellen`;
        
        lucide.createIcons();
        return;
    }
    
    emptyStateEl.classList.add('hidden');
    specsGridEl.classList.remove('hidden');
    
    specs.forEach((item, index) => {
        const card = document.createElement('div');
        card.className = 'spec-card';
        
        card.innerHTML = `
            <div class="spec-card-header">
                <div>
                    <h3 class="spec-label">${escapeHTML(item.label)}</h3>
                </div>
                <span class="spec-value-badge">${escapeHTML(item.value)}</span>
            </div>
            
            <div class="spec-card-actions">
                <button class="btn btn-secondary btn-icon-sm" onclick="openSpecModal(${index})" title="Bearbeiten">
                    <i data-lucide="edit-3"></i>
                </button>
                <button class="btn btn-secondary btn-icon-sm btn-delete" onclick="deleteSpec(${index})" title="Löschen">
                    <i data-lucide="trash-2"></i>
                </button>
            </div>
        `;
        
        specsGridEl.appendChild(card);
    });
    
    lucide.createIcons();
}

// Modal handling
function openSpecModal(index = null) {
    specForm.reset();
    
    if (index !== null) {
        modalTitle.textContent = 'Eintrag bearbeiten';
        editSpecIndexEl.value = index;
        
        const item = appState.specs[index];
        specBrandEl.value = item.label;
        specValueEl.value = item.value;
    } else {
        modalTitle.textContent = 'Eintrag hinzufügen';
        editSpecIndexEl.value = '';
    }
    
    // Set input placeholders dynamically
    specBrandEl.placeholder = journey === 'bike' ? 'z.B. Bianchi, Canyon, Orbea' : 'z.B. Reichweite, Ladezeit';
    specValueEl.placeholder = journey === 'bike' ? 'z.B. 57, L, 55' : 'z.B. 450 km, 20 Min';
    
    specModal.classList.remove('hidden');
    lucide.createIcons();
}

// Close Modal
function closeSpecModal() {
    specModal.classList.add('hidden');
}

// Handle submit
function handleSpecFormSubmit(e) {
    e.preventDefault();
    
    const indexStr = editSpecIndexEl.value;
    const label = specBrandEl.value.trim();
    const value = specValueEl.value.trim();
    
    const specData = { label, value };
    
    if (indexStr !== '') {
        const index = parseInt(indexStr);
        appState.specs[index] = specData;
        saveData('Eintrag aktualisiert');
    } else {
        appState.specs.push(specData);
        saveData('Neuer Eintrag hinzugefügt');
    }
    
    closeSpecModal();
    renderSpecs();
}

// Actions
window.deleteSpec = function(index) {
    const label = appState.specs[index].label;
    if (confirm(`Möchtest du den Eintrag "${label}" wirklich löschen?`)) {
        appState.specs.splice(index, 1);
        renderSpecs();
        saveData(`Eintrag "${label}" gelöscht`);
    }
};

// Helper Functions
function escapeHTML(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Sync Status
function showSyncStatus(color, text) {
    const dot = syncStatusEl.querySelector('.status-dot');
    const textEl = syncStatusEl.querySelector('.status-text');
    
    dot.className = `status-dot ${color}`;
    textEl.textContent = text;
}

// Toast
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
