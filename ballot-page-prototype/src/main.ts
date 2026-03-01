import './styles.css';
import { state } from './state';
import {
  renderShell,
  renderFilterBar,
  renderIssuePills,
  renderIdentityPills,
  renderRaceCards,
} from './render';

// ============================================================
// MOUNT
// ============================================================

const app = document.getElementById('app')!;
app.innerHTML = renderShell();

// ============================================================
// RENDER CYCLE
// ============================================================

function renderAll(): void {
  renderFilterBar();
  renderIssuePills();
  renderIdentityPills();
  renderRaceCards();
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
    state.setDropdown(null);
    return;
  }

  // Dropdown toggle buttons
  const dropdownBtn = target.closest('[data-dropdown]') as HTMLElement | null;
  if (dropdownBtn) {
    const which = dropdownBtn.getAttribute('data-dropdown') as 'issues' | 'identity';
    state.toggleDropdown(which);
    return;
  }

  // Issue pill (inside popover)
  const issuePill = target.closest('[data-issue]') as HTMLElement | null;
  if (issuePill) {
    state.toggleIssue(issuePill.getAttribute('data-issue')!);
    return;
  }

  // Identity pill (inside popover)
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

  // Agree/disagree buttons — handle BEFORE expand so clicks don't bubble
  const alignBtn = target.closest('[data-align]') as HTMLElement | null;
  if (alignBtn) {
    e.stopPropagation();
    const key = alignBtn.getAttribute('data-align-key')!;
    const rating = alignBtn.getAttribute('data-align')! as 'agree' | 'disagree';
    state.toggleAlignment(key, rating);
    return;
  }

  // Other issues toggle
  const otherToggle = target.closest('[data-other-toggle]') as HTMLElement | null;
  if (otherToggle) {
    const raceId = otherToggle.getAttribute('data-other-toggle')!;
    state.toggleExpanded(`other:${raceId}`);
    return;
  }

  // Endorsement "more" toggle
  const endorsementToggle = target.closest('[data-endorsement-toggle]') as HTMLElement | null;
  if (endorsementToggle) {
    const candidateName = endorsementToggle.getAttribute('data-endorsement-toggle')!;
    state.toggleExpanded(`endorsements:${candidateName}`);
    return;
  }

  // Address submit
  if (target.closest('#address-btn')) {
    const input = document.getElementById('address-input') as HTMLInputElement;
    const val = input.value.trim();
    if (val) {
      const row = document.getElementById('toolbar-address')!;
      const confirmed = document.getElementById('address-confirmed')!;
      const confirmedText = document.getElementById('address-confirmed-text')!;
      row.style.display = 'none';
      confirmed.style.display = 'inline-flex';
      confirmedText.textContent = val;
    }
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

// Address submit on Enter
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.openDropdown) {
    state.setDropdown(null);
  }
  if (e.key === 'Enter' && (e.target as HTMLElement).id === 'address-input') {
    document.getElementById('address-btn')?.click();
  }
});
