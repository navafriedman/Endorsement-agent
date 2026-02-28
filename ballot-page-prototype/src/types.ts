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

export interface IssuePosition {
  position: string;
  source: string;
  stances: string[];
}

export interface Candidate {
  name: string;
  party: 'Democratic' | 'Republican';
  incumbent: boolean;
  initials: string;
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
