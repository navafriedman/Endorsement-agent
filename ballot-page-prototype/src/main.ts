import './styles.css';
import { state } from './state';
import {
  renderShell,
  renderViewToggle,
  renderIssuePills,
  renderIdentityPills,
  renderFiltersBar,
  renderRacesView,
  renderIssuesView,
  renderIdentityView,
  updatePanels,
} from './render';

// ============================================================
// MOUNT
// ============================================================

const app = document.getElementById('app')!;
app.innerHTML = renderShell();

// ============================================================
// INITIAL RENDER
// ============================================================

function renderAll(): void {
  renderViewToggle();
  renderIssuePills();
  renderIdentityPills();
  renderFiltersBar();
  renderRacesView();
  renderIssuesView();
  renderIdentityView();
  updatePanels();
}

renderAll();

// ============================================================
// SUBSCRIBE TO STATE CHANGES
// ============================================================

state.subscribe(renderAll);

// ============================================================
// EVENT DELEGATION
// ============================================================

app.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  const btn = target.closest('button') || target.closest('.pill');
  if (!btn) return;

  // View toggle
  const viewAttr = btn.getAttribute('data-view');
  if (viewAttr) {
    state.setView(viewAttr as 'races' | 'issues' | 'identity');
    return;
  }

  // Issue pill
  const issueAttr = btn.getAttribute('data-issue');
  if (issueAttr) {
    state.toggleIssue(issueAttr);
    return;
  }

  // Identity pill
  const identityAttr = btn.getAttribute('data-identity');
  if (identityAttr) {
    state.toggleIdentity(identityAttr);
    return;
  }

  // Clear all
  if (btn.id === 'clear-all') {
    state.clearAll();
    return;
  }
});
