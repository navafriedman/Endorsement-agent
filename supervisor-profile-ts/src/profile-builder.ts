/**
 * Builds a ResponsivenessProfile by pulling from multiple public sources:
 *
 * 1. Legistar Web API — meetings, votes, legislation, persons, bodies
 * 2. County website — bio, contact info, committee assignments (HTML scrape)
 * 3. DuckDuckGo search — news mentions, campaign finance references
 *
 * Each field is wrapped in a DataPoint tracking availability and source.
 */

import { LegistarClient } from './legistar';
import {
  ResponsivenessProfile,
  VoteRecord,
  MeetingAttendance,
  CommitteeAssignment,
  PublicStatement,
  CampaignFinanceRef,
  DataPoint,
  dp,
  emptyProfile,
} from './types';

export interface BuildOptions {
  name: string;
  legistarClient: string;
  jurisdiction: string;
  state: string;
  district?: string;
  maxMeetings?: number;
}

export async function buildProfile(opts: BuildOptions): Promise<ResponsivenessProfile> {
  const { name, legistarClient, jurisdiction, state, district } = opts;
  const maxMeetings = opts.maxMeetings ?? 20;

  const profile = emptyProfile(name, jurisdiction, state, district);
  const log = (msg: string) => console.log(`  [profile-builder] ${msg}`);

  // --- 1. Legistar data ---
  log('Querying Legistar API...');
  try {
    const lc = new LegistarClient(legistarClient);

    // Find person
    const person = await lc.findPerson(name);
    if (!person) {
      log(`Person "${name}" not found in Legistar`);
      profile.data_sources_failed.push('Legistar persons (name not found)');
    } else {
      const personId = person.PersonId;
      log(`Found: ${person.PersonFullName} (ID: ${personId})`);
      profile.data_sources_used.push('Legistar Web API');

      if (person.PersonEmail) {
        profile.email = dp(person.PersonEmail, { source_name: 'Legistar' });
      }
      if (person.PersonPhone) {
        profile.phone = dp(person.PersonPhone, { source_name: 'Legistar' });
      }

      // Find Board of Supervisors body
      const bodies = await lc.getBodies();
      const bosBody = bodies.find(b =>
        (b.BodyName || '').toLowerCase().includes('board of supervisor')
      );
      if (bosBody) {
        log(`Board body: ${bosBody.BodyName} (ID: ${bosBody.BodyId})`);
      }

      // Collect committee assignments from bodies
      const committees: CommitteeAssignment[] = [];
      for (const body of bodies) {
        // We can't easily tell membership from the bodies list alone,
        // but we record them as discoverable bodies
        if (body.BodyTypeName && body.BodyTypeName !== 'Primary Legislative Body') {
          committees.push({
            name: body.BodyName,
            body_type: body.BodyTypeName,
          });
        }
      }

      // Get recent events
      const events = await lc.getEvents({
        bodyId: bosBody?.BodyId,
      });
      const recentEvents = events.slice(0, maxMeetings);
      log(`Found ${events.length} total events, scanning ${recentEvents.length}...`);

      // Process events for votes and attendance
      let totalMeetings = 0;
      let attended = 0;
      const votes: VoteRecord[] = [];
      const attendance: MeetingAttendance[] = [];

      for (const event of recentEvents) {
        totalMeetings++;
        let personPresent = false;

        try {
          const items = await lc.getEventItems(event.EventId);

          for (const item of items) {
            if (!item.EventItemId) continue;
            try {
              const itemVotes = await lc.getEventItemVotes(item.EventItemId);
              for (const v of itemVotes) {
                if (v.VotePersonId === personId) {
                  personPresent = true;
                  votes.push({
                    matter_id: item.EventItemMatterId ?? 0,
                    matter_file: item.EventItemMatterFile,
                    matter_title: item.EventItemTitle || 'Unknown',
                    vote_value: v.VoteValueName || 'Unknown',
                    event_date: (event.EventDate || '').slice(0, 10),
                    event_id: event.EventId,
                    body_name: event.EventBodyName,
                  });
                }
              }
            } catch { /* skip item */ }
          }
        } catch { /* skip event */ }

        if (personPresent) attended++;
        attendance.push({
          event_id: event.EventId,
          event_date: (event.EventDate || '').slice(0, 10),
          body_name: event.EventBodyName || 'Unknown',
          present: personPresent,
        });
      }

      profile.votes = votes;
      profile.meeting_attendance = attendance;

      if (totalMeetings > 0) {
        const rate = Math.round((attended / totalMeetings) * 1000) / 10;
        profile.attendance_rate = dp(rate, {
          source_name: 'Legistar (derived)',
          notes: `${attended}/${totalMeetings} meetings (inferred from vote records)`,
        });
        profile.vote_summary = dp(
          { total_votes: votes.length, meetings_scanned: totalMeetings },
          { source_name: 'Legistar' },
        );
      }

      log(`Votes: ${votes.length}, Attendance: ${attended}/${totalMeetings}`);

      // We don't set committees from bodies alone (can't confirm membership),
      // but we note that bodies are discoverable
      profile.committee_count = dp(null, {
        availability: 'partial',
        source_name: 'Legistar bodies',
        notes: `${bodies.length} bodies found in Legistar. Membership per-person requires county website or manual review.`,
      });
    }
  } catch (e: any) {
    log(`Legistar error: ${e.message}`);
    profile.data_sources_failed.push(`Legistar API (${e.message})`);
  }

  // --- 2. County website ---
  log('Scraping county website...');
  try {
    const countyData = await scrapeCountyWebsite(name, jurisdiction, state, district);
    if (countyData.officialUrl) {
      profile.official_page_url = dp(countyData.officialUrl, { source_name: 'County website' });
    }
    if (countyData.email && profile.email.availability !== 'found') {
      profile.email = dp(countyData.email, { source_name: 'County website', source_url: countyData.officialUrl });
    }
    if (countyData.phone && profile.phone.availability !== 'found') {
      profile.phone = dp(countyData.phone, { source_name: 'County website', source_url: countyData.officialUrl });
    }
    if (countyData.committees.length > 0) {
      profile.committees = countyData.committees;
      profile.committee_count = dp(countyData.committees.length, {
        source_name: 'County website',
        source_url: countyData.officialUrl,
      });
    }
    if (countyData.officialUrl) {
      profile.data_sources_used.push(`County website (${countyData.officialUrl})`);
    }
  } catch (e: any) {
    log(`County website error: ${e.message}`);
    profile.data_sources_failed.push('County website');
  }

  // --- 3. News search ---
  log('Searching for news mentions...');
  try {
    const newsResults = await searchNews(name, jurisdiction);
    const seen = new Set<string>();
    const unique: PublicStatement[] = [];
    for (const r of newsResults) {
      if (!seen.has(r.source_url || '')) {
        seen.add(r.source_url || '');
        unique.push(r);
      }
    }
    profile.public_statements = unique;
    profile.news_mention_count = dp(unique.length, {
      source_name: 'DuckDuckGo search',
      notes: `${unique.length} unique web results`,
    });
    if (unique.length > 0) profile.data_sources_used.push('DuckDuckGo web search');
    log(`News mentions: ${unique.length}`);
  } catch (e: any) {
    log(`News search error: ${e.message}`);
    profile.data_sources_failed.push('DuckDuckGo search');
  }

  // --- 4. Campaign finance search ---
  log('Searching campaign finance...');
  try {
    const financeResults = await searchCampaignFinance(name, jurisdiction, state);
    profile.campaign_finance_refs = financeResults;
    if (financeResults.length > 0) {
      profile.total_contributions = dp(null, {
        availability: 'partial',
        source_name: 'Web search (references only)',
        notes: `Found ${financeResults.length} web results. Actual dollar amounts require parsing Cal-Access or FPPC filings.`,
      });
      profile.data_sources_used.push('DuckDuckGo search (campaign finance)');
    }
    log(`Finance refs: ${financeResults.length}`);
  } catch (e: any) {
    log(`Finance search error: ${e.message}`);
  }

  // --- Mark known-unavailable fields ---
  markUnavailableFields(profile);

  profile.profile_generated_at = new Date().toISOString();
  return profile;
}

// --- County website scraper ---

interface CountyData {
  officialUrl?: string;
  email?: string;
  phone?: string;
  committees: CommitteeAssignment[];
}

async function scrapeCountyWebsite(
  name: string, jurisdiction: string, state: string, district?: string
): Promise<CountyData> {
  const slug = name.toLowerCase().replace(/\s+/g, '-');
  const countySlug = jurisdiction.toLowerCase().replace(/\s*county\s*/i, '').replace(/\s+/g, '');
  const result: CountyData = { committees: [] };

  const urls = [
    `https://www.countyof${countySlug}.gov/government/board-of-supervisors/district-${district}-${slug}`,
    `https://www.countyof${countySlug}.gov/government/board-of-supervisors`,
  ];

  for (const url of urls) {
    try {
      const resp = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; SupervisorProfileBot/0.1)',
          Accept: 'text/html',
        },
        signal: AbortSignal.timeout(10000),
      });
      if (!resp.ok) continue;

      const html = await resp.text();
      result.officialUrl = url;

      // Extract email
      const emailMatch = html.match(/mailto:([^"'\s]+)/i);
      if (emailMatch) result.email = emailMatch[1];

      // Extract phone
      const phoneMatch = html.match(/tel:([^"'\s]+)/i);
      if (phoneMatch) result.phone = phoneMatch[1];

      // Extract committee names from text content
      const committeePattern = /(?:committee|commission|board|authority|council)\b[^<]{5,80}/gi;
      const matches = html.match(committeePattern) || [];
      const seen = new Set<string>();
      for (const m of matches) {
        // Strip HTML tags and clean
        const clean = m.replace(/<[^>]+>/g, '').trim();
        if (clean.length > 10 && clean.length < 100 && !seen.has(clean.toLowerCase())) {
          seen.add(clean.toLowerCase());
          let role: string | undefined;
          if (/chair/i.test(clean)) role = 'Chair';
          else if (/vice/i.test(clean)) role = 'Vice Chair';
          result.committees.push({ name: clean, role, source_url: url });
        }
      }

      break; // success, no need to try next URL
    } catch {
      continue;
    }
  }

  return result;
}

// --- DuckDuckGo news search ---

async function searchDuckDuckGo(query: string, maxResults = 10): Promise<Array<{ title: string; url: string; snippet: string }>> {
  const encoded = encodeURIComponent(query);
  const ddgUrl = `https://html.duckduckgo.com/html/?q=${encoded}`;

  const resp = await fetch(ddgUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SupervisorProfileBot/0.1)' },
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) throw new Error(`DuckDuckGo returned ${resp.status}`);

  const html = await resp.text();
  const results: Array<{ title: string; url: string; snippet: string }> = [];

  // Parse results from DDG HTML
  const resultBlocks = html.split('class="result ');
  for (let i = 1; i < resultBlocks.length && results.length < maxResults; i++) {
    const block = resultBlocks[i];

    // Extract title
    const titleMatch = block.match(/class="result__title"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/);
    const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';

    // Extract URL (DDG uses redirect URLs with uddg= param)
    const urlMatch = block.match(/uddg=([^&"]+)/);
    const actualUrl = urlMatch ? decodeURIComponent(urlMatch[1]) : '';

    // Extract snippet
    const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/[atd]/);
    const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, '').trim() : '';

    if (title && actualUrl && actualUrl.startsWith('http')) {
      results.push({ title, url: actualUrl, snippet });
    }
  }

  return results;
}

async function searchNews(name: string, jurisdiction: string): Promise<PublicStatement[]> {
  const queries = [
    `"${name}" ${jurisdiction} supervisor`,
    `"${name}" ${jurisdiction} county board`,
  ];

  const statements: PublicStatement[] = [];
  for (const q of queries) {
    try {
      const results = await searchDuckDuckGo(q, 10);
      for (const r of results) {
        statements.push({
          title: r.title,
          source_url: r.url,
          excerpt: r.snippet,
        });
      }
    } catch { /* search failed, continue */ }
    await new Promise(r => setTimeout(r, 1000)); // rate limit
  }
  return statements;
}

async function searchCampaignFinance(name: string, jurisdiction: string, state: string): Promise<CampaignFinanceRef[]> {
  const queries = [
    `"${name}" campaign contributions ${jurisdiction}`,
    `"${name}" campaign finance ${state}`,
  ];

  const refs: CampaignFinanceRef[] = [];
  for (const q of queries) {
    try {
      const results = await searchDuckDuckGo(q, 5);
      for (const r of results) {
        refs.push({ title: r.title, source_url: r.url, snippet: r.snippet });
      }
    } catch { /* skip */ }
    await new Promise(r => setTimeout(r, 1000));
  }

  // Deduplicate
  const seen = new Set<string>();
  return refs.filter(r => {
    if (seen.has(r.source_url)) return false;
    seen.add(r.source_url);
    return true;
  });
}

// --- Mark known-unavailable fields ---

function markUnavailableFields(profile: ResponsivenessProfile) {
  if (profile.term_start.availability !== 'found') {
    profile.term_start = dp(null, {
      notes: 'Term dates are sometimes on the county website bio page or Wikipedia. Not available via Legistar API.',
    });
  }
  if (profile.term_end.availability !== 'found') {
    profile.term_end = dp(null, { notes: 'See term_start notes.' });
  }
  if (profile.first_elected.availability !== 'found') {
    profile.first_elected = dp(null, { notes: 'Available via news search or Wikipedia, not structured data.' });
  }

  profile.constituent_response_time = dp(null, {
    notes: 'Not publicly tracked. Requires CPRA request for correspondence logs, or a constituent survey.',
  });
  profile.town_halls_held = dp(null, {
    notes: 'Not systematically tracked in any public database. Could be partially inferred from Legistar special meeting types or social media.',
  });
  profile.public_comment_engagement = dp(null, {
    notes: 'Meeting videos exist but supervisor responses to public comments are not transcribed. Requires AI video analysis.',
  });
  profile.social_media_responsiveness = dp(null, {
    notes: 'Requires platform API access (increasingly restricted) or manual monitoring of Twitter/Instagram/Facebook.',
  });

  if (profile.budget_summary.availability !== 'found') {
    profile.budget_summary = dp(null, {
      notes: 'County budgets are published as PDFs organized by department, not by supervisor district. Not machine-readable.',
    });
  }
  if (profile.total_contributions.availability !== 'found' && profile.total_contributions.availability !== 'partial') {
    profile.total_contributions = dp(null, {
      notes: 'Campaign finance data exists in state filing systems (e.g., Cal-Access for CA) but requires scraping or API access.',
    });
  }

  profile.meeting_minutes_availability = dp(null, {
    availability: 'partial',
    source_name: 'Legistar',
    notes: 'Minutes posted to Legistar if jurisdiction uses it. Searchable by date but not by supervisor.',
  });
  profile.agenda_responsiveness = dp(null, {
    notes: 'No public mechanism tracks which agenda items were requested by which supervisor or constituents.',
  });
}
