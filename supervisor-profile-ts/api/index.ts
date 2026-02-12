import express, { Request, Response } from 'express';
import cors from 'cors';
import { buildProfile } from '../src/profile-builder';
import { ResponsivenessProfile, DataPoint, DataAvailability } from '../src/types';

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

/**
 * POST /api/profile
 *
 * Build a responsiveness profile for a supervisor.
 *
 * Body: {
 *   name: string;           // e.g., "Chris Lopez"
 *   legistarClient: string; // e.g., "monterey"
 *   jurisdiction: string;   // e.g., "Monterey County"
 *   state: string;          // e.g., "CA"
 *   district?: string;      // e.g., "3"
 *   maxMeetings?: number;   // default 20
 * }
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
 * Returns a pre-built sample profile for Chris Lopez (Monterey County)
 * based on web research data, for demo/testing purposes.
 */
app.get('/api/profile/sample', (_req: Request, res: Response) => {
  res.json({ profile: SAMPLE_PROFILE, summary: summarize(SAMPLE_PROFILE) });
});

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
  ];

  for (const [name, dp] of dpFields) {
    counts[dp.availability]++;
    if (dp.availability === 'not_found' || dp.availability === 'partial') {
      gaps.push({ field: name, status: dp.availability, notes: dp.notes || '' });
    }
  }

  return { counts, gaps, total_fields: dpFields.length };
}

// --- Sample profile (pre-built from web research) ---
const SAMPLE_PROFILE: ResponsivenessProfile = {
  name: 'Chris Lopez',
  district: '3',
  jurisdiction: 'Monterey County',
  state: 'CA',
  title: 'Supervisor',
  official_page_url: {
    value: 'https://www.countyofmonterey.gov/government/board-of-supervisors/district-3-chris-lopez',
    availability: 'found', source_name: 'County website',
  },
  email: {
    value: 'district3@countyofmonterey.gov',
    availability: 'found', source_name: 'County website',
  },
  phone: {
    value: '(831) 755-5033',
    availability: 'found', source_name: 'County website',
  },
  term_start: {
    value: '2023-01-01', availability: 'found', source_name: 'Wikipedia / County website',
    notes: 'Reelected June 2022, current term started January 2023',
  },
  term_end: {
    value: '2026-12-31', availability: 'found', source_name: 'Wikipedia',
  },
  first_elected: {
    value: '2018-06', availability: 'found', source_name: 'News articles',
    notes: 'Elected June 2018, succeeded Simon Salinas. Reelected June 2022.',
  },
  votes: [
    { matter_id: 0, matter_title: 'FY 2024-25 County Budget Approval', vote_value: 'Aye', event_date: '2024-06-20', event_id: 0, body_name: 'Board of Supervisors' },
    { matter_id: 0, matter_title: 'Hiring Freeze Implementation', vote_value: 'Aye', event_date: '2024-10-01', event_id: 0, body_name: 'Board of Supervisors' },
  ],
  vote_summary: {
    value: { total_votes_sample: 2, note: 'Full vote history available via Legistar API from 2019+' },
    availability: 'partial', source_name: 'Legistar Web API',
    notes: 'Roll-call votes stored per agenda item. Full extraction requires iterating events > items > votes.',
  },
  meeting_attendance: [],
  attendance_rate: {
    value: null, availability: 'partial', source_name: 'Legistar (derived)',
    notes: 'Inferred from vote records. No explicit attendance field in Legistar.',
  },
  legislation_count: {
    value: null, availability: 'partial', source_name: 'Legistar',
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
  committee_count: { value: 12, availability: 'found', source_name: 'County website' },
  budget_summary: {
    value: null, availability: 'not_found',
    notes: 'County budgets are PDFs organized by department, not by supervisor district. FY 2024-25 budget is $2B. Budget Committee (Lopez is Vice Chair) provides oversight.',
  },
  public_statements: [
    { title: 'Chris Lopez wins District 3 supervisor seat', source_url: 'https://www.montereycountyweekly.com/news/local_news/chris-lopez-wins-the-open-seat-for-district-county-supervisor/article_787a75c8-69da-11e8-ba99-bf748a78343e.html', source_name: 'Monterey County Weekly' },
    { title: 'Rivas appoints Lopez to Coastal Commission', source_url: 'https://lookout.co/rivas-ousts-justin-cummings-from-coastal-commission-appoints-pro-development-monterey-county-supervisor-chris-lopez/story', source_name: 'Lookout Santa Cruz' },
    { title: 'Board approves $2B budget for 2024-25', source_url: 'https://www.montereycountynow.com/blogs/news_blog/the-board-of-supervisors-approves-a-2-billion-budget-for-2024-25-plus-adding-a/article_b34752e2-2f50-11ef-9311-476d84af0bc1.html', source_name: 'Monterey County Now' },
    { title: 'County implements hiring freeze amid deficit', source_url: 'https://www.montereycountynow.com/news/local_news/three-months-into-the-fiscal-year-county-of-monterey-implements-a-hiring-freeze/article_46d63124-90e3-11ef-8bad-3318943027bb.html', source_name: 'Monterey County Now' },
  ],
  news_mention_count: { value: 4, availability: 'found', source_name: 'DuckDuckGo search' },
  campaign_finance_refs: [
    { title: 'Money in Politics - Voices of Monterey Bay', source_url: 'https://voicesofmontereybay.org/2022/05/05/money-in-politics/', snippet: 'Analysis of campaign contributions in Monterey County races' },
  ],
  total_contributions: {
    value: null, availability: 'partial',
    notes: 'Campaign finance data in Cal-Access. Known: received fossil fuel contributions (Chevron, CIPA).',
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
  profile_generated_at: new Date().toISOString(),
  data_sources_used: [
    'Legistar Web API',
    'County website (countyofmonterey.gov)',
    'DuckDuckGo web search',
    'Wikipedia',
  ],
  data_sources_failed: [],
};

export default app;
