import './styles.css';
import { state } from './state';
import {
  renderShell,
  renderFilterBar,
  renderFilterPills,
  renderRaceCards,
  renderBallotBar,
  renderBallotSummary,
  renderPostPrintModal,
} from './render';

// ============================================================
// MOUNT
// ============================================================

const app = document.getElementById('app')!;
app.innerHTML = renderShell();

// ============================================================
// FOCUS SAVE / RESTORE
// ============================================================

function saveFocus(): { key: string | null; scrollY: number } {
  const active = document.activeElement as HTMLElement | null;
  const scrollY = window.scrollY;
  if (!active || active === document.body) return { key: null, scrollY };

  if (active.dataset.align && active.dataset.alignKey) {
    return { key: `[data-align="${active.dataset.align}"][data-align-key="${CSS.escape(active.dataset.alignKey)}"]`, scrollY };
  }
  if (active.dataset.issueExpand) {
    return { key: `[data-issue-expand="${CSS.escape(active.dataset.issueExpand)}"]`, scrollY };
  }
  if (active.dataset.endorseExpand) {
    return { key: `[data-endorse-expand="${CSS.escape(active.dataset.endorseExpand)}"]`, scrollY };
  }
  if (active.dataset.selectCandidate && active.dataset.selectRace) {
    return { key: `[data-select-candidate="${CSS.escape(active.dataset.selectCandidate)}"][data-select-race="${CSS.escape(active.dataset.selectRace)}"]`, scrollY };
  }
  if (active.dataset.otherToggle) {
    return { key: `[data-other-toggle="${CSS.escape(active.dataset.otherToggle)}"]`, scrollY };
  }
  if (active.id) {
    return { key: `#${CSS.escape(active.id)}`, scrollY };
  }
  return { key: null, scrollY };
}

function restoreFocus(saved: { key: string | null; scrollY: number }): void {
  if (saved.key) {
    const el = document.querySelector(saved.key) as HTMLElement | null;
    if (el) {
      el.focus({ preventScroll: true });
    }
  }
  window.scrollTo(0, saved.scrollY);
}

// ============================================================
// RENDER CYCLE
// ============================================================

function renderAll(): void {
  const focus = saveFocus();
  renderFilterBar();
  renderFilterPills();
  renderRaceCards();
  renderBallotBar();
  renderBallotSummary();
  restoreFocus(focus);
}

renderAll();
state.subscribe(renderAll);

// ============================================================
// EVENT DELEGATION
// ============================================================

app.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;

  // Filter overlay click — close dropdowns
  if (target.id === 'filter-overlay') {
    const triggerBtn = state.openDropdown
      ? document.querySelector(`[data-dropdown="${state.openDropdown}"]`) as HTMLElement | null
      : null;
    state.setDropdown(null);
    if (triggerBtn) triggerBtn.focus();
    return;
  }

  // Dropdown toggle button
  const dropdownBtn = target.closest('[data-dropdown]') as HTMLElement | null;
  if (dropdownBtn) {
    const which = dropdownBtn.getAttribute('data-dropdown') as 'filters';
    state.toggleDropdown(which);
    if (state.openDropdown === which) {
      requestAnimationFrame(() => {
        const popover = dropdownBtn.closest('.filter-dropdown')?.querySelector('.filter-popover') as HTMLElement | null;
        const firstPill = popover?.querySelector('.pill') as HTMLElement | null;
        if (firstPill) firstPill.focus();
      });
    }
    return;
  }

  // Issue pill
  const issuePill = target.closest('[data-issue]') as HTMLElement | null;
  if (issuePill) {
    state.toggleIssue(issuePill.getAttribute('data-issue')!);
    return;
  }

  // Identity pill
  const identityPill = target.closest('[data-identity]') as HTMLElement | null;
  if (identityPill) {
    state.toggleIdentity(identityPill.getAttribute('data-identity')!);
    return;
  }

  // Remove filter tag
  const removeIssue = target.closest('[data-remove-issue]') as HTMLElement | null;
  if (removeIssue) {
    state.toggleIssue(removeIssue.getAttribute('data-remove-issue')!);
    return;
  }
  const removeIdentity = target.closest('[data-remove-identity]') as HTMLElement | null;
  if (removeIdentity) {
    state.toggleIdentity(removeIdentity.getAttribute('data-remove-identity')!);
    return;
  }

  // Clear all
  if (target.closest('#clear-all')) {
    state.clearAll();
    return;
  }

  // Candidate selection
  const selectBtn = target.closest('[data-select-candidate]') as HTMLElement | null;
  if (selectBtn) {
    const candidateName = selectBtn.getAttribute('data-select-candidate')!;
    const raceId = selectBtn.getAttribute('data-select-race')!;
    state.selectCandidate(raceId, candidateName);
    return;
  }

  // Issue row expand/collapse
  const issueExpand = target.closest('[data-issue-expand]') as HTMLElement | null;
  if (issueExpand) {
    state.recordEngagement();
    state.toggleExpanded(issueExpand.getAttribute('data-issue-expand')!);
    return;
  }

  // Endorsement expand/collapse
  const endorseExpand = target.closest('[data-endorse-expand]') as HTMLElement | null;
  if (endorseExpand) {
    state.toggleExpanded(endorseExpand.getAttribute('data-endorse-expand')!);
    return;
  }

  // Agree/disagree buttons
  const alignBtn = target.closest('[data-align]') as HTMLElement | null;
  if (alignBtn) {
    e.stopPropagation();
    const key = alignBtn.getAttribute('data-align-key')!;
    const rating = alignBtn.getAttribute('data-align')! as 'agree' | 'disagree';
    state.toggleAlignment(key, rating);
    return;
  }

  // Other issue tag — click to add that issue
  const addIssue = target.closest('[data-add-issue]') as HTMLElement | null;
  if (addIssue) {
    const issueId = addIssue.getAttribute('data-add-issue')!;
    if (!state.selectedIssues.has(issueId)) {
      state.toggleIssue(issueId);
    }
    return;
  }

  // Other issues toggle
  const otherToggle = target.closest('[data-other-toggle]') as HTMLElement | null;
  if (otherToggle) {
    state.toggleExpanded(otherToggle.getAttribute('data-other-toggle')!);
    return;
  }

  // Share race
  const shareBtn = target.closest('[data-share-race]') as HTMLElement | null;
  if (shareBtn) {
    state.recordEngagement();
    const raceId = shareBtn.getAttribute('data-share-race')!;
    const url = `${window.location.origin}${window.location.pathname}#race-${raceId}`;
    if (navigator.share) {
      navigator.share({ url }).catch(() => {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        const label = shareBtn.querySelector('.share-label');
        if (label) label.textContent = 'Copied!';
        shareBtn.classList.add('copied');
        setTimeout(() => {
          const liveBtn = document.querySelector(`[data-share-race="${raceId}"]`);
          if (liveBtn) {
            liveBtn.classList.remove('copied');
            const liveLabel = liveBtn.querySelector('.share-label');
            if (liveLabel) liveLabel.textContent = 'Share';
          }
        }, 2000);
      });
    }
    return;
  }

  // View ballot summary
  if (target.closest('#view-ballot-summary')) {
    state.setBallotSummaryOpen(true);
    return;
  }

  // Close ballot summary
  if (target.closest('#ballot-summary-close') || target.closest('#ballot-summary-done')) {
    state.setBallotSummaryOpen(false);
    return;
  }

  // Ballot summary overlay background click
  if (target.id === 'ballot-summary-overlay') {
    state.setBallotSummaryOpen(false);
    return;
  }

  // Ballot summary "Change" button — jump to race
  const summaryJump = target.closest('[data-summary-jump]') as HTMLElement | null;
  if (summaryJump) {
    const raceId = summaryJump.getAttribute('data-summary-jump')!;
    state.setBallotSummaryOpen(false);
    requestAnimationFrame(() => {
      const raceEl = document.getElementById(`race-${raceId}`);
      if (raceEl) raceEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    return;
  }

  // Ballot summary print
  if (target.closest('#ballot-summary-print')) {
    window.print();
    return;
  }

  // Donation dismiss
  if (target.closest('#donation-dismiss') || target.closest('#donation-dismiss-later')) {
    state.dismissDonation();
    return;
  }

  // Print guide
  if (target.closest('#print-guide')) {
    window.print();
    const container = document.getElementById('donation-modal-container');
    if (container) {
      container.innerHTML = renderPostPrintModal();
      const overlay = document.getElementById('donation-modal-overlay');
      if (overlay) overlay.classList.add('visible');
    }
    return;
  }

  // "Customize" hint
  if (target.closest('#hint-customize')) {
    state.setDropdown('filters');
    return;
  }

  // Address change
  if (target.closest('#address-change')) {
    const row = document.getElementById('toolbar-address')!;
    const confirmed = document.getElementById('address-confirmed')!;
    row.style.display = '';
    confirmed.style.display = 'none';
    const input = document.getElementById('address-input') as HTMLInputElement;
    input.focus();
    return;
  }
});

// Address form submission
const addressForm = document.getElementById('toolbar-address') as HTMLFormElement | null;
if (addressForm) {
  addressForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('address-input') as HTMLInputElement;
    const val = input.value.trim();
    if (val) {
      state.recordEngagement();
      const row = document.getElementById('toolbar-address')!;
      const confirmed = document.getElementById('address-confirmed')!;
      const confirmedText = document.getElementById('address-confirmed-text')!;
      row.style.display = 'none';
      confirmed.style.display = 'inline-flex';
      confirmedText.textContent = val;
    }
  });
}

// Donation modal handlers
document.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  if (target.closest('#donation-modal-close') || target.closest('#donation-modal-skip') || target.id === 'donation-modal-overlay') {
    const overlay = document.getElementById('donation-modal-overlay');
    if (overlay) overlay.classList.remove('visible');
  }
});

// Keyboard handlers
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    // Close ballot summary
    if (state.ballotSummaryOpen) {
      state.setBallotSummaryOpen(false);
      return;
    }
    // Close donation modal
    const modal = document.getElementById('donation-modal-overlay');
    if (modal?.classList.contains('visible')) {
      modal.classList.remove('visible');
      return;
    }
    // Close dropdown
    if (state.openDropdown) {
      const triggerBtn = document.querySelector(`[data-dropdown="${state.openDropdown}"]`) as HTMLElement | null;
      state.setDropdown(null);
      if (triggerBtn) triggerBtn.focus();
    }
  }
});
