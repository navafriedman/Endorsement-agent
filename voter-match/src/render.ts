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
// LOCATION CONTEXT — part of the election header
// ============================================================

function renderLocationContext(): string {
  const addr = state.address;
  if (addr) {
    return `<div class="location-context confirmed">
      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
      <span>${esc(addr)}</span>
      <button class="location-change" id="address-change">Change</button>
    </div>`;
  }

  return `<div class="location-context">
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
    <input type="text" class="location-input" id="address-input" placeholder="Enter your address for your exact ballot" autocomplete="street-address" />
    <button class="location-go" id="address-lookup">Go</button>
  </div>`;
}

// ============================================================
// FILTER SECTION — always-visible engagement cards that evolve
// ============================================================

function renderFilterSection(): string {
  const issueCount = state.ratedIssueCount;
  const groupCount = state.selectedGroups.size;
  const hasPrefs = state.hasPreferences;

  // Build active tags for below the cards
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

  // Issues card — evolves based on state
  const issueCardClass = state.filterOpen === 'issues' ? 'active' : issueCount > 0 ? 'done' : '';
  let issueStatus: string;
  if (issueCount > 0) {
    issueStatus = `<span class="engage-card-status done">${issueCount} issue${issueCount > 1 ? 's' : ''} selected ✓</span>`;
  } else {
    issueStatus = `<span class="engage-card-desc">Pick where you stand on key topics</span>`;
  }
  const issueCta = issueCount > 0
    ? `<span class="engage-card-arrow">Edit →</span>`
    : `<span class="engage-card-arrow">Choose →</span>`;

  // Groups card — evolves based on state
  const groupCardClass = state.filterOpen === 'groups' ? 'active' : groupCount > 0 ? 'done' : '';
  let groupStatus: string;
  if (groupCount > 0) {
    groupStatus = `<span class="engage-card-status done">${groupCount} group${groupCount > 1 ? 's' : ''} selected ✓</span>`;
  } else {
    groupStatus = `<span class="engage-card-desc">Select groups whose endorsements you value</span>`;
  }
  const groupCta = groupCount > 0
    ? `<span class="engage-card-arrow">Edit →</span>`
    : `<span class="engage-card-arrow">Choose →</span>`;

  return `<div class="engage-section">
    <h2 class="engage-title">Personalize your ballot</h2>
    <p class="engage-subtitle">Tell us what matters to you and we'll rank candidates by how well they match.</p>
    ${renderLocationContext()}
    <div class="engage-cards">
      <button class="engage-card ${issueCardClass}" data-open-filter="issues">
        <span class="engage-card-title"><span class="engage-card-icon">⚖</span> <span class="engage-card-label">Issues</span></span>
        ${issueStatus}
        ${issueCta}
      </button>
      <button class="engage-card ${groupCardClass}" data-open-filter="groups">
        <span class="engage-card-title"><span class="engage-card-icon">🤝</span> <span class="engage-card-label">Organizations</span></span>
        ${groupStatus}
        ${groupCta}
      </button>
    </div>
    ${activeTags ? `<div class="active-tags-row">${activeTags}
      ${hasPrefs ? '<button class="clear-link" id="clear-all">Clear all</button>' : ''}
    </div>` : ''}
  </div>`;
}

// ============================================================
// ISSUES PANEL — scannable grid of compact issue cards
// ============================================================

function renderIssuesPanel(): string {
  if (state.filterOpen !== 'issues') return '';

  const rows = ISSUES.map(issue => {
    const stances = ISSUE_STANCES[issue.id];
    if (!stances) return '';
    const current = state.issueStances.get(issue.id);

    return `<div class="issue-row">
      <span class="issue-row-label"><span class="issue-row-icon">${issue.icon}</span>${esc(issue.label)}</span>
      <div class="issue-row-options">
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
      <p>Tap the position closest to yours on each topic.</p>
    </div>
    ${doneCount > 0 ? `<div class="issue-progress">${doneCount} of ${ISSUES.length} answered</div>` : ''}
    <div class="issue-list">${rows}</div>
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

  // Count endorsements per group
  const endorseCounts = new Map<string, number>();
  for (const g of IDENTITY_GROUPS) {
    let count = 0;
    RACES.forEach(r => r.candidates.forEach(c => {
      if (c.endorsements.includes(g.id)) count++;
    }));
    endorseCounts.set(g.id, count);
  }

  // Collect unique categories
  const categories = [...new Set(IDENTITY_GROUPS.map(g => g.type))];
  const activeCat = state.groupCategory;
  const searchQ = state.groupSearch.toLowerCase();

  // Filter groups
  let filtered = IDENTITY_GROUPS;
  if (activeCat !== 'all') {
    filtered = filtered.filter(g => g.type === activeCat);
  }
  if (searchQ) {
    filtered = filtered.filter(g => g.label.toLowerCase().includes(searchQ) || g.type.toLowerCase().includes(searchQ));
  }

  // Sort: selected first, then by endorsement count
  const sorted = [...filtered].sort((a, b) => {
    const aSel = state.selectedGroups.has(a.id) ? 0 : 1;
    const bSel = state.selectedGroups.has(b.id) ? 0 : 1;
    if (aSel !== bSel) return aSel - bSel;
    return (endorseCounts.get(b.id) ?? 0) - (endorseCounts.get(a.id) ?? 0);
  });

  const pills = sorted.map(g => {
    const sel = state.selectedGroups.has(g.id);
    const count = endorseCounts.get(g.id) ?? 0;
    return `<button class="pill ${sel ? 'selected' : ''}" data-group="${g.id}" aria-pressed="${sel}">
      <span class="pill-icon">${g.icon}</span>
      ${esc(g.label)}
      <span class="pill-count">${count}</span>
    </button>`;
  }).join('');

  // Category tabs
  const catTabs = [`<button class="group-cat-tab ${activeCat === 'all' ? 'active' : ''}" data-group-cat="all">All</button>`]
    .concat(categories.map(cat =>
      `<button class="group-cat-tab ${activeCat === cat ? 'active' : ''}" data-group-cat="${esc(cat)}">${esc(cat)}</button>`
    )).join('');

  const selCount = state.selectedGroups.size;

  return `<div class="filter-panel" id="groups-panel">
    <div class="filter-panel-header">
      <h3>Who do you trust?</h3>
      <p>Tap organizations whose endorsements matter to you.</p>
    </div>
    <input type="text" class="group-search" id="group-search-input" placeholder="Search endorsers…" value="${esc(state.groupSearch)}" autocomplete="off" />
    <div class="group-cat-bar">${catTabs}</div>
    ${selCount > 0 ? `<div class="issue-progress">${selCount} selected</div>` : ''}
    <div class="group-pills">${pills}</div>
    ${filtered.length === 0 ? '<p class="group-empty">No endorsers match your search.</p>' : ''}
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
// KEY POSITIONS — 1-2 top issue stances shown on card by default
// ============================================================

function renderKeyPositions(c: import('./types').Candidate, ms: MatchScore): string {
  const allIssueIds = Object.keys(c.issues);
  if (allIssueIds.length === 0) return '';

  // Prioritize: matched issues first, then other rated issues, then unrated
  const matchedAgree = new Set(ms.matchedIssues.filter(m => m.stance === 'agree').map(m => m.issueId));
  const matchedDisagree = new Set(ms.matchedIssues.filter(m => m.stance === 'disagree').map(m => m.issueId));

  const sorted = [...allIssueIds].sort((a, b) => {
    const aPri = matchedAgree.has(a) ? 0 : matchedDisagree.has(a) ? 1 : 2;
    const bPri = matchedAgree.has(b) ? 0 : matchedDisagree.has(b) ? 1 : 2;
    return aPri - bPri;
  });

  const issueIds = sorted.slice(0, 2);

  const pills = issueIds.map(id => {
    const pos = c.issues[id];
    const issue = ISSUES.find(i => i.id === id);
    if (!pos || !issue || pos.stances.length === 0) return '';
    const colors = ISSUE_COLORS[id];
    const matchClass = matchedAgree.has(id) ? 'match' : matchedDisagree.has(id) ? 'mismatch' : '';
    return `<span class="key-position-pill ${matchClass}" style="background:${colors.bg};color:${colors.text}">
      <span class="key-position-issue">${issue.icon} ${esc(issue.label)}</span>
      <span class="key-position-stance">${esc(pos.stances[0])}</span>
    </span>`;
  }).filter(Boolean).join('');

  return `<div class="key-positions">${pills}</div>`;
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
  const isSel = state.selectedCandidates.get(ms.race.id) === c.name;
  const partyClass = c.party === 'Democratic' ? 'dem' : 'rep';
  const isTopMatch = rank === 0 && ms.score >= 60;

  return `<div class="candidate-card ${isTopMatch ? 'top-match' : ''} ${isSel ? 'is-selected' : ''}">
    <div class="card-inner">
      <div class="card-header">
        <div class="candidate-avatar">${esc(c.initials)}</div>
        ${renderMatchBadge(ms.score)}
      </div>
      <h3 class="candidate-name">
        <a href="#candidate/${esc(ms.race.id)}/${encodeURIComponent(c.name)}" class="candidate-name-link" data-open-candidate data-race="${esc(ms.race.id)}" data-candidate="${esc(c.name)}">${esc(c.name)}</a>
      </h3>
      <div class="candidate-meta">
        <span class="party-dot ${partyClass}"></span>
        <span>${esc(c.party)}${c.incumbent ? ' · Incumbent' : ''}</span>
      </div>
      ${renderKeyPositions(c, ms)}
      ${renderEndorsementRow(ms)}
      <div class="candidate-actions">
        <button type="button" class="select-btn ${isSel ? 'selected' : ''}" data-select-candidate="${esc(c.name)}" data-select-race="${esc(ms.race.id)}" aria-pressed="${isSel}">
          ${isSel ? ICON_CHECK + ' Selected' : 'Select'}
        </button>
        <a href="#candidate/${esc(ms.race.id)}/${encodeURIComponent(c.name)}" class="details-link" data-open-candidate data-race="${esc(ms.race.id)}" data-candidate="${esc(c.name)}">
          View profile →
        </a>
      </div>
    </div>
  </div>`;
}

// ============================================================
// MAIN PAGE
// ============================================================

export function renderPage(): string {
  if (state.activeView.type === 'candidate') {
    return renderCandidateView();
  }
  return renderBallotPage();
}

// ============================================================
// CANDIDATE DETAIL VIEW
// ============================================================

const SOURCE_TYPE_ICONS: Record<string, { icon: string; label: string }> = {
  candidate_website: { icon: '🌐', label: 'Candidate Website' },
  legislative_record: { icon: '📋', label: 'Legislative Record' },
  public_statements: { icon: '🎤', label: 'Public Statements' },
  news_coverage: { icon: '📰', label: 'News Coverage' },
};

function renderCandidateView(): string {
  const view = state.activeView;
  if (view.type !== 'candidate') return '';

  const race = RACES.find(r => r.id === view.raceId);
  if (!race) return '';
  const candidate = race.candidates.find(c => c.name === view.candidateName);
  if (!candidate) return '';

  const ms = state.computeRaceMatches(race).find(m => m.candidate.name === candidate.name)!;
  const isSel = state.selectedCandidates.get(race.id) === candidate.name;
  const partyClass = candidate.party === 'Democratic' ? 'dem' : 'rep';

  // Summary box — top 3 stance pills
  const topIssueIds = Object.keys(candidate.issues).slice(0, 3);
  const topPills = topIssueIds.map(id => {
    const issue = ISSUES.find(i => i.id === id);
    const pos = candidate.issues[id];
    if (!issue || !pos || pos.stances.length === 0) return '';
    const colors = ISSUE_COLORS[id];
    return `<a class="cv-stance-pill" href="#cv-issue-${id}" style="background:${colors.bg};color:${colors.text}">${issue.icon} ${esc(pos.stances[0])}</a>`;
  }).filter(Boolean).join('');

  const issueCount = Object.keys(candidate.issues).length;
  const endorseCount = candidate.endorsements.length;

  // Issue position cards
  const ratedIds = new Set(ms.matchedIssues.map(m => m.issueId));
  const allIssueIds = Object.keys(candidate.issues);
  // Sort: matched first, then unrated
  const sortedIssueIds = [
    ...ms.matchedIssues.filter(mi => mi.stance === 'agree').map(mi => mi.issueId),
    ...ms.matchedIssues.filter(mi => mi.stance === 'disagree').map(mi => mi.issueId),
    ...allIssueIds.filter(id => !ratedIds.has(id)),
  ];

  const issueCards = sortedIssueIds.map(issueId => {
    const issue = ISSUES.find(i => i.id === issueId);
    const pos = candidate.issues[issueId];
    if (!issue || !pos) return '';
    const colors = ISSUE_COLORS[issueId];
    const mi = ms.matchedIssues.find(m => m.issueId === issueId);
    const isExpanded = state.expandedPositions.has(issueId);

    let matchTag = '';
    if (mi) {
      matchTag = mi.stance === 'agree'
        ? '<span class="cv-match-tag agree">✓ Match</span>'
        : '<span class="cv-match-tag disagree">✗ Differs</span>';
    }

    const pills = pos.stances.map(s =>
      `<span class="stance-pill" style="background:${colors.bg};color:${colors.text}">${esc(s)}</span>`
    ).join('');

    const srcInfo = SOURCE_TYPE_ICONS[pos.sourceType] ?? SOURCE_TYPE_ICONS['candidate_website'];
    const srcClass = pos.sourceType === 'candidate_website' || pos.sourceType === 'public_statements' ? 'first-party' : 'third-party';

    let expandedContent = '';
    if (isExpanded) {
      let quoteBlock = '';
      if (pos.directQuote) {
        quoteBlock = `<blockquote class="cv-verbatim">
          <p>"${esc(pos.directQuote)}"</p>
        </blockquote>`;
      }

      expandedContent = `<div class="cv-issue-expanded">
        <p class="cv-position-text">${esc(pos.position)}</p>
        ${quoteBlock}
        <a class="cv-source-chip ${srcClass}" ${pos.sourceUrl ? `href="${esc(pos.sourceUrl)}" target="_blank" rel="noopener"` : ''}>
          ${srcInfo.icon} ${esc(srcInfo.label)} — ${esc(pos.source)}
        </a>
      </div>`;
    }

    return `<div class="cv-issue-card ${isExpanded ? 'expanded' : ''} ${mi ? mi.stance : ''}" id="cv-issue-${issueId}">
      <button type="button" class="cv-issue-collapsed" data-toggle-position="${issueId}">
        <span class="cv-issue-left">
          <span class="cv-issue-icon">${issue.icon}</span>
          <span class="cv-issue-label">${esc(issue.label)}</span>
        </span>
        ${matchTag}
        <span class="cv-issue-pills">${pills}</span>
        <svg class="cv-chevron ${isExpanded ? 'open' : ''}" aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      ${expandedContent}
    </div>`;
  }).join('');

  // Endorsement clusters by category
  let endorseSection = '';
  if (endorseCount > 0) {
    const byCategory = new Map<string, typeof IDENTITY_GROUPS>();
    for (const eid of candidate.endorsements) {
      const g = IDENTITY_GROUPS.find(x => x.id === eid);
      if (!g) continue;
      if (!byCategory.has(g.type)) byCategory.set(g.type, []);
      byCategory.get(g.type)!.push(g);
    }

    // Sort: categories with user-matched groups first
    const sortedCategories = [...byCategory.entries()].sort((a, b) => {
      const aMatch = a[1].some(g => state.selectedGroups.has(g.id)) ? 0 : 1;
      const bMatch = b[1].some(g => state.selectedGroups.has(g.id)) ? 0 : 1;
      return aMatch - bMatch;
    });

    const clusters = sortedCategories.map(([cat, groups]) => {
      const chips = groups.map(g => {
        const matched = state.selectedGroups.has(g.id);
        return `<span class="cv-endorse-chip ${matched ? 'matched' : ''}">${g.icon} ${esc(g.label)}${matched ? ' ✓' : ''}</span>`;
      }).join('');
      return `<div class="cv-endorse-cluster">
        <div class="cv-cluster-header">${esc(cat)} (${groups.length})</div>
        <div class="cv-cluster-chips">${chips}</div>
      </div>`;
    }).join('');

    // Quote cards
    const quotes = ENDORSEMENT_QUOTES[candidate.name] ?? {};
    const quoteCards = candidate.endorsements
      .filter(eid => quotes[eid])
      .sort((a, b) => {
        const aM = state.selectedGroups.has(a) ? 0 : 1;
        const bM = state.selectedGroups.has(b) ? 0 : 1;
        return aM - bM;
      })
      .map(eid => {
        const g = IDENTITY_GROUPS.find(x => x.id === eid)!;
        const matched = state.selectedGroups.has(eid);
        return `<div class="cv-quote-card ${matched ? 'matched' : ''}">
          <p>"${esc(quotes[eid])}"</p>
          <cite>${g.icon} ${esc(g.label)}${matched ? ' <span class="cv-trust-tag">✓ You trust</span>' : ''}</cite>
        </div>`;
      }).join('');

    endorseSection = `
      <section class="cv-section" id="cv-endorsements">
        <h2 class="cv-section-title">Who's recommending ${esc(candidate.name.split(' ')[candidate.name.split(' ').length - 1])}</h2>
        <div class="cv-endorsement-clusters">${clusters}</div>
        ${quoteCards ? `<div class="cv-quotes">${quoteCards}</div>` : ''}
      </section>`;
  }

  // Bio / About section
  let bioSection = '';
  if (candidate.bio) {
    bioSection = `
      <section class="cv-section" id="cv-about">
        <h2 class="cv-section-title">About</h2>
        <p class="cv-bio">${esc(candidate.bio)}</p>
        ${candidate.website ? `<a class="cv-website-link" href="${esc(candidate.website)}" target="_blank" rel="noopener">Visit campaign website →</a>` : ''}
      </section>`;
  }

  // Section nav counts
  const sections = [
    { id: 'cv-positions', label: 'Positions', count: issueCount },
    ...(endorseCount > 0 ? [{ id: 'cv-endorsements', label: 'Endorsements', count: endorseCount }] : []),
    ...(candidate.bio ? [{ id: 'cv-about', label: 'About', count: 0 }] : []),
  ];
  const navTabs = sections.map(s =>
    `<a class="cv-nav-tab" href="#${s.id}" data-scroll-section="${s.id}">${s.label}${s.count > 0 ? ` (${s.count})` : ''}</a>`
  ).join('');

  return `
    <div class="candidate-view">
      <nav class="cv-back">
        <button type="button" class="cv-back-link" data-back-to-ballot>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
          Back to ballot
        </button>
      </nav>

      <div class="cv-summary">
        <div class="cv-summary-header">
          <div class="candidate-avatar lg">${esc(candidate.initials)}</div>
          <div class="cv-summary-info">
            <h1 class="cv-name">${esc(candidate.name)}</h1>
            <div class="cv-meta">
              <span class="party-dot ${partyClass}"></span>
              <span>${esc(candidate.party)}${candidate.incumbent ? ' · Incumbent' : ''} · ${esc(race.name)}</span>
            </div>
            ${renderMatchBadge(ms.score)}
          </div>
        </div>
        ${topPills ? `<div class="cv-top-pills">${topPills}</div>` : ''}
        <div class="cv-summary-counts">${endorseCount} endorsement${endorseCount !== 1 ? 's' : ''} · ${issueCount} issue position${issueCount !== 1 ? 's' : ''}</div>
        <button type="button" class="select-btn cv-select ${isSel ? 'selected' : ''}" data-select-candidate="${esc(candidate.name)}" data-select-race="${esc(race.id)}" aria-pressed="${isSel}">
          ${isSel ? ICON_CHECK + ' Selected' : 'Select this candidate'}
        </button>
      </div>

      <nav class="cv-nav" id="cv-nav">
        ${navTabs}
      </nav>

      <section class="cv-section" id="cv-positions">
        <h2 class="cv-section-title">Where they stand</h2>
        <div class="cv-issues">${issueCards}</div>
      </section>

      ${endorseSection}
      ${bioSection}

      <footer class="cv-methodology">
        Every position listed here is sourced from public records and candidate statements.
      </footer>
    </div>

    <div class="cv-sticky-cta">
      <button type="button" class="select-btn cv-select ${isSel ? 'selected' : ''}" data-select-candidate="${esc(candidate.name)}" data-select-race="${esc(race.id)}" aria-pressed="${isSel}">
        ${isSel ? ICON_CHECK + ' Selected' : 'Select ' + esc(candidate.name.split(' ')[candidate.name.split(' ').length - 1])}
      </button>
    </div>
  `;
}

// ============================================================
// BALLOT PAGE
// ============================================================

function renderBallotPage(): string {
  const sortedRaces = [...RACES].sort((a, b) =>
    (RACE_TYPE_ORDER[a.type] ?? 9) - (RACE_TYPE_ORDER[b.type] ?? 9)
  );

  const activeFilter = state.raceTypeFilter;
  const filteredRaces = activeFilter === 'all'
    ? sortedRaces
    : sortedRaces.filter(r => r.type === activeFilter);

  const raceSections = filteredRaces.map(race => {
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

  const raceTypeFilters = (['all', 'federal', 'state', 'local'] as const).map(type => {
    const count = type === 'all' ? sortedRaces.length : sortedRaces.filter(r => r.type === type).length;
    if (count === 0 && type !== 'all') return '';
    const label = type === 'all' ? 'All' : type.charAt(0).toUpperCase() + type.slice(1);
    return `<button class="race-filter-tab ${activeFilter === type ? 'active' : ''}" data-race-filter="${type}">${label}</button>`;
  }).join('');

  return `
    <div class="hero">
      <div class="hero-election-label">Texas Primary — March 3, 2026</div>
      <h1 class="hero-title">Review your ballot before you vote.</h1>
      <p class="hero-subtitle">Explore candidates matched to your priorities. Personalize below to see who aligns with what matters to you.</p>
    </div>

    ${renderFilterSection()}
    ${renderIssuesPanel()}
    ${renderGroupsPanel()}

    <div class="race-filter-bar">${raceTypeFilters}</div>
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
