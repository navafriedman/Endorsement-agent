import type { MatchScore } from './types';
import { ISSUES, IDENTITY_GROUPS, ISSUE_STANCES, ISSUE_COLORS, RACES } from './data';
import { state } from './state';

function esc(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

const RACE_TYPE_ORDER: Record<string, number> = { federal: 0, state: 1, local: 2 };
const ICON_CHEVRON_DOWN = '<svg class="chevron-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
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
      <div id="step-content"></div>
    </main>

    <footer class="footer" role="contentinfo">
      <div class="footer-inner">
        <div>
          Info sourced from public filings, verified media, and official campaign materials and submitted by AI.<br>
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
  `;
}

// ============================================================
// STEP 1: ISSUES
// ============================================================

export function renderIssueStep(): string {
  const ratedCount = state.ratedIssueCount;
  const total = ISSUES.length;
  const pct = Math.round((ratedCount / total) * 100);

  const cards = ISSUES.map((issue, idx) => {
    const stances = ISSUE_STANCES[issue.id];
    if (!stances) return '';
    const current = state.issueStances.get(issue.id);
    const isDone = current !== undefined;

    return `<div class="stance-card ${isDone ? 'done' : ''}">
      <div class="stance-card-top">
        <span class="stance-card-icon" aria-hidden="true">${issue.icon}</span>
        <span class="stance-card-label">${esc(issue.label)}</span>
        <span class="stance-card-num">${idx + 1} of ${total}</span>
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
        ${current === 'skip' ? '✓ Skipped' : 'Skip'}
      </button>
    </div>`;
  }).join('');

  return `
    <div class="hero">
      <div class="step-indicator">
        <span class="step-dot active"></span>
        <span class="step-dot"></span>
        <span class="step-label">Step 1 of 2</span>
      </div>
      <h1 class="hero-title">What matters to you?</h1>
      <p class="hero-subtitle">Pick the statement closest to your view on each issue. We'll match you to candidates who share your priorities.</p>
    </div>

    <div class="progress-container">
      <div class="progress-header">
        <span class="progress-text">${ratedCount} of ${total} issues</span>
        <span class="progress-text">${pct}%</span>
      </div>
      <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
    </div>

    <div class="stance-list">${cards}</div>

    <div class="step-nav">
      <div></div>
      <button type="button" class="btn-primary" id="go-to-groups" ${ratedCount === 0 ? 'disabled' : ''}>
        Next: Who do you trust? ${ICON_ARROW}
      </button>
    </div>
  `;
}

// ============================================================
// STEP 2: GROUPS
// ============================================================

export function renderGroupStep(): string {
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
        <span class="pill-icon" aria-hidden="true">${g.icon}</span>
        ${esc(g.label)}
        <span class="pill-count">${count}</span>
      </button>`;
    }).join('');

    sections += `<div class="group-section">
      <div class="group-section-label">${esc(type)}</div>
      <div class="group-pills">${pills}</div>
    </div>`;
  }

  return `
    <div class="hero">
      <div class="step-indicator">
        <span class="step-dot done"></span>
        <span class="step-dot active"></span>
        <span class="step-label">Step 2 of 2</span>
      </div>
      <h1 class="hero-title">Who do you trust?</h1>
      <p class="hero-subtitle">Select organizations whose endorsements you value. We'll highlight which candidates they back.</p>
    </div>

    ${sections}

    <div class="step-nav">
      <button type="button" class="btn-secondary" id="back-to-issues">
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        Back
      </button>
      <button type="button" class="btn-primary" id="show-results">
        Show my matches ${ICON_ARROW}
      </button>
    </div>
  `;
}

// ============================================================
// STEP 3: RESULTS
// ============================================================

function renderMatchBadge(score: number): string {
  const level = score >= 70 ? 'high' : score >= 40 ? 'mid' : 'low';
  return `<span class="match-badge ${level}"><span class="match-dot"></span>${score}% match</span>`;
}

function buildDescription(ms: MatchScore): string {
  const parts: string[] = [];
  if (ms.issueTotal > 0) {
    parts.push(`${ms.issueMatches}/${ms.issueTotal} issues align`);
  }
  if (ms.endorsementTotal > 0 && ms.endorsementMatches > 0) {
    const names = ms.matchedEndorsements.map(eid => {
      const g = IDENTITY_GROUPS.find(x => x.id === eid);
      return g?.label ?? eid;
    });
    if (names.length <= 2) {
      parts.push(`Endorsed by ${names.join(' and ')}`);
    } else {
      parts.push(`Endorsed by ${names[0]} & ${names.length - 1} more you trust`);
    }
  }
  return parts.join('. ') + (parts.length ? '.' : '');
}

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

  // Build text
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

  // Other issues
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

  // Endorsements
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

function renderCandidateCard(ms: MatchScore, rank: number): string {
  const c = ms.candidate;
  const key = `detail:${ms.race.id}:${c.name}`;
  const isOpen = state.isExpanded(key);
  const isSel = state.selectedCandidates.get(ms.race.id) === c.name;
  const partyClass = c.party === 'Democratic' ? 'dem' : 'rep';

  const desc = buildDescription(ms);
  const endorseRow = renderEndorsementRow(ms);

  return `<div class="candidate-card ${rank === 0 && ms.score >= 60 ? 'top-match' : ''}">
    ${renderMatchBadge(ms.score)}
    <div class="candidate-avatar">${esc(c.initials)}</div>
    <div class="candidate-name-link">${esc(c.name)} ${ICON_ARROW}</div>
    <div class="candidate-meta-line">
      <span class="party-dot ${partyClass}"></span>${esc(c.party)}${c.incumbent ? ' · Incumbent' : ''}
    </div>
    <p class="candidate-description">${esc(desc)}</p>
    ${endorseRow}
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

export function renderResultsStep(): string {
  const matches = state.computeMatches();
  const sortedRaces = [...RACES].sort((a, b) =>
    (RACE_TYPE_ORDER[a.type] ?? 9) - (RACE_TYPE_ORDER[b.type] ?? 9)
  );

  const allMatches = [...matches.values()].flat();
  const strongCount = allMatches.filter(m => m.score >= 70).length;

  const raceSections = sortedRaces.map(race => {
    const raceMatches = matches.get(race.id) ?? [];
    if (raceMatches.length === 0) return '';

    const numCols = Math.min(raceMatches.length, 3);

    return `<section class="race-section" id="race-${esc(race.id)}">
      <div class="race-section-header">
        <div>
          <span class="race-section-title">${esc(race.name)}</span>
          <span class="race-type-badge ${race.type}">${race.type}</span>
        </div>
        <button type="button" class="race-compare-link" data-compare-race="${esc(race.id)}">
          Compare
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>
      <div class="candidate-grid cols-${numCols}">
        ${raceMatches.map((ms, i) => renderCandidateCard(ms, i)).join('')}
      </div>
    </section>`;
  }).join('');

  return `
    <div class="results-header">
      <div class="hero-election-label">Your personalized ballot</div>
      <h1 class="results-title">Review your ballot before you vote.</h1>
      <p class="results-subtitle">
        Candidates ranked by how well they match your priorities.
        ${strongCount > 0 ? `<strong>${strongCount} strong match${strongCount > 1 ? 'es' : ''}</strong> found.` : ''}
      </p>
      <div class="results-toolbar">
        <button type="button" class="btn-text" id="edit-preferences">
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          Edit my priorities
        </button>
      </div>
    </div>

    ${raceSections}
  `;
}

// ============================================================
// BALLOT BAR
// ============================================================

export function renderBallotBar(): void {
  const el = document.getElementById('ballot-bar');
  if (!el) return;
  if (state.step !== 'results') { el.innerHTML = ''; return; }

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
        <div class="candidate-avatar">${esc(candidate.initials)}</div>
        <strong>${esc(candidate.name)}</strong>
        <span class="party-dot ${partyClass}"></span>
        <button type="button" class="ballot-summary-change" data-summary-jump="${esc(race.id)}">Change</button>
      </div>
    </div>`;
  }).join('');

  const decided = state.selectedCandidateCount;

  container.innerHTML = `<div class="ballot-summary-overlay" id="ballot-summary-overlay">
    <div class="ballot-summary" role="dialog" aria-label="My Ballot">
      <div class="ballot-summary-header">
        <h2>My Ballot</h2>
        <span class="ballot-summary-count">${decided}/${sortedRaces.length} decided</span>
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
