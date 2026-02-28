import type { Candidate } from './types';
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
// LAYOUT SHELL
// ============================================================

export function renderShell(): string {
  return `
    <header class="header">
      <div class="container">
        <a class="logo" href="#">change<span>.vote</span></a>
        <span class="header-location">Fort Worth, TX</span>
      </div>
    </header>

    <section class="hero">
      <div class="container">
        <h1>Your Personalized Ballot Guide</h1>
        <div class="hero-subtitle">See every race, compare candidates, and find who aligns with you.</div>
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
// ISSUE ROW (compact, expandable, with stance pills)
// ============================================================

function renderIssueRow(c: Candidate, issueId: string, isSelected: boolean): string {
  const issue = ISSUES.find(i => i.id === issueId)!;
  const pos = c.issues[issueId];
  const key = `${c.name}:${issueId}`;
  const expanded = state.isExpanded(key);
  const alignment = state.getAlignment(key);
  const colors = ISSUE_COLORS[issueId];

  const ratedClass = alignment === 'agree' ? 'rated-agree' : alignment === 'disagree' ? 'rated-disagree' : '';

  let stancePills = '';
  if (pos) {
    stancePills = `<span class="stance-pills-inline">${
      pos.stances.map(s =>
        `<span class="stance-pill" style="background:${colors?.bg ?? '#f1f5f9'};color:${colors?.text ?? '#475569'}">${esc(s)}</span>`
      ).join('')
    }</span>`;
  } else {
    stancePills = '<span class="no-position-label">No position found</span>';
  }

  let detail = '';
  if (pos) {
    const borderStyle = colors ? `style="border-left-color:${colors.border}"` : '';
    detail = `<div class="issue-detail">
      <div class="issue-detail-inner">
        <div class="issue-detail-quote" ${borderStyle}>
          ${esc(pos.position)}
        </div>
        <div class="issue-detail-source">Source: ${esc(pos.source)}</div>
      </div>
    </div>`;
  }

  return `<div class="issue-row ${expanded ? 'expanded' : ''} ${ratedClass}" data-expand-key="${esc(key)}" data-candidate="${esc(c.name)}" data-issue-id="${issueId}">
    <div class="issue-row-header">
      ${isSelected ? '' : `<span class="issue-icon">${issue.icon}</span>`}
      <span class="issue-row-label">${esc(issue.label)}</span>
      ${stancePills}
      <span class="align-btns">
        <button class="align-btn ${alignment === 'agree' ? 'active-agree' : ''}" data-align="agree" data-align-key="${esc(key)}" title="I agree">${THUMB_UP}</button>
        <button class="align-btn ${alignment === 'disagree' ? 'active-disagree' : ''}" data-align="disagree" data-align-key="${esc(key)}" title="I disagree">${THUMB_DOWN}</button>
      </span>
      <span class="issue-row-caret">&#9654;</span>
    </div>
    ${detail}
  </div>`;
}

// ============================================================
// CANDIDATE COLUMN
// ============================================================

function renderCandidateCol(c: Candidate, raceName: string): string {
  const selectedIssueIds = [...state.selectedIssues];
  const allCandidateIssueIds = Object.keys(c.issues);
  const otherIssueIds = allCandidateIssueIds.filter(id => !state.selectedIssues.has(id));
  const hasOtherIssues = otherIssueIds.length > 0;

  // Selected issues first
  let issuesHtml = '';
  if (selectedIssueIds.length > 0) {
    issuesHtml = selectedIssueIds.map(id => renderIssueRow(c, id, true)).join('');
  }

  // Other issues toggle
  let otherHtml = '';
  if (hasOtherIssues && selectedIssueIds.length > 0) {
    const otherKey = `other:${c.name}`;
    const otherOpen = state.isExpanded(otherKey);
    otherHtml = `
      <div class="other-issues-toggle ${otherOpen ? 'open' : ''}" data-other-toggle="${esc(c.name)}">
        <span class="toggle-caret">&#9654;</span>
        Other issues (${otherIssueIds.length})
      </div>
      <div class="other-issues-content ${otherOpen ? 'visible' : ''}" data-other-content="${esc(c.name)}">
        ${otherIssueIds.map(id => renderIssueRow(c, id, false)).join('')}
      </div>`;
  } else if (!selectedIssueIds.length && allCandidateIssueIds.length > 0) {
    // No filters: show nothing or show all compactly
    // Show nothing — the hint below the filter bar guides them
  }

  // Endorsements
  let endorsementsHtml = '';
  if (c.endorsements.length > 0) {
    const chips = c.endorsements.map(eid => {
      const group = IDENTITY_GROUPS.find(g => g.id === eid);
      if (!group) return '';
      const highlighted = state.selectedIdentities.has(eid);
      return `<span class="endorsement-chip ${highlighted ? 'highlighted' : ''}">${group.icon} ${esc(group.label)}</span>`;
    }).join('');
    endorsementsHtml = `<div class="candidate-endorsements"><div class="endorsement-chips">${chips}</div></div>`;
  }

  // Alignment score
  let alignmentHtml = '';
  const alignResult = state.getAlignmentScore(c.name);
  if (alignResult) {
    const level = alignResult.score >= 60 ? 'high' : alignResult.score >= 30 ? 'medium' : 'low';
    alignmentHtml = `<div class="alignment-score visible">
      <span class="alignment-chip ${level}">${alignResult.score}% alignment</span>
    </div>`;
  }

  return `<div class="candidate-col">
    <div class="candidate-race-label">${esc(raceName)}</div>
    <div class="candidate-name-row">
      <div class="candidate-avatar">${esc(c.initials)}</div>
      <div class="candidate-info">
        <h4>${esc(c.name)}</h4>
        <span class="candidate-meta">
          ${esc(c.party)}
          ${c.incumbent ? ' <span class="incumbent-badge">Incumbent</span>' : ''}
        </span>
      </div>
    </div>
    <div class="candidate-issues">
      ${issuesHtml}
      ${otherHtml}
    </div>
    <div class="candidate-bottom">
      ${endorsementsHtml}
      ${alignmentHtml}
    </div>
  </div>`;
}

// ============================================================
// RACE CARDS
// ============================================================

export function renderRaceCards(): void {
  const el = document.getElementById('race-cards')!;

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

    return `<div class="race-card fade-in">
      <div class="race-header">
        <span class="race-name">${esc(race.name)}</span>
        <span class="race-badge ${race.type}">${race.type}</span>
      </div>
      <div class="candidates-grid">
        ${race.candidates.map(c => renderCandidateCol(c, race.name)).join('')}
      </div>
    </div>`;
  }).join('');
}
