import './styles.css';
import { state } from './state';
import {
  renderShell,
  renderIssueStep,
  renderGroupStep,
  renderResultsStep,
  renderBallotBar,
  renderBallotSummary,
} from './render';

// ============================================================
// MOUNT
// ============================================================

const app = document.getElementById('app')!;
app.innerHTML = renderShell();

// ============================================================
// RENDER CYCLE
// ============================================================

function renderStep(): void {
  const el = document.getElementById('step-content')!;

  switch (state.step) {
    case 'issues':
      el.innerHTML = renderIssueStep();
      break;
    case 'groups':
      el.innerHTML = renderGroupStep();
      break;
    case 'results':
      el.innerHTML = renderResultsStep();
      break;
  }

  renderBallotBar();
  renderBallotSummary();
}

renderStep();
state.subscribe(renderStep);

// ============================================================
// EVENT DELEGATION
// ============================================================

app.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;

  // Stance selection (Step 1)
  const stanceBtn = target.closest('[data-stance-issue]') as HTMLElement | null;
  if (stanceBtn) {
    const issueId = stanceBtn.getAttribute('data-stance-issue')!;
    const choice = stanceBtn.getAttribute('data-stance-choice')! as 'agree' | 'disagree' | 'skip';
    state.setIssueStance(issueId, choice);
    return;
  }

  // Group selection (Step 2)
  const groupBtn = target.closest('[data-group]') as HTMLElement | null;
  if (groupBtn) {
    state.toggleGroup(groupBtn.getAttribute('data-group')!);
    return;
  }

  // Navigation
  if (target.closest('#go-to-groups')) {
    state.setStep('groups');
    return;
  }
  if (target.closest('#back-to-issues')) {
    state.setStep('issues');
    return;
  }
  if (target.closest('#show-results')) {
    state.setStep('results');
    return;
  }
  if (target.closest('#edit-preferences')) {
    state.setStep('issues');
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

// Keyboard handlers
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (state.ballotOpen) {
      state.setBallotOpen(false);
    }
  }
});
