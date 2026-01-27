"""Web search functionality for finding endorsement pages."""

import asyncio
import re
from typing import Optional
from urllib.parse import quote_plus, urlparse

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from .models import Candidate, Race


class SearchResult(BaseModel):
    """A search result from web search."""
    title: str
    url: str
    snippet: str


from pydantic import BaseModel


class SearchResult(BaseModel):
    """A search result from web search."""
    title: str
    url: str
    snippet: str


class WebSearcher:
    """Handles web searches for endorsement pages."""

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key
        self.client = httpx.AsyncClient(
            timeout=30.0,
            follow_redirects=True,
            headers={
                "User-Agent": "Mozilla/5.0 (compatible; EndorsementCrawler/1.0)"
            }
        )

    async def close(self):
        """Close the HTTP client."""
        await self.client.aclose()

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
    async def search_duckduckgo(self, query: str, max_results: int = 10) -> list[SearchResult]:
        """Search using DuckDuckGo HTML (no API key required)."""
        encoded_query = quote_plus(query)
        url = f"https://html.duckduckgo.com/html/?q={encoded_query}"

        response = await self.client.get(url)
        response.raise_for_status()

        results = []
        # Parse the HTML response for search results
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(response.text, 'lxml')

        for result in soup.select('.result')[:max_results]:
            title_elem = result.select_one('.result__title a')
            snippet_elem = result.select_one('.result__snippet')

            if title_elem:
                title = title_elem.get_text(strip=True)
                # DuckDuckGo uses redirect URLs, extract actual URL
                href = title_elem.get('href', '')
                # Extract actual URL from DuckDuckGo redirect
                url_match = re.search(r'uddg=([^&]+)', href)
                if url_match:
                    from urllib.parse import unquote
                    actual_url = unquote(url_match.group(1))
                else:
                    actual_url = href

                snippet = snippet_elem.get_text(strip=True) if snippet_elem else ""

                if actual_url and not actual_url.startswith('/'):
                    results.append(SearchResult(
                        title=title,
                        url=actual_url,
                        snippet=snippet
                    ))

        return results

    async def search_for_race(self, race: Race, max_results_per_query: int = 10) -> list[SearchResult]:
        """Search for endorsement pages for a race."""
        all_results = []
        seen_urls = set()

        queries = race.search_queries()

        for query in queries:
            try:
                results = await self.search_duckduckgo(query, max_results_per_query)
                for result in results:
                    if result.url not in seen_urls:
                        seen_urls.add(result.url)
                        all_results.append(result)
            except Exception as e:
                print(f"Search failed for query '{query}': {e}")

            # Be respectful to the search engine
            await asyncio.sleep(1)

        return all_results

    async def search_for_candidate(
        self,
        candidate: Candidate,
        race: Race,
        max_results_per_query: int = 10
    ) -> list[SearchResult]:
        """Search for endorsement pages for a specific candidate."""
        all_results = []
        seen_urls = set()

        queries = candidate.search_queries(race.name, race.year)

        for query in queries:
            try:
                results = await self.search_duckduckgo(query, max_results_per_query)
                for result in results:
                    if result.url not in seen_urls:
                        seen_urls.add(result.url)
                        all_results.append(result)
            except Exception as e:
                print(f"Search failed for query '{query}': {e}")

            await asyncio.sleep(1)

        return all_results

    def filter_relevant_results(self, results: list[SearchResult]) -> list[SearchResult]:
        """Filter results to those likely containing endorsement information."""
        endorsement_keywords = [
            'endorse', 'endorsement', 'endorsed', 'endorses',
            'voter guide', 'voting guide', 'recommendations',
            'who to vote', 'support', 'backs', 'backing'
        ]

        filtered = []
        for result in results:
            text = f"{result.title} {result.snippet}".lower()
            if any(kw in text for kw in endorsement_keywords):
                filtered.append(result)

        return filtered
