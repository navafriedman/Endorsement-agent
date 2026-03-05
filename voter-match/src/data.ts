import type { Issue, IdentityGroup, Race } from './types';

export const ISSUES: Issue[] = [
  { id: 'immigration', label: 'Immigration', icon: '🌎' },
  { id: 'education', label: 'Education', icon: '📚' },
  { id: 'healthcare', label: 'Healthcare', icon: '🏥' },
  { id: 'housing', label: 'Housing', icon: '🏠' },
  { id: 'criminal_justice', label: 'Criminal Justice', icon: '⚖' },
  { id: 'economy', label: 'Economy & Jobs', icon: '💰' },
  { id: 'environment', label: 'Environment', icon: '🌱' },
  { id: 'voting_rights', label: 'Voting Rights', icon: '🗳' },
  { id: 'gun_policy', label: 'Gun Policy', icon: '🔰' },
  { id: 'reproductive_rights', label: 'Reproductive Rights', icon: '⚕' },
  { id: 'lgbtq', label: 'LGBTQ+ Rights', icon: '🏳' },
  { id: 'budget', label: 'Budget & Taxes', icon: '📈' },
];

export const IDENTITY_GROUPS: IdentityGroup[] = [
  { id: 'teachers_union', label: 'Teachers Unions', icon: '📚', type: 'Labor' },
  { id: 'nurses_union', label: 'Nurses / Healthcare Workers', icon: '🩺', type: 'Labor' },
  { id: 'afl_cio', label: 'AFL-CIO', icon: '⚖', type: 'Labor' },
  { id: 'sierra_club', label: 'Sierra Club', icon: '🌳', type: 'Environmental' },
  { id: 'lwv', label: 'League of Women Voters', icon: '🗳', type: 'Civic' },
  { id: 'naacp', label: 'NAACP', icon: '✊', type: 'Civil Rights' },
  { id: 'lulac', label: 'LULAC', icon: '🌎', type: 'Civil Rights' },
  { id: 'planned_parenthood', label: 'Planned Parenthood', icon: '💙', type: 'Healthcare' },
  { id: 'emily_list', label: "EMILY's List", icon: '☆', type: 'Women' },
  { id: 'chamber_commerce', label: 'Chamber of Commerce', icon: '🏢', type: 'Business' },
  { id: 'nra', label: 'NRA', icon: '🔰', type: 'Gun Rights' },
  { id: 'texas_right_to_life', label: 'Texas Right to Life', icon: '✝', type: 'Pro-Life' },
  { id: 'fw_star_telegram', label: 'Star-Telegram Editorial', icon: '📰', type: 'Newspaper' },
  { id: 'texas_tribune', label: 'Texas Tribune', icon: '📰', type: 'Newspaper' },
];

export const ISSUE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  immigration:          { bg: '#dbeafe', text: '#1e40af', border: '#3b82f6' },
  education:            { bg: '#fef3c7', text: '#92400e', border: '#f59e0b' },
  healthcare:           { bg: '#d1fae5', text: '#065f46', border: '#10b981' },
  housing:              { bg: '#e0e7ff', text: '#3730a3', border: '#6366f1' },
  criminal_justice:     { bg: '#f3e8ff', text: '#6b21a8', border: '#a855f7' },
  economy:              { bg: '#fef3c7', text: '#78350f', border: '#d97706' },
  environment:          { bg: '#ccfbf1', text: '#134e4a', border: '#14b8a6' },
  voting_rights:        { bg: '#fce7f3', text: '#9d174d', border: '#ec4899' },
  gun_policy:           { bg: '#fee2e2', text: '#991b1b', border: '#ef4444' },
  reproductive_rights:  { bg: '#fce7f3', text: '#831843', border: '#db2777' },
  lgbtq:                { bg: '#ede9fe', text: '#5b21b6', border: '#8b5cf6' },
  budget:               { bg: '#e0f2fe', text: '#075985', border: '#0ea5e9' },
};

// Representative stances for each issue - these are the "position statements"
// a voter can agree or disagree with to determine alignment
export const ISSUE_STANCES: Record<string, { progressive: string; conservative: string }> = {
  immigration: {
    progressive: 'Create a pathway to citizenship for undocumented immigrants',
    conservative: 'Strengthen border enforcement and restrict illegal immigration',
  },
  education: {
    progressive: 'Increase public school funding and make college more affordable',
    conservative: 'Expand school choice with vouchers and parental curriculum rights',
  },
  healthcare: {
    progressive: 'Expand Medicaid and government health coverage',
    conservative: 'Reduce government involvement in healthcare, promote market solutions',
  },
  housing: {
    progressive: 'Invest in affordable housing and strengthen tenant protections',
    conservative: 'Reduce regulations to let the market increase housing supply',
  },
  criminal_justice: {
    progressive: 'Reform the justice system with diversion programs and bail reform',
    conservative: 'Increase law enforcement funding and oppose bail reform',
  },
  economy: {
    progressive: 'Raise the minimum wage and expand worker protections',
    conservative: 'Cut taxes and reduce regulations to grow the economy',
  },
  environment: {
    progressive: 'Transition to clean energy and invest in climate resilience',
    conservative: 'Balance environmental goals with energy independence and jobs',
  },
  voting_rights: {
    progressive: 'Expand voting access with more locations and automatic registration',
    conservative: 'Strengthen voter ID requirements to ensure election integrity',
  },
  gun_policy: {
    progressive: 'Require universal background checks and support red flag laws',
    conservative: 'Protect Second Amendment rights and oppose new gun regulations',
  },
  reproductive_rights: {
    progressive: 'Protect abortion access and oppose state restrictions',
    conservative: 'Restrict or ban abortion to protect unborn life',
  },
  lgbtq: {
    progressive: 'Pass anti-discrimination protections for LGBTQ+ individuals',
    conservative: 'Protect religious liberty and parental rights on these issues',
  },
  budget: {
    progressive: 'Invest in public services and infrastructure, even if it means higher taxes',
    conservative: 'Cut government spending and reduce taxes',
  },
};

export const RACES: Race[] = [
  {
    id: 'us_senate_tx',
    name: 'U.S. Senate',
    position: 'US Senator',
    type: 'federal',
    candidates: [
      {
        name: 'Jasmine Crockett',
        party: 'Democratic',
        incumbent: false,
        initials: 'JC',
        issues: {
          immigration: { position: 'Supports pathway to citizenship for undocumented immigrants; opposes border wall expansion', source: 'Campaign website', stances: ['Pathway to citizenship', 'Opposes border wall'] },
          education: { position: 'Advocates for increased public school funding, student debt relief, universal pre-K', source: 'Legislative record (TX House)', stances: ['Public school funding', 'Student debt relief', 'Universal pre-K'] },
          healthcare: { position: 'Supports expanding Medicaid in Texas, lowering prescription drug costs', source: 'Campaign website', stances: ['Expand Medicaid', 'Lower Rx costs'] },
          criminal_justice: { position: 'Led criminal justice reform bills in TX House; supports ending cash bail', source: 'TX Legislature voting record', stances: ['CJ reform bills', 'End cash bail'] },
          economy: { position: 'Supports raising federal minimum wage, small business tax credits', source: 'Campaign platform', stances: ['Raise minimum wage', 'Small biz tax credits'] },
          reproductive_rights: { position: 'Pro-choice; opposes Texas abortion restrictions; supports restoring Roe protections', source: 'Public statements', stances: ['Pro-choice', 'Restore Roe'] },
          voting_rights: { position: 'Authored voting access legislation in TX House; opposes voter ID restrictions', source: 'Legislative record', stances: ['Voting access bills', 'Opposes voter ID'] },
          gun_policy: { position: 'Supports universal background checks and red flag laws', source: 'Campaign website', stances: ['Background checks', 'Red flag laws'] },
          lgbtq: { position: 'Supports Equality Act and anti-discrimination protections', source: 'Public statements', stances: ['Equality Act', 'Anti-discrimination'] },
          housing: { position: 'Supports federal affordable housing investment and renter protections', source: 'Campaign platform', stances: ['Affordable housing', 'Renter protections'] },
        },
        endorsements: ['naacp', 'emily_list', 'teachers_union', 'afl_cio', 'planned_parenthood', 'lwv'],
      },
      {
        name: 'James Talarico',
        party: 'Democratic',
        incumbent: false,
        initials: 'JT',
        issues: {
          education: { position: 'Former teacher; championed public school funding and teacher pay raises in TX House', source: 'Legislative record (TX House)', stances: ['Public school funding', 'Teacher pay raises'] },
          healthcare: { position: 'Supports Medicaid expansion and mental health funding', source: 'Campaign website', stances: ['Medicaid expansion', 'Mental health funding'] },
          immigration: { position: 'Supports comprehensive immigration reform with earned legalization', source: 'Campaign website', stances: ['Immigration reform', 'Earned legalization'] },
          environment: { position: 'Supports clean energy transition and grid reliability investments', source: 'Legislative record', stances: ['Clean energy', 'Grid reliability'] },
          economy: { position: 'Focus on workforce development, community college investment', source: 'Campaign platform', stances: ['Workforce development', 'Community colleges'] },
          gun_policy: { position: 'Supports raising age to purchase firearms, universal background checks', source: 'TX Legislature voting record', stances: ['Raise purchase age', 'Background checks'] },
          reproductive_rights: { position: 'Pro-choice; opposes state abortion restrictions', source: 'Public statements', stances: ['Pro-choice', 'Opposes restrictions'] },
          voting_rights: { position: 'Supports automatic voter registration and expanded early voting', source: 'Campaign website', stances: ['Auto registration', 'Expanded early voting'] },
          housing: { position: 'Supports affordable housing tax credits and anti-displacement measures', source: 'Campaign platform', stances: ['Housing tax credits', 'Anti-displacement'] },
        },
        endorsements: ['teachers_union', 'sierra_club', 'lwv', 'planned_parenthood'],
      },
    ],
  },
  {
    id: 'tarrant_county_judge',
    name: 'Tarrant County Judge',
    position: 'County Judge',
    type: 'local',
    candidates: [
      {
        name: "Tim O'Hare",
        party: 'Republican',
        incumbent: true,
        initials: 'TO',
        issues: {
          immigration: { position: 'Championed local anti-illegal-immigration ordinances; supports stricter enforcement', source: 'County records, news coverage', stances: ['Anti-immigration ordinances', 'Stricter enforcement'] },
          budget: { position: 'Cut county budget, reduced property tax rate', source: 'Tarrant County budget records', stances: ['Cut budget', 'Reduced tax rate'] },
          criminal_justice: { position: 'Supports law enforcement funding increases; opposes bail reform', source: 'Public statements', stances: ['Fund law enforcement', 'Opposes bail reform'] },
          education: { position: 'Supports school choice and parental rights in curriculum', source: 'Public statements', stances: ['School choice', 'Parental rights'] },
          lgbtq: { position: 'Opposed library materials with LGBTQ+ content; supported restrictions', source: 'County meeting minutes', stances: ['Library restrictions'] },
          gun_policy: { position: 'Strong Second Amendment supporter; opposes new gun regulations', source: 'NRA endorsement', stances: ['2A supporter', 'Opposes gun regs'] },
        },
        endorsements: ['nra', 'texas_right_to_life', 'chamber_commerce'],
      },
      {
        name: 'Robert Buker',
        party: 'Republican',
        incumbent: false,
        initials: 'RB',
        issues: {
          budget: { position: 'Promises fiscal responsibility, transparent county spending', source: 'Campaign website', stances: ['Fiscal responsibility', 'Transparency'] },
          criminal_justice: { position: 'Supports law enforcement; focus on reducing property crime', source: 'Campaign platform', stances: ['Fund police', 'Reduce property crime'] },
          housing: { position: 'Wants to streamline permitting to increase housing supply', source: 'Campaign website', stances: ['Streamline permits', 'More housing'] },
        },
        endorsements: [],
      },
      {
        name: 'Lydia Bean',
        party: 'Democratic',
        incumbent: false,
        initials: 'LB',
        issues: {
          healthcare: { position: 'Supports county health programs expansion, mental health services', source: 'Campaign website', stances: ['Expand health programs', 'Mental health'] },
          housing: { position: 'Advocates for affordable housing investment and tenant protections', source: 'Campaign platform', stances: ['Affordable housing', 'Tenant protections'] },
          criminal_justice: { position: 'Supports diversion programs and mental health courts', source: 'Campaign website', stances: ['Diversion programs', 'Mental health courts'] },
          education: { position: 'Supports public school funding, opposes book bans', source: 'Public statements', stances: ['Public school funding', 'Opposes book bans'] },
          budget: { position: 'Wants increased transparency in county spending; supports investing in infrastructure', source: 'Campaign platform', stances: ['Transparency', 'Infrastructure investment'] },
          environment: { position: 'Supports county climate resilience planning', source: 'Campaign website', stances: ['Climate resilience'] },
          voting_rights: { position: 'Supports expanded early voting locations in Tarrant County', source: 'Campaign platform', stances: ['More early voting'] },
        },
        endorsements: ['lwv', 'teachers_union', 'sierra_club'],
      },
    ],
  },
  {
    id: 'tarrant_commissioner_p1',
    name: 'Tarrant County Commissioner, Pct. 1',
    position: 'County Commissioner',
    type: 'local',
    candidates: [
      {
        name: 'Alisa Simmons',
        party: 'Democratic',
        incumbent: true,
        initials: 'AS',
        issues: {
          healthcare: { position: 'Expanded county health services; supported JPS Hospital funding', source: 'County voting record', stances: ['Expand health services', 'JPS Hospital funding'] },
          housing: { position: 'Championed affordable housing initiatives in Precinct 1', source: 'Commissioner office records', stances: ['Affordable housing'] },
          budget: { position: 'Voted for infrastructure investments; supports progressive revenue', source: 'County budget votes', stances: ['Infrastructure', 'Progressive revenue'] },
          criminal_justice: { position: 'Supports re-entry programs and community-based safety', source: 'Public statements', stances: ['Re-entry programs', 'Community safety'] },
        },
        endorsements: ['naacp', 'afl_cio', 'lwv'],
      },
      {
        name: 'Tony Tinderholt',
        party: 'Republican',
        incumbent: false,
        initials: 'TT',
        issues: {
          budget: { position: 'Wants to cut county spending; opposes tax increases', source: 'Campaign website', stances: ['Cut spending', 'No tax increases'] },
          immigration: { position: 'Former state rep who authored strict immigration enforcement bills', source: 'TX Legislature record', stances: ['Strict enforcement'] },
          gun_policy: { position: 'Authored constitutional carry legislation in TX House', source: 'Legislative record', stances: ['Constitutional carry'] },
          criminal_justice: { position: 'Supports increased law enforcement funding', source: 'Campaign platform', stances: ['Fund law enforcement'] },
          reproductive_rights: { position: 'Authored bill to criminalize abortion with no exceptions', source: 'TX Legislature record', stances: ['Criminalize abortion'] },
        },
        endorsements: ['nra', 'texas_right_to_life'],
      },
    ],
  },
  {
    id: 'tarrant_district_clerk',
    name: 'Tarrant County District Clerk',
    position: 'District Clerk',
    type: 'local',
    candidates: [
      {
        name: 'Phil Sorrells',
        party: 'Republican',
        incumbent: true,
        initials: 'PS',
        issues: {
          criminal_justice: { position: 'Modernized case filing systems; reduced processing backlogs', source: 'Office records', stances: ['Modernized filing', 'Reduced backlogs'] },
          budget: { position: 'Reduced office operating costs while maintaining services', source: 'County budget reports', stances: ['Cut costs', 'Maintained services'] },
        },
        endorsements: ['fw_star_telegram'],
      },
      {
        name: 'Tiffany Burks',
        party: 'Democratic',
        incumbent: false,
        initials: 'TB',
        issues: {
          criminal_justice: { position: 'Wants to improve public access to court records, reduce wait times', source: 'Campaign website', stances: ['Public access', 'Reduce wait times'] },
          voting_rights: { position: 'Supports making jury selection more representative of community demographics', source: 'Campaign platform', stances: ['Representative juries'] },
        },
        endorsements: ['naacp'],
      },
    ],
  },
  {
    id: 'tarrant_county_clerk',
    name: 'Tarrant County Clerk',
    position: 'County Clerk',
    type: 'local',
    candidates: [
      {
        name: 'Tom Wilder',
        party: 'Republican',
        incumbent: true,
        initials: 'TW',
        issues: {
          budget: { position: 'Maintained efficient operations; digitized many county records', source: 'Office annual reports', stances: ['Efficient operations', 'Digitized records'] },
          voting_rights: { position: 'Managed county elections; implemented voter ID requirements', source: 'County records', stances: ['Voter ID requirements'] },
        },
        endorsements: ['chamber_commerce'],
      },
      {
        name: 'Nathan Smith',
        party: 'Democratic',
        incumbent: false,
        initials: 'NS',
        issues: {
          voting_rights: { position: 'Wants more polling locations, extended hours, multilingual support', source: 'Campaign website', stances: ['More polling sites', 'Extended hours', 'Multilingual'] },
          budget: { position: 'Supports investing in technology to improve county services', source: 'Campaign platform', stances: ['Tech investment'] },
        },
        endorsements: ['lulac', 'lwv'],
      },
    ],
  },
  {
    id: 'tx_house_90',
    name: 'Texas House District 90',
    position: 'State Representative',
    type: 'state',
    candidates: [
      {
        name: 'Ramon Romero Jr.',
        party: 'Democratic',
        incumbent: true,
        initials: 'RR',
        issues: {
          education: { position: 'Voted for public school funding increases; opposes voucher programs', source: 'TX Legislature voting record', stances: ['Public school funding', 'Opposes vouchers'] },
          healthcare: { position: 'Supports Medicaid expansion for Texas', source: 'Legislative record', stances: ['Medicaid expansion'] },
          immigration: { position: 'Opposes SB4-style enforcement bills; supports immigrant communities', source: 'Voting record', stances: ['Opposes SB4', 'Supports immigrants'] },
          economy: { position: 'Supports small business grants and workforce training for District 90', source: 'Office records', stances: ['Small biz grants', 'Workforce training'] },
          housing: { position: 'Authored bill for property tax relief for elderly homeowners', source: 'Legislative record', stances: ['Property tax relief'] },
        },
        endorsements: ['lulac', 'teachers_union', 'afl_cio'],
      },
    ],
  },
  {
    id: 'tx_house_95',
    name: 'Texas House District 95',
    position: 'State Representative',
    type: 'state',
    candidates: [
      {
        name: 'Nicole Collier',
        party: 'Democratic',
        incumbent: true,
        initials: 'NC',
        issues: {
          criminal_justice: { position: 'Chairs Criminal Jurisprudence committee; led bail reform and re-entry legislation', source: 'TX Legislature committee records', stances: ['Chairs CJ committee', 'Bail reform', 'Re-entry legislation'] },
          education: { position: 'Supports increased teacher pay and public school funding', source: 'Voting record', stances: ['Teacher pay', 'Public school funding'] },
          healthcare: { position: 'Supports expanding access to mental health services', source: 'Legislative record', stances: ['Mental health access'] },
          gun_policy: { position: 'Supports background check requirements and safe storage laws', source: 'Voting record', stances: ['Background checks', 'Safe storage'] },
          voting_rights: { position: 'Opposed restrictive voting bills; supports expanded access', source: 'Legislative record', stances: ['Opposes restrictions', 'Expanded access'] },
        },
        endorsements: ['naacp', 'emily_list', 'planned_parenthood', 'teachers_union'],
      },
    ],
  },
];
