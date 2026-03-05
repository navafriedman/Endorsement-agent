# Candidate Detail View — Implementation Plan

## Context

Today the ballot page shows candidate **cards** with a collapsible "More info" panel inline.
The goal is a full **candidate detail view** — a dedicated screen you navigate to when you
click into a candidate.

**Core problem to solve:** User feedback says the current version feels like "just a lot of
text." The candidate view must be scannable (find what you care about in seconds) and
trustworthy (every claim clearly sourced without cluttering the UI).

The current app is a single-page vanilla TypeScript app with string-based rendering, an
observer-pattern state store, and event delegation. There is no router. All candidate data
lives in `data.ts` (positions, stances, endorsement IDs, endorsement quotes).

---

## Design Principles (from research)

These four principles — grounded in NNGroup eye-tracking research, Center for Civic Design
guidelines, and BallotReady/Ballotpedia patterns — drive every design decision below.

### 1. Front-load the verdict, then support it (Inverted Pyramid)
Every section leads with the conclusion. Users scanning 5 candidates don't want to read
paragraphs to find the stance. NNGroup confirms users decide within seconds whether content
matches their purpose.

### 2. One concept = one visual chunk (Cognitive Load Theory)
Each issue position or endorsement category lives in its own visually bounded card. Working
memory holds ~4 items (Cowan's refinement of Miller's Law). Cards create explicit spatial
groupings the brain retains.

### 3. Make verification available but not mandatory (Progressive Disclosure)
Sources should be one interaction away (hover or tap), never zero (clutters the page) or
two-plus (erodes trust). Most voters scan; only 2-3 issues get a deep read. Show the
minimum upfront, reveal depth on demand.

### 4. Visual consistency is itself a trust signal
Consistent card sizes, heading treatments, and icon usage signal editorial rigor.
Inconsistency — even in spacing — signals sloppiness, which NNGroup's trust research
identifies as a credibility killer.

---

## Design Overview

The candidate view is a **full-page slide-in** (not a modal) that replaces the ballot list.
A "← Back to ballot" link returns the user to exactly where they were, scroll position preserved.

### Layout (top → bottom)

```
┌──────────────────────────────────────────────────┐
│  ← Back to ballot                                │
├──────────────────────────────────────────────────┤
│  SUMMARY BOX (scannable in <5 seconds)           │
│  ┌──────────────────────────────────────────┐    │
│  │  [Avatar]  Jasmine Crockett              │    │
│  │  ● Democrat · U.S. Senate                │    │
│  │  ● 72% match                             │    │
│  │                                          │    │
│  │  Key positions:                          │    │
│  │  [🏥 Expand Medicaid] [📚 School funding]│    │
│  │  [⚖ End cash bail]                       │    │
│  │                                          │    │
│  │  6 endorsements · 10 issue positions     │    │
│  │                                          │    │
│  │  [Select this candidate]                 │    │
│  └──────────────────────────────────────────┘    │
├──────────────────────────────────────────────────┤
│  SECTION NAV (sticky on scroll)                  │
│  [Positions (10)] [Endorsements (6)] [Bio]       │
├──────────────────────────────────────────────────┤
│  Where they stand                                │
│  ┌──────────────────────────────────────────┐    │
│  │ 🏥 Healthcare                  ✓ Match   │    │
│  │ Expand Medicaid · Lower Rx costs         │    │
│  │                                          │    │
│  │ ▸ Full position + source       [📋 src]  │    │
│  └──────────────────────────────────────────┘    │
│  (each issue = one card, collapsed by default)   │
├──────────────────────────────────────────────────┤
│  Who's recommending Crockett                     │
│  ┌──────────────────────────────────────────┐    │
│  │  Labor (3)                               │    │
│  │  [📚 Teachers Union] [⚖ AFL-CIO]        │    │
│  │  [🩺 Nurses Union]                       │    │
│  ├──────────────────────────────────────────┤    │
│  │  Civil Rights (2)                        │    │
│  │  [✊ NAACP] [🗳 LWV]                     │    │
│  ├──────────────────────────────────────────┤    │
│  │  Women (1)                               │    │
│  │  [☆ EMILY's List]                        │    │
│  └──────────────────────────────────────────┘    │
│                                                  │
│  ┌─ Quote card ────────────────────────────┐     │
│  │ "Jasmine Crockett has been a tireless   │     │
│  │  advocate for civil rights..."          │     │
│  │           — ✊ NAACP                     │     │
│  └─────────────────────────────────────────┘     │
├──────────────────────────────────────────────────┤
│  [Select this candidate]  (sticky on mobile)     │
└──────────────────────────────────────────────────┘
```

---

## Key Scannability Patterns Applied

### Pattern A: Summary Box at top
A visually distinct box at the top distills the 3-4 most important facts. The user gets
the gist in under 5 seconds — party, match score, top stance pills, endorsement count —
before deciding whether to scroll deeper. Each pill links (via anchor) to the full position
below.

### Pattern B: Layer-cake headings with section nav
Bold, descriptive section headings create horizontal "stripes" — NNGroup calls this the
most effective scanning pattern. A **sticky section nav** (horizontal tab bar on mobile,
sidebar on desktop) shows section names + counts: `Positions (10) | Endorsements (6) | Bio`.
Users scanning the left edge can jump directly to "Endorsements" without processing
anything about voting record.

### Pattern C: One-issue-per-card with progressive disclosure
Each issue position is its own card showing:
- **Collapsed (default):** Icon + issue name + stance pills + match tag (✓/✗)
- **Expanded (tap to reveal):** Full position narrative + source citation + "In their words" quote

This lets users see 8-10 issues on one screen without scrolling, and only expand the ones
they care about. The collapsed state is the "verdict"; the expanded state is the evidence.

### Pattern D: Endorsement clustering by category
Instead of a flat list of endorsers, group them: "Labor (3)", "Civil Rights (2)",
"Environmental (1)". Pre-categorized clusters exploit the brain's preference for
pre-organized information. The category headers themselves become scannable — a user who
cares about environmental groups finds that cluster in <2 seconds.

### Pattern E: Visual stance indicators
Small consistent markers next to each issue — green ✓ for match, red ✗ for differs,
neutral dash for unrated — exploit pre-attentive processing. Users scan 10 positions in
seconds via color+shape before reading any text. Always paired with text for accessibility.

---

## Key Trust Patterns Applied

### Pattern F: Source provenance chips
Below each expanded position, a compact pill shows the source type with an icon:
`[🌐 Candidate Website]`, `[📋 Legislative Record]`, `[📰 News Coverage]`.

This is the BallotReady model: immediately communicates *what kind* of source backs a claim
without consuming layout space. Color-code subtly: blue for first-party (candidate's own
words), gray for third-party. The chip is a link to the original source.

Define 5 source types:
- `Candidate Website` — candidate's own platform page
- `Legislative Record` — voting record, bill sponsorship
- `Public Statements` — speeches, interviews, debates
- `News Coverage` — third-party reporting
- `Endorser Statement` — the endorsing org's announcement

### Pattern G: "In their own words" expandable quotes
For each issue position, an optional expandable section shows the candidate's verbatim
statement in a visually distinct blockquote. Nothing builds trust like showing the
candidate's actual words. If no direct quote exists, honestly say:
"No direct statement found. Position inferred from [source]."

### Pattern H: Methodology footer
A persistent "How we research candidates" link accessible from every candidate view.
Content: what sources are used, how missing information is handled, editorial standards
(verbatim when possible, no editorializing), nonpartisan commitment. Written once, linked
everywhere. Surface it contextually on first view as a dismissible banner:
"Every position listed here is sourced. [Learn how we research →]"

---

## Implementation Steps

### Step 1 — Data model additions (`types.ts`, `data.ts`)

Extend `Candidate` for richer detail and source tracking:

```ts
// types.ts
interface Candidate {
  // ... existing fields ...
  bio?: string;           // 1-2 sentence factual summary
  photoUrl?: string;      // headshot (optional, fallback to initials)
  website?: string;       // campaign website URL
}

// Extend IssuePosition for source provenance
interface IssuePosition {
  position: string;
  source: string;
  sourceType: 'candidate_website' | 'legislative_record' | 'public_statements' | 'news_coverage';
  sourceUrl?: string;     // direct link to source
  directQuote?: string;   // verbatim candidate statement for "In their words"
  stances: string[];
}
```

Populate `bio` for each candidate. Add `sourceType` to every existing `IssuePosition`.
Add `directQuote` where available (not required — the UI handles missing quotes gracefully).

### Step 2 — Routing via state (`state.ts`)

Add a lightweight "view" concept to AppState:

```ts
private _activeView: { type: 'ballot' } | { type: 'candidate'; raceId: string; candidateName: string } = { type: 'ballot' };
private _ballotScrollY = 0;
private _expandedPositions = new Set<string>();  // track which issue cards are expanded

openCandidate(raceId: string, candidateName: string): void {
  this._ballotScrollY = window.scrollY;
  this._expandedPositions.clear();
  this._activeView = { type: 'candidate', raceId, candidateName };
  this.notify();
}

backToBallot(): void {
  this._activeView = { type: 'ballot' };
  this.notify();
  requestAnimationFrame(() => window.scrollTo(0, this._ballotScrollY));
}

togglePosition(issueId: string): void {
  if (this._expandedPositions.has(issueId)) {
    this._expandedPositions.delete(issueId);
  } else {
    this._expandedPositions.add(issueId);
  }
  this.notify();
}
```

Update `renderPage()` to branch on `activeView.type`.

### Step 3 — URL hash support (progressive enhancement)

Push `#candidate/us_senate_tx/Jasmine-Crockett` on navigate, listen for `popstate`
to enable browser back button:

```ts
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

New function `renderCandidateView()` with these sub-sections:

#### 4a. Summary box (Pattern A)

The first thing the user sees. Visually distinct (light background, subtle border).
Contains:
- Avatar (photo or initials) + candidate name
- Party dot + party name + race name + incumbent badge
- Match badge (reuse `renderMatchBadge()`)
- **Top 3 stance pills** — the 3 highest-priority issues as colored pills
  (reuse `ISSUE_COLORS`). These anchor-link to the full position cards below.
- Counts: "6 endorsements · 10 issue positions"
- Select button
- Bio paragraph (if available), in muted text

#### 4b. Sticky section nav (Pattern B)

Horizontal bar that sticks to the top on scroll:
```
[Positions (10)] [Endorsements (6)] [About]
```
Each tab smooth-scrolls to its section. Active tab highlights as user scrolls
(IntersectionObserver on section headings).

#### 4c. "Where they stand" — issue position cards (Patterns C, E, F, G)

Each issue is a **self-contained card** with two states:

**Collapsed (default):**
```
┌─────────────────────────────────────────┐
│  🏥 Healthcare                ✓ Match   │
│  [Expand Medicaid] [Lower Rx costs]     │
│                            ▸ Details    │
└─────────────────────────────────────────┘
```

**Expanded (on tap):**
```
┌─────────────────────────────────────────┐
│  🏥 Healthcare                ✓ Match   │
│  [Expand Medicaid] [Lower Rx costs]     │
│                                         │
│  Supports expanding Medicaid in Texas,  │
│  lowering prescription drug costs.      │
│                                         │
│  ┌─ In their own words ─────────────┐   │
│  │ "Every Texan deserves access to  │   │
│  │  affordable healthcare..."       │   │
│  └──────────────────────────────────┘   │
│                                         │
│  [🌐 Candidate Website]                 │
│                            ▾ Collapse   │
└─────────────────────────────────────────┘
```

**Ordering:**
1. Matched issues (✓) — sorted by user's issue priority
2. Mismatched issues (✗) — still shown, honesty builds trust
3. Unrated issues (neutral) — no match indicator

**Match indicator styling (Pattern E):**
- ✓ Match — green background pill
- ✗ Differs — soft red/orange pill
- Unrated — no pill (clean)

**Source provenance chip (Pattern F):**
Rendered at the bottom of the expanded card. Icon + source type label, styled as
a subtle linked pill. Click opens the source URL.

Source type → icon mapping:
- `candidate_website` → 🌐
- `legislative_record` → 📋
- `public_statements` → 🎤
- `news_coverage` → 📰

**"In their own words" (Pattern G):**
If `directQuote` exists, show in a visually distinct blockquote inside the expanded
card. Light gray background, left border accent, italicized. If no quote exists,
don't show the section (no "N/A" — just omit).

#### 4d. "Who's recommending [Name]" — endorsements (Pattern D)

**Clustered by category**, not a flat list:

```
Labor (3)
[📚 Teachers Union ✓] [⚖ AFL-CIO ✓] [🩺 Nurses Union]

Civil Rights (2)
[✊ NAACP ✓] [🗳 LWV]

Healthcare (1)
[💙 Planned Parenthood]
```

- Categories derived from `IdentityGroup.type`
- User-selected groups get a ✓ and highlighted border
- Each category header shows the count
- Categories with user-matched groups sort first

**Quote cards** below the grid — one per available quote from `ENDORSEMENT_QUOTES`.
Matched-group quotes appear first with a subtle highlight:
```
┌─────────────────────────────────────────┐
│  "Jasmine Crockett has been a tireless  │
│   advocate for civil rights..."         │
│                                         │
│   ✊ NAACP                  ✓ You trust  │
└─────────────────────────────────────────┘
```

#### 4e. Methodology link (Pattern H)

At the bottom of every candidate view, a subtle but always-visible section:
```
────────────────────────────────────
Every position listed here is sourced from public records
and candidate statements. [How we research candidates →]
```
Links to a methodology page/modal explaining the editorial process.

On first ever candidate view open, show a dismissible banner version at the top.

#### 4f. Sticky mobile CTA

On mobile, a fixed-bottom bar with "Select [Name]" button so the user can act
without scrolling back up. Reuses the ballot-bar CSS pattern.

### Step 5 — Entry points (click handlers in `main.ts`)

Ways to open the candidate view:

1. **Candidate name** on the card — clickable with `data-open-candidate`
2. **"View profile →"** button — replaces "More info" expand
3. **Stance pills in summary box** — anchor-link to issue section via `data-scroll-to-issue`

New event handlers:
```ts
// Open candidate view
const openCandidate = target.closest('[data-open-candidate]');
// Back to ballot
const backBtn = target.closest('[data-back-to-ballot]');
// Expand/collapse issue card
const toggleIssue = target.closest('[data-toggle-position]');
// Scroll to section from sticky nav
const scrollToSection = target.closest('[data-scroll-section]');
```

### Step 6 — Styling (`styles.css`)

Key new style blocks:

```
/* Summary box */
.cv-summary         — light purple/gray tint, rounded, padding 24px
.cv-summary-pills   — flex-wrap row of top stance pills

/* Section nav */
.cv-nav              — sticky top: 0, z-index, white bg, bottom border
.cv-nav-tab          — pill-style tabs with counts
.cv-nav-tab.active   — bold + accent underline

/* Issue cards */
.cv-issue-card       — bordered card, 12px padding, margin-bottom 8px
.cv-issue-card.expanded — extra padding for revealed content
.cv-issue-collapsed  — flex row: icon + label + pills + match tag + chevron
.cv-issue-expanded   — position text + quote block + source chip

/* Source chips */
.cv-source-chip      — inline-flex, small pill, icon + text, link
.cv-source-chip.first-party  — subtle blue tint
.cv-source-chip.third-party  — subtle gray tint

/* "In their words" quote */
.cv-verbatim         — blockquote, gray bg, left-border accent, italic

/* Endorsement clusters */
.cv-endorse-cluster  — margin-bottom section per category
.cv-cluster-header   — category name + count, muted text, small caps
.cv-endorse-chip     — pill with icon + name, matched state border

/* Quote cards */
.cv-quote-card       — larger blockquote card, shadow, rounded
.cv-quote-card.matched — highlighted border

/* Sticky CTA */
.cv-sticky-cta       — fixed bottom, mobile only, z-index above content

/* Methodology */
.cv-methodology      — muted text, top border, padding-top
```

Responsive:
- **Desktop (>700px):** 720px max-width centered, 2-col endorser grid, sidebar nav option
- **Tablet (500-700px):** full-width, horizontal sticky nav, 2-col endorsers
- **Mobile (≤500px):** full-width, horizontal sticky nav (compact), 1-col endorsers,
  sticky bottom CTA, tighter card padding, summary box pills wrap to 2 lines

### Step 7 — Update candidate card on ballot page

Modify `renderCandidateCard()`:

- Make candidate name clickable: `data-open-candidate data-race="..." data-candidate="..."`
- Replace "More info" / "Less info" toggle with "View profile →" that navigates
- Keep the inline "Select" button (quick action without navigating)
- Keep match badge, key positions, endorsement row on the card face

Remove `renderDetailPanel()` and related expand/collapse state for inline details.

---

## What stays the same

- **Card face** on ballot page — avatar, match badge, name, party, key positions,
  endorsement row, select button
- **Select button** — works identically from card and detail view
- **Scoring algorithm** — no changes to `computeRaceMatches()`
- **Filter panels** — issues and groups panels stay on the ballot page

## What gets removed

- **Inline detail panel** (`renderDetailPanel()` + expand/collapse toggle) — replaced by
  the full candidate view

---

## Data we'd want to add per candidate

Priority order:

1. **`bio`** (high) — 1-2 sentences, factual. Biggest UX win for the summary box.
2. **`sourceType`** (high) — categorize every existing source string. Enables provenance chips.
3. **`directQuote`** (medium) — verbatim candidate statements for "In their words" sections.
4. **`sourceUrl`** (medium) — direct links to original sources. Makes provenance chips clickable.
5. **`photoUrl`** (nice-to-have) — real candidate photos.
6. **`website`** (nice-to-have) — campaign site link.

---

## Sequencing

| Phase | Work | Effort |
|-------|------|--------|
| **1** | Data model: extend types, add `sourceType` + `bio` to all candidates | Small-Medium |
| **2** | State routing + `renderCandidateView` skeleton + back nav + hash | Small |
| **3** | Summary box + sticky section nav | Small |
| **4** | Issue position cards (collapsed/expanded, source chips, verbatim quotes) | Medium |
| **5** | Endorsement section (clustered categories, quote cards) | Medium |
| **6** | Card updates (name clickable, remove inline expand, "View profile →") | Small |
| **7** | Styling + responsive + sticky CTA + methodology footer | Medium |
| **8** | Polish — transitions, scroll behavior, IntersectionObserver for nav, Escape key | Small |

Phases 1-7 are the core build. Phase 8 is polish.

---

## Sources

Design decisions informed by:
- [NNGroup — Layer-Cake Scanning Pattern](https://www.nngroup.com/articles/layer-cake-pattern-scanning/)
- [NNGroup — Inverted Pyramid for Web](https://www.nngroup.com/articles/inverted-pyramid/)
- [NNGroup — Chunking](https://www.nngroup.com/articles/chunking/)
- [NNGroup — Trustworthy Design](https://www.nngroup.com/articles/trustworthy-design/)
- [Center for Civic Design — Voter Guide](https://civicdesign.org/fieldguides/designing-a-voter-guide-to-an-election/)
- [BallotReady — Research Process](https://www.ballotready.org/research-process)
- [Shape of AI — Citation Patterns](https://www.shapeof.ai/patterns/citations)
- [Ballotpedia — Quality Benchmarks](https://ballotpedia.org/Eight_Quality_Benchmarks_for_a_Sample_Ballot_Lookup_Tool)
- [Laws of UX — Chunking](https://lawsofux.com/chunking/)
