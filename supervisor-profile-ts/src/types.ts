/**
 * Types for the Supervisor Responsiveness Profile.
 *
 * Every profile field that can be missing is wrapped in DataPoint,
 * which tracks availability, source, and explanatory notes.
 *
 * Designed for investigative journalists building data-driven
 * accountability stories from scattered public records.
 */

export type DataAvailability = 'found' | 'partial' | 'not_found' | 'not_applicable';

/** How much a journalist can rely on this data point */
export type SourceReliability = 'official_record' | 'verified_news' | 'web_search' | 'inferred' | 'self_reported';

export interface DataPoint {
  value: any;
  availability: DataAvailability;
  source_url?: string;
  source_name?: string;
  source_reliability?: SourceReliability;
  notes?: string;
  fetched_at?: string;
}

/** Tracks a public records request a reporter could file */
export interface PublicRecordsNote {
  record_type: string;
  custodian: string;
  request_basis: string;
  estimated_turnaround?: string;
  notes?: string;
}

export interface VoteRecord {
  matter_id: number;
  matter_file?: string;
  matter_title: string;
  vote_value: string;
  event_date: string;
  event_id: number;
  body_name?: string;
}

export interface MeetingAttendance {
  event_id: number;
  event_date: string;
  body_name: string;
  present: boolean;
}

export interface CommitteeAssignment {
  name: string;
  role?: string;
  body_type?: string;
  source_url?: string;
}

export interface PublicStatement {
  title: string;
  date?: string;
  source_url?: string;
  source_name?: string;
  excerpt?: string;
}

export interface CampaignFinanceRef {
  title: string;
  source_url: string;
  snippet?: string;
}

/** A constituent issue surfaced from petitions, news, or public comment */
export interface ConstituentIssue {
  issue: string;
  source_type: 'petition' | 'local_news' | 'public_comment' | 'community_org';
  source_url?: string;
  source_name?: string;
  signature_count?: number;
  date?: string;
  district_relevant: boolean;
  supervisor_action?: 'voted_aligned' | 'voted_against' | 'no_action' | 'spoke_in_support' | 'unknown';
  notes?: string;
}

/** What this elected role controls, influences, and cannot do */
export interface RoleFraming {
  official_title: string;
  governing_body: string;
  board_size: number;
  direct_authority: string[];
  influence_over: string[];
  no_authority_over: string[];
  key_context: string;
}

/**
 * Structured constituent alignment scorecard.
 * Scores are 0-100 numeric. null means insufficient data.
 * Each dimension tracks evidence, gaps, and reporter actions.
 */
export interface AlignmentDimension {
  label: string;
  score: number | null;       // 0-100, null = insufficient data
  confidence: number;         // 0-100, how much data backs this score
  evidence: string[];
  data_gap?: string;
  reporter_action?: string;
}

export interface AlignmentScorecard {
  overall_score: number | null;      // 0-100, null = insufficient data
  overall_confidence: number;         // 0-100
  overall_notes: string;
  dimensions: {
    voting_alignment: AlignmentDimension;
    committee_relevance: AlignmentDimension;
    accessibility: AlignmentDimension;
    donor_independence: AlignmentDimension;
    issue_responsiveness: AlignmentDimension;
  };
}

export interface ResponsivenessProfile {
  // Identity
  name: string;
  district?: string;
  jurisdiction: string;
  state: string;
  title: string;
  role_framing?: RoleFraming;

  // Contact
  official_page_url: DataPoint;
  email: DataPoint;
  phone: DataPoint;

  // Term
  term_start: DataPoint;
  term_end: DataPoint;
  first_elected: DataPoint;

  // Legislative activity (Legistar)
  votes: VoteRecord[];
  vote_summary: DataPoint;
  meeting_attendance: MeetingAttendance[];
  attendance_rate: DataPoint;
  legislation_count: DataPoint;

  // Committees
  committees: CommitteeAssignment[];
  committee_count: DataPoint;

  // Budget
  budget_summary: DataPoint;

  // Public engagement
  public_statements: PublicStatement[];
  news_mention_count: DataPoint;

  // Campaign finance
  campaign_finance_refs: CampaignFinanceRef[];
  total_contributions: DataPoint;

  // Responsiveness (mostly unavailable)
  constituent_response_time: DataPoint;
  town_halls_held: DataPoint;
  public_comment_engagement: DataPoint;
  social_media_responsiveness: DataPoint;

  // Constituent issue alignment
  constituent_issues: ConstituentIssue[];
  alignment_scorecard: AlignmentScorecard;

  // Public records & meeting minutes
  meeting_minutes_availability: DataPoint;
  agenda_responsiveness: DataPoint;
  cpra_records_notes: PublicRecordsNote[];

  // Meta
  profile_generated_at: string;
  data_sources_used: string[];
  data_sources_failed: string[];
}

/** Comparative summary for cross-supervisor analysis */
export interface SupervisorComparison {
  supervisors: Array<{
    name: string;
    district: string;
    data_completeness: number;
    fields_found: number;
    fields_partial: number;
    fields_not_found: number;
    vote_count: number;
    committee_count: number;
    news_mentions: number;
    alignment_score: number | null;
    alignment_confidence: number;
    constituent_issues_count: number;
    key_gaps: string[];
  }>;
  jurisdiction: string;
  generated_at: string;
  story_angles: string[];
}

/** Helper to create a DataPoint */
export function dp(
  value: any,
  opts?: { source_url?: string; source_name?: string; source_reliability?: SourceReliability; notes?: string; availability?: DataAvailability }
): DataPoint {
  return {
    value,
    availability: opts?.availability ?? (value != null ? 'found' : 'not_found'),
    source_url: opts?.source_url,
    source_name: opts?.source_name,
    source_reliability: opts?.source_reliability,
    notes: opts?.notes,
    fetched_at: new Date().toISOString(),
  };
}

export function emptyProfile(name: string, jurisdiction: string, state: string, district?: string): ResponsivenessProfile {
  const empty = dp(null);
  return {
    name,
    district,
    jurisdiction,
    state,
    title: 'Supervisor',
    official_page_url: { ...empty },
    email: { ...empty },
    phone: { ...empty },
    term_start: { ...empty },
    term_end: { ...empty },
    first_elected: { ...empty },
    votes: [],
    vote_summary: { ...empty },
    meeting_attendance: [],
    attendance_rate: { ...empty },
    legislation_count: { ...empty },
    committees: [],
    committee_count: { ...empty },
    budget_summary: { ...empty },
    public_statements: [],
    news_mention_count: { ...empty },
    campaign_finance_refs: [],
    total_contributions: { ...empty },
    constituent_response_time: { ...empty },
    town_halls_held: { ...empty },
    public_comment_engagement: { ...empty },
    social_media_responsiveness: { ...empty },
    constituent_issues: [],
    alignment_scorecard: emptyScorecard(),
    meeting_minutes_availability: { ...empty },
    agenda_responsiveness: { ...empty },
    cpra_records_notes: [],
    profile_generated_at: new Date().toISOString(),
    data_sources_used: [],
    data_sources_failed: [],
  };
}

function emptyScorecard(): AlignmentScorecard {
  const emptyDim = (label: string): AlignmentDimension => ({
    label,
    score: null,
    confidence: 0,
    evidence: [],
  });
  return {
    overall_score: null,
    overall_confidence: 0,
    overall_notes: '',
    dimensions: {
      voting_alignment: emptyDim('Voting Alignment'),
      committee_relevance: emptyDim('Committee Relevance'),
      accessibility: emptyDim('Accessibility'),
      donor_independence: emptyDim('Donor Independence'),
      issue_responsiveness: emptyDim('Issue Responsiveness'),
    },
  };
}

// --- Legistar API response types ---

export interface LegistarPerson {
  PersonId: number;
  PersonGuid: string;
  PersonFullName: string;
  PersonFirstName?: string;
  PersonLastName?: string;
  PersonEmail?: string;
  PersonPhone?: string;
  PersonActiveFlag: number;
}

export interface LegistarBody {
  BodyId: number;
  BodyName: string;
  BodyTypeId: number;
  BodyTypeName: string;
}

export interface LegistarEvent {
  EventId: number;
  EventBodyId: number;
  EventBodyName: string;
  EventDate: string;
  EventTime?: string;
  EventVideoPath?: string;
  EventAgendaFile?: string;
  EventMinutesFile?: string;
}

export interface LegistarEventItem {
  EventItemId: number;
  EventItemTitle: string;
  EventItemMatterId?: number;
  EventItemMatterFile?: string;
  EventItemActionName?: string;
  EventItemPassedFlag?: number;
}

export interface LegistarVote {
  VoteId: number;
  VotePersonId: number;
  VotePersonName: string;
  VoteValueName: string;
}

export interface LegistarMatter {
  MatterId: number;
  MatterFile: string;
  MatterTitle: string;
  MatterTypeName?: string;
  MatterStatusName?: string;
  MatterIntroDate?: string;
}

export interface LegistarSponsor {
  MatterSponsorName: string;
  MatterSponsorNameId: number;
}
