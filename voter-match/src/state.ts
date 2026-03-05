import type { StanceChoice, MatchScore, Candidate, Race } from './types';
import { RACES, IDENTITY_GROUPS, ISSUE_STANCES } from './data';

type Listener = () => void;

export type Step = 'issues' | 'groups' | 'results';

class AppState {
  private _step: Step = 'issues';
  private _issueStances = new Map<string, StanceChoice>();
  private _selectedGroups = new Set<string>();
  private _selectedCandidates = new Map<string, string>(); // raceId -> candidateName
  private _expandedCards = new Set<string>();
  private _ballotOpen = false;
  private listeners: Listener[] = [];

  get step(): Step { return this._step; }
  get issueStances(): ReadonlyMap<string, StanceChoice> { return this._issueStances; }
  get selectedGroups(): ReadonlySet<string> { return this._selectedGroups; }
  get selectedCandidates(): ReadonlyMap<string, string> { return this._selectedCandidates; }
  get ballotOpen(): boolean { return this._ballotOpen; }

  subscribe(listener: Listener): () => void {
    this.listeners.push(listener);
    return () => { this.listeners = this.listeners.filter(l => l !== listener); };
  }

  private notify(): void { this.listeners.forEach(l => l()); }

  setStep(step: Step): void {
    this._step = step;
    this.notify();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

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

  get selectedCandidateCount(): number { return this._selectedCandidates.size; }

  get ratedIssueCount(): number {
    let count = 0;
    for (const [, v] of this._issueStances) {
      if (v !== 'skip') count++;
    }
    return count;
  }

  // Compute match scores for all candidates
  computeMatches(): Map<string, MatchScore[]> {
    const result = new Map<string, MatchScore[]>();

    for (const race of RACES) {
      const scores: MatchScore[] = race.candidates.map(c =>
        this.scoreCandidate(c, race)
      );
      scores.sort((a, b) => b.score - a.score);
      result.set(race.id, scores);
    }

    return result;
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

    // Weighted score: 60% issues, 40% endorsements
    const issueScore = issueTotal > 0 ? (issueMatches / issueTotal) * 100 : 50;
    const endorseScore = endorsementTotal > 0 ? (endorsementMatches / endorsementTotal) * 100 : 50;

    const hasIssues = issueTotal > 0;
    const hasEndorsements = endorsementTotal > 0;

    let score: number;
    if (hasIssues && hasEndorsements) {
      score = issueScore * 0.6 + endorseScore * 0.4;
    } else if (hasIssues) {
      score = issueScore;
    } else if (hasEndorsements) {
      score = endorseScore;
    } else {
      score = 50;
    }

    return {
      candidate,
      race,
      score: Math.round(score),
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

    const stances = ISSUE_STANCES[issueId];
    if (!stances) return 'disagree';

    // Determine if candidate aligns progressive or conservative
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

    // User chose 'agree' on the progressive statement (choice A) or 'disagree' (choice B = conservative)
    if (userChoice === 'agree') {
      // User is progressive on this issue
      return candidateLean === 'progressive' ? 'agree' : 'disagree';
    } else {
      // User is conservative on this issue
      return candidateLean === 'conservative' ? 'agree' : 'disagree';
    }
  }
}

export const state = new AppState();
