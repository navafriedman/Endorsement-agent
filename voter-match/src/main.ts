import './styles.css';
import { state } from './state';
import {
  renderShell,
  renderPage,
  renderBallotBar,
  renderBallotSummary,
} from './render';

// ============================================================
// MOUNT
// ============================================================

const app = document.getElementById('app')!;
app.innerHTML = renderShell();

// ============================================================
// RENDER
// ============================================================

function renderAll(): void {
  const scrollY = window.scrollY;
  const focused = document.activeElement as HTMLElement | null;
  const focusId = focused?.id;
  const cursorPos = focused instanceof HTMLInputElement ? focused.selectionStart : null;

  const el = document.getElementById('page-content')!;
  el.innerHTML = renderPage();
  renderBallotBar();
  renderBallotSummary();

  // Update overlay
  const overlay = document.getElementById('filter-overlay')!;
  overlay.classList.toggle('visible', state.filterOpen !== null);

  window.scrollTo(0, scrollY);

  // Restore focus on search inputs after re-render
  if (focusId) {
    const restore = document.getElementById(focusId) as HTMLInputElement | null;
    if (restore) {
      restore.focus();
      if (cursorPos !== null && 'setSelectionRange' in restore) {
        restore.setSelectionRange(cursorPos, cursorPos);
      }
    }
  }
}

renderAll();
state.subscribe(renderAll);

// Hash-based navigation (browser back button support)
window.addEventListener('popstate', () => {
  const hash = location.hash;
  if (hash.startsWith('#candidate/')) {
    const parts = hash.slice(1).split('/');
    const raceId = parts[1];
    const name = decodeURIComponent(parts[2]);
    if (raceId && name) {
      state.openCandidate(raceId, name);
    }
  } else if (state.activeView.type === 'candidate') {
    state.backToBallot();
  }
});

// ============================================================
// EVENT DELEGATION
// ============================================================

app.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;

  // Filter buttons
  const filterBtn = target.closest('[data-open-filter]') as HTMLElement | null;
  if (filterBtn) {
    const which = filterBtn.getAttribute('data-open-filter') as 'issues' | 'groups';
    state.setFilterOpen(which);
    return;
  }

  // Close filter
  if (target.closest('[data-close-filter]')) {
    state.setFilterOpen(null);
    return;
  }

  // Filter overlay click
  if (target.id === 'filter-overlay') {
    state.setFilterOpen(null);
    return;
  }

  // Stance selection
  const stanceBtn = target.closest('[data-stance-issue]') as HTMLElement | null;
  if (stanceBtn) {
    const issueId = stanceBtn.getAttribute('data-stance-issue')!;
    const choice = stanceBtn.getAttribute('data-stance-choice')! as 'agree' | 'disagree' | 'skip';
    state.setIssueStance(issueId, choice);
    return;
  }

  // Importance selection
  const impBtn = target.closest('[data-imp-issue]') as HTMLElement | null;
  if (impBtn) {
    const issueId = impBtn.getAttribute('data-imp-issue')!;
    const level = impBtn.getAttribute('data-imp-level')! as 'low' | 'medium' | 'high';
    state.setIssueImportance(issueId, level);
    return;
  }

  // Group selection
  const groupBtn = target.closest('[data-group]') as HTMLElement | null;
  if (groupBtn) {
    state.toggleGroup(groupBtn.getAttribute('data-group')!);
    return;
  }

  // Remove issue tag
  const removeIssue = target.closest('[data-remove-issue]') as HTMLElement | null;
  if (removeIssue) {
    state.setIssueStance(removeIssue.getAttribute('data-remove-issue')!, 'skip');
    return;
  }

  // Remove group tag
  const removeGroup = target.closest('[data-remove-group]') as HTMLElement | null;
  if (removeGroup) {
    state.toggleGroup(removeGroup.getAttribute('data-remove-group')!);
    return;
  }

  // Clear all
  if (target.closest('#clear-all')) {
    state.clearIssues();
    state.clearGroups();
    return;
  }

  // Candidate selection
  const selectBtn = target.closest('[data-select-candidate]') as HTMLElement | null;
  if (selectBtn) {
    state.selectCandidate(
      selectBtn.getAttribute('data-select-race')!,
      selectBtn.getAttribute('data-select-candidate')!,
    );
    return;
  }

  // Open candidate view
  const openCandidate = target.closest('[data-open-candidate]') as HTMLElement | null;
  if (openCandidate) {
    e.preventDefault();
    state.openCandidate(
      openCandidate.getAttribute('data-race')!,
      openCandidate.getAttribute('data-candidate')!,
    );
    window.scrollTo(0, 0);
    return;
  }

  // Back to ballot
  if (target.closest('[data-back-to-ballot]')) {
    state.backToBallot();
    return;
  }

  // Toggle position card (candidate view)
  const togglePos = target.closest('[data-toggle-position]') as HTMLElement | null;
  if (togglePos) {
    state.togglePosition(togglePos.getAttribute('data-toggle-position')!);
    return;
  }

  // Scroll to section (candidate view nav)
  const scrollSection = target.closest('[data-scroll-section]') as HTMLElement | null;
  if (scrollSection) {
    e.preventDefault();
    const sectionId = scrollSection.getAttribute('data-scroll-section')!;
    const sectionEl = document.getElementById(sectionId);
    if (sectionEl) sectionEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }

  // Detail toggle (candidate details + other positions)
  const detailToggle = target.closest('[data-detail-toggle]') as HTMLElement | null;
  if (detailToggle) {
    state.toggleExpanded(detailToggle.getAttribute('data-detail-toggle')!);
    return;
  }

  // Race type filter
  const raceFilter = target.closest('[data-race-filter]') as HTMLElement | null;
  if (raceFilter) {
    state.setRaceTypeFilter(raceFilter.getAttribute('data-race-filter')! as 'all' | 'federal' | 'state' | 'local');
    return;
  }

  // Group category filter
  const groupCat = target.closest('[data-group-cat]') as HTMLElement | null;
  if (groupCat) {
    state.setGroupCategory(groupCat.getAttribute('data-group-cat')!);
    return;
  }

  // Address lookup
  if (target.closest('#address-lookup')) {
    const input = document.getElementById('address-input') as HTMLInputElement | null;
    if (input && input.value.trim()) {
      state.setAddress(input.value.trim());
    }
    return;
  }
  if (target.closest('#address-change')) {
    state.setAddress('');
    return;
  }

  // Ballot bar
  if (target.closest('#view-ballot-summary')) {
    state.setBallotOpen(true);
    return;
  }
  if (target.closest('#ballot-summary-close') || target.closest('#ballot-summary-done')) {
    state.setBallotOpen(false);
    return;
  }
  if (target.id === 'ballot-summary-overlay') {
    state.setBallotOpen(false);
    return;
  }

  // Ballot summary jump
  const summaryJump = target.closest('[data-summary-jump]') as HTMLElement | null;
  if (summaryJump) {
    const raceId = summaryJump.getAttribute('data-summary-jump')!;
    state.setBallotOpen(false);
    requestAnimationFrame(() => {
      const raceEl = document.getElementById(`race-${raceId}`);
      if (raceEl) raceEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    return;
  }

  // Print
  if (target.closest('#ballot-summary-print')) {
    window.print();
    return;
  }
});

// Group search input
app.addEventListener('input', (e) => {
  const target = e.target as HTMLElement;
  if (target.id === 'group-search-input') {
    state.setGroupSearch((target as HTMLInputElement).value);
  }
});

// Keyboard
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (state.ballotOpen) {
      state.setBallotOpen(false);
    } else if (state.activeView.type === 'candidate') {
      state.backToBallot();
    } else if (state.filterOpen) {
      state.setFilterOpen(null);
    }
  }
  // Enter in address input
  if (e.key === 'Enter' && (e.target as HTMLElement).id === 'address-input') {
    const input = e.target as HTMLInputElement;
    if (input.value.trim()) {
      state.setAddress(input.value.trim());
    }
  }
});
