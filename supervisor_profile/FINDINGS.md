# Supervisor Responsiveness Profile: Findings

## Target: Chris Lopez, District 3, Monterey County, CA

This prototype attempts to build a "responsiveness profile" for one supervisor
using only publicly available online information.

---

## Data Sources Investigated

| Source | URL | API? | Status |
|--------|-----|------|--------|
| Legistar Web API | `webapi.legistar.com/v1/monterey/` | Yes (REST/OData) | Available, free, no token required for Monterey |
| Legistar Web Portal | `monterey.legistar.com` | No (HTML scraping) | Available, records from 2009+ |
| County Website | `countyofmonterey.gov` | No | Available |
| County Budget Office | `countyofmonterey.gov/.../budget-analysis` | No (PDFs only) | Available but not machine-readable |
| Cal-Access (CA SOS) | `cal-access.sos.ca.gov` | Partial | Campaign finance filings exist |
| DuckDuckGo Search | `html.duckduckgo.com` | Free HTML scraping | Works for news discovery |
| Wikipedia | `en.wikipedia.org` | Yes | Basic supervisor info |

---

## What Data Can You Actually Find?

### FOUND (Reliably Available)

| Field | Source | Notes |
|-------|--------|-------|
| **Name, District, Title** | County website, Wikipedia | Trivially available |
| **Official page URL** | County website | `countyofmonterey.gov/.../district-3-chris-lopez` |
| **Email** | County website (contact page) | `district3@countyofmonterey.gov` |
| **Phone** | County website (contact page) | `(831) 755-5033` |
| **Term dates** | Wikipedia, news articles | Elected 2018, reelected 2022, current term 2023-2026 |
| **Committee assignments** | County website bio + Legistar bodies | 13 committees/boards identified |
| **News mentions** | Web search (DuckDuckGo) | Dozens of articles findable |
| **Meeting dates** | Legistar events API | Full calendar from 2009+ |
| **Agenda items** | Legistar event items API | Per-meeting agenda with titles and file numbers |

### PARTIALLY Available (Requires Extra Work)

| Field | Source | Gap |
|-------|--------|-----|
| **Individual vote records** | Legistar votes API | Available but requires iterating: events → event items → votes per item. Slow (hundreds of API calls for full history). Structure: `VotePersonId`, `VoteValueName` (Aye/No/Abstain/Absent) |
| **Attendance rate** | Derived from votes | No explicit "attendance" field. Must infer: if person voted on any item in a meeting, they were present. May miss meetings where they were present but didn't vote on roll-call items |
| **Sponsored legislation** | Legistar sponsors API | Endpoint exists (`/matters/{id}/sponsors`) but Monterey County may not consistently tag individual supervisor sponsors. Most items are "Board Reports" introduced by departments |
| **Campaign finance** | Cal-Access + news reports | Dollar amounts and donor names exist in state filings but require scraping Cal-Access or filing CPRA requests. News mentions fossil fuel donations (Chevron, CIPA) but no totals |
| **Budget priorities** | Budget PDFs + meeting votes | County publishes PDF budget books (~$2B for FY24-25). Organized by department, not by district. Budget Committee oversight (Lopez is Vice Chair) is visible in Legistar, but individual supervisor budget priorities are not separately tracked |

### NOT FOUND (Not Publicly Available)

| Field | Why It's Missing | What Would Help |
|-------|------------------|-----------------|
| **Constituent response time** | No public system tracks how quickly supervisors respond to constituent inquiries | CPRA request for correspondence logs; constituent survey; test inquiry monitoring |
| **Town halls / community meetings** | Informal events not recorded in any official system | Social media monitoring; news search; CPRA for staff calendars |
| **Public comment engagement** | Meeting videos exist but supervisor responses to public comments aren't transcribed or indexed | AI-powered video analysis of meeting recordings at `monterey.legistar.com/Page.aspx?M=W` |
| **Social media responsiveness** | Platform APIs increasingly restricted; no public dashboard | Build Twitter/Instagram monitoring; would need API access or manual tracking |
| **Constituent complaint resolution** | Internal processes not publicly reported | CPRA request; grand jury reports sometimes cover this |
| **Staff responsiveness** | Supervisor office staffing and response quality not tracked | Constituent survey; mystery shopper approach |
| **District-level spending** | Budget organized by department, not by supervisor district | Would need to cross-reference capital projects with district geography |
| **Photo URL** | County website has photos but no stable direct-link image in Legistar | Scrape from county website HTML |

---

## Architecture of This Prototype

```
supervisor_profile/
├── __init__.py
├── __main__.py              # python -m supervisor_profile
├── models.py                # Pydantic schemas (ResponsivenessProfile, DataPoint, etc.)
├── legistar_client.py       # Async Legistar Web API client with pagination
├── profile_builder.py       # Orchestrator: Legistar + county website + search
├── cli.py                   # CLI entry point with human-readable report
├── sample_profile_chris_lopez.json  # Example output with real research data
└── FINDINGS.md              # This document
```

### How to Run

```bash
python -m supervisor_profile --name "Chris Lopez" --client monterey \
  --jurisdiction "Monterey County" --state CA --district 3 \
  --output profile.json --max-meetings 20
```

### Key Design Decisions

1. **DataPoint wrapper**: Every field is wrapped in a `DataPoint` that tracks
   availability (`found`/`partial`/`not_found`), source URL, and explanatory notes.
   This makes the gaps as visible as the data.

2. **Legistar-first**: The Legistar API is the richest structured data source
   for local government. It has meetings, votes, legislation, persons, and bodies
   going back to 2009.

3. **Multi-source fallback**: If Legistar doesn't have contact info, the county
   website is scraped. News search fills in public statements.

4. **Gap report**: The profile generates a machine-readable gap report showing
   exactly which fields couldn't be populated and why.

---

## Key Insight: The "Responsiveness" Gap

The most important finding is that **actual responsiveness metrics are almost
entirely unavailable from public online sources**. The data that IS available
tells you about a supervisor's *activity* (votes, meetings, committees, legislation)
but not their *responsiveness* (how quickly they reply, whether they engage
with constituents, whether they follow up on issues).

### What's Available = "Activity Profile"
- Did they show up to meetings?
- How did they vote?
- What committees are they on?
- What did the news say about them?

### What's Missing = "Responsiveness Profile"
- Do they reply to constituent emails?
- Do they hold community meetings in their district?
- Do they engage with public comments at board meetings?
- Do they follow up on constituent concerns?
- Are their staff accessible?

### Bridging the Gap Would Require:
1. **CPRA/FOIA requests** for internal correspondence metadata
2. **Constituent surveys** (structured polling of district residents)
3. **AI video analysis** of meeting recordings (public comment periods)
4. **Social media monitoring** (reply rates on Twitter, Instagram, Facebook)
5. **Mystery constituent** program (submitting test inquiries and timing responses)
6. **Grand jury reports** (occasionally investigate supervisor responsiveness)

---

## Legistar API Reference (for Monterey County)

These are the key endpoints that work for the `monterey` client:

```
GET /v1/monterey/persons                    # All officials/staff
GET /v1/monterey/bodies                     # Board of Supervisors, committees
GET /v1/monterey/events                     # Meetings (filterable by date, body)
GET /v1/monterey/events/{id}/eventitems     # Agenda items per meeting
GET /v1/monterey/eventitems/{id}/votes      # Roll-call votes per agenda item
GET /v1/monterey/matters                    # Legislation/resolutions
GET /v1/monterey/matters/{id}/sponsors      # Sponsors per item
GET /v1/monterey/matters/{id}/histories     # Action history per item
```

OData filtering: `$filter=EventDate ge datetime'2024-01-01'`
Pagination: `$top=1000&$skip=0`
