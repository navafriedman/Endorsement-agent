import type { MatchScore } from './types';
import { ISSUES, IDENTITY_GROUPS, ISSUE_STANCES, ISSUE_COLORS, RACES } from './data';
import { state } from './state';

function esc(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

const PARTY_LOGO: Record<string, string> = {
  Democratic: '<svg class="party-logo" aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#3B82F6"/><text x="12" y="16.5" text-anchor="middle" fill="white" font-size="13" font-weight="700" font-family="sans-serif">D</text></svg>',
  Republican: '<svg class="party-logo" aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#EF4444"/><text x="12" y="16.5" text-anchor="middle" fill="white" font-size="13" font-weight="700" font-family="sans-serif">R</text></svg>',
};

const RACE_TYPE_ORDER: Record<string, number> = { federal: 0, state: 1, local: 2 };

// ============================================================
// SHELL
// ============================================================

export function renderShell(): string {
  return `
    <a class="skip-link" href="#main">Skip to content</a>
    <header class="header" role="banner">
      <div class="container">
        <a class="logo" href="/">change<span>.vote</span></a>
        <span class="header-tagline">Your Personalized Ballot Guide</span>
        <div class="header-election">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="4" width="18" height="18" rx="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          TX Primary — Mar 3, 2026
        </div>
      </div>
    </header>

    <main class="container" id="main">
      <div id="step-content"></div>
    </main>

    <footer class="footer" role="contentinfo">
      <div class="container">
        Nonpartisan. Private. No account needed. — <a href="/">change.vote</a><br>
        All candidate positions sourced and linked. Endorsement data from public records.
      </div>
    </footer>

    <div id="ballot-bar"></div>
    <div id="ballot-summary-container"></div>
  `;
}

// ============================================================
// STEP 1: ISSUES — Swipeable stance cards
// ============================================================

export function renderIssueStep(): string {
  const issueCards = ISSUES.map((issue, idx) => {
    const stances = ISSUE_STANCES[issue.id];
    if (!stances) return '';

    const current = state.issueStances.get(issue.id);
    const colors = ISSUE_COLORS[issue.id];
    const isDone = current !== undefined;

    return `<div class="stance-card ${isDone ? 'done' : ''}" data-stance-card="${issue.id}" style="--issue-bg:${colors.bg};--issue-text:${colors.text};--issue-border:${colors.border}">
      <div class="stance-card-header">
        <span class="stance-card-icon" aria-hidden="true">${issue.icon}</span>
        <span class="stance-card-label">${esc(issue.label)}</span>
        <span class="stance-card-num">${idx + 1}/${ISSUES.length}</span>
      </div>
      <div class="stance-options">
        <button type="button" class="stance-btn ${current === 'agree' ? 'selected-agree' : ''}" data-stance-issue="${issue.id}" data-stance-choice="agree">
          <span class="stance-text">${esc(stances.progressive)}</span>
        </button>
        <button type="button" class="stance-btn ${current === 'disagree' ? 'selected-disagree' : ''}" data-stance-issue="${issue.id}" data-stance-choice="disagree">
          <span class="stance-text">${esc(stances.conservative)}</span>
        </button>
      </div>
      <button type="button" class="stance-skip" data-stance-issue="${issue.id}" data-stance-choice="skip">
        ${current === 'skip' ? '✓ Skipped' : 'Skip this issue'}
      </button>
    </div>`;
  }).join('');

  const ratedCount = state.ratedIssueCount;
  const totalCount = ISSUES.length;
  const progressPct = Math.round((ratedCount / totalCount) * 100);

  return `
    <div class="step-header">
      <div class="step-badge">Step 1 of 2</div>
      <h1 class="step-title">What matters to you?</h1>
      <p class="step-subtitle">Pick the statement closest to your view on each issue. This takes about 60 seconds.</p>
    </div>

    <div class="progress-bar-container">
      <div class="progress-bar" style="width:${progressPct}%"></div>
      <span class="progress-label">${ratedCount}/${totalCount} issues</span>
    </div>

    <div class="stance-cards">
      ${issueCards}
    </div>

    <div class="step-nav">
      <div class="step-nav-spacer"></div>
      <button type="button" class="btn-primary btn-lg" id="go-to-groups" ${ratedCount === 0 ? 'disabled' : ''}>
        Next: Who do you trust?
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
    </div>
  `;
}

// ============================================================
// STEP 2: GROUPS — Trusted organizations
// ============================================================

export function renderGroupStep(): string {
  const groupsByType = new Map<string, typeof IDENTITY_GROUPS>();
  for (const group of IDENTITY_GROUPS) {
    const arr = groupsByType.get(group.type) ?? [];
    arr.push(group);
    groupsByType.set(group.type, arr);
  }

  let groupsHtml = '';
  for (const [type, groups] of groupsByType) {
    groupsHtml += `<div class="group-category">
      <h3 class="group-category-label">${esc(type)}</h3>
      <div class="group-pills">
        ${groups.map(g => {
          const selected = state.selectedGroups.has(g.id);
          // Count candidates endorsed
          let endorseCount = 0;
          RACES.forEach(r => r.candidates.forEach(c => {
            if (c.endorsements.includes(g.id)) endorseCount++;
          }));
          return `<button class="pill ${selected ? 'selected identity' : ''}" data-group="${g.id}" aria-pressed="${selected}">
            <span class="pill-icon" aria-hidden="true">${g.icon}</span>
            ${esc(g.label)}
            <span class="pill-count">${endorseCount}</span>
          </button>`;
        }).join('')}
      </div>
    </div>`;
  }

  return `
    <div class="step-header">
      <div class="step-badge">Step 2 of 2</div>
      <h1 class="step-title">Who do you trust?</h1>
      <p class="step-subtitle">Select organizations whose endorsements matter to you. We'll factor their picks into your matches.</p>
    </div>

    <div class="group-grid">
      ${groupsHtml}
    </div>

    <div class="step-nav">
      <button type="button" class="btn-secondary" id="back-to-issues">
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        Back
      </button>
      <button type="button" class="btn-primary btn-lg" id="show-results">
        Show my matches
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
    </div>
  `;
}

// ============================================================
// STEP 3: RESULTS — Match-sorted candidate cards per race
// ============================================================

function renderScoreRing(score: number): string {
  const r = 20;
  const c = 2 * Math.PI * r;
  const pct = score / 100;
  const dashOffset = c * (1 - pct);
  const level = score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low';

  return `<div class="score-ring ${level}" aria-label="${score}% match">
    <svg viewBox="0 0 48 48">
      <circle cx="24" cy="24" r="${r}" fill="none" stroke="var(--ring-track)" stroke-width="4"/>
      <circle cx="24" cy="24" r="${r}" fill="none" stroke="var(--ring-fill)" stroke-width="4"
        stroke-dasharray="${c}" stroke-dashoffset="${dashOffset}"
        stroke-linecap="round" transform="rotate(-90 24 24)"/>
    </svg>
    <span class="score-ring-value">${score}%</span>
  </div>`;
}

function renderMatchDetails(ms: MatchScore): string {
  const key = `detail:${ms.race.id}:${ms.candidate.name}`;
  const isOpen = state.isExpanded(key);
  if (!isOpen) return '';

  let issueRows = '';
  for (const mi of ms.matchedIssues) {
    const issue = ISSUES.find(i => i.id === mi.issueId)!;
    const pos = ms.candidate.issues[mi.issueId];
    const colors = ISSUE_COLORS[mi.issueId];
    if (!pos) continue;

    const stancePills = pos.stances.map(s =>
      `<span class="stance-pill" style="background:${colors.bg};color:${colors.text}">${esc(s)}</span>`
    ).join('');

    issueRows += `<div class="detail-issue-row ${mi.stance === 'agree' ? 'match' : 'mismatch'}">
      <div class="detail-issue-header">
        <span class="detail-issue-icon" aria-hidden="true">${issue.icon}</span>
        <span class="detail-issue-label">${esc(issue.label)}</span>
        <span class="detail-match-badge ${mi.stance}">${mi.stance === 'agree' ? '✓ Match' : '✗ Differs'}</span>
      </div>
      <div class="detail-stances">${stancePills}</div>
      <p class="detail-position">${esc(pos.position)}</p>
      <span class="detail-source">${esc(pos.source)}</span>
    </div>`;
  }

  // Show unrated issues the candidate has positions on
  const ratedIssueIds = new Set(ms.matchedIssues.map(mi => mi.issueId));
  const otherIssues = Object.keys(ms.candidate.issues).filter(id => !ratedIssueIds.has(id));
  let otherHtml = '';
  if (otherIssues.length > 0) {
    otherHtml = `<div class="detail-other-issues">
      <h5 class="detail-other-label">Other positions</h5>
      ${otherIssues.map(issueId => {
        const issue = ISSUES.find(i => i.id === issueId)!;
        const pos = ms.candidate.issues[issueId];
        const colors = ISSUE_COLORS[issueId];
        if (!pos) return '';
        const stancePills = pos.stances.map(s =>
          `<span class="stance-pill" style="background:${colors.bg};color:${colors.text}">${esc(s)}</span>`
        ).join('');
        return `<div class="detail-issue-row neutral">
          <div class="detail-issue-header">
            <span class="detail-issue-icon" aria-hidden="true">${issue.icon}</span>
            <span class="detail-issue-label">${esc(issue.label)}</span>
          </div>
          <div class="detail-stances">${stancePills}</div>
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
      const isMatch = state.selectedGroups.has(eid);
      return `<span class="endorsement-chip ${isMatch ? 'matched' : ''}">${g.icon} ${esc(g.label)}${isMatch ? ' ✓' : ''}</span>`;
    }).join('');
    endorseHtml = `<div class="detail-endorsements">
      <h5 class="detail-endorse-label">Endorsements</h5>
      <div class="detail-endorse-chips">${chips}</div>
    </div>`;
  }

  return `<div class="match-details">${issueRows}${otherHtml}${endorseHtml}</div>`;
}

function renderCandidateResult(ms: MatchScore, rank: number): string {
  const c = ms.candidate;
  const key = `detail:${ms.race.id}:${c.name}`;
  const isOpen = state.isExpanded(key);
  const isSelected = state.selectedCandidates.get(ms.race.id) === c.name;

  // Compact endorsement matches
  let endorseMatchHtml = '';
  if (state.selectedGroups.size > 0) {
    endorseMatchHtml = `<span class="endorse-match-inline">${ms.endorsementMatches}/${ms.endorsementTotal} trusted groups</span>`;
  }

  // Issue match summary
  let issueSummary = '';
  if (ms.issueTotal > 0) {
    issueSummary = `<span class="issue-match-inline">${ms.issueMatches}/${ms.issueTotal} issue match</span>`;
  }

  return `<div class="candidate-result ${rank === 0 ? 'top-match' : ''} ${isSelected ? 'is-selected' : ''}">
    <div class="candidate-result-main">
      <div class="candidate-result-left">
        ${renderScoreRing(ms.score)}
        <div class="candidate-result-info">
          <div class="candidate-result-name">
            <h4>${esc(c.name)}</h4>
            ${c.incumbent ? '<span class="incumbent-badge">Incumbent</span>' : ''}
          </div>
          <span class="candidate-result-meta">
            ${PARTY_LOGO[c.party] ?? ''} ${esc(c.party)}
          </span>
          <div class="candidate-result-tags">
            ${issueSummary}
            ${endorseMatchHtml}
          </div>
        </div>
      </div>
      <div class="candidate-result-actions">
        <button type="button" class="candidate-select-btn ${isSelected ? 'selected' : ''}" data-select-candidate="${esc(c.name)}" data-select-race="${esc(ms.race.id)}" aria-pressed="${isSelected}">
          ${isSelected
            ? '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Selected'
            : '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg> Select'}
        </button>
        <button type="button" class="detail-toggle" data-detail-toggle="${esc(key)}" aria-expanded="${isOpen}">
          ${isOpen ? 'Less' : 'Details'}
          <svg class="detail-chevron ${isOpen ? 'open' : ''}" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
      </div>
    </div>
    ${renderMatchDetails(ms)}
  </div>`;
}

export function renderResultsStep(): string {
  const matches = state.computeMatches();

  const sortedRaces = [...RACES].sort((a, b) =>
    (RACE_TYPE_ORDER[a.type] ?? 9) - (RACE_TYPE_ORDER[b.type] ?? 9)
  );

  const raceCards = sortedRaces.map(race => {
    const raceMatches = matches.get(race.id) ?? [];
    if (raceMatches.length === 0) return '';

    const topScore = raceMatches[0]?.score ?? 0;

    return `<article class="race-card" aria-label="${esc(race.name)}" id="race-${esc(race.id)}">
      <div class="race-header">
        <div class="race-header-left">
          <h3 class="race-name">${esc(race.name)}</h3>
          <span class="race-badge ${race.type}">${race.type}</span>
        </div>
        ${topScore > 0 ? `<span class="race-top-score">Top match: ${topScore}%</span>` : ''}
      </div>
      <div class="race-candidates">
        ${raceMatches.map((ms, i) => renderCandidateResult(ms, i)).join('')}
      </div>
    </article>`;
  }).join('');

  // Summary stats
  const allMatches = [...matches.values()].flat();
  const topMatches = allMatches.filter(m => m.score >= 70);

  return `
    <div class="step-header results-header">
      <h1 class="step-title">Your Matches</h1>
      <p class="step-subtitle">
        Candidates ranked by how well they match your priorities.
        ${topMatches.length > 0 ? `<strong>${topMatches.length} strong match${topMatches.length > 1 ? 'es' : ''}</strong> found across your ballot.` : ''}
      </p>
      <div class="results-actions">
        <button type="button" class="btn-secondary btn-sm" id="edit-preferences">
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          Edit preferences
        </button>
      </div>
    </div>

    <div class="results-legend">
      <span class="legend-item"><span class="legend-dot high"></span> 70%+ Strong match</span>
      <span class="legend-item"><span class="legend-dot medium"></span> 40-69% Partial match</span>
      <span class="legend-item"><span class="legend-dot low"></span> Under 40%</span>
    </div>

    <div id="race-cards">${raceCards}</div>
  `;
}

// ============================================================
// BALLOT BAR
// ============================================================

export function renderBallotBar(): void {
  const el = document.getElementById('ballot-bar');
  if (!el) return;

  if (state.step !== 'results') {
    el.innerHTML = '';
    return;
  }

  const count = state.selectedCandidateCount;
  const totalRaces = RACES.filter(r => r.candidates.length > 0).length;

  if (count === 0) {
    el.innerHTML = '';
    return;
  }

  el.innerHTML = `<div class="ballot-bar">
    <div class="ballot-bar-inner">
      <div class="ballot-bar-info">
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
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
// BALLOT SUMMARY
// ============================================================

export function renderBallotSummary(): void {
  const container = document.getElementById('ballot-summary-container');
  if (!container) return;

  if (!state.ballotOpen) {
    container.innerHTML = '';
    return;
  }

  const sortedRaces = [...RACES]
    .filter(r => r.candidates.length > 0)
    .sort((a, b) => (RACE_TYPE_ORDER[a.type] ?? 9) - (RACE_TYPE_ORDER[b.type] ?? 9));

  const rows = sortedRaces.map(race => {
    const picked = state.selectedCandidates.get(race.id);
    const candidate = picked ? race.candidates.find(c => c.name === picked) : null;

    if (!candidate) {
      return `<div class="ballot-summary-row undecided">
        <div class="ballot-summary-race">
          <span class="race-badge ${race.type}">${race.type}</span>
          <span class="ballot-summary-race-name">${esc(race.name)}</span>
        </div>
        <span class="ballot-summary-undecided">Not yet decided</span>
      </div>`;
    }

    return `<div class="ballot-summary-row">
      <div class="ballot-summary-race">
        <span class="race-badge ${race.type}">${race.type}</span>
        <span class="ballot-summary-race-name">${esc(race.name)}</span>
      </div>
      <div class="ballot-summary-pick">
        <div class="candidate-avatar" aria-hidden="true">${esc(candidate.initials)}</div>
        <strong>${esc(candidate.name)}</strong>
        <span class="candidate-result-meta">${PARTY_LOGO[candidate.party] ?? ''}</span>
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
      <div class="ballot-summary-body">${rows}</div>
      <div class="ballot-summary-footer">
        <button type="button" class="btn-primary" id="ballot-summary-print">
          <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
          Print my ballot
        </button>
        <button type="button" class="btn-secondary" id="ballot-summary-done">Done</button>
      </div>
    </div>
  </div>`;
}
