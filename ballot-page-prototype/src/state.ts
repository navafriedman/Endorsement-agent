type Listener = () => void;

export type AlignmentRating = 'agree' | 'disagree' | null;

class AppState {
  private _selectedIssues = new Set<string>(['immigration', 'education', 'healthcare']);
  private _selectedIdentities = new Set<string>();
  private _openDropdown: 'issues' | 'identity' | null = null;
  private _expandedRows = new Set<string>(); // "candidateName:issueId"
  private _alignments = new Map<string, AlignmentRating>(); // "candidateName:issueId" -> rating
  private listeners: Listener[] = [];

  get selectedIssues(): ReadonlySet<string> { return this._selectedIssues; }
  get selectedIdentities(): ReadonlySet<string> { return this._selectedIdentities; }
  get openDropdown(): string | null { return this._openDropdown; }

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
    if (this._selectedIssues.has(id)) {
      this._selectedIssues.delete(id);
    } else {
      this._selectedIssues.add(id);
    }
    this.notify();
  }

  toggleIdentity(id: string): void {
    if (this._selectedIdentities.has(id)) {
      this._selectedIdentities.delete(id);
    } else {
      this._selectedIdentities.add(id);
    }
    this.notify();
  }

  setDropdown(which: 'issues' | 'identity' | null): void {
    this._openDropdown = which;
    this.notify();
  }

  toggleDropdown(which: 'issues' | 'identity'): void {
    this._openDropdown = this._openDropdown === which ? null : which;
    this.notify();
  }

  clearAll(): void {
    this._selectedIssues.clear();
    this._selectedIdentities.clear();
    this._alignments.clear();
    this._expandedRows.clear();
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
      this._alignments.set(key, rating);
    }
    this.notify();
  }

}

export const state = new AppState();
