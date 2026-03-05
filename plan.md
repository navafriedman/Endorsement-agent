# Candidate Detail View — Implementation Plan

## Context

Today the ballot page shows candidate **cards** with a collapsible "More info" panel inline.
The goal is a full **candidate detail view** — a dedicated screen you navigate to when you
click into a candidate — similar to the reference (Roy Cooper on Chalkbeat/Vote.org).

The current app is a single-page vanilla TypeScript app with string-based rendering, an
observer-pattern state store, and event delegation. There is no router. All candidate data
lives in `data.ts` (positions, stances, endorsement IDs, endorsement quotes).

---

## Design Overview

The candidate view is a **full-page slide-in** (not a modal) that replaces the ballot list.
A "← Back to ballot" link returns the user to exactly where they were, scroll position preserved.

### Layout (top → bottom)

```
┌──────────────────────────────────────────────┐
│  ← Back to ballot                            │
├──────────────────────────────────────────────┤
│  [Avatar]   Race label · Party · Incumbent   │
│  Candidate Name                              │
│  ● 72% match                                 │
│                                              │
│  [Select this candidate]                     │
├──────────────────────────────────────────────┤
│  Where they stand                            │
│  ┌──────────────────────────────────────┐    │
│  │ 🏥 Healthcare               ✓ Match │    │
│  │ Expand Medicaid · Lower Rx costs     │    │
│  │ "Supports expanding Medicaid in..."  │    │
│  │ Source: Campaign website             │    │
│  └──────────────────────────────────────┘    │
│  ... (all issues, matched first)             │
├──────────────────────────────────────────────┤
│  Who's recommending [Name]                   │
│                                              │
│  "Strong advocacy support"  [N] Recommenders │
│  ● Issues ● Labor ● Party ● Community        │
│                                              │
│  ┌─ Quote card ────────────────────────┐     │
│  │ "Jasmine Crockett has been a..."    │     │
│  │       — NAACP                       │     │
│  └─────────────────────────────────────┘     │
│                                              │
│  All N endorsers (grid)                      │
│  [📚 Teachers Union] [⚖ AFL-CIO] ...        │
├──────────────────────────────────────────────┤
│  [Select this candidate]  (sticky on mobile) │
└──────────────────────────────────────────────┘
```

---

## Implementation Steps

### Step 1 — Data model additions (`types.ts`, `data.ts`)

Add optional fields to `Candidate` for richer detail:

```ts
// types.ts — extend Candidate
interface Candidate {
  // ... existing fields ...
  bio?: string;           // 1-2 sentence summary (from campaign site)
  photoUrl?: string;      // headshot (optional, fallback to initials)
  website?: string;       // campaign website URL
  socialLinks?: {         // social media
    twitter?: string;
    facebook?: string;
    instagram?: string;
  };
}
```

Populate `bio` for each candidate in `data.ts`. This is the single biggest content
improvement — the reference screenshot leads with a strong one-liner ("Roy Cooper is a
former Governor..."). Keep it factual, sourced from campaign sites.

`photoUrl` and `socialLinks` are optional — the view works without them (initials avatar,
no social section). This lets us ship without needing to source images.

### Step 2 — Routing via state (`state.ts`)

Add a lightweight "view" concept to AppState. No URL router needed yet —
just a state field that switches what `renderPage()` returns.

```ts
// New state fields
private _activeView: { type: 'ballot' } | { type: 'candidate'; raceId: string; candidateName: string } = { type: 'ballot' };
private _ballotScrollY = 0;  // preserve scroll position when navigating away

get activeView() { return this._activeView; }

openCandidate(raceId: string, candidateName: string): void {
  this._ballotScrollY = window.scrollY;
  this._activeView = { type: 'candidate', raceId, candidateName };
  this.notify();
}

backToBallot(): void {
  this._activeView = { type: 'ballot' };
  this.notify();
  // Restore scroll after render
  requestAnimationFrame(() => window.scrollTo(0, this._ballotScrollY));
}
```

Update `renderPage()` to branch:

```ts
export function renderPage(): string {
  if (state.activeView.type === 'candidate') {
    return renderCandidateView();
  }
  return renderBallotPage(); // existing code, extracted to a function
}
```

### Step 3 — URL hash support (progressive enhancement)

Push `#candidate/us_senate_tx/Jasmine-Crockett` on navigate, listen for `popstate`
to enable browser back button. This is a small addition but critical for UX:

```ts
// main.ts
window.addEventListener('popstate', () => {
  const hash = location.hash;
  if (hash.startsWith('#candidate/')) {
    const [, raceId, name] = hash.slice(1).split('/');
    state.openCandidate(raceId, decodeURIComponent(name));
  } else {
    state.backToBallot();
  }
});
```

### Step 4 — Candidate view renderer (`render.ts`)

New function `renderCandidateView()`. Sections:

#### 4a. Header + hero

```
← Back to ballot
[Race name] · [Party dot] [Party] · Incumbent
# Candidate Name
● 72% match
[Select this candidate]
```

- Back link uses `data-back-to-ballot` for event delegation
- Match badge reuses existing `renderMatchBadge()`
- Select button reuses existing select logic
- If `bio` exists, show it under the name as a quiet paragraph
- If `photoUrl` exists, show a real photo instead of initials circle

#### 4b. "Where they stand" — issue positions

Show ALL issues (not just matched ones), organized:

1. **Matched issues first** — with ✓ Match / ✗ Differs tag (reuse existing detail panel logic)
2. **Unrated issues second** — no match tag, neutral styling

Each issue row:
- Issue icon + label + match tag
- Stance pills (colored per issue, reuse `ISSUE_COLORS`)
- Position text (the narrative `position` field)
- Source citation

This is largely the existing `renderDetailPanel()` logic extracted and expanded to always
show all issues (no collapse/expand needed since this is a dedicated page).

#### 4c. "Who's recommending [Name]" — endorsements section

This is where we go beyond the current inline display. Modeled on the reference screenshot:

1. **Summary line** — "Strong advocacy support" + badge showing total recommender count
2. **Category legend** — colored dots for endorsement types (Issues, Labor, Party, Community)
   derived from `IdentityGroup.type`
3. **Featured quotes** — carousel/cards of endorsement quotes from `ENDORSEMENT_QUOTES`.
   Show matched-group quotes first (highlighted). Each quote card shows the quote text +
   org icon + org name.
4. **Full endorser grid** — 2-column grid of all endorsing organizations as chips
   (icon + name). Matched ones get a highlight border.

#### 4d. Connect section (if social links exist)

Simple row of social media icon links. Only render if `socialLinks` is populated.
Skip this section entirely if no links — don't show an empty section.

#### 4e. Sticky mobile CTA

On mobile, a fixed-bottom bar with "Select [Name]" button, so the user can act
without scrolling back up. Reuses the ballot-bar pattern already in the CSS.

### Step 5 — Entry points (click handlers in `main.ts`)

Three ways to open the candidate view:

1. **Candidate name** on the card — wrap in a clickable link with `data-open-candidate`
2. **"More info" button** — change from expanding inline detail to navigating to view
3. **New "View profile →" link** — explicit CTA on the card

Event handler:

```ts
const openCandidate = target.closest('[data-open-candidate]') as HTMLElement | null;
if (openCandidate) {
  const raceId = openCandidate.getAttribute('data-race')!;
  const name = openCandidate.getAttribute('data-candidate')!;
  state.openCandidate(raceId, name);
  return;
}

if (target.closest('[data-back-to-ballot]')) {
  state.backToBallot();
  return;
}
```

### Step 6 — Styling (`styles.css`)

New styles needed:

```
.candidate-view          — full-width container, max-width 720px (narrower than ballot)
.candidate-view-header   — back link + race context
.candidate-view-hero     — name, party, match, bio, photo
.candidate-view-section  — shared section wrapper (consistent spacing)
.candidate-view-issues   — issue list (mostly reuse .detail-issue-row styles)
.candidate-view-endorsements — endorsement section
.endorsement-quote-card  — styled quote cards (larger than inline blockquotes)
.endorser-grid           — 2-col grid of org chips
.candidate-view-cta      — sticky bottom CTA on mobile
```

Responsive considerations:
- **Desktop (>700px)**: 720px centered, two-column endorser grid, quotes side-by-side
- **Mobile (≤500px)**: Full-width, single-column endorsers, sticky bottom CTA,
  tighter section padding

### Step 7 — Update candidate card to link to view

Modify `renderCandidateCard()`:

- Make candidate name a clickable element: `data-open-candidate data-race="..." data-candidate="..."`
- Replace "More info" expand toggle with "View profile →" that navigates
- Keep the inline "Select" button on the card (quick action without navigating)
- Keep the match badge, key positions, and endorsement row on the card face

### Step 8 — Scroll-to-top on view open

When navigating to candidate view, scroll to top. When going back, restore saved scroll.
Already handled in Step 2's `openCandidate` / `backToBallot` methods.

---

## What stays the same

- **Card face** on the ballot page — avatar, match badge, name, party, key positions,
  endorsement row, select button. These remain compact summary cards.
- **Select button** — works identically from both card and detail view.
- **Scoring algorithm** — no changes to `computeRaceMatches()`.
- **Filter panels** — issues and groups panels stay on the ballot page.

## What gets removed

- **Inline detail panel** (`renderDetailPanel()` + expand/collapse toggle) — replaced by
  the full candidate view. This simplifies the card significantly and removes the
  "More info" / "Less info" toggle state complexity.

## Data we'd want to add per candidate

Priority order:

1. **`bio`** (required) — 1-2 sentences, factual. Biggest UX win.
2. **`photoUrl`** (nice-to-have) — real candidate photos make the page feel legitimate
3. **`website`** (nice-to-have) — link to campaign site for users who want to go deeper
4. **`socialLinks`** (low priority) — Twitter/X, Facebook, Instagram handles

---

## Sequencing

| Phase | Work | Effort |
|-------|------|--------|
| **1** | State routing + renderCandidateView skeleton + back navigation + hash support | Small |
| **2** | Issue positions section (extract from renderDetailPanel, show all issues) | Small — mostly reuse |
| **3** | Endorsements section (quotes, grid, category legend) | Medium |
| **4** | Card updates (name clickable, remove inline expand, add "View profile") | Small |
| **5** | Styling + responsive + sticky CTA | Medium |
| **6** | Data enrichment (bios, optional photos/links) | Content work |
| **7** | Polish — transitions, scroll behavior, keyboard nav (Escape to go back) | Small |

Phases 1-5 are the core build. Phase 6 is content. Phase 7 is polish.
Total: a focused day of work for phases 1-5, assuming no new data sourcing.
