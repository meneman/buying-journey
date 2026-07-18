// Shared Navigation and Journey Selector Logic
const urlParamsShared = new URLSearchParams(window.location.search);
const journeyShared = urlParamsShared.get('journey') || 'bike';

document.addEventListener('DOMContentLoaded', () => {
    // 1. Manage Recent Journeys in LocalStorage
    updateRecentJourneys(journeyShared);
    
    // 2. Render Journey Dropdown
    renderJourneyDropdown();
    
    // 3. Centralized link parameter update
    updateHeaderLinks();
    
    // 4. Set dropdown and modal events
    setupJourneySelectorEvents();
});

function updateRecentJourneys(current) {
    let recent = JSON.parse(localStorage.getItem('recent_journeys') || '[]');
    if (!recent.includes(current)) {
        recent.push(current);
        localStorage.setItem('recent_journeys', JSON.stringify(recent));
    }
}

function renderJourneyDropdown() {
    const listContainer = document.getElementById('recentJourneysList');
    if (!listContainer) return;
    
    listContainer.innerHTML = '';
    
    let recent = JSON.parse(localStorage.getItem('recent_journeys') || '[]');
    if (!recent.includes('bike')) recent.push('bike');
    if (!recent.includes(journeyShared)) recent.push(journeyShared);
    
    recent.forEach(j => {
        const btn = document.createElement('button');
        btn.className = `dropdown-item ${j === journeyShared ? 'active' : ''}`;
        btn.innerHTML = `
            <i data-lucide="compass" style="width: 14px; height: 14px; margin-right: 8px;"></i>
            <span>${escapeHTMLShared(j)}</span>
        `;
        btn.addEventListener('click', () => {
            window.location.href = `${window.location.pathname}?journey=${encodeURIComponent(j)}`;
        });
        listContainer.appendChild(btn);
    });
    
    // Update button text in header
    const currentNameEl = document.getElementById('currentJourneyName');
    if (currentNameEl) {
        currentNameEl.textContent = journeyShared;
    }
}

function updateHeaderLinks() {
    document.querySelectorAll('.header-nav .nav-link').forEach(link => {
        const href = link.getAttribute('href');
        if (href) {
            const cleanHref = href.split('?')[0];
            link.setAttribute('href', `${cleanHref}?journey=${encodeURIComponent(journeyShared)}`);
        }
    });
    
    // Update SilverBullet link
    const sbBtn = document.querySelector('.header-actions a.btn-secondary');
    if (sbBtn) {
        sbBtn.setAttribute('href', `https://notes.wohnli.com/${encodeURIComponent(journeyShared)}.buying-journey`);
    }
}

function setupJourneySelectorEvents() {
    const dropdownBtn = document.getElementById('journeyDropdownBtn');
    const dropdownMenu = document.getElementById('journeyDropdownMenu');
    
    if (dropdownBtn && dropdownMenu) {
        // Toggle dropdown
        dropdownBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdownMenu.classList.toggle('hidden');
        });
        
        // Hide dropdown when clicking outside
        document.addEventListener('click', () => {
            dropdownMenu.classList.add('hidden');
        });
        
        dropdownMenu.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }
    
    // Modal controls
    const createBtn = document.getElementById('createJourneyBtn');
    const modal = document.getElementById('journeyModal');
    const closeBtn = document.getElementById('closeJourneyModalBtn');
    const cancelBtn = document.getElementById('cancelJourneyModalBtn');
    const form = document.getElementById('journeyForm');
    
    if (createBtn && modal) {
        createBtn.addEventListener('click', () => {
            modal.classList.remove('hidden');
            if (dropdownMenu) dropdownMenu.classList.add('hidden');
            document.getElementById('newJourneyId').focus();
        });
    }
    
    if (closeBtn && modal) {
        closeBtn.addEventListener('click', () => modal.classList.add('hidden'));
    }
    
    if (cancelBtn && modal) {
        cancelBtn.addEventListener('click', () => modal.classList.add('hidden'));
    }
    
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const newId = document.getElementById('newJourneyId').value.trim().toLowerCase().replace(/[^a-z0-9.-]/g, '');
            if (newId) {
                // Redirect to the new journey page
                window.location.href = `index.html?journey=${encodeURIComponent(newId)}`;
            }
        });
    }
}

function escapeHTMLShared(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
