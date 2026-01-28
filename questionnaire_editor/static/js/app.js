/**
 * Election Questionnaire Editor - JavaScript Application
 */

// =============================================================================
// State Management
// =============================================================================

const state = {
    questionnaires: [],
    currentQuestionnaire: null,
    currentContent: null,
    editedContent: null,
    hasUnsavedChanges: false,
    editingRaceIndex: null,
    modalCandidates: []
};

// =============================================================================
// Initialization
// =============================================================================

document.addEventListener('DOMContentLoaded', () => {
    loadQuestionnaires();
    loadFilterStates();
});

// Warn before leaving with unsaved changes
window.addEventListener('beforeunload', (e) => {
    if (state.hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
    }
});

// =============================================================================
// API Functions
// =============================================================================

async function apiCall(url, options = {}) {
    try {
        const response = await fetch(url, {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Request failed' }));
            throw new Error(error.error || `HTTP ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        showToast(error.message, 'error');
        throw error;
    }
}

// =============================================================================
// Questionnaire List
// =============================================================================

async function loadQuestionnaires() {
    const params = new URLSearchParams();

    const state_filter = document.getElementById('filter-state')?.value;
    const city = document.getElementById('filter-city')?.value;
    const startDate = document.getElementById('filter-date-start')?.value;
    const endDate = document.getElementById('filter-date-end')?.value;

    if (state_filter) params.append('state', state_filter);
    if (city) params.append('city', city);
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);

    try {
        const data = await apiCall(`/api/questionnaires?${params}`);
        state.questionnaires = data.questionnaires;
        renderQuestionnaireList();
    } catch (error) {
        console.error('Failed to load questionnaires:', error);
    }
}

function renderQuestionnaireList() {
    const container = document.getElementById('questionnaire-list');
    if (!container) return;

    if (state.questionnaires.length === 0) {
        container.innerHTML = `
            <div class="empty-list">
                <p style="color: var(--text-muted); text-align: center; padding: 20px;">
                    No questionnaires found.<br>Create one or import a JSON file.
                </p>
            </div>
        `;
        return;
    }

    container.innerHTML = state.questionnaires.map(q => `
        <div class="questionnaire-item ${state.currentQuestionnaire?.id === q.id ? 'active' : ''}"
             onclick="selectQuestionnaire(${q.id})">
            <div class="questionnaire-item-name">${escapeHtml(q.name)}</div>
            <div class="questionnaire-item-meta">
                ${q.state ? `<span>${q.state}</span>` : ''}
                ${q.city ? `<span>${q.city}</span>` : ''}
                ${q.primary_date ? `<span>${formatDate(q.primary_date)}</span>` : ''}
            </div>
        </div>
    `).join('');
}

async function selectQuestionnaire(id) {
    if (state.hasUnsavedChanges) {
        if (!confirm('You have unsaved changes. Discard them?')) {
            return;
        }
    }

    try {
        const data = await apiCall(`/api/questionnaires/${id}`);
        state.currentQuestionnaire = data.questionnaire;
        state.currentContent = data.content;
        state.editedContent = JSON.parse(JSON.stringify(data.content));
        state.hasUnsavedChanges = false;

        renderEditor();
        renderQuestionnaireList();

        document.getElementById('empty-state').style.display = 'none';
        document.getElementById('editor-container').style.display = 'block';
    } catch (error) {
        console.error('Failed to load questionnaire:', error);
    }
}

// =============================================================================
// Editor Rendering
// =============================================================================

function renderEditor() {
    if (!state.currentQuestionnaire || !state.editedContent) return;

    document.getElementById('questionnaire-name').textContent = state.currentQuestionnaire.name;
    document.getElementById('version-badge').textContent = `v${state.currentQuestionnaire.current_version}`;
    document.getElementById('edit-name').value = state.editedContent.name || '';
    document.getElementById('edit-description').value = state.editedContent.description || '';

    renderRaces();
}

function renderRaces() {
    const container = document.getElementById('races-container');
    if (!container || !state.editedContent) return;

    const races = state.editedContent.races || [];

    if (races.length === 0) {
        container.innerHTML = `
            <div class="empty-races" style="text-align: center; padding: 40px; color: var(--text-muted);">
                <p>No races added yet. Click "Add Race" to get started.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = races.map((race, index) => `
        <div class="race-card">
            <div class="race-card-header" onclick="editRace(${index})">
                <div>
                    <div class="race-card-title">${escapeHtml(race.name)}</div>
                    <div class="race-card-meta">
                        <span class="race-type-badge ${race.race_type}">${race.race_type}</span>
                        <span>${race.position}</span>
                        ${race.state ? `<span>${race.state}</span>` : ''}
                        ${race.city ? `<span>${race.city}</span>` : ''}
                        ${race.district ? `<span>District ${race.district}</span>` : ''}
                        ${race.primary_date ? `<span>${formatDate(race.primary_date)}</span>` : ''}
                    </div>
                </div>
                <div class="race-card-actions">
                    <button class="btn btn-sm btn-outline" onclick="event.stopPropagation(); editRace(${index})">Edit</button>
                </div>
            </div>
            ${race.candidates && race.candidates.length > 0 ? `
                <div class="race-card-body">
                    <div class="candidates-header">Candidates (${race.candidates.length})</div>
                    ${race.candidates.map(c => `
                        <div class="candidate-row">
                            <span class="candidate-name">${escapeHtml(c.name)}</span>
                            ${c.party ? `<span class="candidate-party">${c.party}</span>` : ''}
                            ${c.incumbent ? `<span class="candidate-incumbent">Incumbent</span>` : ''}
                        </div>
                    `).join('')}
                </div>
            ` : ''}
        </div>
    `).join('');
}

// =============================================================================
// Race Editor
// =============================================================================

function addRace() {
    state.editingRaceIndex = null;
    state.modalCandidates = [];

    // Reset form
    document.getElementById('race-modal-title').textContent = 'Add Race';
    document.getElementById('race-name').value = '';
    document.getElementById('race-position').value = '';
    document.getElementById('race-type').value = 'local';
    document.getElementById('race-year').value = new Date().getFullYear();
    document.getElementById('race-state').value = state.currentQuestionnaire?.state || '';
    document.getElementById('race-city').value = state.currentQuestionnaire?.city || '';
    document.getElementById('race-district').value = '';
    document.getElementById('race-primary-date').value = '';
    document.getElementById('race-general-date').value = '';
    document.getElementById('delete-race-btn').style.display = 'none';

    renderModalCandidates();
    showModal('race-modal');
}

function editRace(index) {
    const race = state.editedContent.races[index];
    if (!race) return;

    state.editingRaceIndex = index;
    state.modalCandidates = JSON.parse(JSON.stringify(race.candidates || []));

    document.getElementById('race-modal-title').textContent = 'Edit Race';
    document.getElementById('race-name').value = race.name || '';
    document.getElementById('race-position').value = race.position || '';
    document.getElementById('race-type').value = race.race_type || 'local';
    document.getElementById('race-year').value = race.year || new Date().getFullYear();
    document.getElementById('race-state').value = race.state || '';
    document.getElementById('race-city').value = race.city || '';
    document.getElementById('race-district').value = race.district || '';
    document.getElementById('race-primary-date').value = race.primary_date || '';
    document.getElementById('race-general-date').value = race.general_date || '';
    document.getElementById('delete-race-btn').style.display = 'inline-flex';

    renderModalCandidates();
    showModal('race-modal');
}

function saveRace() {
    const race = {
        name: document.getElementById('race-name').value.trim(),
        position: document.getElementById('race-position').value.trim(),
        race_type: document.getElementById('race-type').value,
        year: parseInt(document.getElementById('race-year').value),
        state: document.getElementById('race-state').value.trim().toUpperCase(),
        city: document.getElementById('race-city').value.trim(),
        district: document.getElementById('race-district').value.trim() || undefined,
        primary_date: document.getElementById('race-primary-date').value || undefined,
        general_date: document.getElementById('race-general-date').value || undefined,
        candidates: state.modalCandidates.filter(c => c.name.trim())
    };

    // Clean up undefined fields
    Object.keys(race).forEach(key => {
        if (race[key] === undefined || race[key] === '') {
            delete race[key];
        }
    });

    if (!race.name || !race.position) {
        showToast('Race name and position are required', 'error');
        return;
    }

    if (!state.editedContent.races) {
        state.editedContent.races = [];
    }

    if (state.editingRaceIndex !== null) {
        state.editedContent.races[state.editingRaceIndex] = race;
    } else {
        state.editedContent.races.push(race);
    }

    state.hasUnsavedChanges = true;
    renderRaces();
    closeModal('race-modal');
    showToast('Race saved. Remember to save the questionnaire.', 'success');
}

function deleteCurrentRace() {
    if (state.editingRaceIndex === null) return;

    if (!confirm('Are you sure you want to delete this race?')) {
        return;
    }

    state.editedContent.races.splice(state.editingRaceIndex, 1);
    state.hasUnsavedChanges = true;
    renderRaces();
    closeModal('race-modal');
    showToast('Race deleted. Remember to save the questionnaire.', 'warning');
}

// =============================================================================
// Candidate Editor (in modal)
// =============================================================================

function renderModalCandidates() {
    const container = document.getElementById('modal-candidates-list');
    if (!container) return;

    if (state.modalCandidates.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 16px; color: var(--text-muted);">
                No candidates added yet.
            </div>
        `;
        return;
    }

    container.innerHTML = state.modalCandidates.map((c, index) => `
        <div class="candidate-edit-row">
            <input type="text" value="${escapeHtml(c.name)}" placeholder="Candidate name"
                   onchange="updateModalCandidate(${index}, 'name', this.value)">
            <input type="text" value="${escapeHtml(c.party || '')}" placeholder="Party"
                   onchange="updateModalCandidate(${index}, 'party', this.value)">
            <select onchange="updateModalCandidate(${index}, 'incumbent', this.value === 'true')">
                <option value="false" ${!c.incumbent ? 'selected' : ''}>No</option>
                <option value="true" ${c.incumbent ? 'selected' : ''}>Inc.</option>
            </select>
            <button class="btn-icon" onclick="removeModalCandidate(${index})" title="Remove">
                &times;
            </button>
        </div>
    `).join('');
}

function addCandidateToModal() {
    state.modalCandidates.push({
        name: '',
        party: '',
        incumbent: false
    });
    renderModalCandidates();
}

function updateModalCandidate(index, field, value) {
    if (state.modalCandidates[index]) {
        state.modalCandidates[index][field] = value;
    }
}

function removeModalCandidate(index) {
    state.modalCandidates.splice(index, 1);
    renderModalCandidates();
}

// =============================================================================
// Save & Update
// =============================================================================

async function saveQuestionnaire() {
    if (!state.currentQuestionnaire || !state.editedContent) return;

    // Update metadata from form
    state.editedContent.name = document.getElementById('edit-name').value.trim();
    state.editedContent.description = document.getElementById('edit-description').value.trim();

    const changeSummary = prompt('Describe your changes (optional):', '') || 'Updated questionnaire';

    try {
        const data = await apiCall(`/api/questionnaires/${state.currentQuestionnaire.id}`, {
            method: 'PUT',
            body: JSON.stringify({
                content: state.editedContent,
                change_summary: changeSummary
            })
        });

        state.currentQuestionnaire = data.questionnaire;
        state.currentContent = data.content;
        state.editedContent = JSON.parse(JSON.stringify(data.content));
        state.hasUnsavedChanges = false;

        renderEditor();
        loadQuestionnaires();
        showToast('Questionnaire saved successfully!', 'success');
    } catch (error) {
        console.error('Failed to save:', error);
    }
}

// =============================================================================
// Create Questionnaire
// =============================================================================

function showCreateModal() {
    document.getElementById('new-name').value = '';
    document.getElementById('new-description').value = '';
    document.getElementById('new-state').value = '';
    document.getElementById('new-city').value = '';
    document.getElementById('new-primary-date').value = '';
    showModal('create-modal');
}

async function createQuestionnaire() {
    const name = document.getElementById('new-name').value.trim();
    const description = document.getElementById('new-description').value.trim();
    const stateCode = document.getElementById('new-state').value.trim().toUpperCase();
    const city = document.getElementById('new-city').value.trim();
    const primaryDate = document.getElementById('new-primary-date').value;

    if (!name) {
        showToast('Name is required', 'error');
        return;
    }

    const content = {
        name,
        description,
        races: []
    };

    try {
        const data = await apiCall('/api/questionnaires', {
            method: 'POST',
            body: JSON.stringify({
                name,
                description,
                state: stateCode || undefined,
                city: city || undefined,
                primary_date: primaryDate || undefined,
                content
            })
        });

        closeModal('create-modal');
        await loadQuestionnaires();
        await selectQuestionnaire(data.questionnaire.id);
        showToast('Questionnaire created!', 'success');
    } catch (error) {
        console.error('Failed to create:', error);
    }
}

// =============================================================================
// Import / Export
// =============================================================================

async function importFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('/api/questionnaires/import', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Import failed');
        }

        const data = await response.json();
        await loadQuestionnaires();
        await selectQuestionnaire(data.questionnaire.id);
        showToast('Questionnaire imported successfully!', 'success');
    } catch (error) {
        showToast(error.message, 'error');
    }

    // Reset file input
    event.target.value = '';
}

function exportQuestionnaire() {
    if (!state.currentQuestionnaire) return;

    const content = state.editedContent || state.currentContent;
    const blob = new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `${state.currentQuestionnaire.name.replace(/\s+/g, '_').toLowerCase()}_v${state.currentQuestionnaire.current_version}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('Questionnaire exported', 'success');
}

// =============================================================================
// Version History
// =============================================================================

async function showVersionHistory() {
    if (!state.currentQuestionnaire) return;

    try {
        const [versionsData, changesData] = await Promise.all([
            apiCall(`/api/questionnaires/${state.currentQuestionnaire.id}/versions`),
            apiCall(`/api/questionnaires/${state.currentQuestionnaire.id}/changes`)
        ]);

        renderVersionList(versionsData.versions, versionsData.current_version);
        showModal('version-modal');
    } catch (error) {
        console.error('Failed to load version history:', error);
    }
}

function renderVersionList(versions, currentVersion) {
    const container = document.getElementById('version-list');
    if (!container) return;

    container.innerHTML = versions.map(v => `
        <div class="version-item ${v.version_number === currentVersion ? 'current' : ''}">
            <div class="version-info">
                <div class="version-number">
                    Version ${v.version_number}
                    ${v.version_number === currentVersion ? '<span style="color: var(--primary-color);">(Current)</span>' : ''}
                </div>
                <div class="version-meta">${formatDateTime(v.created_at)}</div>
                ${v.change_summary ? `<div class="version-summary">${escapeHtml(v.change_summary)}</div>` : ''}
            </div>
            <div class="version-actions">
                <button class="btn btn-sm btn-outline" onclick="viewVersion(${v.version_number})">View</button>
                ${v.version_number !== currentVersion ? `
                    <button class="btn btn-sm btn-secondary" onclick="rollbackToVersion(${v.version_number})">Restore</button>
                ` : ''}
            </div>
        </div>
    `).join('');
}

async function viewVersion(versionNumber) {
    if (!state.currentQuestionnaire) return;

    try {
        const data = await apiCall(`/api/questionnaires/${state.currentQuestionnaire.id}/versions/${versionNumber}`);
        const content = JSON.stringify(data.content, null, 2);

        // Show in a simple alert for now - could be a nicer modal
        const blob = new Blob([content], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
    } catch (error) {
        console.error('Failed to view version:', error);
    }
}

async function rollbackToVersion(versionNumber) {
    if (!state.currentQuestionnaire) return;

    if (!confirm(`Restore to version ${versionNumber}? This will create a new version with the old content.`)) {
        return;
    }

    try {
        const data = await apiCall(`/api/questionnaires/${state.currentQuestionnaire.id}/versions/${versionNumber}/rollback`, {
            method: 'POST'
        });

        state.currentQuestionnaire = data.questionnaire;
        state.currentContent = data.content;
        state.editedContent = JSON.parse(JSON.stringify(data.content));
        state.hasUnsavedChanges = false;

        renderEditor();
        loadQuestionnaires();
        closeModal('version-modal');
        showToast(`Restored to version ${versionNumber}`, 'success');
    } catch (error) {
        console.error('Failed to rollback:', error);
    }
}

// =============================================================================
// Crawler Integration
// =============================================================================

async function startCrawl() {
    if (!state.currentQuestionnaire) return;

    if (state.hasUnsavedChanges) {
        showToast('Please save your changes before running the crawler', 'warning');
        return;
    }

    if (!confirm('Start the endorsement crawler for this questionnaire?')) {
        return;
    }

    try {
        const data = await apiCall(`/api/questionnaires/${state.currentQuestionnaire.id}/crawl`, {
            method: 'POST'
        });

        showToast(`Crawler job started! Job ID: ${data.job.id}`, 'success');
    } catch (error) {
        console.error('Failed to start crawler:', error);
    }
}

// =============================================================================
// Filtering
// =============================================================================

async function loadFilterStates() {
    try {
        const data = await apiCall('/api/states');
        const select = document.getElementById('filter-state');
        if (select && data.states) {
            data.states.forEach(s => {
                const option = document.createElement('option');
                option.value = s;
                option.textContent = s;
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Failed to load states:', error);
    }
}

let filterTimeout;
function debounceFilter() {
    clearTimeout(filterTimeout);
    filterTimeout = setTimeout(filterQuestionnaires, 300);
}

function filterQuestionnaires() {
    loadQuestionnaires();
}

// =============================================================================
// Modal Utilities
// =============================================================================

function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'flex';
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
    }
}

// Close modal when clicking outside
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        e.target.style.display = 'none';
    }
});

// Close modal with Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.style.display = 'none';
        });
    }
});

// =============================================================================
// Toast Notifications
// =============================================================================

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 4000);
}

// =============================================================================
// Utility Functions
// =============================================================================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
}
