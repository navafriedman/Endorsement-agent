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
// FOCUS SAVE / RESTORE
// ============================================================

function saveFocus(): { key: string | null; scrollY: number } {
  const active = document.activeElement as HTMLElement | null;
  const scrollY = window.scrollY;
  if (!active || active === document.body) return { key: null, scrollY };

  // Build a selector that can find this element after re-render
  if (active.dataset.align && active.dataset.alignKey) {
    return { key: `[data-align="${active.dataset.align}"][data-align-key="${CSS.escape(active.dataset.alignKey)}"]`, scrollY };
  }
  if (active.dataset.detailToggle) {
    return { key: `[data-detail-toggle="${CSS.escape(active.dataset.detailToggle)}"]`, scrollY };
  }
  if (active.dataset.otherToggle) {
    return { key: `[data-other-toggle="${CSS.escape(active.dataset.otherToggle)}"]`, scrollY };
  }
  if (active.dataset.endorsementToggle) {
    return { key: `[data-endorsement-toggle="${CSS.escape(active.dataset.endorsementToggle)}"]`, scrollY };
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
  renderIssuePills();
  renderIdentityPills();
  renderRaceCards();
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

  // Dropdown toggle buttons
  const dropdownBtn = target.closest('[data-dropdown]') as HTMLElement | null;
  if (dropdownBtn) {
    const which = dropdownBtn.getAttribute('data-dropdown') as 'issues' | 'identity';
    state.toggleDropdown(which);
    // If we just opened, move focus into the popover
    if (state.openDropdown === which) {
      requestAnimationFrame(() => {
        const popover = dropdownBtn.closest('.filter-dropdown')?.querySelector('.filter-popover') as HTMLElement | null;
        const firstPill = popover?.querySelector('.pill') as HTMLElement | null;
        if (firstPill) firstPill.focus();
      });
    }
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

  // Position detail toggle
  const detailToggle = target.closest('[data-detail-toggle]') as HTMLElement | null;
  if (detailToggle) {
    const key = detailToggle.getAttribute('data-detail-toggle')!;
    state.toggleExpanded(key);
    return;
  }

  // Other issues toggle
  const otherToggle = target.closest('[data-other-toggle]') as HTMLElement | null;
  if (otherToggle) {
    state.toggleExpanded(otherToggle.getAttribute('data-other-toggle')!);
    return;
  }

  // Endorsement "more" toggle
  const endorsementToggle = target.closest('[data-endorsement-toggle]') as HTMLElement | null;
  if (endorsementToggle) {
    state.toggleExpanded(endorsementToggle.getAttribute('data-endorsement-toggle')!);
    return;
  }

  // Share race
  const shareBtn = target.closest('[data-share-race]') as HTMLElement | null;
  if (shareBtn) {
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
      const row = document.getElementById('toolbar-address')!;
      const confirmed = document.getElementById('address-confirmed')!;
      const confirmedText = document.getElementById('address-confirmed-text')!;
      row.style.display = 'none';
      confirmed.style.display = 'inline-flex';
      confirmedText.textContent = val;
    }
  });
}

// Keyboard handlers
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.openDropdown) {
    const triggerBtn = document.querySelector(`[data-dropdown="${state.openDropdown}"]`) as HTMLElement | null;
    state.setDropdown(null);
    if (triggerBtn) triggerBtn.focus();
  }
});
