type Listener = () => void;

export type AlignmentRating = 'agree' | 'disagree' | null;

class AppState {
  private _selectedIssues = new Set<string>(['immigration', 'education', 'healthcare']);
  private _selectedIdentities = new Set<string>();
  private _openDropdown: 'filters' | null = null;
  private _expandedRows = new Set<string>();
  private _alignments = new Map<string, AlignmentRating>();
  private _usingDefaultIssues = true;
  private _donationDismissed = false;
  private _engagementCount = 0;
  private _selectedCandidates = new Map<string, string>(); // raceId -> candidateName
  private _ballotSummaryOpen = false;
  private listeners: Listener[] = [];

  get selectedIssues(): ReadonlySet<string> { return this._selectedIssues; }
  get selectedIdentities(): ReadonlySet<string> { return this._selectedIdentities; }
  get openDropdown(): string | null { return this._openDropdown; }
  get usingDefaultIssues(): boolean { return this._usingDefaultIssues; }
  get donationDismissed(): boolean { return this._donationDismissed; }
  get engagementCount(): number { return this._engagementCount; }
  get ballotSummaryOpen(): boolean { return this._ballotSummaryOpen; }

  recordEngagement(): void {
    this._engagementCount++;
  }

  dismissDonation(): void {
    this._donationDismissed = true;
    this.notify();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify(): void {
    this.listeners.forEach(l => l());
  }

  toggleIssue(id: string): void {
    this._usingDefaultIssues = false;
    this._engagementCount++;
    if (this._selectedIssues.has(id)) {
      this._selectedIssues.delete(id);
    } else {
      this._selectedIssues.add(id);
    }
    this.notify();
  }

  toggleIdentity(id: string): void {
    this._engagementCount++;
    if (this._selectedIdentities.has(id)) {
      this._selectedIdentities.delete(id);
    } else {
      this._selectedIdentities.add(id);
    }
    this.notify();
  }

  setDropdown(which: 'filters' | null): void {
    this._openDropdown = which;
    this.notify();
  }

  toggleDropdown(which: 'filters'): void {
    this._openDropdown = this._openDropdown === which ? null : which;
    this.notify();
  }

  clearAll(): void {
    this._selectedIssues.clear();
    this._selectedIdentities.clear();
    this._alignments.clear();
    this._expandedRows.clear();
    this._usingDefaultIssues = false;
    this.notify();
  }

  hasFilters(): boolean {
    return this._selectedIssues.size > 0 || this._selectedIdentities.size > 0;
  }

  // Row expansion
  isExpanded(key: string): boolean {
    return this._expandedRows.has(key);
  }

  toggleExpanded(key: string): void {
    if (this._expandedRows.has(key)) {
      this._expandedRows.delete(key);
    } else {
      this._expandedRows.add(key);
    }
    this.notify();
  }

  // Candidate selection per race
  getSelectedCandidate(raceId: string): string | null {
    return this._selectedCandidates.get(raceId) ?? null;
  }

  selectCandidate(raceId: string, candidateName: string): void {
    const current = this._selectedCandidates.get(raceId);
    if (current === candidateName) {
      this._selectedCandidates.delete(raceId);
    } else {
      this._selectedCandidates.set(raceId, candidateName);
    }
    this._engagementCount++;
    this.notify();
  }

  get selectedCandidateCount(): number {
    return this._selectedCandidates.size;
  }

  get selectedCandidates(): ReadonlyMap<string, string> {
    return this._selectedCandidates;
  }

  setBallotSummaryOpen(open: boolean): void {
    this._ballotSummaryOpen = open;
    this.notify();
  }

  // Alignments
  getAlignment(key: string): AlignmentRating {
    return this._alignments.get(key) ?? null;
  }

  setAlignment(key: string, rating: AlignmentRating): void {
    if (rating === null) {
      this._alignments.delete(key);
    } else {
      this._alignments.set(key, rating);
    }
    this.notify();
  }

  toggleAlignment(key: string, rating: 'agree' | 'disagree'): void {
    const current = this._alignments.get(key);
    if (current === rating) {
      this._alignments.delete(key);
    } else {
      if (!current) this._engagementCount++;
      this._alignments.set(key, rating);
    }
    this.notify();
  }

}

export const state = new AppState();
