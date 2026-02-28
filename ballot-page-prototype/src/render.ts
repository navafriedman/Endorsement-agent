import type { Candidate, Race } from './types';
import { ISSUES, IDENTITY_GROUPS, RACES } from './data';
import { state } from './state';

// ============================================================
// HELPERS
// ============================================================

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function calculateMatch(candidate: Candidate): number {
  let total = 0;
  let matched = 0;

  for (const issueId of state.selectedIssues) {
    total++;
    if (candidate.issues[issueId]) matched++;
  }

  for (const groupId of state.selectedIdentities) {
    total++;
    if (candidate.endorsements.includes(groupId)) matched++;
  }

  return total === 0 ? 0 : Math.round((matched / total) * 100);
}

function countCandidatesWithIssue(issueId: string): number {
  let count = 0;
  RACES.forEach(r => r.candidates.forEach(c => {
    if (c.issues[issueId]) count++;
  }));
  return count;
}

function countEndorsements(groupId: string): number {
  let count = 0;
  RACES.forEach(r => r.candidates.forEach(c => {
    if (c.endorsements.includes(groupId)) count++;
  }));
  return count;
}

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
        <h1>What's on Your Ballot</h1>
        <div class="hero-subtitle">Fort Worth, TX — Tarrant County</div>
        <div class="election-badge">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="4" width="18" height="18" rx="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          Texas Primary — March 3, 2026
        </div>
      </div>
    </section>

    <main class="container">
      <div class="view-toggle" id="view-toggle"></div>

      <div id="issue-picker" class="picker">
        <div class="picker-title">What issues matter to you?</div>
        <div class="picker-desc">Select issues to see where every candidate stands.</div>
        <div class="pill-grid" id="issue-pills"></div>
      </div>

      <div id="identity-picker" class="picker">
        <div class="picker-title">Which voices do you trust?</div>
        <div class="picker-desc">Select organizations to see who they endorse.</div>
        <div class="pill-grid" id="identity-pills"></div>
      </div>

      <div id="filters-bar"></div>

      <div class="view-panel active" id="panel-races"></div>
      <div class="view-panel" id="panel-issues"></div>
      <div class="view-panel" id="panel-identity"></div>
    </main>

    <footer class="footer">
      <div class="container">
        Nonpartisan. Private. No account needed. — <a href="#">change.vote</a><br>
        Sources linked per candidate. Endorsement data from public records.
      </div>
    </footer>
  `;
}

// ============================================================
// VIEW TOGGLE
// ============================================================

export function renderViewToggle(): void {
  const el = document.getElementById('view-toggle')!;
  const views = [
    { id: 'races', label: 'By Race' },
    { id: 'issues', label: 'Issues First' },
    { id: 'identity', label: 'Who I Trust' },
  ] as const;

  el.innerHTML = views.map(v =>
    `<button class="view-toggle-btn ${state.currentView === v.id ? 'active' : ''}"
            data-view="${v.id}">${v.label}</button>`
  ).join('');
}

// ============================================================
// PILLS
// ============================================================

export function renderIssuePills(): void {
  const el = document.getElementById('issue-pills')!;
  el.innerHTML = ISSUES.map(issue => {
    const count = countCandidatesWithIssue(issue.id);
    const selected = state.selectedIssues.has(issue.id);
    return `<button class="pill ${selected ? 'selected' : ''}" data-issue="${issue.id}">
      <span class="pill-icon">${issue.icon}</span>
      ${escapeHtml(issue.label)}
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
      ${escapeHtml(group.label)}
      <span class="pill-count">${count}</span>
    </button>`;
  }).join('');
}

// ============================================================
// FILTERS BAR
// ============================================================

export function renderFiltersBar(): void {
  const el = document.getElementById('filters-bar')!;

  if (!state.hasFilters()) {
    el.innerHTML = '';
    return;
  }

  let tags = '';
  for (const id of state.selectedIssues) {
    const issue = ISSUES.find(i => i.id === id)!;
    tags += `<span class="filter-tag issue">${issue.icon} ${escapeHtml(issue.label)}</span>`;
  }
  for (const id of state.selectedIdentities) {
    const group = IDENTITY_GROUPS.find(g => g.id === id)!;
    tags += `<span class="filter-tag identity">${group.icon} ${escapeHtml(group.label)}</span>`;
  }

  el.innerHTML = `
    <div class="filters-bar">
      <div class="filters-bar-tags">${tags}</div>
      <button class="clear-btn" id="clear-all">Clear all</button>
    </div>
  `;
}

// ============================================================
// VIEW: BY RACE
// ============================================================

function renderCandidateCol(c: Candidate): string {
  const matchScore = calculateMatch(c);
  const hasFilters = state.hasFilters();
  const selectedIssueIds = [...state.selectedIssues];
  const hasSelectedIssues = selectedIssueIds.length > 0;

  // Positions section
  let positionsHtml = '';
  if (hasSelectedIssues) {
    const items = selectedIssueIds.map(issueId => {
      const issue = ISSUES.find(i => i.id === issueId)!;
      const pos = c.issues[issueId];
      return `<div class="position-item">
        <div class="position-label">${escapeHtml(issue.label)}</div>
        ${pos
          ? `<div class="position-text">${escapeHtml(pos.position)}</div>
             <div class="position-source">Source: ${escapeHtml(pos.source)}</div>`
          : `<div class="position-none">No public position found</div>`
        }
      </div>`;
    }).join('');
    positionsHtml = `<div class="positions-list">${items}</div>`;
  }

  // Endorsements section
  let endorsementsHtml = '';
  if (c.endorsements.length > 0) {
    const chips = c.endorsements.map(eid => {
      const group = IDENTITY_GROUPS.find(g => g.id === eid);
      if (!group) return '';
      const highlighted = state.selectedIdentities.has(eid);
      return `<span class="endorsement-chip ${highlighted ? 'highlighted' : ''}">
        ${group.icon} ${escapeHtml(group.label)}
      </span>`;
    }).join('');
    endorsementsHtml = `
      <div class="endorsements">
        <div class="endorsements-label">Endorsed by</div>
        <div class="endorsement-chips">${chips}</div>
      </div>`;
  }

  // Match bar
  let matchHtml = '';
  if (hasFilters) {
    const level = matchScore >= 60 ? 'high' : matchScore >= 30 ? 'medium' : 'low';
    matchHtml = `
      <div class="match-section">
        <div class="match-label">
          <span>Alignment</span>
          <span>${matchScore}%</span>
        </div>
        <div class="match-bar">
          <div class="match-fill ${level}" style="width: ${matchScore}%"></div>
        </div>
      </div>`;
  }

  return `<div class="candidate-col">
    <div class="candidate-header">
      <div class="candidate-avatar">${escapeHtml(c.initials)}</div>
      <div>
        <div class="candidate-name">${escapeHtml(c.name)}</div>
        <div class="candidate-meta">
          ${escapeHtml(c.party)}
          ${c.incumbent ? '<span class="incumbent-tag">Incumbent</span>' : ''}
        </div>
      </div>
    </div>
    ${positionsHtml}
    ${endorsementsHtml}
    ${matchHtml}
  </div>`;
}

export function renderRacesView(): void {
  const el = document.getElementById('panel-races')!;

  let hint = '';
  if (!state.hasFilters()) {
    hint = `<div class="race-hint">
      Select issues or groups above to compare candidates on what matters to you
    </div>`;
  }

  el.innerHTML = hint + RACES.map(race => {
    if (race.candidates.length === 0) {
      return `<div class="race-card fade-in">
        <div class="race-header">
          <span class="race-name">${escapeHtml(race.name)}</span>
          <span class="race-badge ${race.type}">${race.type}</span>
        </div>
        <div style="padding:24px;text-align:center;color:var(--text-muted);font-size:14px;">
          No candidates filed yet
        </div>
      </div>`;
    }

    return `<div class="race-card fade-in">
      <div class="race-header">
        <span class="race-name">${escapeHtml(race.name)}</span>
        <span class="race-badge ${race.type}">${race.type}</span>
      </div>
      <div class="candidates-grid">
        ${race.candidates.map(c => renderCandidateCol(c)).join('')}
      </div>
    </div>`;
  }).join('');
}

// ============================================================
// VIEW: ISSUES FIRST
// ============================================================

export function renderIssuesView(): void {
  const el = document.getElementById('panel-issues')!;

  if (state.selectedIssues.size === 0) {
    el.innerHTML = `
      <div class="hint">
        <div class="hint-icon">☝</div>
        <h3>Select issues above</h3>
        <p>Pick the topics that matter to you and we'll compare candidates across every race.</p>
      </div>`;
    return;
  }

  let html = '';
  for (const issueId of state.selectedIssues) {
    const issue = ISSUES.find(i => i.id === issueId)!;

    html += `<div class="issue-group fade-in">
      <div class="issue-group-header">
        <div class="issue-group-icon">${issue.icon}</div>
        <div>
          <div class="issue-group-title">${escapeHtml(issue.label)}</div>
          <div class="issue-group-subtitle">Where candidates stand across your races</div>
        </div>
      </div>`;

    for (const race of RACES) {
      if (race.candidates.length === 0) continue;

      html += `<div class="issue-race">
        <div class="issue-race-label">${escapeHtml(race.name)}</div>
        <div class="issue-candidates">
          ${race.candidates.map(c => {
            const pos = c.issues[issueId];
            const matchedEndorsements = [...state.selectedIdentities]
              .filter(gid => c.endorsements.includes(gid));

            return `<div class="issue-cell">
              <div class="issue-cell-name">
                ${escapeHtml(c.name)}
                ${c.incumbent ? '<span class="incumbent-tag">Incumbent</span>' : ''}
              </div>
              <div class="issue-cell-party">${escapeHtml(c.party)}</div>
              ${pos
                ? `<div class="issue-cell-position">
                    ${escapeHtml(pos.position)}
                    <span class="source">Source: ${escapeHtml(pos.source)}</span>
                  </div>`
                : '<div class="issue-cell-none">No public position found</div>'
              }
              ${matchedEndorsements.length > 0
                ? `<div style="margin-top:8px;">
                    <div class="endorsement-chips">
                      ${matchedEndorsements.map(gid => {
                        const g = IDENTITY_GROUPS.find(x => x.id === gid)!;
                        return `<span class="endorsement-chip highlighted">${g.icon} ${escapeHtml(g.label)}</span>`;
                      }).join('')}
                    </div>
                  </div>`
                : ''
              }
            </div>`;
          }).join('')}
        </div>
      </div>`;
    }

    html += '</div>';
  }

  el.innerHTML = html;
}

// ============================================================
// VIEW: WHO I TRUST (Identity-First)
// ============================================================

export function renderIdentityView(): void {
  const el = document.getElementById('panel-identity')!;

  if (state.selectedIdentities.size === 0) {
    el.innerHTML = `
      <div class="hint">
        <div class="hint-icon">🤝</div>
        <h3>Select groups above</h3>
        <p>Pick the organizations you trust and we'll show who they endorse.</p>
      </div>`;
    return;
  }

  let html = '';
  for (const groupId of state.selectedIdentities) {
    const group = IDENTITY_GROUPS.find(g => g.id === groupId)!;

    const endorsedRaces: { race: Race; endorsed: Candidate[] }[] = [];
    for (const race of RACES) {
      const endorsed = race.candidates.filter(c => c.endorsements.includes(groupId));
      if (endorsed.length > 0) {
        endorsedRaces.push({ race, endorsed });
      }
    }

    html += `<div class="issue-group fade-in">
      <div class="issue-group-header">
        <div class="issue-group-icon identity-group-icon">${group.icon}</div>
        <div>
          <div class="issue-group-title">${escapeHtml(group.label)}</div>
          <div class="issue-group-subtitle">${escapeHtml(group.type)} — ${
            endorsedRaces.length === 0
              ? 'No endorsements in your races'
              : `Endorsements in ${endorsedRaces.length} race${endorsedRaces.length > 1 ? 's' : ''}`
          }</div>
        </div>
      </div>`;

    if (endorsedRaces.length === 0) {
      html += `<div class="issue-race">
        <div style="padding:20px;text-align:center;color:var(--text-muted);font-size:14px;">
          No endorsements found for your local races.
        </div>
      </div>`;
    }

    for (const { race, endorsed } of endorsedRaces) {
      html += `<div class="issue-race">
        <div class="issue-race-label">${escapeHtml(race.name)}</div>
        <div class="issue-candidates">
          ${endorsed.map(c => {
            const snippets = [...state.selectedIssues].map(iid => {
              const issue = ISSUES.find(i => i.id === iid)!;
              const pos = c.issues[iid];
              if (!pos) return '';
              return `<div class="issue-snippet">
                <strong>${escapeHtml(issue.label)}:</strong> ${escapeHtml(pos.position)}
              </div>`;
            }).join('');

            return `<div class="issue-cell">
              <div class="issue-cell-name">
                ${escapeHtml(c.name)}
                ${c.incumbent ? '<span class="incumbent-tag">Incumbent</span>' : ''}
              </div>
              <div class="issue-cell-party">${escapeHtml(c.party)}</div>
              <div class="endorsed-badge">✓ Endorsed by ${escapeHtml(group.label)}</div>
              ${snippets}
            </div>`;
          }).join('')}
        </div>
      </div>`;
    }

    html += '</div>';
  }

  el.innerHTML = html;
}

// ============================================================
// PANELS — show/hide based on current view
// ============================================================

export function updatePanels(): void {
  const panels = ['races', 'issues', 'identity'] as const;
  panels.forEach(id => {
    const panel = document.getElementById(`panel-${id}`)!;
    panel.classList.toggle('active', state.currentView === id);
  });
}
