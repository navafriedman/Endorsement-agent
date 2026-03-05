import type { StanceChoice, MatchScore, Candidate, Race } from './types';
import { RACES, IDENTITY_GROUPS, ISSUE_STANCES } from './data';

type Listener = () => void;

class AppState {
  private _issueStances = new Map<string, StanceChoice>();
  private _selectedGroups = new Set<string>();
  private _selectedCandidates = new Map<string, string>();
  private _expandedCards = new Set<string>();
  private _ballotOpen = false;
  private _filterOpen: 'issues' | 'groups' | null = null;
  private listeners: Listener[] = [];

  get issueStances(): ReadonlyMap<string, StanceChoice> { return this._issueStances; }
  get selectedGroups(): ReadonlySet<string> { return this._selectedGroups; }
  get selectedCandidates(): ReadonlyMap<string, string> { return this._selectedCandidates; }
  get ballotOpen(): boolean { return this._ballotOpen; }
  get filterOpen(): 'issues' | 'groups' | null { return this._filterOpen; }

  subscribe(listener: Listener): () => void {
    this.listeners.push(listener);
    return () => { this.listeners = this.listeners.filter(l => l !== listener); };
  }

  private notify(): void { this.listeners.forEach(l => l()); }

  setIssueStance(issueId: string, choice: StanceChoice): void {
    this._issueStances.set(issueId, choice);
    this.notify();
  }

  toggleGroup(id: string): void {
    if (this._selectedGroups.has(id)) {
      this._selectedGroups.delete(id);
    } else {
      this._selectedGroups.add(id);
    }
    this.notify();
  }

  selectCandidate(raceId: string, name: string): void {
    const current = this._selectedCandidates.get(raceId);
    if (current === name) {
      this._selectedCandidates.delete(raceId);
    } else {
      this._selectedCandidates.set(raceId, name);
    }
    this.notify();
  }

  toggleExpanded(key: string): void {
    if (this._expandedCards.has(key)) {
      this._expandedCards.delete(key);
    } else {
      this._expandedCards.add(key);
    }
    this.notify();
  }

  isExpanded(key: string): boolean { return this._expandedCards.has(key); }

  setBallotOpen(open: boolean): void {
    this._ballotOpen = open;
    this.notify();
  }

  setFilterOpen(which: 'issues' | 'groups' | null): void {
    this._filterOpen = this._filterOpen === which ? null : which;
    this.notify();
  }

  get selectedCandidateCount(): number { return this._selectedCandidates.size; }

  get ratedIssueCount(): number {
    let count = 0;
    for (const [, v] of this._issueStances) {
      if (v !== 'skip') count++;
    }
    return count;
  }

  get hasPreferences(): boolean {
    return this.ratedIssueCount > 0 || this._selectedGroups.size > 0;
  }

  clearIssues(): void {
    this._issueStances.clear();
    this.notify();
  }

  clearGroups(): void {
    this._selectedGroups.clear();
    this.notify();
  }

  // Compute match scores for all candidates in a race
  computeRaceMatches(race: Race): MatchScore[] {
    const scores = race.candidates.map(c => this.scoreCandidate(c, race));
    if (this.hasPreferences) {
      scores.sort((a, b) => b.score - a.score);
    }
    return scores;
  }

  private scoreCandidate(candidate: Candidate, race: Race): MatchScore {
    let issueMatches = 0;
    let issueTotal = 0;
    const matchedIssues: { issueId: string; stance: 'agree' | 'disagree' }[] = [];

    for (const [issueId, choice] of this._issueStances) {
      if (choice === 'skip') continue;
      const pos = candidate.issues[issueId];
      if (!pos) continue;

      issueTotal++;
      const alignment = this.getCandidateAlignment(candidate, issueId, choice);
      if (alignment === 'agree') {
        issueMatches++;
        matchedIssues.push({ issueId, stance: 'agree' });
      } else {
        matchedIssues.push({ issueId, stance: 'disagree' });
      }
    }

    let endorsementMatches = 0;
    const endorsementTotal = this._selectedGroups.size;
    const matchedEndorsements: string[] = [];

    for (const groupId of this._selectedGroups) {
      if (candidate.endorsements.includes(groupId)) {
        endorsementMatches++;
        matchedEndorsements.push(groupId);
      }
    }

    const hasIssues = issueTotal > 0;
    const hasEndorsements = endorsementTotal > 0;

    let score: number;
    if (hasIssues && hasEndorsements) {
      const issueScore = (issueMatches / issueTotal) * 100;
      const endorseScore = (endorsementMatches / endorsementTotal) * 100;
      score = issueScore * 0.6 + endorseScore * 0.4;
    } else if (hasIssues) {
      score = (issueMatches / issueTotal) * 100;
    } else if (hasEndorsements) {
      score = (endorsementMatches / endorsementTotal) * 100;
    } else {
      score = -1; // No preferences set
    }

    return {
      candidate,
      race,
      score: score >= 0 ? Math.round(score) : -1,
      issueMatches,
      issueTotal,
      endorsementMatches,
      endorsementTotal,
      matchedIssues,
      matchedEndorsements,
    };
  }

  private getCandidateAlignment(candidate: Candidate, issueId: string, userChoice: StanceChoice): 'agree' | 'disagree' {
    if (userChoice === 'skip') return 'disagree';

    const pos = candidate.issues[issueId];
    if (!pos) return 'disagree';

    const stanceText = pos.stances.join(' ').toLowerCase();
    const posText = pos.position.toLowerCase();
    const combined = stanceText + ' ' + posText;

    const progressiveSignals = [
      'expand', 'increase', 'fund', 'support', 'pathway', 'reform',
      'protect', 'access', 'affordable', 'pro-choice', 'background check',
      'equality', 'anti-discrimination', 'clean energy', 'medicaid',
      'public school', 'minimum wage', 'diversion', 'bail reform',
      're-entry', 'mental health', 'tenant', 'renter', 'community',
      'early voting', 'auto registration', 'multilingual',
    ];

    const conservativeSignals = [
      'cut', 'reduce', 'oppose', 'strict', 'enforcement', 'restrict',
      'second amendment', '2a supporter', 'constitutional carry',
      'school choice', 'parental rights', 'voter id', 'criminalize',
      'anti-immigration', 'fund law enforcement', 'fund police',
      'opposes bail', 'opposes gun', 'library restrictions',
      'fiscal responsibility', 'no tax',
    ];

    let progScore = 0;
    let consScore = 0;

    for (const signal of progressiveSignals) {
      if (combined.includes(signal)) progScore++;
    }
    for (const signal of conservativeSignals) {
      if (combined.includes(signal)) consScore++;
    }

    const candidateLean = progScore > consScore ? 'progressive' : 'conservative';

    if (userChoice === 'agree') {
      return candidateLean === 'progressive' ? 'agree' : 'disagree';
    } else {
      return candidateLean === 'conservative' ? 'agree' : 'disagree';
    }
  }
}

export const state = new AppState();
