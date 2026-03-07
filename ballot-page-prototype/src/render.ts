import type { Candidate, Race } from './types';
import { ISSUES, IDENTITY_GROUPS, RACES, ISSUE_COLORS } from './data';
import { state } from './state';

// ============================================================
// HELPERS
// ============================================================

function renderStancePills(stances: string[], colors: { bg: string; text: string } | undefined): string {
  return stances.map(s =>
    `<span class="stance-pill" style="background:${colors?.bg ?? '#f1f5f9'};color:${colors?.text ?? '#475569'}">${esc(s)}</span>`
  ).join('');
}

function esc(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function countCandidatesWithIssue(issueId: string): number {
  let n = 0;
  RACES.forEach(r => r.candidates.forEach(c => { if (c.issues[issueId]) n++; }));
  return n;
}

function countEndorsements(groupId: string): number {
  let n = 0;
  RACES.forEach(r => r.candidates.forEach(c => { if (c.endorsements.includes(groupId)) n++; }));
  return n;
}

const THUMB_UP = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M2 20h2V9H2v11zm20-9a2 2 0 0 0-2-2h-6.32l.95-4.57.03-.32a1.5 1.5 0 0 0-.44-1.06L13.17 2 7.59 7.59A2 2 0 0 0 7 9v10a2 2 0 0 0 2 2h9a2 2 0 0 0 1.84-1.22l3.02-7.05A2 2 0 0 0 22 11z"/></svg>';
const THUMB_DOWN = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M22 4h-2v11h2V4zM2 13a2 2 0 0 0 2 2h6.32l-.95 4.57-.03.32c0 .4.16.77.44 1.06L10.83 22l5.58-5.59A2 2 0 0 0 17 15V5a2 2 0 0 0-2-2H6a2 2 0 0 0-1.84 1.22l-3.02 7.05A2 2 0 0 0 2 13z"/></svg>';
const ICON_EXTERNAL = '<svg class="source-link-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';
const ICON_CHEVRON = '<svg class="detail-chevron" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
const ICON_SHARE = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>';

// ============================================================
// STANCE COMPARISON (for alignment inference)
// ============================================================

function compareStances(stancesA: string[], stancesB: string[]): 'similar' | 'opposed' | 'unknown' {
  const wordsOf = (stances: string[]) =>
    new Set(stances.flatMap(s => s.toLowerCase().split(/\W+/).filter(w => w.length > 2)));

  const aWords = wordsOf(stancesA);
  const bWords = wordsOf(stancesB);

  // Check for opposition patterns
  const opposites: [string, string][] = [
    ['opposes', 'supports'], ['oppose', 'support'],
    ['against', 'pro'], ['anti', 'pro'],
    ['cut', 'expand'], ['reduce', 'increase'],
    ['restrict', 'expand'], ['criminalize', 'protect'],
    ['ban', 'protect'], ['opposes', 'expand'],
    ['strict', 'pathway'], ['enforcement', 'pathway'],
    ['opposes', 'funding'], ['cut', 'funding'],
    ['opposes', 'reform'], ['strict', 'comprehensive'],
  ];

  for (const [a, b] of opposites) {
    if ((aWords.has(a) && bWords.has(b)) || (aWords.has(b) && bWords.has(a))) {
      return 'opposed';
    }
  }

  // Check for meaningful word overlap
  const stopWords = new Set(['the', 'and', 'for', 'with', 'new', 'more']);
  const aMeaningful = [...aWords].filter(w => !stopWords.has(w));
  const overlap = aMeaningful.filter(w => bWords.has(w));
  if (overlap.length >= 2) return 'similar';
  if (overlap.length >= 1 && aMeaningful.length <= 3) return 'similar';

  return 'unknown';
}

type InferResult = { rating: 'agree' | 'disagree'; from: string } | null;

// All candidates flattened from all races (static data, computed once)
const ALL_CANDIDATES: Candidate[] = RACES.flatMap(r => r.candidates);

function getInferredAlignment(candidate: Candidate, issueId: string): InferResult {
  const pos = candidate.issues[issueId];
  if (!pos) return null;

  // Search ALL candidates across ALL races for an explicit rating on this issue
  for (const other of ALL_CANDIDATES) {
    if (other.name === candidate.name) continue;
    const otherPos = other.issues[issueId];
    if (!otherPos) continue;

    const otherKey = `${other.name}:${issueId}`;
    const otherRating = state.getAlignment(otherKey);
    if (!otherRating) continue;

    const cmp = compareStances(pos.stances, otherPos.stances);
    if (cmp === 'similar') {
      return { rating: otherRating, from: other.name };
    }
    if (cmp === 'opposed') {
      return { rating: otherRating === 'agree' ? 'disagree' : 'agree', from: other.name };
    }
  }

  return null;
}

function getFullAlignmentScore(candidate: Candidate): { score: number; total: number } | null {
  let agrees = 0;
  let total = 0;

  for (const issueId of state.selectedIssues) {
    if (!candidate.issues[issueId]) continue;

    const key = `${candidate.name}:${issueId}`;
    const explicit = state.getAlignment(key);

    if (explicit) {
      total++;
      if (explicit === 'agree') agrees++;
    } else {
      const inferred = getInferredAlignment(candidate, issueId);
      if (inferred) {
        total++;
        if (inferred.rating === 'agree') agrees++;
      }
    }
  }

  if (total === 0) return null;
  return { score: Math.round((agrees / total) * 100), total };
}

// ============================================================
// LAYOUT SHELL
// ============================================================

export function renderShell(): string {
  return `
    <a class="skip-link" href="#race-cards">Skip to ballot</a>
    <header class="header" role="banner">
      <div class="container">
        <a class="logo" href="/">change<span>.vote</span></a>
        <span class="header-tagline">Your Personalized Ballot Guide</span>
        <button type="button" class="print-guide-btn" id="print-guide" aria-label="Print your ballot guide">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
          Print my guide
        </button>
        <a href="https://change.vote/donate" class="header-support-link" target="_blank" rel="noopener">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
          Support us
        </a>
      </div>
    </header>

    <main class="container" id="main">
      <h1 class="ballot-headline">Build your ballot in seconds.</h1>
      <div class="toolbar" id="toolbar" role="toolbar" aria-label="Ballot filters">
        <div class="toolbar-row toolbar-top">
          <form class="toolbar-address" id="toolbar-address" role="search" aria-label="Address lookup">
            <svg class="toolbar-addr-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            <label for="address-input" class="sr-only">Your address</label>
            <input type="text" class="toolbar-addr-input" id="address-input" placeholder="Enter your address...">
            <button type="submit" class="toolbar-addr-btn" id="address-btn">Find ballot</button>
          </form>
          <div class="toolbar-address-confirmed" id="address-confirmed" style="display:none">
            <svg class="toolbar-addr-check" aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            <span id="address-confirmed-text"></span>
            <button type="button" class="toolbar-addr-change" id="address-change">Change</button>
          </div>
          <div class="toolbar-election" aria-hidden="true">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="18" rx="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            TX Primary — Mar 3, 2026
          </div>
        </div>
        <div class="toolbar-row toolbar-filters">
          <div class="filter-dropdown" id="dropdown-filters">
            <button class="filter-dropdown-btn" data-dropdown="filters" aria-expanded="false" aria-haspopup="true" aria-controls="popover-filters">
              What matters to you? <span class="caret" aria-hidden="true">&#9662;</span>
            </button>
            <div class="filter-popover" id="popover-filters" role="dialog" aria-label="Select issues and groups">
              <div class="popover-section">
                <h2 class="filter-popover-heading">Issues</h2>
                <p>Pick topics to compare candidate stances side by side.</p>
                <div class="pill-grid" id="issue-pills" role="group" aria-label="Issue filters"></div>
              </div>
              <div class="popover-divider"></div>
              <div class="popover-section">
                <h2 class="filter-popover-heading">Groups you trust</h2>
                <p>Select organizations and we'll highlight who they endorse.</p>
                <div class="pill-grid" id="identity-pills" role="group" aria-label="Group filters"></div>
              </div>
            </div>
          </div>
          <div class="filter-active-tags" id="filter-active-tags" role="list" aria-label="Active filters"></div>
          <button class="clear-all-link" id="clear-all" style="display:none">Clear all</button>
        </div>
      </div>
      <div class="filter-bar-hint" id="filter-hint" role="status">
        Select issues or groups above to compare candidates on what matters to you
      </div>
      <div class="filter-overlay" id="filter-overlay"></div>

      <div id="race-cards" aria-live="polite"></div>
      <div id="live-status" class="sr-only" aria-live="polite" aria-atomic="true"></div>
    </main>

    <footer class="footer" role="contentinfo">
      <div class="container">
        Nonpartisan. Private. No account needed. — <a href="/">change.vote</a><br>
        All candidate positions sourced and linked. Endorsement data from public records.
      </div>
    </footer>

    <div id="ballot-bar"></div>
    <div id="ballot-summary-container"></div>
    <div id="donation-modal-container"></div>
  `;
}

// ============================================================
// FILTER BAR
// ============================================================

export function renderFilterBar(): void {
  const filtersBtn = document.querySelector('#dropdown-filters .filter-dropdown-btn') as HTMLElement;
  const filtersDD = document.getElementById('dropdown-filters')!;
  const overlay = document.getElementById('filter-overlay')!;
  const tagsEl = document.getElementById('filter-active-tags')!;
  const clearBtn = document.getElementById('clear-all')!;
  const hint = document.getElementById('filter-hint')!;

  // Dropdown open state + aria-expanded
  const filtersOpen = state.openDropdown === 'filters';
  filtersDD.classList.toggle('open', filtersOpen);
  filtersBtn.setAttribute('aria-expanded', String(filtersOpen));
  overlay.classList.toggle('visible', state.openDropdown !== null);

  // Button state — show combined count
  const issueCount = state.selectedIssues.size;
  const identityCount = state.selectedIdentities.size;
  const totalCount = issueCount + identityCount;

  filtersBtn.classList.toggle('has-selections', totalCount > 0);
  filtersBtn.innerHTML = totalCount > 0
    ? `What matters to you? <span class="badge">${totalCount}</span> <span class="caret" aria-hidden="true">&#9662;</span>`
    : 'What matters to you? <span class="caret" aria-hidden="true">&#9662;</span>';

  // Active tags (as buttons in a list)
  let tags = '';
  for (const id of state.selectedIssues) {
    const issue = ISSUES.find(i => i.id === id)!;
    tags += `<button role="listitem" class="filter-active-tag issue-tag" data-remove-issue="${id}" aria-label="Remove ${esc(issue.label)} filter"><span aria-hidden="true">${issue.icon}</span> ${esc(issue.label)} <span class="remove" aria-hidden="true">&#10005;</span></button>`;
  }
  for (const id of state.selectedIdentities) {
    const group = IDENTITY_GROUPS.find(g => g.id === id)!;
    tags += `<button role="listitem" class="filter-active-tag identity-tag" data-remove-identity="${id}" aria-label="Remove ${esc(group.label)} filter"><span aria-hidden="true">${group.icon}</span> ${esc(group.label)} <span class="remove" aria-hidden="true">&#10005;</span></button>`;
  }
  tagsEl.innerHTML = tags;

  // Clear all
  clearBtn.style.display = state.hasFilters() ? '' : 'none';

  // Hint
  if (state.usingDefaultIssues) {
    hint.classList.add('defaults-active');
    hint.innerHTML = `<span class="hint-sparkle" aria-hidden="true">✨</span> Showing top issues by default <button type="button" class="hint-customize-btn" id="hint-customize"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg> Customize</button>`;
    hint.style.display = '';
  } else if (state.hasFilters()) {
    hint.classList.remove('defaults-active');
    hint.innerHTML = `<button type="button" class="hint-customize-btn subtle" id="hint-customize"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg> Customize issues</button>`;
    hint.style.display = '';
  } else {
    hint.classList.remove('defaults-active');
    hint.innerHTML = `Select issues or groups above to compare candidates on what matters to you <button type="button" class="hint-customize-btn" id="hint-customize"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg> Get started</button>`;
    hint.style.display = '';
  }

  // Update live status
  updateLiveStatus();
}

function updateLiveStatus(): void {
  const el = document.getElementById('live-status');
  if (!el) return;
  const issueCount = state.selectedIssues.size;
  const identityCount = state.selectedIdentities.size;
  if (issueCount === 0 && identityCount === 0) {
    el.textContent = '';
    return;
  }
  const parts: string[] = [];
  if (issueCount > 0) parts.push(`${issueCount} issue${issueCount > 1 ? 's' : ''}`);
  if (identityCount > 0) parts.push(`${identityCount} group${identityCount > 1 ? 's' : ''}`);
  el.textContent = `Filtering by ${parts.join(' and ')}`;
}

// ============================================================
// PILLS (inside unified popover)
// ============================================================

export function renderFilterPills(): void {
  // Issue pills
  const issueEl = document.getElementById('issue-pills')!;
  issueEl.innerHTML = ISSUES.map(issue => {
    const count = countCandidatesWithIssue(issue.id);
    const selected = state.selectedIssues.has(issue.id);
    return `<button class="pill ${selected ? 'selected' : ''}" data-issue="${issue.id}" aria-pressed="${selected}">
      <span class="pill-icon" aria-hidden="true">${issue.icon}</span>
      ${esc(issue.label)}
      <span class="pill-count">${count}</span>
    </button>`;
  }).join('');

  // Identity pills
  const identityEl = document.getElementById('identity-pills')!;
  identityEl.innerHTML = IDENTITY_GROUPS.map(group => {
    const count = countEndorsements(group.id);
    const selected = state.selectedIdentities.has(group.id);
    return `<button class="pill identity ${selected ? 'selected' : ''}" data-identity="${group.id}" aria-pressed="${selected}">
      <span class="pill-icon" aria-hidden="true">${group.icon}</span>
      ${esc(group.label)}
      <span class="pill-count">${count}</span>
    </button>`;
  }).join('');
}

// ============================================================
// CANDIDATE HEADER (top of race card)
// ============================================================

const PARTY_LOGO: Record<string, string> = {
  Democratic: '<svg class="party-logo" aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#0D4DFB"/><text x="12" y="16.5" text-anchor="middle" fill="white" font-size="13" font-weight="700" font-family="sans-serif">D</text></svg>',
  Republican: '<svg class="party-logo" aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#F34E49"/><text x="12" y="16.5" text-anchor="middle" fill="white" font-size="13" font-weight="700" font-family="sans-serif">R</text></svg>',
};

function renderInlineIssue(c: Candidate, issueId: string): string {
  const issue = ISSUES.find(i => i.id === issueId)!;
  const pos = c.issues[issueId];
  const key = `${c.name}:${issueId}`;
  const colors = ISSUE_COLORS[issueId];
  const explicitAlignment = state.getAlignment(key);
  const inferred = !explicitAlignment ? getInferredAlignment(c, issueId) : null;
  const alignment = explicitAlignment ?? inferred?.rating ?? null;
  const isInferred = !explicitAlignment && inferred !== null;

  const ratedClass = alignment === 'agree' ? 'rated-agree' : alignment === 'disagree' ? 'rated-disagree' : '';

  if (!pos) return '';

  const stancePills = renderStancePills(pos.stances, colors);
  const expandKey = `issue:${c.name}:${issueId}`;
  const isOpen = state.isExpanded(expandKey);

  let expandedContent = '';
  if (isOpen) {
    const agreePressed = explicitAlignment === 'agree' ? 'true' : isInferred && alignment === 'agree' ? 'mixed' : 'false';
    const disagreePressed = explicitAlignment === 'disagree' ? 'true' : isInferred && alignment === 'disagree' ? 'mixed' : 'false';
    const agreeClass = explicitAlignment === 'agree' ? 'active-agree' : isInferred && alignment === 'agree' ? 'inferred-agree' : '';
    const disagreeClass = explicitAlignment === 'disagree' ? 'active-disagree' : isInferred && alignment === 'disagree' ? 'inferred-disagree' : '';
    const inferredTag = isInferred ? `<span class="inferred-badge">Inferred from ${esc(inferred!.from)}</span>` : '';

    expandedContent = `
      <div class="align-bar">
        <button class="align-pill ${agreeClass}" data-align="agree" data-align-key="${esc(key)}" aria-pressed="${agreePressed}">${THUMB_UP} Agree</button>
        <button class="align-pill ${disagreeClass}" data-align="disagree" data-align-key="${esc(key)}" aria-pressed="${disagreePressed}">${THUMB_DOWN} Disagree</button>
        ${inferredTag}
      </div>
      <div class="position-detail visible">
        <div class="position-quote">${esc(pos.position)}</div>
        <span class="source-link">${ICON_EXTERNAL} ${esc(pos.source)}</span>
      </div>`;
  }

  return `<div class="inline-issue ${ratedClass} ${isOpen ? 'expanded' : ''}">
    <button type="button" class="inline-issue-header" data-issue-expand="${esc(expandKey)}" aria-expanded="${isOpen}">
      <span class="inline-issue-icon" aria-hidden="true">${issue.icon}</span>
      <div class="stance-pills-block">${stancePills}</div>
      <span class="inline-issue-chevron">${ICON_CHEVRON}</span>
    </button>
    ${expandedContent}
  </div>`;
}

function renderEndorsementMatch(c: Candidate): string {
  if (c.endorsements.length === 0 && state.selectedIdentities.size === 0) return '';

  const hasGroups = state.selectedIdentities.size > 0;
  const sorted = [...c.endorsements].sort((a, b) => {
    const aH = state.selectedIdentities.has(a) ? 0 : 1;
    const bH = state.selectedIdentities.has(b) ? 0 : 1;
    return aH - bH;
  });

  const MAX_VISIBLE = 3;
  const visible = sorted.slice(0, MAX_VISIBLE);
  const overflow = sorted.slice(MAX_VISIBLE);
  const expandKey = `endorse:${c.name}`;
  const isExpanded = state.isExpanded(expandKey);

  const renderChip = (eid: string) => {
    const group = IDENTITY_GROUPS.find(g => g.id === eid);
    if (!group) return '';
    const highlighted = state.selectedIdentities.has(eid);
    const check = highlighted ? '<span class="endorsement-check" aria-hidden="true">&#10003;</span> ' : '';
    return `<span class="endorsement-chip-inline ${highlighted ? 'highlighted' : ''}">${check}${group.icon} ${esc(group.label)}</span>`;
  };

  const visibleChips = visible.map(renderChip).join('');
  let overflowHtml = '';
  if (overflow.length > 0) {
    if (isExpanded) {
      overflowHtml = `${overflow.map(renderChip).join('')}<button type="button" class="endorsement-expand-btn" data-endorse-expand="${esc(expandKey)}">Show less</button>`;
    } else {
      overflowHtml = `<button type="button" class="endorsement-expand-btn" data-endorse-expand="${esc(expandKey)}">+${overflow.length} more</button>`;
    }
  }

  let matchHtml = '';
  if (hasGroups) {
    const matchCount = [...state.selectedIdentities].filter(gid => c.endorsements.includes(gid)).length;
    const totalSelected = state.selectedIdentities.size;
    const level = matchCount === totalSelected ? 'high' : matchCount > 0 ? 'medium' : 'low';
    matchHtml = `<div class="endorsement-match-score ${level}">${matchCount}/${totalSelected} of your groups</div>`;
  }

  if (c.endorsements.length === 0 && hasGroups) {
    return `<div class="endorsement-match-block">
      <div class="endorsement-match-score low">0/${state.selectedIdentities.size} of your groups</div>
    </div>`;
  }

  return `<div class="endorsement-match-block">
    ${matchHtml}
    <div class="endorsement-inline">${visibleChips}${overflowHtml}</div>
  </div>`;
}

function renderCandidateHeader(c: Candidate, raceId: string): string {
  const selectedIssueIds = [...state.selectedIssues];
  const issueBlocksHtml = selectedIssueIds.map(id => renderInlineIssue(c, id)).join('');
  const endorsementsHtml = renderEndorsementMatch(c);

  // Alignment score
  let alignmentHtml = '';
  const alignResult = getFullAlignmentScore(c);
  if (alignResult) {
    const level = alignResult.score >= 60 ? 'high' : alignResult.score >= 30 ? 'medium' : 'low';
    alignmentHtml = `<div class="alignment-score visible">
      <span class="alignment-chip ${level}">${alignResult.score}% match</span>
      <span class="alignment-detail">${alignResult.total} issue${alignResult.total > 1 ? 's' : ''} rated</span>
    </div>`;
  }

  // Selection button
  const isSelected = state.getSelectedCandidate(raceId) === c.name;
  const selectBtnClass = isSelected ? 'candidate-select-btn selected' : 'candidate-select-btn';
  const selectIcon = isSelected
    ? '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>'
    : '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>';
  const selectLabel = isSelected ? 'Selected' : 'Select';
  const selectedCellClass = isSelected ? 'candidate-header-cell is-selected' : 'candidate-header-cell';

  return `<div class="${selectedCellClass}">
    <div class="candidate-name-row">
      <div class="candidate-avatar" aria-hidden="true">${esc(c.initials)}</div>
      <div class="candidate-info">
        <div class="candidate-name-line">
          <h4>${esc(c.name)}</h4>
          ${alignmentHtml}
        </div>
        <span class="candidate-meta">
          ${PARTY_LOGO[c.party] ?? ''} ${esc(c.party)}
          ${c.incumbent ? ' <span class="incumbent-badge">Incumbent</span>' : ''}
        </span>
      </div>
      <button type="button" class="${selectBtnClass}" data-select-candidate="${esc(c.name)}" data-select-race="${esc(raceId)}" aria-pressed="${isSelected}">
        ${selectIcon} ${selectLabel}
      </button>
    </div>
    ${endorsementsHtml}
    ${issueBlocksHtml}
  </div>`;
}

// ============================================================
// OTHER ISSUES (compact, togglable per race)
// ============================================================

function renderOtherIssuesSection(race: Race, numCols: number): string {
  const allOtherIds = new Set<string>();
  race.candidates.forEach(c => {
    Object.keys(c.issues).forEach(id => {
      if (!state.selectedIssues.has(id)) allOtherIds.add(id);
    });
  });

  if (allOtherIds.size === 0) return '';

  const otherKey = `other:${race.id}`;
  const otherOpen = state.isExpanded(otherKey);

  const otherRows = [...allOtherIds].map(issueId => {
    const issue = ISSUES.find(i => i.id === issueId)!;
    const colors = ISSUE_COLORS[issueId];

    const cells = race.candidates.map(c => {
      const pos = c.issues[issueId];
      if (!pos) {
        return `<div class="position-cell compact">
          <div class="position-cell-name">${esc(c.name)}</div>
          <span class="position-empty" aria-label="No position found">&mdash;</span>
        </div>`;
      }
      const stancePills = renderStancePills(pos.stances, colors);
      return `<div class="position-cell compact">
        <div class="position-cell-name">${esc(c.name)}</div>
        <div class="stance-pills-block">${stancePills}</div>
        <div class="position-quote-compact">${esc(pos.position)}</div>
      </div>`;
    }).join('');

    return `<section class="issue-section compact" aria-label="${esc(issue.label)}">
      <div class="issue-section-header compact">
        <span class="issue-section-icon" aria-hidden="true">${issue.icon}</span>
        <h4 class="issue-section-label">${esc(issue.label)}</h4>
      </div>
      <div class="issue-comparison cols-${numCols}">
        ${cells}
      </div>
    </section>`;
  }).join('');

  // Collect issue labels for preview
  const otherLabels = [...allOtherIds].slice(0, 4).map(id => {
    const i = ISSUES.find(x => x.id === id)!;
    return `<button type="button" class="other-issue-tag" data-add-issue="${esc(id)}" aria-label="Add ${esc(i.label)} filter">${i.icon} ${esc(i.label)}</button>`;
  }).join('');
  const moreCount = allOtherIds.size > 4 ? ` <span class="other-issue-more">+${allOtherIds.size - 4} more</span>` : '';

  return `
    <div class="other-issues-banner">
      <button type="button" class="other-issues-toggle ${otherOpen ? 'open' : ''}" data-other-toggle="${esc(otherKey)}" aria-expanded="${otherOpen}">
        <span class="toggle-caret" aria-hidden="true">&#9654;</span>
        <span class="other-issues-label">Other issues (${allOtherIds.size})</span>
      </button>
      <div class="other-issue-tags">${otherLabels}${moreCount}</div>
    </div>
    <div class="other-issues-content ${otherOpen ? 'visible' : ''}" data-other-content="${esc(race.id)}">
      ${otherRows}
    </div>`;
}

// ============================================================
// DONATION CTA — inline card (after 3+ engagements)
// ============================================================

function renderDonationCard(): string {
  if (state.donationDismissed || state.engagementCount < 3) return '';
  return `<div class="donation-card fade-in">
    <button type="button" class="donation-dismiss" id="donation-dismiss" aria-label="Dismiss">&times;</button>
    <div class="donation-card-inner">
      <div class="donation-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
      </div>
      <div class="donation-text">
        <strong>This research is free because people like you fund it.</strong>
        <p>change.vote has no paywalls, no ads, and no partisan funders. A small donation keeps it that way.</p>
      </div>
      <div class="donation-actions">
        <a href="https://change.vote/donate" class="donation-btn primary" target="_blank" rel="noopener">Chip in $10</a>
        <button type="button" class="donation-btn secondary" id="donation-dismiss-later">Maybe later</button>
      </div>
    </div>
  </div>`;
}

// ============================================================
// DONATION CTA — post-print modal
// ============================================================

export function renderPostPrintModal(): string {
  return `<div class="donation-modal-overlay" id="donation-modal-overlay">
    <div class="donation-modal" role="dialog" aria-label="Support change.vote">
      <button type="button" class="donation-modal-close" id="donation-modal-close" aria-label="Close">&times;</button>
      <div class="donation-modal-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
      </div>
      <h2>Your guide is printing!</h2>
      <p>Help us keep this free for every voter.</p>
      <div class="donation-modal-amounts">
        <a href="https://change.vote/donate?amount=5" class="donation-amount-btn" target="_blank" rel="noopener">$5</a>
        <a href="https://change.vote/donate?amount=10" class="donation-amount-btn featured" target="_blank" rel="noopener">$10</a>
        <a href="https://change.vote/donate?amount=25" class="donation-amount-btn" target="_blank" rel="noopener">$25</a>
      </div>
      <button type="button" class="donation-modal-skip" id="donation-modal-skip">No thanks</button>
    </div>
  </div>`;
}

// ============================================================
// RACE CARDS
// ============================================================

const RACE_TYPE_ORDER: Record<string, number> = { federal: 0, state: 1, local: 2 };

export function renderRaceCards(): void {
  const el = document.getElementById('race-cards')!;
  const selectedIssueIds = [...state.selectedIssues];

  const sortedRaces = [...RACES].sort((a, b) =>
    (RACE_TYPE_ORDER[a.type] ?? 9) - (RACE_TYPE_ORDER[b.type] ?? 9)
  );

  const donationCardHtml = renderDonationCard();

  el.innerHTML = sortedRaces.map((race, raceIdx) => {
    if (race.candidates.length === 0) {
      return `<article class="race-card fade-in" aria-label="${esc(race.name)}">
        <div class="race-header">
          <h3 class="race-name">${esc(race.name)}</h3>
          <span class="race-badge ${race.type}">${race.type}</span>
        </div>
        <div style="padding:24px;text-align:center;color:var(--text-muted);font-size:14px;">No candidates filed yet</div>
      </article>`;
    }

    const numCandidates = race.candidates.length;

    const candidateHeaders = race.candidates.map(c =>
      renderCandidateHeader(c, race.id)
    ).join('');

    let otherSection = '';
    if (selectedIssueIds.length > 0) {
      otherSection = renderOtherIssuesSection(race, numCandidates);
    }

    const card = `<article class="race-card fade-in" aria-label="${esc(race.name)}" id="race-${esc(race.id)}">
      <div class="race-header">
        <h3 class="race-name">${esc(race.name)}</h3>
        <span class="race-badge ${race.type}">${race.type}</span>
        <button type="button" class="race-share-btn" data-share-race="${esc(race.id)}" aria-label="Share ${esc(race.name)}">
          ${ICON_SHARE} <span class="share-label">Share</span>
        </button>
      </div>
      <div class="candidate-headers cols-${numCandidates}">
        ${candidateHeaders}
      </div>
      <div class="race-card-footer">
        ${otherSection}
      </div>
    </article>`;

    // Insert donation card after the first race
    return raceIdx === 0 ? card + donationCardHtml : card;
  }).join('');
}

// ============================================================
// FLOATING BALLOT BAR
// ============================================================

const ICON_CHECK_CIRCLE = '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';

export function renderBallotBar(): void {
  const el = document.getElementById('ballot-bar')!;
  const count = state.selectedCandidateCount;
  const totalRaces = RACES.filter(r => r.candidates.length > 0).length;

  if (count === 0) {
    el.innerHTML = '';
    return;
  }

  el.innerHTML = `<div class="ballot-bar">
    <div class="ballot-bar-inner">
      <div class="ballot-bar-info">
        ${ICON_CHECK_CIRCLE}
        <span><strong>${count}/${totalRaces}</strong> races decided</span>
      </div>
      <button type="button" class="ballot-bar-btn" id="view-ballot-summary">
        <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="2"/><line x1="10" y1="6" x2="14" y2="6"/><line x1="10" y1="10" x2="14" y2="10"/><line x1="10" y1="14" x2="14" y2="14"/></svg>
        View my ballot
      </button>
    </div>
  </div>`;
}

// ============================================================
// BALLOT SUMMARY OVERLAY
// ============================================================

export function renderBallotSummary(): void {
  const container = document.getElementById('ballot-summary-container')!;

  if (!state.ballotSummaryOpen) {
    container.innerHTML = '';
    return;
  }

  const sortedRaces = [...RACES]
    .filter(r => r.candidates.length > 0)
    .sort((a, b) => (RACE_TYPE_ORDER[a.type] ?? 9) - (RACE_TYPE_ORDER[b.type] ?? 9));

  const rows = sortedRaces.map(race => {
    const picked = state.getSelectedCandidate(race.id);
    const candidate = picked ? race.candidates.find(c => c.name === picked) : null;

    if (!candidate) {
      return `<div class="ballot-summary-row undecided">
        <div class="ballot-summary-race">
          <span class="race-badge ${race.type}">${race.type}</span>
          <span class="ballot-summary-race-name">${esc(race.name)}</span>
        </div>
        <div class="ballot-summary-pick undecided-pick">
          <span class="ballot-summary-undecided">Not yet decided</span>
        </div>
      </div>`;
    }

    const endorsements = candidate.endorsements.slice(0, 3).map(eid => {
      const group = IDENTITY_GROUPS.find(g => g.id === eid);
      return group ? `<span class="endorsement-chip-inline">${group.icon} ${esc(group.label)}</span>` : '';
    }).join('');

    return `<div class="ballot-summary-row">
      <div class="ballot-summary-race">
        <span class="race-badge ${race.type}">${race.type}</span>
        <span class="ballot-summary-race-name">${esc(race.name)}</span>
      </div>
      <div class="ballot-summary-pick">
        <div class="ballot-summary-candidate">
          <div class="candidate-avatar ballot-summary-avatar" aria-hidden="true">${esc(candidate.initials)}</div>
          <div>
            <strong>${esc(candidate.name)}</strong>
            <span class="candidate-meta">${PARTY_LOGO[candidate.party] ?? ''} ${esc(candidate.party)}${candidate.incumbent ? ' · Incumbent' : ''}</span>
            ${endorsements ? `<div class="endorsement-inline">${endorsements}</div>` : ''}
          </div>
        </div>
        <button type="button" class="ballot-summary-change" data-summary-jump="${esc(race.id)}">Change</button>
      </div>
    </div>`;
  }).join('');

  const decidedCount = state.selectedCandidateCount;
  const totalRaces = sortedRaces.length;

  container.innerHTML = `<div class="ballot-summary-overlay" id="ballot-summary-overlay">
    <div class="ballot-summary" role="dialog" aria-label="My Ballot">
      <div class="ballot-summary-header">
        <h2>My Ballot</h2>
        <span class="ballot-summary-count">${decidedCount}/${totalRaces} decided</span>
        <button type="button" class="ballot-summary-close" id="ballot-summary-close" aria-label="Close">&times;</button>
      </div>
      <div class="ballot-summary-body">
        ${rows}
      </div>
      <div class="ballot-summary-footer">
        <button type="button" class="ballot-summary-print" id="ballot-summary-print">
          <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
          Print my ballot
        </button>
        <button type="button" class="ballot-summary-done" id="ballot-summary-done">Done</button>
      </div>
    </div>
  </div>`;
}
