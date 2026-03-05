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
  const el = document.getElementById('page-content')!;
  el.innerHTML = renderPage();
  renderBallotBar();
  renderBallotSummary();

  // Update overlay
  const overlay = document.getElementById('filter-overlay')!;
  overlay.classList.toggle('visible', state.filterOpen !== null);

  window.scrollTo(0, scrollY);
}

renderAll();
state.subscribe(renderAll);

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

  // Detail toggle
  const detailToggle = target.closest('[data-detail-toggle]') as HTMLElement | null;
  if (detailToggle) {
    state.toggleExpanded(detailToggle.getAttribute('data-detail-toggle')!);
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

// Keyboard
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (state.ballotOpen) {
      state.setBallotOpen(false);
    } else if (state.filterOpen) {
      state.setFilterOpen(null);
    }
  }
});
