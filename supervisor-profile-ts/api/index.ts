import express, { Request, Response } from 'express';
import cors from 'cors';
import { buildProfile } from '../src/profile-builder';
import {
  ResponsivenessProfile,
  DataPoint,
  DataAvailability,
  SupervisorComparison,
  ConstituentIssue,
  PublicRecordsNote,
  RoleFraming,
} from '../src/types';

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

/**
 * POST /api/profile
 *
 * Build a responsiveness profile for a supervisor.
 */
app.post('/api/profile', async (req: Request, res: Response) => {
  const { name, legistarClient, jurisdiction, state, district, maxMeetings } = req.body;

  if (!name || !legistarClient || !jurisdiction || !state) {
    return res.status(400).json({
      error: 'Missing required fields: name, legistarClient, jurisdiction, state',
    });
  }

  try {
    const profile = await buildProfile({
      name,
      legistarClient,
      jurisdiction,
      state,
      district,
      maxMeetings: maxMeetings ?? 15,
    });

    res.json({ profile, summary: summarize(profile) });
  } catch (e: any) {
    console.error('Profile build error:', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/profile/sample
 *
 * Returns a pre-built sample profile for Chris Lopez (Monterey County District 3).
 */
app.get('/api/profile/sample', (req: Request, res: Response) => {
  const key = (req.query.supervisor as string) || 'chris_lopez';
  const profile = PROFILES[key];
  if (!profile) {
    return res.status(404).json({
      error: `Supervisor "${key}" not found. Available: ${Object.keys(PROFILES).join(', ')}`,
    });
  }
  res.json({ profile, summary: summarize(profile) });
});

/**
 * GET /api/profile/sample/all
 *
 * Returns all 5 Monterey County supervisor profiles with a comparative summary.
 * Designed for cross-supervisor investigative analysis.
 */
app.get('/api/profile/sample/all', (_req: Request, res: Response) => {
  const profiles = Object.values(PROFILES);
  const summaries = profiles.map(p => ({ profile: p, summary: summarize(p) }));
  const comparison = buildComparison(summaries);
  res.json({ profiles: summaries, comparison });
});

// --- Summarize a single profile ---

function summarize(profile: ResponsivenessProfile) {
  const counts: Record<DataAvailability, number> = { found: 0, partial: 0, not_found: 0, not_applicable: 0 };
  const gaps: Array<{ field: string; status: string; notes: string }> = [];

  const dpFields: Array<[string, DataPoint]> = [
    ['official_page_url', profile.official_page_url],
    ['email', profile.email],
    ['phone', profile.phone],
    ['term_start', profile.term_start],
    ['term_end', profile.term_end],
    ['first_elected', profile.first_elected],
    ['vote_summary', profile.vote_summary],
    ['attendance_rate', profile.attendance_rate],
    ['legislation_count', profile.legislation_count],
    ['committee_count', profile.committee_count],
    ['budget_summary', profile.budget_summary],
    ['news_mention_count', profile.news_mention_count],
    ['total_contributions', profile.total_contributions],
    ['constituent_response_time', profile.constituent_response_time],
    ['town_halls_held', profile.town_halls_held],
    ['public_comment_engagement', profile.public_comment_engagement],
    ['social_media_responsiveness', profile.social_media_responsiveness],
    ['meeting_minutes_availability', profile.meeting_minutes_availability],
    ['agenda_responsiveness', profile.agenda_responsiveness],
  ];

  for (const [name, dp] of dpFields) {
    counts[dp.availability]++;
    if (dp.availability === 'not_found' || dp.availability === 'partial') {
      gaps.push({ field: name, status: dp.availability, notes: dp.notes || '' });
    }
  }

  return { counts, gaps, total_fields: dpFields.length };
}

// --- Cross-supervisor comparison ---

function buildComparison(
  summaries: Array<{ profile: ResponsivenessProfile; summary: ReturnType<typeof summarize> }>
): SupervisorComparison {
  const supervisors = summaries.map(({ profile: p, summary: s }) => ({
    name: p.name,
    district: p.district || '?',
    data_completeness: Math.round((s.counts.found / s.total_fields) * 100),
    fields_found: s.counts.found,
    fields_partial: s.counts.partial,
    fields_not_found: s.counts.not_found,
    vote_count: p.votes.length,
    committee_count: p.committees.length,
    news_mentions: typeof p.news_mention_count.value === 'number' ? p.news_mention_count.value : 0,
    alignment_score: p.alignment_scorecard.overall_score,
    alignment_confidence: p.alignment_scorecard.overall_confidence,
    constituent_issues_count: p.constituent_issues.length,
    key_gaps: s.gaps.filter(g => g.status === 'not_found').map(g => g.field),
  }));

  const story_angles = [
    'Responsiveness gap: No supervisor has publicly trackable constituent response times, town hall records, or public comment engagement metrics.',
    'Data disparity: Compare which supervisors have more transparent public records — differences may indicate varying commitment to openness.',
    'Constituent alignment: Cross-reference Change.org petitions and local news coverage of district issues against each supervisor\'s voting record.',
    'Committee power: Some supervisors sit on significantly more boards — does that translate to better outcomes for their districts?',
    'Campaign finance vs. votes: Do supervisors who received industry contributions vote consistently with those donors\' interests?',
    'Meeting attendance: Legistar vote records can reveal which supervisors are most consistently present for roll-call votes.',
    'CPRA opportunity: Filing parallel records requests to all 5 offices for constituent correspondence logs would reveal who responds and how quickly.',
  ];

  return {
    supervisors,
    jurisdiction: 'Monterey County',
    generated_at: new Date().toISOString(),
    story_angles,
  };
}

// ============================================================
// SAMPLE PROFILES — All 5 Monterey County Supervisors
//
// Built from web research for demo/testing. In production these
// would come from live API calls + scrapers.
// ============================================================

const MONTEREY_ROLE: RoleFraming = {
  official_title: 'County Supervisor',
  governing_body: 'Monterey County Board of Supervisors',
  board_size: 5,
  direct_authority: [
    '\u{1F4B0} County budget ($2B/yr)',
    '\u{1F3D7}\uFE0F Land use & zoning (unincorporated)',
    '\u{1F3DB}\uFE0F Department oversight',
    '\u{1F4CB} Commission appointments',
    '\u{1F4B2} Tax rates & fees',
    '\u{1F465} Employee policies',
    '\u{1F4DD} Contracts & procurement',
  ],
  influence_over: [
    '\u{1F517} Regional boards (TAMC, AMBAG, Air District)',
    '\u{1F4E3} State & federal advocacy',
    '\u{1F4A7} Special districts (water, fire)',
    '\u26A1 Joint powers (waste, broadband, energy)',
    '\u{1F30A} Coastal Commission',
  ],
  no_authority_over: [
    '\u{1F3D9}\uFE0F City governments (independent)',
    '\u{1F393} School & college districts',
    '\u{1F6E3}\uFE0F State highways (Caltrans)',
    '\u{1F332} Federal land (Fort Ord, forests)',
    '\u2699\uFE0F Private utilities (PG&E, CalAm)',
    '\u2696\uFE0F Courts & judicial appointments',
  ],
  key_context: 'Monterey County has a 5-member board. Any 3 supervisors form a majority and can pass motions, approve budgets, and set policy. The board acts as both legislative and executive branch for unincorporated county areas. Individual supervisors represent specific districts but vote on county-wide matters. Committee chair positions (Budget, Cannabis, Energy) provide additional agenda-setting power.',
};

const MONTEREY_CPRA_NOTES: PublicRecordsNote[] = [
  {
    record_type: 'Constituent correspondence logs',
    custodian: 'Monterey County Clerk of the Board',
    request_basis: 'California Public Records Act (Gov. Code § 6250-6270)',
    estimated_turnaround: '10 business days (statutory)',
    notes: 'Request emails/letters from constituents and supervisor responses. May be partially exempt under deliberative process privilege.',
  },
  {
    record_type: 'Supervisor calendar/scheduling records',
    custodian: 'Individual supervisor offices',
    request_basis: 'CPRA',
    estimated_turnaround: '10 business days',
    notes: 'Public meeting schedules are records. Private fundraising events may be withheld.',
  },
  {
    record_type: 'Town hall and community meeting records',
    custodian: 'Clerk of the Board / supervisor staff',
    request_basis: 'CPRA',
    estimated_turnaround: '10-14 business days',
    notes: 'Informal meetings may not have formal records. Worth requesting any sign-in sheets, agendas, or staff summaries.',
  },
];

const MONTEREY_ISSUES: ConstituentIssue[] = [
  {
    issue: 'Fort Ord wildfire prevention and cleanup',
    source_type: 'local_news',
    source_name: 'Monterey Herald',
    date: '2024-08',
    district_relevant: true,
    supervisor_action: 'spoke_in_support',
    notes: 'Multiple supervisors have advocated for accelerated Army base cleanup. Board passed resolution in 2024.',
  },
  {
    issue: 'Agricultural worker housing shortage',
    source_type: 'local_news',
    source_name: 'Monterey County Weekly',
    date: '2024-06',
    district_relevant: true,
    supervisor_action: 'voted_aligned',
    notes: 'Board approved farmworker housing density bonus in Salinas Valley. Affects Districts 1, 3, 4 most directly.',
  },
  {
    issue: 'Stop the Monterey Bay Desalination Plant',
    source_type: 'petition',
    source_name: 'Change.org',
    signature_count: 2400,
    date: '2023-11',
    district_relevant: true,
    supervisor_action: 'unknown',
    notes: 'Petition opposes CalAm desal project. Water district governance overlaps with county board authority.',
  },
  {
    issue: 'Salinas Valley groundwater sustainability',
    source_type: 'community_org',
    source_name: 'LandWatch Monterey County',
    date: '2024-03',
    district_relevant: true,
    supervisor_action: 'voted_aligned',
    notes: 'Board engaged with Sustainable Groundwater Management Act compliance. LandWatch has tracked supervisor positions.',
  },
  {
    issue: 'County hiring freeze impact on services',
    source_type: 'local_news',
    source_name: 'Monterey County Now',
    date: '2024-10',
    district_relevant: true,
    supervisor_action: 'voted_aligned',
    notes: 'All supervisors voted to implement hiring freeze amid $50M structural deficit. Constituent complaints about delayed services followed.',
  },
  {
    issue: 'Protect Monterey County from oil industry expansion',
    source_type: 'petition',
    source_name: 'Change.org',
    signature_count: 8500,
    date: '2022-05',
    district_relevant: true,
    supervisor_action: 'unknown',
    notes: 'Measure Z (2016 fracking ban) was struck down by courts. Ongoing constituent concern about oil industry influence.',
  },
];

const PROFILES: Record<string, ResponsivenessProfile> = {
  // --- District 1: Luis Alejo ---
  luis_alejo: {
    name: 'Luis A. Alejo',
    district: '1',
    jurisdiction: 'Monterey County',
    state: 'CA',
    title: 'Supervisor',
    role_framing: MONTEREY_ROLE,
    official_page_url: {
      value: 'https://www.countyofmonterey.gov/government/board-of-supervisors/district-1-luis-alejo',
      availability: 'found', source_name: 'County website', source_reliability: 'official_record',
    },
    email: {
      value: 'district1@countyofmonterey.gov',
      availability: 'found', source_name: 'County website', source_reliability: 'official_record',
    },
    phone: {
      value: '(831) 755-5011',
      availability: 'found', source_name: 'County website', source_reliability: 'official_record',
    },
    term_start: {
      value: '2021-01-01', availability: 'found', source_name: 'County website',
      source_reliability: 'official_record',
      notes: 'Elected 2020. Former state Assemblymember (2012-2018).',
    },
    term_end: {
      value: '2024-12-31', availability: 'found', source_name: 'County website',
      source_reliability: 'official_record',
      notes: 'Reelected 2024 for second term through 2028.',
    },
    first_elected: {
      value: '2020-11', availability: 'found', source_name: 'News articles',
      source_reliability: 'verified_news',
      notes: 'Previously served in CA State Assembly. Brings Sacramento relationships to county governance.',
    },
    votes: [
      { matter_id: 0, matter_title: 'FY 2024-25 County Budget Approval', vote_value: 'Aye', event_date: '2024-06-20', event_id: 0, body_name: 'Board of Supervisors' },
      { matter_id: 0, matter_title: 'Hiring Freeze Implementation', vote_value: 'Aye', event_date: '2024-10-01', event_id: 0, body_name: 'Board of Supervisors' },
      { matter_id: 0, matter_title: 'Farmworker Housing Density Bonus', vote_value: 'Aye', event_date: '2024-05-14', event_id: 0, body_name: 'Board of Supervisors' },
    ],
    vote_summary: {
      value: { total_votes_sample: 3, note: 'Full vote history available via Legistar API from 2021+' },
      availability: 'partial', source_name: 'Legistar Web API', source_reliability: 'official_record',
      notes: 'Roll-call votes stored per agenda item. Full extraction requires iterating events > items > votes.',
    },
    meeting_attendance: [],
    attendance_rate: {
      value: null, availability: 'partial', source_name: 'Legistar (derived)', source_reliability: 'inferred',
      notes: 'Inferred from vote records. No explicit attendance field in Legistar.',
    },
    legislation_count: {
      value: null, availability: 'partial', source_name: 'Legistar', source_reliability: 'official_record',
      notes: 'Sponsors endpoint exists but Monterey County may not consistently tag individual sponsors.',
    },
    committees: [
      { name: 'Salinas Valley Solid Waste Authority', role: 'Board Chair' },
      { name: 'Association of Monterey Bay Area Governments (AMBAG)', role: 'Board Member' },
      { name: 'Monterey Bay Air Resources District', role: 'Board Member' },
      { name: 'Local Agency Formation Commission (LAFCO)', role: 'Commissioner' },
      { name: 'Salinas Valley Memorial Healthcare System', role: 'Board Member' },
    ],
    committee_count: { value: 5, availability: 'found', source_name: 'County website', source_reliability: 'official_record' },
    budget_summary: {
      value: null, availability: 'not_found',
      notes: 'County budgets are PDFs organized by department, not by supervisor district. FY 2024-25 total budget is ~$2B.',
    },
    public_statements: [
      { title: 'Alejo sworn in as District 1 Supervisor', source_name: 'Monterey County Weekly', date: '2021-01' },
      { title: 'Board approves $2B budget for 2024-25', source_url: 'https://www.montereycountynow.com/blogs/news_blog/the-board-of-supervisors-approves-a-2-billion-budget-for-2024-25-plus-adding-a/article_b34752e2-2f50-11ef-9311-476d84af0bc1.html', source_name: 'Monterey County Now' },
      { title: 'Alejo pushes for agricultural worker protections', source_name: 'The Californian', date: '2023-08' },
    ],
    news_mention_count: { value: 3, availability: 'found', source_name: 'DuckDuckGo search', source_reliability: 'web_search' },
    campaign_finance_refs: [
      { title: 'Money in Politics - Voices of Monterey Bay', source_url: 'https://voicesofmontereybay.org/2022/05/05/money-in-politics/', snippet: 'Analysis of campaign contributions in Monterey County races' },
    ],
    total_contributions: {
      value: null, availability: 'partial', source_reliability: 'web_search',
      notes: 'Campaign finance data in Cal-Access. Previously reported significant agricultural industry support.',
      source_name: 'News reports / Cal-Access',
    },
    constituent_response_time: {
      value: null, availability: 'not_found',
      notes: 'Not publicly tracked. Requires CPRA request for correspondence logs or constituent survey.',
    },
    town_halls_held: {
      value: null, availability: 'not_found',
      notes: 'Not systematically tracked. His Assembly background suggests familiarity with town hall formats, but no public record found.',
    },
    public_comment_engagement: {
      value: null, availability: 'not_found',
      notes: 'Meeting videos exist at monterey.legistar.com but responses are not transcribed.',
    },
    social_media_responsiveness: {
      value: null, availability: 'not_found',
      notes: 'Active on social media but measuring responsiveness requires platform API access.',
    },
    constituent_issues: MONTEREY_ISSUES.filter(i => ['Agricultural worker housing shortage', 'Salinas Valley groundwater sustainability', 'County hiring freeze impact on services'].includes(i.issue)),
    alignment_scorecard: {
      overall_score: 58,
      overall_confidence: 35,
      overall_notes: 'District 1 covers Salinas, heavily agricultural. Strong committee fit for ag and waste issues. Former Assemblymember background suggests policy sophistication. Limited direct responsiveness data.',
      dimensions: {
        voting_alignment: {
          label: 'Voting Alignment', score: 60, confidence: 25,
          evidence: ['Voted for farmworker housing density bonus (aligned with ag worker constituents)', 'Voted for hiring freeze (mixed: fiscal prudence vs. constituent service impacts)'],
          data_gap: 'Only 3 sample votes — full Legistar extraction needed',
          reporter_action: 'Run full Legistar vote extraction for 2021-present',
        },
        committee_relevance: {
          label: 'Committee Relevance', score: 78, confidence: 70,
          evidence: ['Solid Waste Authority Chair — directly serves district', 'LAFCO Commissioner — shapes service boundaries', 'Air Resources District — ag air quality'],
          reporter_action: 'Review committee meeting minutes for participation level',
        },
        accessibility: {
          label: 'Accessibility', score: null, confidence: 10,
          evidence: ['Official email/phone listed', 'Former Assemblymember — experienced with constituent services'],
          data_gap: 'No town hall records, response times, or social media metrics',
          reporter_action: 'File CPRA for correspondence volume and response times',
        },
        donor_independence: {
          label: 'Donor Independence', score: null, confidence: 10,
          evidence: ['Ag industry support reported but amounts not extracted'],
          data_gap: 'Need Cal-Access filing analysis',
          reporter_action: 'Pull Cal-Access filings; cross-reference donors with votes',
        },
        issue_responsiveness: {
          label: 'Issue Responsiveness', score: 55, confidence: 30,
          evidence: ['Farmworker housing vote aligns with district priority', 'Groundwater engagement aligns with ag needs'],
          data_gap: 'No petition response tracking',
          reporter_action: 'Search Change.org for District 1 petitions',
        },
      },
    },
    meeting_minutes_availability: {
      value: 'Legistar (monterey.legistar.com)', availability: 'partial', source_reliability: 'official_record',
      notes: 'Minutes posted to Legistar. Searchable by date but not by supervisor. Video recordings also available.',
    },
    agenda_responsiveness: {
      value: null, availability: 'not_found',
      notes: 'No public mechanism tracks which agenda items were requested by which supervisor or by constituents.',
    },
    cpra_records_notes: MONTEREY_CPRA_NOTES,
    profile_generated_at: new Date().toISOString(),
    data_sources_used: ['Legistar Web API', 'County website (countyofmonterey.gov)', 'DuckDuckGo web search'],
    data_sources_failed: [],
  },

  // --- District 2: Glenn Church ---
  glenn_church: {
    name: 'Glenn Church',
    district: '2',
    jurisdiction: 'Monterey County',
    state: 'CA',
    title: 'Supervisor',
    role_framing: MONTEREY_ROLE,
    official_page_url: {
      value: 'https://www.countyofmonterey.gov/government/board-of-supervisors/district-2-glenn-church',
      availability: 'found', source_name: 'County website', source_reliability: 'official_record',
    },
    email: {
      value: 'district2@countyofmonterey.gov',
      availability: 'found', source_name: 'County website', source_reliability: 'official_record',
    },
    phone: {
      value: '(831) 755-5022',
      availability: 'found', source_name: 'County website', source_reliability: 'official_record',
    },
    term_start: {
      value: '2023-01-01', availability: 'found', source_name: 'County website',
      source_reliability: 'official_record',
      notes: 'Elected 2022. Replaced John Phillips.',
    },
    term_end: {
      value: '2026-12-31', availability: 'found', source_name: 'County website',
      source_reliability: 'official_record',
    },
    first_elected: {
      value: '2022-06', availability: 'found', source_name: 'News articles',
      source_reliability: 'verified_news',
      notes: 'Background in North County community organizations. First elected office.',
    },
    votes: [
      { matter_id: 0, matter_title: 'FY 2024-25 County Budget Approval', vote_value: 'Aye', event_date: '2024-06-20', event_id: 0, body_name: 'Board of Supervisors' },
      { matter_id: 0, matter_title: 'Hiring Freeze Implementation', vote_value: 'Aye', event_date: '2024-10-01', event_id: 0, body_name: 'Board of Supervisors' },
    ],
    vote_summary: {
      value: { total_votes_sample: 2, note: 'Full history available via Legistar from 2023+' },
      availability: 'partial', source_name: 'Legistar Web API', source_reliability: 'official_record',
      notes: 'Roll-call votes stored per agenda item.',
    },
    meeting_attendance: [],
    attendance_rate: {
      value: null, availability: 'partial', source_name: 'Legistar (derived)', source_reliability: 'inferred',
      notes: 'Inferred from vote records.',
    },
    legislation_count: {
      value: null, availability: 'partial', source_name: 'Legistar', source_reliability: 'official_record',
      notes: 'Sponsors endpoint exists but may not tag individual sponsors.',
    },
    committees: [
      { name: 'Transportation Agency for Monterey County (TAMC)', role: 'Board Member' },
      { name: 'Monterey Peninsula Water Management District', role: 'Liaison' },
      { name: 'Fort Ord Reuse Authority (FORA) successor', role: 'Representative' },
    ],
    committee_count: { value: 3, availability: 'found', source_name: 'County website', source_reliability: 'official_record' },
    budget_summary: {
      value: null, availability: 'not_found',
      notes: 'Budget PDFs not organized by district.',
    },
    public_statements: [
      { title: 'Glenn Church wins District 2 seat', source_name: 'Monterey Herald', date: '2022-06' },
      { title: 'Board addresses Fort Ord cleanup timeline', source_name: 'Monterey County Now', date: '2024-03' },
    ],
    news_mention_count: { value: 2, availability: 'found', source_name: 'DuckDuckGo search', source_reliability: 'web_search' },
    campaign_finance_refs: [],
    total_contributions: {
      value: null, availability: 'not_found',
      notes: 'Campaign finance data in Cal-Access. Minimal reporting found via web search for first-time candidate.',
    },
    constituent_response_time: {
      value: null, availability: 'not_found',
      notes: 'Not publicly tracked.',
    },
    town_halls_held: {
      value: null, availability: 'not_found',
      notes: 'No public record found. District 2 (North County / Monterey Peninsula) geography may limit town hall reach.',
    },
    public_comment_engagement: {
      value: null, availability: 'not_found',
      notes: 'Meeting videos exist but not transcribed.',
    },
    social_media_responsiveness: {
      value: null, availability: 'not_found',
      notes: 'Limited social media presence found via web search.',
    },
    constituent_issues: MONTEREY_ISSUES.filter(i => ['Fort Ord wildfire prevention and cleanup', 'Stop the Monterey Bay Desalination Plant', 'County hiring freeze impact on services'].includes(i.issue)),
    alignment_scorecard: {
      overall_score: null,
      overall_confidence: 18,
      overall_notes: 'First-term supervisor with limited public track record. District 2 includes Monterey Peninsula — Fort Ord and water are top concerns. Too few data points.',
      dimensions: {
        voting_alignment: {
          label: 'Voting Alignment', score: null, confidence: 10,
          evidence: ['Only 2 sample votes, both unanimous board actions'],
          data_gap: 'Need full Legistar extraction — dissenting votes most informative',
          reporter_action: 'Full Legistar extraction; flag non-unanimous votes',
        },
        committee_relevance: {
          label: 'Committee Relevance', score: 62, confidence: 60,
          evidence: ['TAMC seat relevant to Peninsula transportation', 'Water Management District liaison matches top concern', 'Fort Ord successor body matches cleanup advocacy'],
        },
        accessibility: {
          label: 'Accessibility', score: null, confidence: 5,
          evidence: ['Official contact published'],
          data_gap: 'No town hall records, limited social media, no response times',
          reporter_action: 'CPRA for correspondence; survey District 2 community orgs',
        },
        donor_independence: {
          label: 'Donor Independence', score: null, confidence: 5,
          evidence: ['Minimal campaign finance reporting for first-time candidate'],
          data_gap: 'Cal-Access filings not yet analyzed',
          reporter_action: 'Pull 2022 campaign filings from Cal-Access',
        },
        issue_responsiveness: {
          label: 'Issue Responsiveness', score: null, confidence: 15,
          evidence: ['Fort Ord cleanup — board addressed timeline in 2024', 'Desal petition (2,400 signatures) — position unclear'],
          data_gap: 'No petition response data',
          reporter_action: 'Contact petition organizers; review board meeting videos',
        },
      },
    },
    meeting_minutes_availability: {
      value: 'Legistar (monterey.legistar.com)', availability: 'partial', source_reliability: 'official_record',
      notes: 'Minutes posted to Legistar.',
    },
    agenda_responsiveness: {
      value: null, availability: 'not_found',
      notes: 'No public mechanism tracks agenda item origins.',
    },
    cpra_records_notes: MONTEREY_CPRA_NOTES,
    profile_generated_at: new Date().toISOString(),
    data_sources_used: ['Legistar Web API', 'County website', 'DuckDuckGo web search'],
    data_sources_failed: [],
  },

  // --- District 3: Chris Lopez ---
  chris_lopez: {
    name: 'Chris Lopez',
    district: '3',
    jurisdiction: 'Monterey County',
    state: 'CA',
    title: 'Supervisor',
    role_framing: MONTEREY_ROLE,
    official_page_url: {
      value: 'https://www.countyofmonterey.gov/government/board-of-supervisors/district-3-chris-lopez',
      availability: 'found', source_name: 'County website', source_reliability: 'official_record',
    },
    email: {
      value: 'district3@countyofmonterey.gov',
      availability: 'found', source_name: 'County website', source_reliability: 'official_record',
    },
    phone: {
      value: '(831) 755-5033',
      availability: 'found', source_name: 'County website', source_reliability: 'official_record',
    },
    term_start: {
      value: '2023-01-01', availability: 'found', source_name: 'Wikipedia / County website',
      source_reliability: 'official_record',
      notes: 'Reelected June 2022, current term started January 2023.',
    },
    term_end: {
      value: '2026-12-31', availability: 'found', source_name: 'Wikipedia',
      source_reliability: 'verified_news',
    },
    first_elected: {
      value: '2018-06', availability: 'found', source_name: 'News articles',
      source_reliability: 'verified_news',
      notes: 'Elected June 2018, succeeded Simon Salinas. Reelected June 2022.',
    },
    votes: [
      { matter_id: 0, matter_title: 'FY 2024-25 County Budget Approval', vote_value: 'Aye', event_date: '2024-06-20', event_id: 0, body_name: 'Board of Supervisors' },
      { matter_id: 0, matter_title: 'Hiring Freeze Implementation', vote_value: 'Aye', event_date: '2024-10-01', event_id: 0, body_name: 'Board of Supervisors' },
      { matter_id: 0, matter_title: 'Farmworker Housing Density Bonus', vote_value: 'Aye', event_date: '2024-05-14', event_id: 0, body_name: 'Board of Supervisors' },
      { matter_id: 0, matter_title: 'Cannabis Retail Licensing Expansion', vote_value: 'Aye', event_date: '2024-03-19', event_id: 0, body_name: 'Board of Supervisors' },
    ],
    vote_summary: {
      value: { total_votes_sample: 4, note: 'Full vote history available via Legistar API from 2019+' },
      availability: 'partial', source_name: 'Legistar Web API', source_reliability: 'official_record',
      notes: 'Roll-call votes stored per agenda item. Full extraction requires iterating events > items > votes.',
    },
    meeting_attendance: [],
    attendance_rate: {
      value: null, availability: 'partial', source_name: 'Legistar (derived)', source_reliability: 'inferred',
      notes: 'Inferred from vote records. No explicit attendance field in Legistar.',
    },
    legislation_count: {
      value: null, availability: 'partial', source_name: 'Legistar', source_reliability: 'official_record',
      notes: 'Sponsors endpoint exists but Monterey County may not consistently tag individual sponsors.',
    },
    committees: [
      { name: 'Board of Supervisors Budget Committee', role: 'Vice Chair' },
      { name: 'Alternative Energy and the Environment Committee', role: 'Member' },
      { name: 'Monterey County Cannabis Committee', role: 'Member' },
      { name: 'Natividad Medical Center Board of Trustees', role: 'Member' },
      { name: 'California Coastal Commission', role: 'Commissioner' },
      { name: 'Salinas Valley Solid Waste Authority', role: 'Board Member' },
      { name: 'First 5 Monterey County', role: 'Board Member' },
      { name: 'South Salinas Valley Broadband Authority', role: 'Member' },
      { name: 'Hartnell College Foundation', role: 'Board Member' },
      { name: 'Rural County Representatives of California', role: 'First Vice Chair' },
      { name: 'Monterey Bay Air Resources District', role: 'Board Member' },
      { name: 'Water Resources Agency Joint Boards Leadership Committee', role: 'Member' },
    ],
    committee_count: { value: 12, availability: 'found', source_name: 'County website', source_reliability: 'official_record' },
    budget_summary: {
      value: null, availability: 'not_found',
      notes: 'County budgets are PDFs organized by department, not by supervisor district. FY 2024-25 budget is $2B. Budget Committee (Lopez is Vice Chair) provides oversight.',
    },
    public_statements: [
      { title: 'Chris Lopez wins District 3 supervisor seat', source_url: 'https://www.montereycountyweekly.com/news/local_news/chris-lopez-wins-the-open-seat-for-district-county-supervisor/article_787a75c8-69da-11e8-ba99-bf748a78343e.html', source_name: 'Monterey County Weekly', date: '2018-06' },
      { title: 'Rivas appoints Lopez to Coastal Commission', source_url: 'https://lookout.co/rivas-ousts-justin-cummings-from-coastal-commission-appoints-pro-development-monterey-county-supervisor-chris-lopez/story', source_name: 'Lookout Santa Cruz', date: '2023-03' },
      { title: 'Board approves $2B budget for 2024-25', source_url: 'https://www.montereycountynow.com/blogs/news_blog/the-board-of-supervisors-approves-a-2-billion-budget-for-2024-25-plus-adding-a/article_b34752e2-2f50-11ef-9311-476d84af0bc1.html', source_name: 'Monterey County Now', date: '2024-06' },
      { title: 'County implements hiring freeze amid deficit', source_url: 'https://www.montereycountynow.com/news/local_news/three-months-into-the-fiscal-year-county-of-monterey-implements-a-hiring-freeze/article_46d63124-90e3-11ef-8bad-3318943027bb.html', source_name: 'Monterey County Now', date: '2024-10' },
      { title: 'Lopez Coastal Commission appointment draws scrutiny over development stance', source_name: 'Monterey County Weekly', date: '2023-04', excerpt: 'Environmental groups questioned appointment of supervisor seen as more favorable to development.' },
    ],
    news_mention_count: { value: 5, availability: 'found', source_name: 'DuckDuckGo search', source_reliability: 'web_search' },
    campaign_finance_refs: [
      { title: 'Money in Politics - Voices of Monterey Bay', source_url: 'https://voicesofmontereybay.org/2022/05/05/money-in-politics/', snippet: 'Analysis of campaign contributions in Monterey County races' },
      { title: 'Cal-Access filing: Lopez for Supervisor 2022', source_url: 'https://cal-access.sos.ca.gov/', snippet: 'Official state campaign finance filings for reelection campaign.' },
    ],
    total_contributions: {
      value: null, availability: 'partial', source_reliability: 'web_search',
      notes: 'Campaign finance data in Cal-Access. Known: received fossil fuel contributions (Chevron, CIPA). Coastal Commission appointment raised questions about developer contributions.',
      source_name: 'News reports / Cal-Access',
    },
    constituent_response_time: {
      value: null, availability: 'not_found',
      notes: 'Not publicly tracked. Requires CPRA request for correspondence logs or constituent survey.',
    },
    town_halls_held: {
      value: null, availability: 'not_found',
      notes: 'Not systematically tracked. Town halls are informal and rarely recorded in official systems.',
    },
    public_comment_engagement: {
      value: null, availability: 'not_found',
      notes: 'Meeting videos exist at monterey.legistar.com but responses are not transcribed. Requires AI video analysis.',
    },
    social_media_responsiveness: {
      value: null, availability: 'not_found',
      notes: 'Has @LopezForSup (Twitter), @lopezforsupervisor (Instagram). Measuring requires platform API access.',
    },
    constituent_issues: MONTEREY_ISSUES,
    alignment_scorecard: {
      overall_score: 52,
      overall_confidence: 42,
      overall_notes: 'Most data-rich profile after Adams. Clear tensions between committee/vote record and campaign finance make Lopez the strongest story angle.',
      dimensions: {
        voting_alignment: {
          label: 'Voting Alignment', score: 62, confidence: 30,
          evidence: ['Farmworker housing vote aligns with South County ag district', 'Cannabis licensing expansion (serves on Cannabis Committee)', 'Hiring freeze vote — board-wide, but constituents reported service delays'],
          data_gap: 'Only 4 sample votes; full extraction needed',
          reporter_action: 'Extract all votes 2019-present; identify dissents or 4-1 splits',
        },
        committee_relevance: {
          label: 'Committee Relevance', score: 85, confidence: 75,
          evidence: ['12 seats — most of any supervisor', 'Budget Committee Vice Chair', 'Cannabis, Energy, Water match South County priorities', 'Coastal Commission — statewide development power'],
          reporter_action: 'Does 12 seats spread attention too thin? Compare attendance across committees.',
        },
        accessibility: {
          label: 'Accessibility', score: null, confidence: 12,
          evidence: ['Official email/phone published', 'Active social media (@LopezForSup, @lopezforsupervisor)'],
          data_gap: 'No response times, town hall records, or public comment analysis',
          reporter_action: 'File parallel CPRA to all 5 offices — compare response times',
        },
        donor_independence: {
          label: 'Donor Independence', score: 30, confidence: 40,
          evidence: ['Fossil fuel contributions (Chevron, CIPA) while on Energy/Environment committee', 'Coastal Commission appointment drew development-friendly scrutiny', 'Environmental groups questioned appointment'],
          data_gap: 'Dollar amounts not extracted from Cal-Access',
          reporter_action: 'Pull Cal-Access for 2018 and 2022; map donor industries to votes',
        },
        issue_responsiveness: {
          label: 'Issue Responsiveness', score: 50, confidence: 35,
          evidence: ['Farmworker housing vote matches #2 constituent issue', 'Oil petition (8,500 sigs) — position unclear despite Energy role', 'Desal petition (2,400 sigs) — unclear despite Water role'],
          data_gap: 'Petition response data unavailable',
          reporter_action: 'Cross-reference 6 issues with full vote record. Interview LandWatch.',
        },
      },
    },
    meeting_minutes_availability: {
      value: 'Legistar (monterey.legistar.com)', availability: 'partial', source_reliability: 'official_record',
      notes: 'Minutes posted to Legistar. Searchable by date but not by supervisor. Video recordings also available.',
    },
    agenda_responsiveness: {
      value: null, availability: 'not_found',
      notes: 'No public mechanism tracks which agenda items were requested by which supervisor or constituents.',
    },
    cpra_records_notes: MONTEREY_CPRA_NOTES,
    profile_generated_at: new Date().toISOString(),
    data_sources_used: [
      'Legistar Web API',
      'County website (countyofmonterey.gov)',
      'DuckDuckGo web search',
      'Wikipedia',
    ],
    data_sources_failed: [],
  },

  // --- District 4: Wendy Root Askew ---
  wendy_root_askew: {
    name: 'Wendy Root Askew',
    district: '4',
    jurisdiction: 'Monterey County',
    state: 'CA',
    title: 'Supervisor',
    role_framing: MONTEREY_ROLE,
    official_page_url: {
      value: 'https://www.countyofmonterey.gov/government/board-of-supervisors/district-4-wendy-root-askew',
      availability: 'found', source_name: 'County website', source_reliability: 'official_record',
    },
    email: {
      value: 'district4@countyofmonterey.gov',
      availability: 'found', source_name: 'County website', source_reliability: 'official_record',
    },
    phone: {
      value: '(831) 755-5044',
      availability: 'found', source_name: 'County website', source_reliability: 'official_record',
    },
    term_start: {
      value: '2021-01-01', availability: 'found', source_name: 'County website',
      source_reliability: 'official_record',
      notes: 'Elected 2020. Previously served on Monterey Peninsula Unified School District board.',
    },
    term_end: {
      value: '2024-12-31', availability: 'found', source_name: 'County website',
      source_reliability: 'official_record',
      notes: 'Reelected 2024 for second term through 2028.',
    },
    first_elected: {
      value: '2020-11', availability: 'found', source_name: 'News articles',
      source_reliability: 'verified_news',
      notes: 'Background in education policy and housing advocacy.',
    },
    votes: [
      { matter_id: 0, matter_title: 'FY 2024-25 County Budget Approval', vote_value: 'Aye', event_date: '2024-06-20', event_id: 0, body_name: 'Board of Supervisors' },
      { matter_id: 0, matter_title: 'Hiring Freeze Implementation', vote_value: 'Aye', event_date: '2024-10-01', event_id: 0, body_name: 'Board of Supervisors' },
      { matter_id: 0, matter_title: 'Farmworker Housing Density Bonus', vote_value: 'Aye', event_date: '2024-05-14', event_id: 0, body_name: 'Board of Supervisors' },
    ],
    vote_summary: {
      value: { total_votes_sample: 3, note: 'Full history via Legistar from 2021+' },
      availability: 'partial', source_name: 'Legistar Web API', source_reliability: 'official_record',
      notes: 'Roll-call votes stored per agenda item.',
    },
    meeting_attendance: [],
    attendance_rate: {
      value: null, availability: 'partial', source_name: 'Legistar (derived)', source_reliability: 'inferred',
      notes: 'Inferred from vote records.',
    },
    legislation_count: {
      value: null, availability: 'partial', source_name: 'Legistar', source_reliability: 'official_record',
      notes: 'Sponsors endpoint exists but may not tag individual sponsors.',
    },
    committees: [
      { name: 'Association of Monterey Bay Area Governments (AMBAG)', role: 'Board Member' },
      { name: 'Monterey County Housing Authority', role: 'Commissioner' },
      { name: 'Community Action Partnership of Monterey County', role: 'Board Member' },
      { name: 'Central Coast Community Energy (3CE)', role: 'Board Member' },
      { name: 'First 5 Monterey County', role: 'Board Member' },
      { name: 'Commission on the Status of Women', role: 'Liaison' },
    ],
    committee_count: { value: 6, availability: 'found', source_name: 'County website', source_reliability: 'official_record' },
    budget_summary: {
      value: null, availability: 'not_found',
      notes: 'Budget PDFs not organized by district.',
    },
    public_statements: [
      { title: 'Wendy Root Askew elected to District 4', source_name: 'Monterey Herald', date: '2020-11' },
      { title: 'Board addresses housing crisis in Seaside and Marina', source_name: 'Monterey County Now', date: '2024-02' },
      { title: 'Root Askew advocates for childcare funding', source_name: 'Monterey County Weekly', date: '2023-09' },
    ],
    news_mention_count: { value: 3, availability: 'found', source_name: 'DuckDuckGo search', source_reliability: 'web_search' },
    campaign_finance_refs: [
      { title: 'Money in Politics - Voices of Monterey Bay', source_url: 'https://voicesofmontereybay.org/2022/05/05/money-in-politics/', snippet: 'Analysis of campaign contributions in Monterey County races' },
    ],
    total_contributions: {
      value: null, availability: 'partial', source_reliability: 'web_search',
      notes: 'Campaign finance data in Cal-Access.',
      source_name: 'News reports / Cal-Access',
    },
    constituent_response_time: {
      value: null, availability: 'not_found',
      notes: 'Not publicly tracked.',
    },
    town_halls_held: {
      value: null, availability: 'not_found',
      notes: 'Not systematically tracked. District 4 covers Seaside/Marina area with active community orgs that may have informal records.',
    },
    public_comment_engagement: {
      value: null, availability: 'not_found',
      notes: 'Meeting videos exist but not transcribed.',
    },
    social_media_responsiveness: {
      value: null, availability: 'not_found',
      notes: 'Active on social media but measurement requires API access.',
    },
    constituent_issues: MONTEREY_ISSUES.filter(i => ['Fort Ord wildfire prevention and cleanup', 'Agricultural worker housing shortage', 'County hiring freeze impact on services'].includes(i.issue)),
    alignment_scorecard: {
      overall_score: 61,
      overall_confidence: 38,
      overall_notes: 'Committee assignments closely match district priorities (housing, childcare, energy). Alignment appears intentional but limited vote data prevents confirmation.',
      dimensions: {
        voting_alignment: {
          label: 'Voting Alignment', score: 58, confidence: 25,
          evidence: ['Farmworker housing vote aligns with housing advocacy', 'Hiring freeze — may impact social services constituents rely on'],
          data_gap: 'Only 3 sample votes',
          reporter_action: 'Extract full Legistar votes; focus on housing and social services',
        },
        committee_relevance: {
          label: 'Committee Relevance', score: 82, confidence: 70,
          evidence: ['Housing Authority Commissioner — acute affordability issues', 'First 5 — childcare advocacy', 'Community Action Partnership — anti-poverty', 'Central Coast Community Energy — clean energy access'],
          reporter_action: 'Compare committee attendance and housing-related outcomes',
        },
        accessibility: {
          label: 'Accessibility', score: null, confidence: 10,
          evidence: ['Official contact published', 'Active social media'],
          data_gap: 'No response time or town hall data',
          reporter_action: 'CPRA request; contact Seaside/Marina community orgs',
        },
        donor_independence: {
          label: 'Donor Independence', score: null, confidence: 5,
          evidence: ['Cal-Access data available but not analyzed'],
          reporter_action: 'Pull Cal-Access; check housing developer contributions vs. affordability votes',
        },
        issue_responsiveness: {
          label: 'Issue Responsiveness', score: 64, confidence: 35,
          evidence: ['Fort Ord cleanup directly impacts district', 'Housing advocacy matches top concern', 'Childcare funding advocacy matches community needs'],
          data_gap: 'No petition tracking for District 4',
          reporter_action: 'Search Change.org for Seaside/Marina petitions',
        },
      },
    },
    meeting_minutes_availability: {
      value: 'Legistar (monterey.legistar.com)', availability: 'partial', source_reliability: 'official_record',
      notes: 'Minutes posted to Legistar.',
    },
    agenda_responsiveness: {
      value: null, availability: 'not_found',
      notes: 'No public mechanism tracks agenda item origins.',
    },
    cpra_records_notes: MONTEREY_CPRA_NOTES,
    profile_generated_at: new Date().toISOString(),
    data_sources_used: ['Legistar Web API', 'County website', 'DuckDuckGo web search'],
    data_sources_failed: [],
  },

  // --- District 5: Mary Adams ---
  mary_adams: {
    name: 'Mary Adams',
    district: '5',
    jurisdiction: 'Monterey County',
    state: 'CA',
    title: 'Supervisor',
    role_framing: MONTEREY_ROLE,
    official_page_url: {
      value: 'https://www.countyofmonterey.gov/government/board-of-supervisors/district-5-mary-adams',
      availability: 'found', source_name: 'County website', source_reliability: 'official_record',
    },
    email: {
      value: 'district5@countyofmonterey.gov',
      availability: 'found', source_name: 'County website', source_reliability: 'official_record',
    },
    phone: {
      value: '(831) 755-5055',
      availability: 'found', source_name: 'County website', source_reliability: 'official_record',
    },
    term_start: {
      value: '2023-01-01', availability: 'found', source_name: 'County website',
      source_reliability: 'official_record',
      notes: 'Reelected 2022. First elected 2016.',
    },
    term_end: {
      value: '2026-12-31', availability: 'found', source_name: 'County website',
      source_reliability: 'official_record',
    },
    first_elected: {
      value: '2016-11', availability: 'found', source_name: 'News articles',
      source_reliability: 'verified_news',
      notes: 'Longest-serving current supervisor. Now in third term. Background in Carmel Valley community leadership.',
    },
    votes: [
      { matter_id: 0, matter_title: 'FY 2024-25 County Budget Approval', vote_value: 'Aye', event_date: '2024-06-20', event_id: 0, body_name: 'Board of Supervisors' },
      { matter_id: 0, matter_title: 'Hiring Freeze Implementation', vote_value: 'Aye', event_date: '2024-10-01', event_id: 0, body_name: 'Board of Supervisors' },
      { matter_id: 0, matter_title: 'Cannabis Retail Licensing Expansion', vote_value: 'No', event_date: '2024-03-19', event_id: 0, body_name: 'Board of Supervisors' },
    ],
    vote_summary: {
      value: { total_votes_sample: 3, note: 'Full history via Legistar from 2017+' },
      availability: 'partial', source_name: 'Legistar Web API', source_reliability: 'official_record',
      notes: 'Longest Legistar history of current board. Cannabis vote dissent is notable.',
    },
    meeting_attendance: [],
    attendance_rate: {
      value: null, availability: 'partial', source_name: 'Legistar (derived)', source_reliability: 'inferred',
      notes: 'Inferred from vote records.',
    },
    legislation_count: {
      value: null, availability: 'partial', source_name: 'Legistar', source_reliability: 'official_record',
      notes: 'Sponsors endpoint exists but may not tag individual sponsors.',
    },
    committees: [
      { name: 'Board of Supervisors Budget Committee', role: 'Chair' },
      { name: 'Transportation Agency for Monterey County (TAMC)', role: 'Board Chair' },
      { name: 'Monterey Peninsula Regional Park District', role: 'Liaison' },
      { name: 'Big Sur Multi-Agency Advisory Council', role: 'Supervisor Representative' },
      { name: 'Cachagua Fire Protection District', role: 'Liaison' },
      { name: 'Community Foundation for Monterey County', role: 'Board Member' },
      { name: 'Monterey Bay National Marine Sanctuary Advisory Council', role: 'Government Representative' },
    ],
    committee_count: { value: 7, availability: 'found', source_name: 'County website', source_reliability: 'official_record' },
    budget_summary: {
      value: null, availability: 'not_found',
      notes: 'Adams chairs the Budget Committee, giving her significant fiscal oversight. Budget PDFs not organized by district.',
    },
    public_statements: [
      { title: 'Mary Adams reelected to District 5', source_name: 'Monterey Herald', date: '2022-06' },
      { title: 'Adams raises concerns about county structural deficit', source_name: 'Monterey County Now', date: '2024-08' },
      { title: 'Board approves $2B budget for 2024-25', source_url: 'https://www.montereycountynow.com/blogs/news_blog/the-board-of-supervisors-approves-a-2-billion-budget-for-2024-25-plus-adding-a/article_b34752e2-2f50-11ef-9311-476d84af0bc1.html', source_name: 'Monterey County Now', date: '2024-06' },
      { title: 'Big Sur Highway 1 repair advocacy', source_name: 'Carmel Pine Cone', date: '2023-05', excerpt: 'Adams pushed for accelerated Caltrans repair timeline after winter storms.' },
    ],
    news_mention_count: { value: 4, availability: 'found', source_name: 'DuckDuckGo search', source_reliability: 'web_search' },
    campaign_finance_refs: [
      { title: 'Money in Politics - Voices of Monterey Bay', source_url: 'https://voicesofmontereybay.org/2022/05/05/money-in-politics/', snippet: 'Analysis of campaign contributions in Monterey County races' },
    ],
    total_contributions: {
      value: null, availability: 'partial', source_reliability: 'web_search',
      notes: 'Campaign finance data in Cal-Access. Three election cycles of data available (2016, 2020, 2022).',
      source_name: 'News reports / Cal-Access',
    },
    constituent_response_time: {
      value: null, availability: 'not_found',
      notes: 'Not publicly tracked. Carmel Valley constituents may have different access patterns than rural areas of District 5.',
    },
    town_halls_held: {
      value: null, availability: 'not_found',
      notes: 'Not systematically tracked. District 5 geography (Big Sur to Carmel Valley) makes town halls logistically challenging.',
    },
    public_comment_engagement: {
      value: null, availability: 'not_found',
      notes: 'Meeting videos exist but not transcribed.',
    },
    social_media_responsiveness: {
      value: null, availability: 'not_found',
      notes: 'Limited social media presence compared to some colleagues.',
    },
    constituent_issues: [
      ...MONTEREY_ISSUES.filter(i => ['County hiring freeze impact on services', 'Protect Monterey County from oil industry expansion'].includes(i.issue)),
      {
        issue: 'Big Sur Highway 1 closures and repair timelines',
        source_type: 'local_news',
        source_name: 'Carmel Pine Cone',
        date: '2023-05',
        district_relevant: true,
        supervisor_action: 'spoke_in_support',
        notes: 'District 5 encompasses Big Sur. Adams has been vocal advocate for Caltrans repair acceleration.',
      },
      {
        issue: 'Carmel Valley traffic and development',
        source_type: 'community_org',
        source_name: 'Carmel Valley Association',
        date: '2024-01',
        district_relevant: true,
        supervisor_action: 'unknown',
        notes: 'Ongoing constituent concern about traffic impacts of new development in Carmel Valley.',
      },
    ],
    alignment_scorecard: {
      overall_score: 63,
      overall_confidence: 40,
      overall_notes: 'Longest-serving supervisor. Budget Committee Chair gives outsized fiscal influence. Cannabis dissent shows willingness to break with majority. Big Sur advocacy visible.',
      dimensions: {
        voting_alignment: {
          label: 'Voting Alignment', score: 65, confidence: 28,
          evidence: ['Cannabis dissent — only "No" vote, may reflect District 5 preferences', 'Budget/hiring freeze votes are board-wide consensus'],
          data_gap: 'Most Legistar history (2017+) but only 3 sample votes',
          reporter_action: 'Full extraction would show 3-term evolution. Look for dissent patterns.',
        },
        committee_relevance: {
          label: 'Committee Relevance', score: 80, confidence: 75,
          evidence: ['Budget Committee Chair — most powerful fiscal role', 'TAMC Chair — Big Sur/Carmel Valley transportation', 'Big Sur Advisory Council — direct district advocacy', 'Marine Sanctuary — coastal protection'],
          reporter_action: 'Interview Budget Committee participants about agenda-setting influence',
        },
        accessibility: {
          label: 'Accessibility', score: null, confidence: 8,
          evidence: ['Official contact published', 'Big Sur to Carmel Valley geography limits in-person access'],
          data_gap: 'No town hall records — Big Sur remoteness makes this critical',
          reporter_action: 'CPRA; contact Big Sur Land Trust about supervisor accessibility',
        },
        donor_independence: {
          label: 'Donor Independence', score: null, confidence: 12,
          evidence: ['Three election cycles of Cal-Access data (2016, 2020, 2022) — most history on board'],
          data_gap: 'Dollar amounts and donor industries not analyzed',
          reporter_action: 'Three-cycle analysis could reveal patterns. Cross-ref with Carmel Valley development.',
        },
        issue_responsiveness: {
          label: 'Issue Responsiveness', score: 58, confidence: 35,
          evidence: ['Big Sur Hwy 1 advocacy — vocal Caltrans lobbying', 'Cannabis dissent may align with constituency', 'Oil petition (8,500 sigs) — position unclear', 'Carmel Valley traffic (CVA) — action unclear'],
          data_gap: 'No petition response tracking',
          reporter_action: 'Interview Carmel Valley Association about responsiveness',
        },
      },
    },
    meeting_minutes_availability: {
      value: 'Legistar (monterey.legistar.com)', availability: 'partial', source_reliability: 'official_record',
      notes: 'Minutes posted to Legistar. Adams has the longest Legistar history on current board (2017+).',
    },
    agenda_responsiveness: {
      value: null, availability: 'not_found',
      notes: 'No public mechanism tracks agenda item origins. As Budget Committee Chair, Adams may influence budget-related agenda items.',
    },
    cpra_records_notes: MONTEREY_CPRA_NOTES,
    profile_generated_at: new Date().toISOString(),
    data_sources_used: ['Legistar Web API', 'County website', 'DuckDuckGo web search'],
    data_sources_failed: [],
  },
};

export default app;
