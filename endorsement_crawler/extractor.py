"""AI-powered endorsement extraction using Claude."""

import json
from typing import Optional

from anthropic import Anthropic

from .models import Candidate, Endorsement, EndorsementType, Race
from .scraper import PageContent


EXTRACTION_PROMPT = """You are an expert at extracting political endorsement information from web pages.

Analyze the following web page content and extract any endorsements for political candidates.

RACE CONTEXT:
{race_context}

CANDIDATES TO LOOK FOR:
{candidates}

PAGE URL: {url}
PAGE TITLE: {title}

PAGE CONTENT:
{content}

Extract ALL endorsements mentioned on this page. For each endorsement found, provide:
1. candidate_name: The exact name of the candidate being endorsed
2. endorser_name: Who is making the endorsement (organization, newspaper, person, etc.)
3. endorser_type: One of: organization, newspaper, elected_official, celebrity, union, pac, other
4. endorsement_date: The date of endorsement if mentioned (YYYY-MM-DD format)
5. excerpt: A brief quote or excerpt showing the endorsement (max 200 chars)
6. confidence: Your confidence this is a real endorsement (0.0-1.0)

IMPORTANT RULES:
- Only extract endorsements that are clearly stated, not implied or speculated
- Only extract endorsements for candidates in races relevant to the race context above
- If a candidate name is similar but not exact, use the exact name from the candidates list
- Set confidence lower (0.5-0.7) if the endorsement is ambiguous or conditional
- Set confidence higher (0.8-1.0) if the endorsement is clearly stated

Respond with a JSON object containing an "endorsements" array. If no endorsements found, return {"endorsements": []}.

Example response:
{
  "endorsements": [
    {
      "candidate_name": "John Smith",
      "endorser_name": "Fort Worth Star-Telegram",
      "endorser_type": "newspaper",
      "endorsement_date": "2026-02-15",
      "excerpt": "We endorse John Smith for his commitment to...",
      "confidence": 0.95
    }
  ]
}

Respond ONLY with valid JSON, no other text."""


class EndorsementExtractor:
    """Extracts endorsement information from page content using Claude."""

    def __init__(self, api_key: Optional[str] = None):
        self.client = Anthropic(api_key=api_key) if api_key else Anthropic()

    def extract_endorsements(
        self,
        page: PageContent,
        race: Race,
        model: str = "claude-sonnet-4-20250514"
    ) -> list[Endorsement]:
        """Extract endorsements from a page for a specific race."""

        # Build race context
        location = race.city or race.state
        race_context = f"{race.name} - {race.position} in {location}, {race.state} ({race.year})"

        # Build candidates list
        if race.candidates:
            candidates = "\n".join([
                f"- {c.name}" + (f" ({c.party})" if c.party else "")
                for c in race.candidates
            ])
        else:
            candidates = "(No specific candidates listed - extract any relevant endorsements)"

        prompt = EXTRACTION_PROMPT.format(
            race_context=race_context,
            candidates=candidates,
            url=page.url,
            title=page.title,
            content=page.text[:12000]  # Limit content length
        )

        try:
            response = self.client.messages.create(
                model=model,
                max_tokens=2000,
                messages=[
                    {"role": "user", "content": prompt}
                ]
            )

            # Parse the response
            response_text = response.content[0].text.strip()

            # Handle potential markdown code blocks
            if response_text.startswith("```"):
                response_text = response_text.split("```")[1]
                if response_text.startswith("json"):
                    response_text = response_text[4:]
                response_text = response_text.strip()

            data = json.loads(response_text)

            endorsements = []
            for item in data.get("endorsements", []):
                try:
                    endorsement = Endorsement(
                        candidate_name=item["candidate_name"],
                        endorser_name=item["endorser_name"],
                        endorser_type=EndorsementType(item.get("endorser_type", "other")),
                        race_name=race.name,
                        source_url=page.url,
                        source_title=page.title,
                        endorsement_date=item.get("endorsement_date"),
                        excerpt=item.get("excerpt"),
                        confidence=float(item.get("confidence", 0.8))
                    )
                    endorsements.append(endorsement)
                except Exception as e:
                    print(f"Failed to parse endorsement: {e}")
                    continue

            return endorsements

        except json.JSONDecodeError as e:
            print(f"Failed to parse JSON response: {e}")
            return []
        except Exception as e:
            print(f"Extraction failed: {e}")
            return []

    def validate_endorsement(
        self,
        endorsement: Endorsement,
        race: Race,
        model: str = "claude-sonnet-4-20250514"
    ) -> bool:
        """Validate an extracted endorsement for accuracy."""
        prompt = f"""Validate if this is a legitimate political endorsement:

Candidate: {endorsement.candidate_name}
Endorser: {endorsement.endorser_name}
Race: {race.name} ({race.position})
Source: {endorsement.source_url}
Excerpt: {endorsement.excerpt}

Is this a clear, confirmed endorsement? Answer with just YES or NO."""

        try:
            response = self.client.messages.create(
                model=model,
                max_tokens=10,
                messages=[
                    {"role": "user", "content": prompt}
                ]
            )

            answer = response.content[0].text.strip().upper()
            return answer.startswith("YES")

        except Exception:
            # Default to accepting if validation fails
            return True
