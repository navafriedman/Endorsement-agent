"""Builds a ResponsivenessProfile by pulling data from multiple public sources.

Data sources attempted:
1. Legistar Web API - meetings, votes, legislation, persons
2. County website - bio, contact info, committee assignments
3. Web search - news mentions, public statements, campaign finance
4. Budget documents - budget allocations (usually PDFs, hard to parse)

This prototype demonstrates what's actually accessible and what's missing.
"""

import asyncio
from datetime import datetime
from typing import Optional
from urllib.parse import quote_plus

import httpx
from bs4 import BeautifulSoup
from tenacity import retry, stop_after_attempt, wait_exponential

from .legistar_client import LegistarClient
from .models import (
    BudgetItem,
    CampaignFinanceEntry,
    CommitteeAssignment,
    DataAvailability,
    DataPoint,
    MeetingAttendance,
    PublicStatement,
    ResponsivenessProfile,
    SponsoredLegislation,
    VoteRecord,
)


def _dp(value, source_url=None, source_name=None, notes=None, availability=None):
    """Shorthand to create a DataPoint."""
    if availability is None:
        availability = DataAvailability.FOUND if value is not None else DataAvailability.NOT_FOUND
    return DataPoint(
        value=value,
        availability=availability,
        source_url=source_url,
        source_name=source_name,
        notes=notes,
        fetched_at=datetime.utcnow(),
    )


class ProfileBuilder:
    """Orchestrates data collection from multiple sources to build a profile."""

    def __init__(
        self,
        supervisor_name: str,
        legistar_client_name: str,
        jurisdiction: str,
        state: str,
        district: Optional[str] = None,
    ):
        self.supervisor_name = supervisor_name
        self.legistar_client_name = legistar_client_name
        self.jurisdiction = jurisdiction
        self.state = state
        self.district = district
        self.profile = ResponsivenessProfile(
            name=supervisor_name,
            district=district,
            jurisdiction=jurisdiction,
            state=state,
        )
        self._http = httpx.AsyncClient(
            timeout=30.0,
            follow_redirects=True,
            headers={
                "User-Agent": "Mozilla/5.0 (compatible; SupervisorProfileBot/0.1)",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
        )
        self._sources_used: list[str] = []
        self._sources_failed: list[str] = []

    async def close(self):
        await self._http.aclose()

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        await self.close()

    async def build(self, max_meetings_to_scan: int = 20) -> ResponsivenessProfile:
        """Run all data collection steps and return the populated profile."""
        print(f"\n{'='*60}")
        print(f"Building responsiveness profile for: {self.supervisor_name}")
        print(f"Jurisdiction: {self.jurisdiction}, {self.state}")
        print(f"Legistar client: {self.legistar_client_name}")
        print(f"{'='*60}\n")

        # Run data collection steps
        await self._collect_legistar_data(max_meetings_to_scan)
        await self._collect_county_website_data()
        await self._collect_news_mentions()
        await self._collect_campaign_finance_data()
        self._mark_unavailable_fields()

        self.profile.data_sources_used = self._sources_used
        self.profile.data_sources_failed = self._sources_failed
        self.profile.profile_generated_at = datetime.utcnow()

        return self.profile

    # ------------------------------------------------------------------
    # 1. Legistar data
    # ------------------------------------------------------------------

    async def _collect_legistar_data(self, max_meetings: int):
        """Pull data from the Legistar API."""
        print("[1/4] Querying Legistar API...")
        source = f"https://webapi.legistar.com/v1/{self.legistar_client_name}"

        try:
            async with LegistarClient(self.legistar_client_name) as lc:
                # Find the person
                person = await lc.find_person(self.supervisor_name)
                if not person:
                    print(f"  -> Person '{self.supervisor_name}' not found in Legistar")
                    self._sources_failed.append(f"Legistar persons (name not found)")
                    self.profile.vote_summary = _dp(
                        None, source_url=source,
                        notes="Supervisor not found in Legistar persons endpoint",
                    )
                    return

                person_id = person["PersonId"]
                person_name = person.get("PersonFullName", self.supervisor_name)
                print(f"  -> Found: {person_name} (ID: {person_id})")
                self._sources_used.append("Legistar Web API - persons")

                # Contact info from Legistar
                email = person.get("PersonEmail")
                phone = person.get("PersonPhone")
                if email:
                    self.profile.email = _dp(email, source_url=source, source_name="Legistar")
                if phone:
                    self.profile.phone = _dp(phone, source_url=source, source_name="Legistar")

                # Get bodies (to find Board of Supervisors body ID)
                bodies = await lc.get_bodies()
                bos_body = None
                for body in bodies:
                    body_name = (body.get("BodyName") or "").lower()
                    if "board of supervisors" in body_name or "board of supervisor" in body_name:
                        bos_body = body
                        break

                if bos_body:
                    print(f"  -> Board of Supervisors body: {bos_body['BodyName']} (ID: {bos_body['BodyId']})")
                else:
                    print("  -> Board of Supervisors body not found, using all events")

                # Get recent events
                body_id = bos_body["BodyId"] if bos_body else None
                events = await lc.get_events(body_id=body_id)
                events = events[:max_meetings]
                print(f"  -> Found {len(events)} meetings to scan")

                # Collect meeting attendance and votes
                await self._process_events(lc, events, person_id)

                # Collect sponsored legislation
                await self._collect_sponsored_legislation(lc, person_name)

                self._sources_used.append("Legistar Web API - events/votes")

        except PermissionError as e:
            print(f"  -> Access denied: {e}")
            self._sources_failed.append(f"Legistar API ({e})")
        except httpx.HTTPStatusError as e:
            print(f"  -> HTTP error: {e}")
            self._sources_failed.append(f"Legistar API (HTTP {e.response.status_code})")
        except Exception as e:
            print(f"  -> Error: {e}")
            self._sources_failed.append(f"Legistar API ({type(e).__name__}: {e})")

    async def _process_events(self, lc: LegistarClient, events: list[dict], person_id: int):
        """Process events to extract attendance and votes for the supervisor."""
        total_meetings = 0
        attended = 0

        for event in events:
            event_id = event.get("EventId")
            event_date = (event.get("EventDate") or "")[:10]
            body_name = event.get("EventBodyName", "Unknown")

            if not event_id:
                continue

            total_meetings += 1
            person_voted_or_present = False

            try:
                items = await lc.get_event_items(event_id)
            except Exception:
                continue

            for item in items:
                item_id = item.get("EventItemId")
                if not item_id:
                    continue

                try:
                    votes = await lc.get_event_item_votes(item_id)
                except Exception:
                    continue

                for vote in votes:
                    if vote.get("VotePersonId") == person_id:
                        person_voted_or_present = True
                        vote_value = vote.get("VoteValueName", "Unknown")

                        self.profile.votes.append(VoteRecord(
                            matter_id=item.get("EventItemMatterId", 0),
                            matter_file=item.get("EventItemMatterFile"),
                            matter_title=item.get("EventItemTitle", "Unknown"),
                            vote_value=vote_value,
                            event_date=event_date,
                            event_id=event_id,
                            body_name=body_name,
                        ))

            if person_voted_or_present:
                attended += 1

            self.profile.meeting_attendance.append(MeetingAttendance(
                event_id=event_id,
                event_date=event_date,
                body_name=body_name,
                present=person_voted_or_present,
            ))

            await asyncio.sleep(0.1)

        # Summarize
        if total_meetings > 0:
            rate = attended / total_meetings
            self.profile.attendance_rate = _dp(
                round(rate * 100, 1),
                source_name="Legistar (derived)",
                notes=f"Attended {attended}/{total_meetings} meetings (based on vote records)",
            )
            self.profile.vote_summary = _dp(
                {"total_votes": len(self.profile.votes), "meetings_scanned": total_meetings},
                source_name="Legistar (derived)",
            )
            print(f"  -> Votes found: {len(self.profile.votes)} across {total_meetings} meetings")
            print(f"  -> Attendance rate (by vote presence): {rate*100:.1f}%")

    async def _collect_sponsored_legislation(self, lc: LegistarClient, person_name: str):
        """Try to find legislation sponsored by this person."""
        try:
            matters = await lc.get_matters()
            sponsored = []
            for matter in matters[:200]:  # check recent 200
                matter_id = matter.get("MatterId")
                if not matter_id:
                    continue
                try:
                    sponsors = await lc.get_matter_sponsors(matter_id)
                    for sponsor in sponsors:
                        sponsor_name = (sponsor.get("MatterSponsorName") or "").lower()
                        if self.supervisor_name.lower() in sponsor_name:
                            sponsored.append(SponsoredLegislation(
                                matter_id=matter_id,
                                matter_file=matter.get("MatterFile"),
                                matter_title=matter.get("MatterTitle", "Unknown"),
                                matter_type=matter.get("MatterTypeName"),
                                intro_date=(matter.get("MatterIntroDate") or "")[:10],
                                status=matter.get("MatterStatusName"),
                            ))
                except Exception:
                    continue

                await asyncio.sleep(0.05)

            self.profile.sponsored_legislation = sponsored
            self.profile.legislation_count = _dp(
                len(sponsored),
                source_name="Legistar (derived)",
                notes=f"Checked sponsors of {min(len(matters), 200)} recent matters",
            )
            print(f"  -> Sponsored legislation found: {len(sponsored)}")

        except Exception as e:
            print(f"  -> Error fetching sponsored legislation: {e}")
            self.profile.legislation_count = _dp(
                None, notes=f"Failed: {e}",
                availability=DataAvailability.NOT_FOUND,
            )

    # ------------------------------------------------------------------
    # 2. County website data
    # ------------------------------------------------------------------

    async def _collect_county_website_data(self):
        """Scrape the county website for bio, contact info, committees."""
        print("\n[2/4] Scraping county website...")

        # Try common URL patterns for supervisor pages
        slug = self.supervisor_name.lower().replace(" ", "-")
        # Extract the county/city name from the jurisdiction (e.g., "Monterey County" -> "monterey")
        jurisdiction_slug = self.jurisdiction.lower().replace(" county", "").replace(" ", "")
        urls_to_try = [
            f"https://www.countyof{jurisdiction_slug}.gov/government/board-of-supervisors/district-{self.district}-{slug}",
            f"https://www.countyof{jurisdiction_slug}.gov/government/board-of-supervisors",
        ]

        for url in urls_to_try:
            try:
                resp = await self._fetch_page(url)
                if resp:
                    self._parse_county_page(resp, url)
                    self._sources_used.append(f"County website ({url})")
                    return
            except Exception as e:
                print(f"  -> Failed to fetch {url}: {e}")

        self._sources_failed.append("County website (could not reach)")

    @retry(stop=stop_after_attempt(2), wait=wait_exponential(multiplier=1, min=2, max=5))
    async def _fetch_page(self, url: str) -> Optional[str]:
        """Fetch a web page and return HTML."""
        resp = await self._http.get(url)
        resp.raise_for_status()
        return resp.text

    def _parse_county_page(self, html: str, url: str):
        """Extract supervisor info from a county website page."""
        soup = BeautifulSoup(html, "lxml")

        # Look for email
        email_links = soup.select('a[href^="mailto:"]')
        for link in email_links:
            href = link.get("href", "")
            if "mailto:" in href:
                email = href.replace("mailto:", "").strip()
                if self.profile.email.availability != DataAvailability.FOUND:
                    self.profile.email = _dp(email, source_url=url, source_name="County website")
                    print(f"  -> Email: {email}")

        # Look for phone
        phone_links = soup.select('a[href^="tel:"]')
        for link in phone_links:
            href = link.get("href", "")
            if "tel:" in href:
                phone = href.replace("tel:", "").strip()
                if self.profile.phone.availability != DataAvailability.FOUND:
                    self.profile.phone = _dp(phone, source_url=url, source_name="County website")
                    print(f"  -> Phone: {phone}")

        # Look for committee assignments in page text
        text = soup.get_text(separator="\n")
        committee_keywords = [
            "committee", "commission", "board", "authority", "council", "trust"
        ]
        lines = text.split("\n")
        committees_found = []
        for line in lines:
            line = line.strip()
            if not line or len(line) > 200:
                continue
            line_lower = line.lower()
            if any(kw in line_lower for kw in committee_keywords):
                # Heuristic: looks like a committee name if it's a short line
                # with one of the keywords
                if 10 < len(line) < 100:
                    role = None
                    if "chair" in line_lower:
                        role = "Chair"
                    elif "vice" in line_lower:
                        role = "Vice Chair"
                    committees_found.append(
                        CommitteeAssignment(name=line, role=role, source_url=url)
                    )

        if committees_found:
            self.profile.committees = committees_found
            self.profile.committee_count = _dp(
                len(committees_found), source_url=url, source_name="County website",
            )
            print(f"  -> Committees found: {len(committees_found)}")

        self.profile.official_page_url = _dp(url, source_name="County website")

    # ------------------------------------------------------------------
    # 3. News mentions / public statements
    # ------------------------------------------------------------------

    async def _collect_news_mentions(self):
        """Search for news articles mentioning the supervisor."""
        print("\n[3/4] Searching for news mentions...")

        queries = [
            f'"{self.supervisor_name}" {self.jurisdiction} supervisor',
            f'"{self.supervisor_name}" {self.jurisdiction} county board',
        ]

        statements = []
        for query in queries:
            try:
                results = await self._search_duckduckgo(query, max_results=10)
                for r in results:
                    statements.append(PublicStatement(
                        title=r["title"],
                        source_url=r["url"],
                        source_name=r.get("source"),
                        excerpt=r.get("snippet"),
                    ))
                self._sources_used.append(f"DuckDuckGo search: {query}")
            except Exception as e:
                print(f"  -> Search failed for '{query}': {e}")
                self._sources_failed.append(f"DuckDuckGo ({query})")

            await asyncio.sleep(1)

        # Deduplicate by URL
        seen = set()
        unique = []
        for s in statements:
            if s.source_url not in seen:
                seen.add(s.source_url)
                unique.append(s)

        self.profile.public_statements = unique
        self.profile.news_mention_count = _dp(
            len(unique),
            source_name="DuckDuckGo search",
            notes="Count of unique news/web mentions found via search",
        )
        print(f"  -> News mentions found: {len(unique)}")

    @retry(stop=stop_after_attempt(2), wait=wait_exponential(multiplier=1, min=2, max=5))
    async def _search_duckduckgo(self, query: str, max_results: int = 10) -> list[dict]:
        """Search DuckDuckGo HTML (no API key needed)."""
        encoded = quote_plus(query)
        url = f"https://html.duckduckgo.com/html/?q={encoded}"

        resp = await self._http.get(url)
        resp.raise_for_status()

        soup = BeautifulSoup(resp.text, "lxml")
        results = []

        import re
        from urllib.parse import unquote

        for result in soup.select(".result")[:max_results]:
            title_el = result.select_one(".result__title a")
            snippet_el = result.select_one(".result__snippet")
            if not title_el:
                continue

            title = title_el.get_text(strip=True)
            href = title_el.get("href", "")
            url_match = re.search(r"uddg=([^&]+)", href)
            actual_url = unquote(url_match.group(1)) if url_match else href
            snippet = snippet_el.get_text(strip=True) if snippet_el else ""

            if actual_url and actual_url.startswith("http"):
                results.append({
                    "title": title,
                    "url": actual_url,
                    "snippet": snippet,
                })

        return results

    # ------------------------------------------------------------------
    # 4. Campaign finance
    # ------------------------------------------------------------------

    async def _collect_campaign_finance_data(self):
        """Try to find campaign finance data from public sources."""
        print("\n[4/4] Searching for campaign finance data...")

        # California's Cal-Access is the canonical source
        cal_access_url = "https://cal-access.sos.ca.gov/"
        queries = [
            f'"{self.supervisor_name}" campaign contributions {self.jurisdiction}',
            f'"{self.supervisor_name}" campaign finance {self.state}',
        ]

        finance_mentions = []
        for query in queries:
            try:
                results = await self._search_duckduckgo(query, max_results=5)
                for r in results:
                    finance_mentions.append(r)
            except Exception as e:
                print(f"  -> Search failed: {e}")

            await asyncio.sleep(1)

        if finance_mentions:
            self.profile.total_contributions = _dp(
                None,
                source_name="Web search (references found, not parsed)",
                notes=(
                    f"Found {len(finance_mentions)} web results referencing campaign finance. "
                    "Actual dollar amounts require parsing PDFs or Cal-Access filings."
                ),
                availability=DataAvailability.PARTIAL,
            )
            # Store references as statements
            for mention in finance_mentions:
                self.profile.campaign_finance.append(CampaignFinanceEntry(
                    amount=0,
                    donor_or_payee="(see source)",
                    source_url=mention["url"],
                ))
            self._sources_used.append("DuckDuckGo search (campaign finance)")
            print(f"  -> Campaign finance references found: {len(finance_mentions)}")
        else:
            self.profile.total_contributions = _dp(
                None,
                notes="No campaign finance data found via web search. Check Cal-Access directly.",
                availability=DataAvailability.NOT_FOUND,
            )
            print("  -> No campaign finance data found")

    # ------------------------------------------------------------------
    # Mark fields we know are not publicly available
    # ------------------------------------------------------------------

    def _mark_unavailable_fields(self):
        """Explicitly mark fields that are known to be unavailable from public sources."""

        self.profile.constituent_response_time = _dp(
            None,
            notes=(
                "Not publicly tracked. Would require FOIA/CPRA request for internal "
                "correspondence logs, or a constituent survey."
            ),
            availability=DataAvailability.NOT_FOUND,
        )

        self.profile.town_halls_held = _dp(
            None,
            notes=(
                "Not systematically tracked in any public database. Could be partially "
                "inferred from Legistar 'Special Meeting' types or news searches, but "
                "town halls are often informal and unrecorded."
            ),
            availability=DataAvailability.NOT_FOUND,
        )

        self.profile.public_comment_engagement = _dp(
            None,
            notes=(
                "Meeting minutes sometimes record who spoke during public comment, but "
                "supervisor responses are rarely transcribed. Video archives exist but "
                "require manual review."
            ),
            availability=DataAvailability.NOT_FOUND,
        )

        self.profile.social_media_responsiveness = _dp(
            None,
            notes=(
                "Would require Twitter/Facebook/Instagram API access to measure "
                "reply rates and engagement. Platform APIs are increasingly restricted."
            ),
            availability=DataAvailability.NOT_FOUND,
        )

        # Budget is typically in PDFs, not machine-readable
        if not self.profile.budget_items:
            self.profile.budget_summary = _dp(
                None,
                notes=(
                    "County budgets are published as PDF documents, not machine-readable "
                    "data. Budget is organized by department, not by supervisor district. "
                    "Parsing requires OCR/PDF extraction. See: "
                    "https://www.countyofmonterey.gov/government/departments-a-h/"
                    "administrative-office/budget-analysis"
                ),
                availability=DataAvailability.NOT_FOUND,
            )
