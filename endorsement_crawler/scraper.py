"""Web scraping functionality for extracting content from endorsement pages."""

import re
from typing import Optional
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup
from pydantic import BaseModel
from tenacity import retry, stop_after_attempt, wait_exponential


class PageContent(BaseModel):
    """Extracted content from a web page."""
    url: str
    title: str
    text: str
    links: list[str] = []
    meta_description: Optional[str] = None
    publish_date: Optional[str] = None


class WebScraper:
    """Scrapes and extracts content from web pages."""

    def __init__(self):
        self.client = httpx.AsyncClient(
            timeout=30.0,
            follow_redirects=True,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.5",
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
    async def fetch_page(self, url: str) -> Optional[PageContent]:
        """Fetch and parse a web page."""
        try:
            response = await self.client.get(url)
            response.raise_for_status()

            content_type = response.headers.get('content-type', '')
            if 'text/html' not in content_type and 'application/xhtml' not in content_type:
                return None

            return self._parse_html(url, response.text)
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 403:
                # Try with different headers
                return await self._fetch_with_alternate_headers(url)
            raise
        except Exception as e:
            print(f"Failed to fetch {url}: {e}")
            return None

    async def _fetch_with_alternate_headers(self, url: str) -> Optional[PageContent]:
        """Try fetching with alternate headers for sites that block scrapers."""
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept-Encoding": "gzip, deflate, br",
            "Connection": "keep-alive",
        }

        try:
            response = await self.client.get(url, headers=headers)
            response.raise_for_status()
            return self._parse_html(url, response.text)
        except Exception:
            return None

    def _parse_html(self, url: str, html: str) -> PageContent:
        """Parse HTML content and extract relevant information."""
        soup = BeautifulSoup(html, 'lxml')

        # Remove script and style elements
        for element in soup(['script', 'style', 'nav', 'footer', 'header', 'aside']):
            element.decompose()

        # Get title
        title = ""
        if soup.title:
            title = soup.title.get_text(strip=True)
        elif soup.find('h1'):
            title = soup.find('h1').get_text(strip=True)

        # Get meta description
        meta_desc = None
        meta_tag = soup.find('meta', attrs={'name': 'description'})
        if meta_tag:
            meta_desc = meta_tag.get('content', '')

        # Get publish date
        publish_date = self._extract_date(soup)

        # Get main content
        main_content = self._extract_main_content(soup)

        # Get links
        links = []
        for a in soup.find_all('a', href=True):
            href = a['href']
            if href.startswith('/'):
                href = urljoin(url, href)
            if href.startswith('http'):
                links.append(href)

        return PageContent(
            url=url,
            title=title,
            text=main_content,
            links=links[:50],  # Limit links
            meta_description=meta_desc,
            publish_date=publish_date
        )

    def _extract_main_content(self, soup: BeautifulSoup) -> str:
        """Extract the main content from the page."""
        # Try to find main content area
        main_selectors = [
            'article',
            'main',
            '[role="main"]',
            '.post-content',
            '.entry-content',
            '.article-content',
            '.content',
            '#content',
        ]

        for selector in main_selectors:
            main = soup.select_one(selector)
            if main:
                return self._clean_text(main.get_text(separator='\n'))

        # Fall back to body
        body = soup.find('body')
        if body:
            return self._clean_text(body.get_text(separator='\n'))

        return self._clean_text(soup.get_text(separator='\n'))

    def _clean_text(self, text: str) -> str:
        """Clean up extracted text."""
        # Remove excessive whitespace
        lines = text.split('\n')
        cleaned_lines = []
        for line in lines:
            line = line.strip()
            if line:
                cleaned_lines.append(line)

        text = '\n'.join(cleaned_lines)

        # Remove excessive newlines
        text = re.sub(r'\n{3,}', '\n\n', text)

        # Truncate if too long (keep first 15000 chars for context)
        if len(text) > 15000:
            text = text[:15000] + "\n... [truncated]"

        return text

    def _extract_date(self, soup: BeautifulSoup) -> Optional[str]:
        """Try to extract the publish date from the page."""
        # Check common meta tags
        date_metas = [
            ('meta', {'property': 'article:published_time'}),
            ('meta', {'name': 'date'}),
            ('meta', {'name': 'DC.date'}),
            ('time', {'datetime': True}),
        ]

        for tag, attrs in date_metas:
            element = soup.find(tag, attrs=attrs)
            if element:
                date_value = element.get('content') or element.get('datetime')
                if date_value:
                    return date_value[:10]  # Return just date portion

        return None
