/**
 * Types for the Supervisor Responsiveness Profile.
 *
 * Every profile field that can be missing is wrapped in DataPoint,
 * which tracks availability, source, and explanatory notes.
 */

export type DataAvailability = 'found' | 'partial' | 'not_found' | 'not_applicable';

export interface DataPoint {
  value: any;
  availability: DataAvailability;
  source_url?: string;
  source_name?: string;
  notes?: string;
  fetched_at?: string;
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

export interface ResponsivenessProfile {
  // Identity
  name: string;
  district?: string;
  jurisdiction: string;
  state: string;
  title: string;

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

  // Meta
  profile_generated_at: string;
  data_sources_used: string[];
  data_sources_failed: string[];
}

/** Helper to create a DataPoint */
export function dp(
  value: any,
  opts?: { source_url?: string; source_name?: string; notes?: string; availability?: DataAvailability }
): DataPoint {
  return {
    value,
    availability: opts?.availability ?? (value != null ? 'found' : 'not_found'),
    source_url: opts?.source_url,
    source_name: opts?.source_name,
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
    profile_generated_at: new Date().toISOString(),
    data_sources_used: [],
    data_sources_failed: [],
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
