"""Data models for supervisor responsiveness profiles.

Defines the schema for what a complete "responsiveness profile" would contain,
tracking which data points are actually findable from public sources versus
what's missing.
"""

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class DataAvailability(str, Enum):
    """Whether a data point was actually found from public sources."""
    FOUND = "found"
    PARTIAL = "partial"
    NOT_FOUND = "not_found"
    NOT_APPLICABLE = "not_applicable"


class DataPoint(BaseModel):
    """A single data point with metadata about its source and availability."""
    value: Optional[str | int | float | bool | list | dict] = None
    availability: DataAvailability = DataAvailability.NOT_FOUND
    source_url: Optional[str] = None
    source_name: Optional[str] = None
    notes: Optional[str] = None
    fetched_at: Optional[datetime] = None


# --- Legistar-derived data ---


class VoteRecord(BaseModel):
    """A single vote cast by the supervisor on a legislative item."""
    matter_id: int
    matter_file: Optional[str] = None
    matter_title: str
    vote_value: str  # e.g., "Aye", "No", "Abstain", "Absent"
    event_date: str
    event_id: int
    body_name: Optional[str] = None


class MeetingAttendance(BaseModel):
    """Attendance record for a single meeting."""
    event_id: int
    event_date: str
    body_name: str
    present: bool
    source_url: Optional[str] = None


class SponsoredLegislation(BaseModel):
    """A piece of legislation sponsored or introduced by the supervisor."""
    matter_id: int
    matter_file: Optional[str] = None
    matter_title: str
    matter_type: Optional[str] = None
    intro_date: Optional[str] = None
    status: Optional[str] = None
    source_url: Optional[str] = None


# --- Budget data ---


class BudgetItem(BaseModel):
    """A budget allocation or request associated with the supervisor's priorities."""
    fiscal_year: str
    category: str
    amount: Optional[float] = None
    description: Optional[str] = None
    source_url: Optional[str] = None


# --- Public engagement data ---


class CommitteeAssignment(BaseModel):
    """A committee or board the supervisor serves on."""
    name: str
    role: Optional[str] = None  # e.g., "Chair", "Vice Chair", "Member"
    body_type: Optional[str] = None  # e.g., "Standing Committee", "Advisory Board"
    source_url: Optional[str] = None


class PublicStatement(BaseModel):
    """A public statement, press release, or news mention."""
    title: str
    date: Optional[str] = None
    source_url: Optional[str] = None
    source_name: Optional[str] = None
    excerpt: Optional[str] = None
    topic: Optional[str] = None


class CampaignFinanceEntry(BaseModel):
    """A campaign contribution or expenditure."""
    amount: float
    donor_or_payee: str
    date: Optional[str] = None
    category: Optional[str] = None
    source_url: Optional[str] = None


# --- The full profile ---


class ResponsivenessProfile(BaseModel):
    """Complete responsiveness profile for a supervisor.

    This is the target schema. Each section tracks both the data found
    and metadata about what's missing. The prototype populates what it can
    from public sources and clearly marks gaps.
    """

    # --- Identity ---
    name: str
    district: Optional[str] = None
    jurisdiction: str  # e.g., "Monterey County"
    state: str  # e.g., "CA"
    title: str = "Supervisor"
    photo_url: DataPoint = Field(default_factory=DataPoint)
    official_page_url: DataPoint = Field(default_factory=DataPoint)
    email: DataPoint = Field(default_factory=DataPoint)
    phone: DataPoint = Field(default_factory=DataPoint)

    # --- Term info ---
    term_start: DataPoint = Field(default_factory=DataPoint)
    term_end: DataPoint = Field(default_factory=DataPoint)
    first_elected: DataPoint = Field(default_factory=DataPoint)
    is_incumbent: bool = True

    # --- Legislative activity (from Legistar) ---
    votes: list[VoteRecord] = Field(default_factory=list)
    vote_summary: DataPoint = Field(default_factory=DataPoint)
    meeting_attendance: list[MeetingAttendance] = Field(default_factory=list)
    attendance_rate: DataPoint = Field(default_factory=DataPoint)
    sponsored_legislation: list[SponsoredLegislation] = Field(default_factory=list)
    legislation_count: DataPoint = Field(default_factory=DataPoint)

    # --- Committee work ---
    committees: list[CommitteeAssignment] = Field(default_factory=list)
    committee_count: DataPoint = Field(default_factory=DataPoint)

    # --- Budget & priorities ---
    budget_items: list[BudgetItem] = Field(default_factory=list)
    budget_summary: DataPoint = Field(default_factory=DataPoint)

    # --- Public engagement ---
    public_statements: list[PublicStatement] = Field(default_factory=list)
    news_mention_count: DataPoint = Field(default_factory=DataPoint)

    # --- Campaign finance ---
    campaign_finance: list[CampaignFinanceEntry] = Field(default_factory=list)
    total_contributions: DataPoint = Field(default_factory=DataPoint)
    top_donors: DataPoint = Field(default_factory=DataPoint)

    # --- Responsiveness indicators (aspirational - mostly NOT available publicly) ---
    constituent_response_time: DataPoint = Field(default_factory=DataPoint)
    town_halls_held: DataPoint = Field(default_factory=DataPoint)
    public_comment_engagement: DataPoint = Field(default_factory=DataPoint)
    social_media_responsiveness: DataPoint = Field(default_factory=DataPoint)

    # --- Meta ---
    profile_generated_at: datetime = Field(default_factory=datetime.utcnow)
    data_sources_used: list[str] = Field(default_factory=list)
    data_sources_failed: list[str] = Field(default_factory=list)

    def availability_summary(self) -> dict[str, int]:
        """Summarize how many data points were found vs missing."""
        counts = {status.value: 0 for status in DataAvailability}
        for field_name, field_value in self:
            if isinstance(field_value, DataPoint):
                counts[field_value.availability.value] += 1
        return counts

    def gap_report(self) -> list[dict[str, str]]:
        """Return a list of data fields that could not be populated."""
        gaps = []
        for field_name, field_value in self:
            if isinstance(field_value, DataPoint):
                if field_value.availability in (DataAvailability.NOT_FOUND, DataAvailability.PARTIAL):
                    gaps.append({
                        "field": field_name,
                        "status": field_value.availability.value,
                        "notes": field_value.notes or "No data source identified",
                    })
        return gaps
