export interface Issue {
  id: string;
  label: string;
  icon: string;
}

export interface IdentityGroup {
  id: string;
  label: string;
  icon: string;
  type: string;
}

export type SourceType = 'candidate_website' | 'legislative_record' | 'public_statements' | 'news_coverage';

export interface IssuePosition {
  position: string;
  source: string;
  sourceType: SourceType;
  sourceUrl?: string;
  directQuote?: string;
  stances: string[];
}

export interface Candidate {
  name: string;
  party: 'Democratic' | 'Republican';
  incumbent: boolean;
  initials: string;
  bio?: string;
  photoUrl?: string;
  website?: string;
  issues: Record<string, IssuePosition>;
  endorsements: string[];
}

export interface Race {
  id: string;
  name: string;
  position: string;
  type: 'federal' | 'state' | 'local';
  candidates: Candidate[];
}

export type StanceChoice = 'agree' | 'disagree' | 'skip';

export interface UserStance {
  issueId: string;
  choice: StanceChoice;
}

export interface MatchScore {
  candidate: Candidate;
  race: Race;
  score: number;       // 0-100
  issueMatches: number;
  issueTotal: number;
  endorsementMatches: number;
  endorsementTotal: number;
  matchedIssues: { issueId: string; stance: 'agree' | 'disagree' }[];
  matchedEndorsements: string[];
}
