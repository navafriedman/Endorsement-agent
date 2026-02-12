"""Client for the Legistar Web API (Granicus).

The Legistar API is a public, read-only OData REST API that exposes meeting,
legislation, vote, and person data for municipalities that use Legistar.

Base URL: https://webapi.legistar.com/v1/{client}/
Docs: https://webapi.legistar.com/Help

Not all municipalities expose all endpoints, and some require API tokens.
This client handles pagination (max 1000 per request) and graceful failures.
"""

import asyncio
from typing import Any, Optional

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential


class LegistarClient:
    """Async client for the Legistar Web API."""

    BASE_URL = "https://webapi.legistar.com/v1"

    def __init__(self, client_name: str, token: Optional[str] = None):
        self.client_name = client_name
        self.token = token
        self._http = httpx.AsyncClient(
            timeout=30.0,
            follow_redirects=True,
            headers={"Accept": "application/json"},
        )

    async def close(self):
        await self._http.aclose()

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        await self.close()

    def _url(self, endpoint: str) -> str:
        return f"{self.BASE_URL}/{self.client_name}/{endpoint}"

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
    async def _get(self, endpoint: str, params: Optional[dict] = None) -> Any:
        """Make a GET request to the Legistar API."""
        url = self._url(endpoint)
        request_params = params or {}
        if self.token:
            request_params["token"] = self.token

        response = await self._http.get(url, params=request_params)
        response.raise_for_status()
        return response.json()

    async def _get_all(self, endpoint: str, params: Optional[dict] = None) -> list[dict]:
        """Paginate through all results (Legistar caps at 1000 per page)."""
        all_results = []
        skip = 0
        page_size = 1000

        while True:
            paged_params = dict(params or {})
            paged_params["$top"] = page_size
            paged_params["$skip"] = skip

            try:
                page = await self._get(endpoint, paged_params)
            except httpx.HTTPStatusError as e:
                if e.response.status_code in (401, 403):
                    raise PermissionError(
                        f"Legistar API returned {e.response.status_code} for "
                        f"{self.client_name}/{endpoint}. An API token may be required."
                    )
                raise

            if not page:
                break

            all_results.extend(page)
            if len(page) < page_size:
                break
            skip += page_size
            await asyncio.sleep(0.25)  # rate-limit courtesy

        return all_results

    # ------------------------------------------------------------------
    # High-level endpoints
    # ------------------------------------------------------------------

    async def get_persons(self) -> list[dict]:
        """Get all persons (elected officials, staff, etc.)."""
        return await self._get_all("persons")

    async def find_person(self, name: str) -> Optional[dict]:
        """Find a person by name (case-insensitive partial match)."""
        persons = await self.get_persons()
        name_lower = name.lower()
        for person in persons:
            full_name = (person.get("PersonFullName") or "").lower()
            if name_lower in full_name or full_name in name_lower:
                return person
        return None

    async def get_bodies(self) -> list[dict]:
        """Get all legislative bodies (Board of Supervisors, committees, etc.)."""
        return await self._get_all("bodies")

    async def get_events(
        self,
        body_id: Optional[int] = None,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
    ) -> list[dict]:
        """Get meetings/events, optionally filtered by body and date range."""
        filters = []
        if body_id:
            filters.append(f"EventBodyId eq {body_id}")
        if date_from:
            filters.append(f"EventDate ge datetime'{date_from}'")
        if date_to:
            filters.append(f"EventDate lt datetime'{date_to}'")

        params = {}
        if filters:
            params["$filter"] = " and ".join(filters)
        params["$orderby"] = "EventDate desc"

        return await self._get_all("events", params)

    async def get_event_items(self, event_id: int) -> list[dict]:
        """Get agenda items for a specific meeting/event."""
        return await self._get_all(f"events/{event_id}/eventitems")

    async def get_event_item_votes(self, event_item_id: int) -> list[dict]:
        """Get vote records for a specific agenda item."""
        return await self._get_all(f"eventitems/{event_item_id}/votes")

    async def get_matters(
        self,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
    ) -> list[dict]:
        """Get legislation/matters, optionally filtered by date."""
        filters = []
        if date_from:
            filters.append(f"MatterIntroDate ge datetime'{date_from}'")
        if date_to:
            filters.append(f"MatterIntroDate lt datetime'{date_to}'")

        params = {}
        if filters:
            params["$filter"] = " and ".join(filters)
        params["$orderby"] = "MatterIntroDate desc"

        return await self._get_all("matters", params)

    async def get_matter_sponsors(self, matter_id: int) -> list[dict]:
        """Get sponsors for a specific matter."""
        return await self._get_all(f"matters/{matter_id}/sponsors")

    async def get_matter_histories(self, matter_id: int) -> list[dict]:
        """Get action history for a matter (includes vote references)."""
        return await self._get_all(f"matters/{matter_id}/histories")

    async def get_vote_types(self) -> list[dict]:
        """Get all vote type definitions."""
        return await self._get_all("votetypes")

    # ------------------------------------------------------------------
    # Convenience: extract votes for a person across events
    # ------------------------------------------------------------------

    async def get_person_votes(
        self,
        person_id: int,
        event_ids: Optional[list[int]] = None,
        limit_events: int = 50,
    ) -> list[dict]:
        """Get all votes cast by a specific person across events.

        This requires iterating events -> event items -> votes, which can be slow.
        Use limit_events to cap how many meetings we check.
        """
        if event_ids is None:
            events = await self.get_events()
            event_ids = [e["EventId"] for e in events[:limit_events]]

        person_votes = []
        for event_id in event_ids:
            try:
                items = await self.get_event_items(event_id)
            except Exception:
                continue

            for item in items:
                item_id = item.get("EventItemId")
                if not item_id:
                    continue
                try:
                    votes = await self.get_event_item_votes(item_id)
                except Exception:
                    continue

                for vote in votes:
                    if vote.get("VotePersonId") == person_id:
                        vote["_EventId"] = event_id
                        vote["_EventItemTitle"] = item.get("EventItemTitle", "")
                        vote["_EventItemMatterFile"] = item.get("EventItemMatterFile", "")
                        person_votes.append(vote)

            await asyncio.sleep(0.1)

        return person_votes
