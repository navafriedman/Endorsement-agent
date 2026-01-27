"""Data models for races, candidates, and endorsements."""

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class RaceType(str, Enum):
    """Type of political race."""
    FEDERAL = "federal"
    STATE = "state"
    LOCAL = "local"
    JUDICIAL = "judicial"
    SCHOOL_BOARD = "school_board"
    OTHER = "other"


class EndorsementType(str, Enum):
    """Type of endorsement."""
    ORGANIZATION = "organization"
    NEWSPAPER = "newspaper"
    ELECTED_OFFICIAL = "elected_official"
    CELEBRITY = "celebrity"
    UNION = "union"
    PAC = "pac"
    OTHER = "other"


class Candidate(BaseModel):
    """A candidate running in a race."""
    name: str
    party: Optional[str] = None
    incumbent: bool = False
    website: Optional[str] = None

    def search_queries(self, race_name: str, year: int) -> list[str]:
        """Generate search queries for finding endorsements of this candidate."""
        queries = [
            f'"{self.name}" endorsement {year}',
            f'"{self.name}" endorsed {race_name} {year}',
            f'"{self.name}" endorsements {year} election',
        ]
        if self.party:
            queries.append(f'"{self.name}" {self.party} endorsement {year}')
        return queries


class Race(BaseModel):
    """A political race."""
    name: str
    position: str
    race_type: RaceType
    year: int
    state: str
    city: Optional[str] = None
    district: Optional[str] = None
    candidates: list[Candidate] = Field(default_factory=list)
    primary_date: Optional[str] = None
    general_date: Optional[str] = None

    def search_queries(self) -> list[str]:
        """Generate search queries for finding endorsements for this race."""
        location = self.city or self.state
        queries = [
            f'{self.position} endorsements {self.year} {location}',
            f'{self.name} endorsements {self.year}',
            f'who to vote for {self.position} {self.year} {location}',
            f'{self.position} {self.year} {location} voter guide',
        ]
        return queries


class Endorsement(BaseModel):
    """An endorsement for a candidate."""
    candidate_name: str
    endorser_name: str
    endorser_type: EndorsementType
    race_name: str
    source_url: str
    source_title: Optional[str] = None
    endorsement_date: Optional[str] = None
    excerpt: Optional[str] = None
    confidence: float = Field(ge=0.0, le=1.0, default=0.8)
    crawled_at: datetime = Field(default_factory=datetime.utcnow)

    def __hash__(self):
        return hash((self.candidate_name.lower(), self.endorser_name.lower(), self.race_name.lower()))

    def __eq__(self, other):
        if not isinstance(other, Endorsement):
            return False
        return (
            self.candidate_name.lower() == other.candidate_name.lower() and
            self.endorser_name.lower() == other.endorser_name.lower() and
            self.race_name.lower() == other.race_name.lower()
        )


class CrawlResult(BaseModel):
    """Result of a crawl session."""
    race: Race
    endorsements: list[Endorsement] = Field(default_factory=list)
    sources_checked: list[str] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)
    started_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None


class RaceConfig(BaseModel):
    """Configuration for a set of races to crawl."""
    name: str
    description: Optional[str] = None
    races: list[Race] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)
