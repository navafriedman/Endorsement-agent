import type { ViewMode } from './types';

type Listener = () => void;

class AppState {
  private _selectedIssues = new Set<string>();
  private _selectedIdentities = new Set<string>();
  private _currentView: ViewMode = 'races';
  private listeners: Listener[] = [];

  get selectedIssues(): ReadonlySet<string> { return this._selectedIssues; }
  get selectedIdentities(): ReadonlySet<string> { return this._selectedIdentities; }
  get currentView(): ViewMode { return this._currentView; }

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

  setView(view: ViewMode): void {
    this._currentView = view;
    this.notify();
  }

  clearAll(): void {
    this._selectedIssues.clear();
    this._selectedIdentities.clear();
    this.notify();
  }

  hasFilters(): boolean {
    return this._selectedIssues.size > 0 || this._selectedIdentities.size > 0;
  }
}

export const state = new AppState();
