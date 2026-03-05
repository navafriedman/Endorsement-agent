import type { MatchScore } from './types';
import { ISSUES, IDENTITY_GROUPS, ISSUE_STANCES, ISSUE_COLORS, RACES, ENDORSEMENT_QUOTES } from './data';
import { state } from './state';

function esc(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

const RACE_TYPE_ORDER: Record<string, number> = { federal: 0, state: 1, local: 2 };
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
// ADDRESS BAR — non-blocking, inviting
// ============================================================

function renderAddressBar(): string {
  const addr = state.address;
  if (addr) {
    return `<div class="address-confirmed">
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
      <span class="address-confirmed-text">Showing ballot for <strong>${esc(addr)}</strong></span>
      <button class="address-bar-change" id="address-change">Change</button>
    </div>`;
  }

  return `<div class="address-prompt">
    <div class="address-prompt-label">
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
      Find your exact ballot
    </div>
    <div class="address-input-row">
      <input type="text" class="address-input" id="address-input" placeholder="Enter your home address" autocomplete="street-address" />
      <button class="address-lookup-btn" id="address-lookup">Look up</button>
    </div>
  </div>`;
}

// ============================================================
// FILTER ENGAGEMENT — inviting prompt vs compact toolbar
// ============================================================

function renderFilterSection(): string {
  const issueCount = state.ratedIssueCount;
  const groupCount = state.selectedGroups.size;
  const hasPrefs = state.hasPreferences;

  if (!hasPrefs) {
    // Inviting engagement cards
    return `<div class="engage-section">
      <h2 class="engage-title">Personalize your ballot</h2>
      <p class="engage-subtitle">Tell us what matters to you and we'll rank candidates by how well they match.</p>
      <div class="engage-cards">
        <button class="engage-card ${state.filterOpen === 'issues' ? 'active' : ''}" data-open-filter="issues">
          <span class="engage-card-icon">⚖</span>
          <span class="engage-card-label">Issues you care about</span>
          <span class="engage-card-desc">Pick where you stand on key topics — takes 30 seconds</span>
          <span class="engage-card-arrow">Get started →</span>
        </button>
        <button class="engage-card ${state.filterOpen === 'groups' ? 'active' : ''}" data-open-filter="groups">
          <span class="engage-card-icon">🤝</span>
          <span class="engage-card-label">Organizations you trust</span>
          <span class="engage-card-desc">Select groups whose endorsements you value</span>
          <span class="engage-card-arrow">Get started →</span>
        </button>
      </div>
    </div>`;
  }

  // Compact active filter toolbar
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
      <button class="clear-link" id="clear-all">Clear all</button>
    </div>
    ${activeTags ? `<div class="active-tags-row">${activeTags}</div>` : ''}
  </div>`;
}

// ============================================================
// ISSUES PANEL — scannable grid of compact issue cards
// ============================================================

function renderIssuesPanel(): string {
  if (state.filterOpen !== 'issues') return '';

  const cards = ISSUES.map(issue => {
    const stances = ISSUE_STANCES[issue.id];
    if (!stances) return '';
    const current = state.issueStances.get(issue.id);
    const isDone = current !== undefined && current !== 'skip';

    return `<div class="issue-card ${isDone ? 'done' : ''}">
      <div class="issue-card-header">
        <span class="issue-card-icon">${issue.icon}</span>
        <span class="issue-card-name">${esc(issue.label)}</span>
        ${current && current !== 'skip' ? `<button type="button" class="issue-card-clear" data-stance-issue="${issue.id}" data-stance-choice="skip" aria-label="Clear">&times;</button>` : ''}
      </div>
      <div class="issue-card-options">
        <button type="button" class="stance-opt ${current === 'agree' ? 'sel-a' : ''}" data-stance-issue="${issue.id}" data-stance-choice="agree">
          ${esc(stances.shortProgressive)}
        </button>
        <button type="button" class="stance-opt ${current === 'disagree' ? 'sel-b' : ''}" data-stance-issue="${issue.id}" data-stance-choice="disagree">
          ${esc(stances.shortConservative)}
        </button>
      </div>
    </div>`;
  }).join('');

  const doneCount = state.ratedIssueCount;

  return `<div class="filter-panel" id="issues-panel">
    <div class="filter-panel-header">
      <h3>Where do you stand?</h3>
      <p>Tap the position closest to yours. Skip any you don't care about.</p>
    </div>
    ${doneCount > 0 ? `<div class="issue-progress">${doneCount} of ${ISSUES.length} answered</div>` : ''}
    <div class="issue-grid">${cards}</div>
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
// ENDORSEMENT ROW — with quote from selected endorser
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

  // Find a quote from a selected endorser
  let quoteHtml = '';
  const quotes = ENDORSEMENT_QUOTES[ms.candidate.name];
  if (quotes) {
    // Prefer quote from a selected group
    const matchedQuoteId = sorted.find(eid => state.selectedGroups.has(eid) && quotes[eid]);
    const quoteId = matchedQuoteId ?? sorted.find(eid => quotes[eid]);
    if (quoteId && quotes[quoteId]) {
      const org = IDENTITY_GROUPS.find(x => x.id === quoteId);
      quoteHtml = `<blockquote class="endorsement-quote">
        <p>"${esc(quotes[quoteId])}"</p>
        ${org ? `<cite>— ${esc(org.label)}</cite>` : ''}
      </blockquote>`;
    }
  }

  return `<div class="endorsement-section">
    <div class="endorsement-row">
      <div class="endorsement-avatars">${avatars}</div>
      <span class="endorsement-text">${text}</span>
    </div>
    ${quoteHtml}
  </div>`;
}

// ============================================================
// DETAIL PANEL (expanded) — other positions collapsed by default
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

  // Other issues — collapsed by default, behind a toggle
  const ratedIds = new Set(ms.matchedIssues.map(m => m.issueId));
  const otherIds = Object.keys(ms.candidate.issues).filter(id => !ratedIds.has(id));
  const othersKey = `others:${ms.race.id}:${ms.candidate.name}`;
  const othersOpen = state.isExpanded(othersKey);

  let otherHtml = '';
  if (otherIds.length > 0) {
    const otherContent = othersOpen ? otherIds.map(issueId => {
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
    }).join('') : '';

    otherHtml = `<div class="detail-other-issues">
      <button type="button" class="detail-toggle-link" data-detail-toggle="${esc(othersKey)}">
        ${othersOpen ? 'Hide' : 'Show'} ${otherIds.length} other position${otherIds.length > 1 ? 's' : ''}
        <svg class="detail-toggle-chevron ${othersOpen ? 'open' : ''}" aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      ${otherContent}
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

  return `<div class="candidate-card ${isTopMatch ? 'top-match' : ''} ${isSel ? 'is-selected' : ''}">
    <div class="card-inner">
      <div class="card-header">
        <div class="candidate-avatar">${esc(c.initials)}</div>
        ${renderMatchBadge(ms.score)}
      </div>
      <h3 class="candidate-name">${esc(c.name)}</h3>
      <div class="candidate-meta">
        <span class="party-dot ${partyClass}"></span>
        <span>${esc(c.party)}${c.incumbent ? ' · Incumbent' : ''}</span>
      </div>
      ${renderEndorsementRow(ms)}
      <div class="candidate-actions">
        <button type="button" class="select-btn ${isSel ? 'selected' : ''}" data-select-candidate="${esc(c.name)}" data-select-race="${esc(ms.race.id)}" aria-pressed="${isSel}">
          ${isSel ? ICON_CHECK + ' Selected' : 'Select'}
        </button>
        <button type="button" class="details-link" data-detail-toggle="${esc(key)}" aria-expanded="${isOpen}">
          ${isOpen ? 'Less info' : 'More info'}
        </button>
      </div>
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
      <p class="hero-subtitle">Explore candidates matched to your priorities. Personalize below to see who aligns with what matters to you.</p>
      ${renderAddressBar()}
    </div>

    ${renderFilterSection()}
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
