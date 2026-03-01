import type { Candidate, Race } from './types';
import { ISSUES, IDENTITY_GROUPS, RACES, ISSUE_COLORS } from './data';
import { state } from './state';

// ============================================================
// HELPERS
// ============================================================

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

const THUMB_UP = '<svg viewBox="0 0 24 24"><path d="M2 20h2V9H2v11zm20-9a2 2 0 0 0-2-2h-6.32l.95-4.57.03-.32a1.5 1.5 0 0 0-.44-1.06L13.17 2 7.59 7.59A2 2 0 0 0 7 9v10a2 2 0 0 0 2 2h9a2 2 0 0 0 1.84-1.22l3.02-7.05A2 2 0 0 0 22 11z"/></svg>';
const THUMB_DOWN = '<svg viewBox="0 0 24 24"><path d="M22 4h-2v11h2V4zM2 13a2 2 0 0 0 2 2h6.32l-.95 4.57-.03.32c0 .4.16.77.44 1.06L10.83 22l5.58-5.59A2 2 0 0 0 17 15V5a2 2 0 0 0-2-2H6a2 2 0 0 0-1.84 1.22l-3.02 7.05A2 2 0 0 0 2 13z"/></svg>';

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

function getInferredAlignment(candidate: Candidate, issueId: string, raceCandidates: Candidate[]): InferResult {
  const pos = candidate.issues[issueId];
  if (!pos) return null;

  for (const other of raceCandidates) {
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

function getFullAlignmentScore(candidateName: string, raceCandidates: Candidate[]): { score: number; total: number } | null {
  const candidate = raceCandidates.find(c => c.name === candidateName);
  if (!candidate) return null;

  let agrees = 0;
  let total = 0;

  for (const issueId of state.selectedIssues) {
    if (!candidate.issues[issueId]) continue;

    const key = `${candidateName}:${issueId}`;
    const explicit = state.getAlignment(key);

    if (explicit) {
      total++;
      if (explicit === 'agree') agrees++;
    } else {
      const inferred = getInferredAlignment(candidate, issueId, raceCandidates);
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
    <header class="header">
      <div class="container">
        <a class="logo" href="#">change<span>.vote</span></a>
        <span class="header-location" id="header-location">Fort Worth, TX</span>
      </div>
    </header>

    <section class="hero">
      <div class="container">
        <h1>Your Personalized Ballot Guide</h1>
        <div class="hero-subtitle">See every race, compare candidates, and find who aligns with you.</div>
        <div class="address-row" id="address-row">
          <div class="address-input-wrap">
            <svg class="address-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            <input type="text" class="address-input" id="address-input" placeholder="Enter your address to see your specific ballot...">
          </div>
          <button class="address-btn" id="address-btn">Find my ballot</button>
        </div>
        <div class="address-confirmed" id="address-confirmed" style="display:none">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          <span id="address-confirmed-text"></span>
          <button class="address-change" id="address-change">Change</button>
        </div>
        <div class="election-badge">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="4" width="18" height="18" rx="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          Texas Primary — March 3, 2026 — Fort Worth, Tarrant County
        </div>
      </div>
    </section>

    <main class="container">
      <div class="filter-bar" id="filter-bar">
        <span class="filter-bar-label">Build your ballot:</span>
        <div class="filter-dropdown" id="dropdown-issues">
          <button class="filter-dropdown-btn" data-dropdown="issues">
            Issues I care about <span class="caret">&#9662;</span>
          </button>
          <div class="filter-popover">
            <h3>What issues matter to you?</h3>
            <p>Pick topics and we'll show each candidate's stance side by side.</p>
            <div class="pill-grid" id="issue-pills"></div>
          </div>
        </div>
        <div class="filter-dropdown" id="dropdown-identity">
          <button class="filter-dropdown-btn identity-btn" data-dropdown="identity">
            Groups I trust <span class="caret">&#9662;</span>
          </button>
          <div class="filter-popover">
            <h3>Which voices do you trust?</h3>
            <p>Select organizations you trust and we'll show who they endorse.</p>
            <div class="pill-grid" id="identity-pills"></div>
          </div>
        </div>
        <div class="filter-active-tags" id="filter-active-tags"></div>
        <button class="clear-all-link" id="clear-all" style="display:none">Clear all</button>
      </div>
      <div class="filter-bar-hint" id="filter-hint">
        Select issues or groups above to compare candidates on what matters to you
      </div>
      <div class="filter-overlay" id="filter-overlay"></div>

      <div id="race-cards"></div>
    </main>

    <footer class="footer">
      <div class="container">
        Nonpartisan. Private. No account needed. — <a href="#">change.vote</a><br>
        All candidate positions sourced and linked. Endorsement data from public records.
      </div>
    </footer>
  `;
}

// ============================================================
// FILTER BAR
// ============================================================

export function renderFilterBar(): void {
  const issuesBtn = document.querySelector('#dropdown-issues .filter-dropdown-btn') as HTMLElement;
  const identityBtn = document.querySelector('#dropdown-identity .filter-dropdown-btn') as HTMLElement;
  const issuesDD = document.getElementById('dropdown-issues')!;
  const identityDD = document.getElementById('dropdown-identity')!;
  const overlay = document.getElementById('filter-overlay')!;
  const tagsEl = document.getElementById('filter-active-tags')!;
  const clearBtn = document.getElementById('clear-all')!;
  const hint = document.getElementById('filter-hint')!;

  // Dropdown open state
  issuesDD.classList.toggle('open', state.openDropdown === 'issues');
  identityDD.classList.toggle('open', state.openDropdown === 'identity');
  overlay.classList.toggle('visible', state.openDropdown !== null);

  // Button state
  const issueCount = state.selectedIssues.size;
  const identityCount = state.selectedIdentities.size;

  issuesBtn.classList.toggle('has-selections', issueCount > 0);
  issuesBtn.innerHTML = issueCount > 0
    ? `Issues I care about <span class="badge">${issueCount}</span> <span class="caret">&#9662;</span>`
    : 'Issues I care about <span class="caret">&#9662;</span>';

  identityBtn.classList.toggle('has-selections', identityCount > 0);
  identityBtn.innerHTML = identityCount > 0
    ? `Groups I trust <span class="badge">${identityCount}</span> <span class="caret">&#9662;</span>`
    : 'Groups I trust <span class="caret">&#9662;</span>';

  // Active tags
  let tags = '';
  for (const id of state.selectedIssues) {
    const issue = ISSUES.find(i => i.id === id)!;
    tags += `<span class="filter-active-tag issue-tag" data-remove-issue="${id}">${issue.icon} ${esc(issue.label)} <span class="remove">✕</span></span>`;
  }
  for (const id of state.selectedIdentities) {
    const group = IDENTITY_GROUPS.find(g => g.id === id)!;
    tags += `<span class="filter-active-tag identity-tag" data-remove-identity="${id}">${group.icon} ${esc(group.label)} <span class="remove">✕</span></span>`;
  }
  tagsEl.innerHTML = tags;

  // Clear all
  clearBtn.style.display = state.hasFilters() ? '' : 'none';

  // Hint
  hint.style.display = state.hasFilters() ? 'none' : '';
}

// ============================================================
// PILLS (inside popovers)
// ============================================================

export function renderIssuePills(): void {
  const el = document.getElementById('issue-pills')!;
  el.innerHTML = ISSUES.map(issue => {
    const count = countCandidatesWithIssue(issue.id);
    const selected = state.selectedIssues.has(issue.id);
    return `<button class="pill ${selected ? 'selected' : ''}" data-issue="${issue.id}">
      <span class="pill-icon">${issue.icon}</span>
      ${esc(issue.label)}
      <span class="pill-count">${count}</span>
    </button>`;
  }).join('');
}

export function renderIdentityPills(): void {
  const el = document.getElementById('identity-pills')!;
  el.innerHTML = IDENTITY_GROUPS.map(group => {
    const count = countEndorsements(group.id);
    const selected = state.selectedIdentities.has(group.id);
    return `<button class="pill identity ${selected ? 'selected' : ''}" data-identity="${group.id}">
      <span class="pill-icon">${group.icon}</span>
      ${esc(group.label)}
      <span class="pill-count">${count}</span>
    </button>`;
  }).join('');
}

// ============================================================
// CANDIDATE HEADER (top of race card)
// ============================================================

function renderCandidateHeader(c: Candidate, raceCandidates: Candidate[]): string {
  const partyClass = c.party === 'Democratic' ? 'dem' : 'rep';

  // Endorsements
  let endorsementsHtml = '';
  if (c.endorsements.length > 0) {
    const chips = c.endorsements.map(eid => {
      const group = IDENTITY_GROUPS.find(g => g.id === eid);
      if (!group) return '';
      const highlighted = state.selectedIdentities.has(eid);
      return `<span class="endorsement-chip ${highlighted ? 'highlighted' : ''}">${group.icon} ${esc(group.label)}</span>`;
    }).join('');
    endorsementsHtml = `<div class="endorsement-chips">${chips}</div>`;
  }

  // Alignment score (includes inferences)
  let alignmentHtml = '';
  const alignResult = getFullAlignmentScore(c.name, raceCandidates);
  if (alignResult) {
    const level = alignResult.score >= 60 ? 'high' : alignResult.score >= 30 ? 'medium' : 'low';
    alignmentHtml = `<div class="alignment-score visible">
      <span class="alignment-chip ${level}">${alignResult.score}% match</span>
      <span class="alignment-detail">${alignResult.total} issue${alignResult.total > 1 ? 's' : ''} rated</span>
    </div>`;
  }

  return `<div class="candidate-header-cell ${partyClass}">
    <div class="candidate-name-row">
      <div class="candidate-avatar ${partyClass}">${esc(c.initials)}</div>
      <div class="candidate-info">
        <h4>${esc(c.name)}</h4>
        <span class="candidate-meta">
          ${esc(c.party)}
          ${c.incumbent ? ' <span class="incumbent-badge">Incumbent</span>' : ''}
        </span>
      </div>
    </div>
    ${endorsementsHtml}
    ${alignmentHtml}
  </div>`;
}

// ============================================================
// POSITION CELL (one candidate's position on one issue)
// ============================================================

function renderPositionCell(c: Candidate, issueId: string, raceCandidates: Candidate[]): string {
  const pos = c.issues[issueId];
  const key = `${c.name}:${issueId}`;
  const colors = ISSUE_COLORS[issueId];
  const explicitAlignment = state.getAlignment(key);
  const inferred = !explicitAlignment ? getInferredAlignment(c, issueId, raceCandidates) : null;
  const alignment = explicitAlignment ?? inferred?.rating ?? null;
  const isInferred = !explicitAlignment && inferred !== null;

  const ratedClass = alignment === 'agree' ? 'rated-agree' : alignment === 'disagree' ? 'rated-disagree' : '';

  if (!pos) {
    return `<div class="position-cell ${ratedClass}">
      <div class="position-cell-name">${esc(c.name)}</div>
      <div class="position-empty">No position found</div>
      <div class="position-actions">
        <span class="align-btns always-visible">
          <button class="align-btn ${explicitAlignment === 'agree' ? 'active-agree' : isInferred && alignment === 'agree' ? 'inferred-agree' : ''}" data-align="agree" data-align-key="${esc(key)}" title="I agree">${THUMB_UP}</button>
          <button class="align-btn ${explicitAlignment === 'disagree' ? 'active-disagree' : isInferred && alignment === 'disagree' ? 'inferred-disagree' : ''}" data-align="disagree" data-align-key="${esc(key)}" title="I disagree">${THUMB_DOWN}</button>
        </span>
        ${isInferred ? `<span class="inferred-badge">Inferred</span>` : ''}
      </div>
    </div>`;
  }

  const stancePills = pos.stances.map(s =>
    `<span class="stance-pill" style="background:${colors?.bg ?? '#f1f5f9'};color:${colors?.text ?? '#475569'}">${esc(s)}</span>`
  ).join('');

  const borderColor = colors?.border ?? 'var(--border)';

  return `<div class="position-cell ${ratedClass}">
    <div class="position-cell-name">${esc(c.name)}</div>
    <div class="stance-pills-block">${stancePills}</div>
    <div class="position-quote" style="border-left-color:${borderColor}">${esc(pos.position)}</div>
    <div class="position-source">Source: ${esc(pos.source)}</div>
    <div class="position-actions">
      <span class="align-btns always-visible">
        <button class="align-btn ${explicitAlignment === 'agree' ? 'active-agree' : isInferred && alignment === 'agree' ? 'inferred-agree' : ''}" data-align="agree" data-align-key="${esc(key)}" title="I agree">${THUMB_UP}</button>
        <button class="align-btn ${explicitAlignment === 'disagree' ? 'active-disagree' : isInferred && alignment === 'disagree' ? 'inferred-disagree' : ''}" data-align="disagree" data-align-key="${esc(key)}" title="I disagree">${THUMB_DOWN}</button>
      </span>
      ${isInferred ? `<span class="inferred-badge">Inferred</span>` : ''}
    </div>
  </div>`;
}

// ============================================================
// ISSUE SECTION (one issue, all candidates compared)
// ============================================================

function renderIssueSection(issueId: string, candidates: Candidate[], numCols: number): string {
  const issue = ISSUES.find(i => i.id === issueId)!;
  const colors = ISSUE_COLORS[issueId];

  const cells = candidates.map(c => renderPositionCell(c, issueId, candidates)).join('');

  return `<div class="issue-section">
    <div class="issue-section-header" style="border-left-color:${colors?.border ?? 'var(--border)'}">
      <span class="issue-section-icon">${issue.icon}</span>
      <span class="issue-section-label">${esc(issue.label)}</span>
    </div>
    <div class="issue-comparison cols-${numCols}">
      ${cells}
    </div>
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
          <span class="position-empty">—</span>
        </div>`;
      }
      const stancePills = pos.stances.map(s =>
        `<span class="stance-pill" style="background:${colors?.bg ?? '#f1f5f9'};color:${colors?.text ?? '#475569'}">${esc(s)}</span>`
      ).join('');
      return `<div class="position-cell compact">
        <div class="position-cell-name">${esc(c.name)}</div>
        <div class="stance-pills-block">${stancePills}</div>
        <div class="position-quote-compact">${esc(pos.position)}</div>
      </div>`;
    }).join('');

    return `<div class="issue-section compact">
      <div class="issue-section-header compact" style="border-left-color:${colors?.border ?? 'var(--border)'}">
        <span class="issue-section-icon">${issue.icon}</span>
        <span class="issue-section-label">${esc(issue.label)}</span>
      </div>
      <div class="issue-comparison cols-${numCols}">
        ${cells}
      </div>
    </div>`;
  }).join('');

  return `
    <div class="other-issues-toggle ${otherOpen ? 'open' : ''}" data-other-toggle="${esc(race.id)}">
      <span class="toggle-caret">&#9654;</span>
      Other issues (${allOtherIds.size})
    </div>
    <div class="other-issues-content ${otherOpen ? 'visible' : ''}" data-other-content="${esc(race.id)}">
      ${otherRows}
    </div>`;
}

// ============================================================
// RACE CARDS
// ============================================================

export function renderRaceCards(): void {
  const el = document.getElementById('race-cards')!;
  const selectedIssueIds = [...state.selectedIssues];

  el.innerHTML = RACES.map(race => {
    if (race.candidates.length === 0) {
      return `<div class="race-card fade-in">
        <div class="race-header">
          <span class="race-name">${esc(race.name)}</span>
          <span class="race-badge ${race.type}">${race.type}</span>
        </div>
        <div style="padding:24px;text-align:center;color:var(--text-muted);font-size:14px;">No candidates filed yet</div>
      </div>`;
    }

    const numCandidates = race.candidates.length;

    // Candidate headers row
    const candidateHeaders = race.candidates.map(c =>
      renderCandidateHeader(c, race.candidates)
    ).join('');

    // Selected issue sections
    let issueSections = '';
    if (selectedIssueIds.length > 0) {
      issueSections = selectedIssueIds.map(id =>
        renderIssueSection(id, race.candidates, numCandidates)
      ).join('');
    }

    // Other issues
    let otherSection = '';
    if (selectedIssueIds.length > 0) {
      otherSection = renderOtherIssuesSection(race, numCandidates);
    }

    return `<div class="race-card fade-in">
      <div class="race-header">
        <span class="race-name">${esc(race.name)}</span>
        <span class="race-badge ${race.type}">${race.type}</span>
      </div>
      <div class="candidate-headers cols-${numCandidates}">
        ${candidateHeaders}
      </div>
      ${issueSections}
      <div class="race-card-footer">
        ${otherSection}
      </div>
    </div>`;
  }).join('');
}
