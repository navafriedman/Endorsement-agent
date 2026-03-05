import type { MatchScore } from './types';
import { ISSUES, IDENTITY_GROUPS, ISSUE_STANCES, ISSUE_COLORS, RACES } from './data';
import { state } from './state';

function esc(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

const RACE_TYPE_ORDER: Record<string, number> = { federal: 0, state: 1, local: 2 };
const ICON_ARROW = '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>';
const ICON_CHECK = '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>';

// ============================================================
// SHELL
// ============================================================

export function renderShell(): string {
  return `
    <header class="header" role="banner">
      <div class="container">
        <a class="logo-mark" href="/" aria-label="change.vote home">C</a>
        <div class="header-nav">
          <button class="header-menu-btn" aria-label="Menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
        </div>
      </div>
    </header>

    <main class="container" id="main">
      <div id="page-content"></div>
    </main>

    <footer class="footer" role="contentinfo">
      <div class="footer-inner">
        <div>
          Info sourced from public filings, verified media, and official campaign materials.<br>
          <a href="/">Learn more</a>
        </div>
        <div class="footer-links">
          <a href="/">Report Issue</a>
          <a href="/">Terms of Service</a>
          <a href="/">Privacy Policy</a>
        </div>
      </div>
    </footer>

    <div id="ballot-bar"></div>
    <div id="ballot-summary-container"></div>
    <div id="filter-overlay"></div>
  `;
}

// ============================================================
// FILTER TOOLBAR — always visible at top of ballot
// ============================================================

function renderFilterToolbar(): string {
  const issueCount = state.ratedIssueCount;
  const groupCount = state.selectedGroups.size;
  const hasPrefs = state.hasPreferences;

  // Active filter tags
  let activeTags = '';
  for (const [issueId, choice] of state.issueStances) {
    if (choice === 'skip') continue;
    const issue = ISSUES.find(i => i.id === issueId);
    if (!issue) continue;
    activeTags += `<button class="active-tag issue-tag" data-remove-issue="${issueId}" aria-label="Remove ${esc(issue.label)}">
      ${issue.icon} ${esc(issue.label)} <span class="tag-x">&times;</span>
    </button>`;
  }
  for (const gid of state.selectedGroups) {
    const g = IDENTITY_GROUPS.find(x => x.id === gid);
    if (!g) continue;
    activeTags += `<button class="active-tag group-tag" data-remove-group="${gid}" aria-label="Remove ${esc(g.label)}">
      ${g.icon} ${esc(g.label)} <span class="tag-x">&times;</span>
    </button>`;
  }

  return `<div class="filter-toolbar">
    <div class="filter-toolbar-row">
      <button class="filter-btn ${state.filterOpen === 'issues' ? 'active' : ''} ${issueCount > 0 ? 'has-selections' : ''}" data-open-filter="issues">
        Issues ${issueCount > 0 ? `<span class="filter-count">${issueCount}</span>` : ''}
        <svg class="filter-caret" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <button class="filter-btn ${state.filterOpen === 'groups' ? 'active' : ''} ${groupCount > 0 ? 'has-selections' : ''}" data-open-filter="groups">
        Trusted groups ${groupCount > 0 ? `<span class="filter-count">${groupCount}</span>` : ''}
        <svg class="filter-caret" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      ${hasPrefs ? '<button class="clear-link" id="clear-all">Clear all</button>' : ''}
    </div>
    ${activeTags ? `<div class="active-tags-row">${activeTags}</div>` : ''}
    ${!hasPrefs ? '<p class="filter-hint">Tell us what matters to you and we\'ll rank candidates by how well they match.</p>' : ''}
  </div>`;
}

// ============================================================
// ISSUES PANEL — slides open below toolbar
// ============================================================

function renderIssuesPanel(): string {
  if (state.filterOpen !== 'issues') return '';

  const cards = ISSUES.map(issue => {
    const stances = ISSUE_STANCES[issue.id];
    if (!stances) return '';
    const current = state.issueStances.get(issue.id);
    const isDone = current !== undefined && current !== 'skip';

    return `<div class="issue-row ${isDone ? 'done' : ''}">
      <div class="issue-row-label">
        <span class="issue-row-icon">${issue.icon}</span>
        <span class="issue-row-name">${esc(issue.label)}</span>
      </div>
      <div class="issue-row-options">
        <button type="button" class="stance-chip ${current === 'agree' ? 'selected-a' : ''}" data-stance-issue="${issue.id}" data-stance-choice="agree">
          ${esc(stances.progressive)}
        </button>
        <button type="button" class="stance-chip ${current === 'disagree' ? 'selected-b' : ''}" data-stance-issue="${issue.id}" data-stance-choice="disagree">
          ${esc(stances.conservative)}
        </button>
        ${current ? `<button type="button" class="stance-clear" data-stance-issue="${issue.id}" data-stance-choice="skip">Clear</button>` : ''}
      </div>
    </div>`;
  }).join('');

  return `<div class="filter-panel" id="issues-panel">
    <div class="filter-panel-header">
      <h3>Where do you stand?</h3>
      <p>Pick the statement closest to your view. Candidates will re-rank as you go.</p>
    </div>
    <div class="issue-rows">${cards}</div>
    <div class="filter-panel-footer">
      <button type="button" class="btn-text" data-close-filter>Done</button>
    </div>
  </div>`;
}

// ============================================================
// GROUPS PANEL
// ============================================================

function renderGroupsPanel(): string {
  if (state.filterOpen !== 'groups') return '';

  const byType = new Map<string, typeof IDENTITY_GROUPS>();
  for (const g of IDENTITY_GROUPS) {
    const arr = byType.get(g.type) ?? [];
    arr.push(g);
    byType.set(g.type, arr);
  }

  let sections = '';
  for (const [type, groups] of byType) {
    const pills = groups.map(g => {
      const sel = state.selectedGroups.has(g.id);
      let count = 0;
      RACES.forEach(r => r.candidates.forEach(c => {
        if (c.endorsements.includes(g.id)) count++;
      }));
      return `<button class="pill ${sel ? 'selected' : ''}" data-group="${g.id}" aria-pressed="${sel}">
        <span class="pill-icon">${g.icon}</span>
        ${esc(g.label)}
        <span class="pill-count">${count}</span>
      </button>`;
    }).join('');

    sections += `<div class="group-section">
      <div class="group-section-label">${esc(type)}</div>
      <div class="group-pills">${pills}</div>
    </div>`;
  }

  return `<div class="filter-panel" id="groups-panel">
    <div class="filter-panel-header">
      <h3>Who do you trust?</h3>
      <p>Select organizations whose endorsements you value.</p>
    </div>
    ${sections}
    <div class="filter-panel-footer">
      <button type="button" class="btn-text" data-close-filter>Done</button>
    </div>
  </div>`;
}

// ============================================================
// MATCH BADGE
// ============================================================

function renderMatchBadge(score: number): string {
  if (score < 0) return '';
  const level = score >= 70 ? 'high' : score >= 40 ? 'mid' : 'low';
  return `<span class="match-badge ${level}"><span class="match-dot"></span>${score}% match</span>`;
}

// ============================================================
// ENDORSEMENT ROW
// ============================================================

function renderEndorsementRow(ms: MatchScore): string {
  if (ms.candidate.endorsements.length === 0) return '';

  const sorted = [...ms.candidate.endorsements].sort((a, b) => {
    const aM = state.selectedGroups.has(a) ? 0 : 1;
    const bM = state.selectedGroups.has(b) ? 0 : 1;
    return aM - bM;
  });

  const avatars = sorted.slice(0, 5).map(eid => {
    const g = IDENTITY_GROUPS.find(x => x.id === eid);
    if (!g) return '';
    const matched = state.selectedGroups.has(eid);
    return `<span class="endorsement-avatar ${matched ? 'matched' : ''}" title="${esc(g.label)}">${g.icon}</span>`;
  }).join('');

  const matchedNames = sorted.filter(eid => state.selectedGroups.has(eid)).map(eid => {
    const g = IDENTITY_GROUPS.find(x => x.id === eid);
    return g?.label ?? '';
  });
  const otherCount = ms.candidate.endorsements.length - matchedNames.length;

  let text = '';
  if (matchedNames.length > 0) {
    const nameStr = matchedNames.length <= 2
      ? matchedNames.join(' & ')
      : `${matchedNames[0]} & ${matchedNames.length - 1} more you trust`;
    text = `<span class="match-highlight">Recommended by ${esc(nameStr)}</span>`;
    if (otherCount > 0) text += ` & ${otherCount} more`;
  } else {
    const first = IDENTITY_GROUPS.find(x => x.id === sorted[0]);
    if (first) {
      text = `Recommended by <strong>${esc(first.label)}</strong>`;
      if (sorted.length > 1) text += ` & ${sorted.length - 1} more`;
    }
  }

  return `<div class="endorsement-row">
    <div class="endorsement-avatars">${avatars}</div>
    <span class="endorsement-text">${text}</span>
  </div>`;
}

// ============================================================
// DETAIL PANEL (expanded)
// ============================================================

function renderDetailPanel(ms: MatchScore): string {
  const key = `detail:${ms.race.id}:${ms.candidate.name}`;
  if (!state.isExpanded(key)) return '';

  let issueRows = '';
  for (const mi of ms.matchedIssues) {
    const issue = ISSUES.find(i => i.id === mi.issueId)!;
    const pos = ms.candidate.issues[mi.issueId];
    const colors = ISSUE_COLORS[mi.issueId];
    if (!pos) continue;

    const pills = pos.stances.map(s =>
      `<span class="stance-pill" style="background:${colors.bg};color:${colors.text}">${esc(s)}</span>`
    ).join('');

    issueRows += `<div class="detail-issue-row ${mi.stance === 'agree' ? 'match' : 'mismatch'}">
      <div class="detail-issue-header">
        <span class="detail-issue-icon">${issue.icon}</span>
        <span class="detail-issue-label">${esc(issue.label)}</span>
        <span class="detail-match-tag ${mi.stance}">${mi.stance === 'agree' ? '✓ Match' : '✗ Differs'}</span>
      </div>
      <div class="detail-stances">${pills}</div>
      <p class="detail-position">${esc(pos.position)}</p>
      <span class="detail-source">${esc(pos.source)}</span>
    </div>`;
  }

  // Other issues not rated
  const ratedIds = new Set(ms.matchedIssues.map(m => m.issueId));
  const otherIds = Object.keys(ms.candidate.issues).filter(id => !ratedIds.has(id));
  let otherHtml = '';
  if (otherIds.length > 0) {
    otherHtml = `<div class="detail-other-issues">
      <div class="detail-section-label">Other positions</div>
      ${otherIds.map(issueId => {
        const issue = ISSUES.find(i => i.id === issueId)!;
        const pos = ms.candidate.issues[issueId];
        const colors = ISSUE_COLORS[issueId];
        if (!pos) return '';
        const pills = pos.stances.map(s =>
          `<span class="stance-pill" style="background:${colors.bg};color:${colors.text}">${esc(s)}</span>`
        ).join('');
        return `<div class="detail-issue-row neutral">
          <div class="detail-issue-header">
            <span class="detail-issue-icon">${issue.icon}</span>
            <span class="detail-issue-label">${esc(issue.label)}</span>
          </div>
          <div class="detail-stances">${pills}</div>
          <p class="detail-position">${esc(pos.position)}</p>
        </div>`;
      }).join('')}
    </div>`;
  }

  let endorseHtml = '';
  if (ms.candidate.endorsements.length > 0) {
    const chips = ms.candidate.endorsements.map(eid => {
      const g = IDENTITY_GROUPS.find(x => x.id === eid);
      if (!g) return '';
      const matched = state.selectedGroups.has(eid);
      return `<span class="endorse-chip ${matched ? 'matched' : ''}">${g.icon} ${esc(g.label)}${matched ? ' ✓' : ''}</span>`;
    }).join('');
    endorseHtml = `<div class="detail-endorsements">
      <div class="detail-section-label">All endorsements</div>
      <div class="detail-endorse-chips">${chips}</div>
    </div>`;
  }

  return `<div class="match-details">${issueRows}${otherHtml}${endorseHtml}</div>`;
}

// ============================================================
// CANDIDATE CARD
// ============================================================

function renderCandidateCard(ms: MatchScore, rank: number): string {
  const c = ms.candidate;
  const key = `detail:${ms.race.id}:${c.name}`;
  const isOpen = state.isExpanded(key);
  const isSel = state.selectedCandidates.get(ms.race.id) === c.name;
  const partyClass = c.party === 'Democratic' ? 'dem' : 'rep';
  const isTopMatch = rank === 0 && ms.score >= 60;

  // Build a short description from candidate's top positions
  const positionKeys = Object.keys(c.issues).slice(0, 3);
  const desc = positionKeys.map(k => {
    const pos = c.issues[k];
    return pos ? pos.stances[0] : '';
  }).filter(Boolean).join('. ') + '.';

  return `<div class="candidate-card ${isTopMatch ? 'top-match' : ''} ${isSel ? 'is-selected' : ''}">
    ${renderMatchBadge(ms.score)}
    <div class="candidate-avatar">${esc(c.initials)}</div>
    <div class="candidate-name-link">${esc(c.name)} ${ICON_ARROW}</div>
    <div class="candidate-meta-line">
      <span class="party-dot ${partyClass}"></span>${esc(c.party)}${c.incumbent ? ' · Incumbent' : ''}
    </div>
    <p class="candidate-description">${esc(desc)}</p>
    ${renderEndorsementRow(ms)}
    <div class="candidate-actions">
      <button type="button" class="select-btn ${isSel ? 'selected' : ''}" data-select-candidate="${esc(c.name)}" data-select-race="${esc(ms.race.id)}" aria-pressed="${isSel}">
        ${isSel ? ICON_CHECK + ' Selected' : 'Select'}
      </button>
      <button type="button" class="details-btn" data-detail-toggle="${esc(key)}" aria-expanded="${isOpen}">
        ${isOpen ? 'Less' : 'Details'}
        <svg class="chevron-icon ${isOpen ? 'open' : ''}" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
    </div>
    ${renderDetailPanel(ms)}
  </div>`;
}

// ============================================================
// MAIN PAGE
// ============================================================

export function renderPage(): string {
  const sortedRaces = [...RACES].sort((a, b) =>
    (RACE_TYPE_ORDER[a.type] ?? 9) - (RACE_TYPE_ORDER[b.type] ?? 9)
  );

  const raceSections = sortedRaces.map(race => {
    const matches = state.computeRaceMatches(race);
    if (matches.length === 0) return '';
    const numCols = Math.min(matches.length, 3);

    return `<section class="race-section" id="race-${esc(race.id)}">
      <div class="race-section-header">
        <div>
          <span class="race-section-title">${esc(race.name)}</span>
          <span class="race-type-badge ${race.type}">${race.type}</span>
        </div>
      </div>
      <div class="candidate-grid cols-${numCols}">
        ${matches.map((ms, i) => renderCandidateCard(ms, i)).join('')}
      </div>
    </section>`;
  }).join('');

  return `
    <div class="hero">
      <div class="hero-election-label">Texas Primary — March 3, 2026</div>
      <h1 class="hero-title">Review your ballot before you vote.</h1>
      <p class="hero-subtitle">Your vote will influence the expansion of public transit options, guide road improvements, and determine funding for educational oversight. Explore candidates matched to your priorities.</p>
    </div>

    ${renderFilterToolbar()}
    ${renderIssuesPanel()}
    ${renderGroupsPanel()}

    <div id="race-sections">${raceSections}</div>
  `;
}

// ============================================================
// BALLOT BAR
// ============================================================

export function renderBallotBar(): void {
  const el = document.getElementById('ballot-bar');
  if (!el) return;

  const count = state.selectedCandidateCount;
  const total = RACES.filter(r => r.candidates.length > 0).length;
  if (count === 0) { el.innerHTML = ''; return; }

  el.innerHTML = `<div class="ballot-bar">
    <div class="ballot-bar-inner">
      <div class="ballot-bar-info">
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        <span><strong>${count}/${total}</strong> races decided</span>
      </div>
      <button type="button" class="ballot-bar-btn" id="view-ballot-summary">View my ballot</button>
    </div>
  </div>`;
}

// ============================================================
// BALLOT SUMMARY
// ============================================================

export function renderBallotSummary(): void {
  const container = document.getElementById('ballot-summary-container');
  if (!container) return;
  if (!state.ballotOpen) { container.innerHTML = ''; return; }

  const sortedRaces = [...RACES]
    .filter(r => r.candidates.length > 0)
    .sort((a, b) => (RACE_TYPE_ORDER[a.type] ?? 9) - (RACE_TYPE_ORDER[b.type] ?? 9));

  const rows = sortedRaces.map(race => {
    const picked = state.selectedCandidates.get(race.id);
    const candidate = picked ? race.candidates.find(c => c.name === picked) : null;

    if (!candidate) {
      return `<div class="ballot-summary-row">
        <span class="ballot-summary-race-name">${esc(race.name)}</span>
        <span class="ballot-summary-undecided">Not yet decided</span>
      </div>`;
    }

    const partyClass = candidate.party === 'Democratic' ? 'dem' : 'rep';
    return `<div class="ballot-summary-row">
      <span class="ballot-summary-race-name">${esc(race.name)}</span>
      <div class="ballot-summary-pick">
        <div class="candidate-avatar sm">${esc(candidate.initials)}</div>
        <strong>${esc(candidate.name)}</strong>
        <span class="party-dot ${partyClass}"></span>
        <button type="button" class="ballot-summary-change" data-summary-jump="${esc(race.id)}">Change</button>
      </div>
    </div>`;
  }).join('');

  container.innerHTML = `<div class="ballot-summary-overlay" id="ballot-summary-overlay">
    <div class="ballot-summary" role="dialog" aria-label="My Ballot">
      <div class="ballot-summary-header">
        <h2>My Ballot</h2>
        <span class="ballot-summary-count">${state.selectedCandidateCount}/${sortedRaces.length} decided</span>
        <button type="button" class="ballot-summary-close" id="ballot-summary-close" aria-label="Close">&times;</button>
      </div>
      <div class="ballot-summary-body">${rows}</div>
      <div class="ballot-summary-footer">
        <button type="button" class="btn-primary btn-sm" id="ballot-summary-print">Print my ballot</button>
        <button type="button" class="btn-secondary btn-sm" id="ballot-summary-done">Done</button>
      </div>
    </div>
  </div>`;
}
