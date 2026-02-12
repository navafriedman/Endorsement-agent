"""CLI entry point for building supervisor responsiveness profiles.

Usage:
    python -m supervisor_profile.cli --name "Chris Lopez" --client monterey \
        --jurisdiction "Monterey County" --state CA --district 3

    python -m supervisor_profile.cli --name "Chris Lopez" --client monterey \
        --jurisdiction "Monterey County" --state CA --district 3 --output profile.json
"""

import argparse
import asyncio
import json
import sys
from datetime import datetime

from .profile_builder import ProfileBuilder


def _json_serial(obj):
    """JSON serializer for objects not serializable by default json code."""
    if isinstance(obj, datetime):
        return obj.isoformat()
    raise TypeError(f"Type {type(obj)} not serializable")


def print_profile_report(profile):
    """Print a human-readable report of the profile."""
    print("\n")
    print("=" * 70)
    print(f"  RESPONSIVENESS PROFILE: {profile.name}")
    print(f"  {profile.title}, District {profile.district}")
    print(f"  {profile.jurisdiction}, {profile.state}")
    print("=" * 70)

    # Availability summary
    summary = profile.availability_summary()
    total = sum(summary.values())
    print(f"\n--- DATA AVAILABILITY ({total} tracked fields) ---")
    for status, count in summary.items():
        bar = "#" * count
        print(f"  {status:>15}: {count:>3}  {bar}")

    # Contact info
    print("\n--- CONTACT INFO ---")
    print(f"  Official page: {profile.official_page_url.value or 'Not found'}")
    print(f"  Email:         {profile.email.value or 'Not found'}")
    print(f"  Phone:         {profile.phone.value or 'Not found'}")

    # Legislative activity
    print("\n--- LEGISLATIVE ACTIVITY ---")
    print(f"  Total votes recorded:  {len(profile.votes)}")
    print(f"  Meetings scanned:      {len(profile.meeting_attendance)}")
    if profile.attendance_rate.value is not None:
        print(f"  Attendance rate:       {profile.attendance_rate.value}%")
        print(f"    ({profile.attendance_rate.notes})")
    print(f"  Sponsored legislation: {len(profile.sponsored_legislation)}")

    if profile.votes:
        # Vote breakdown
        vote_values = {}
        for v in profile.votes:
            vote_values[v.vote_value] = vote_values.get(v.vote_value, 0) + 1
        print(f"\n  Vote breakdown:")
        for val, count in sorted(vote_values.items(), key=lambda x: -x[1]):
            print(f"    {val:>20}: {count}")

    if profile.sponsored_legislation:
        print(f"\n  Recent sponsored items:")
        for item in profile.sponsored_legislation[:5]:
            print(f"    - [{item.matter_file or 'N/A'}] {item.matter_title[:60]}")

    # Committees
    print(f"\n--- COMMITTEE ASSIGNMENTS ({len(profile.committees)}) ---")
    for c in profile.committees[:10]:
        role = f" ({c.role})" if c.role else ""
        print(f"  - {c.name}{role}")
    if len(profile.committees) > 10:
        print(f"  ... and {len(profile.committees) - 10} more")

    # News
    print(f"\n--- PUBLIC STATEMENTS / NEWS ({len(profile.public_statements)}) ---")
    for s in profile.public_statements[:5]:
        print(f"  - {s.title[:70]}")
        print(f"    {s.source_url}")
    if len(profile.public_statements) > 5:
        print(f"  ... and {len(profile.public_statements) - 5} more")

    # Campaign finance
    print(f"\n--- CAMPAIGN FINANCE ---")
    if profile.total_contributions.value is not None:
        print(f"  Total contributions: {profile.total_contributions.value}")
    else:
        print(f"  Status: {profile.total_contributions.availability.value}")
        print(f"  Notes:  {profile.total_contributions.notes}")

    # Gaps
    gaps = profile.gap_report()
    print(f"\n--- DATA GAPS ({len(gaps)} fields missing or partial) ---")
    for gap in gaps:
        print(f"  [{gap['status']:>9}] {gap['field']}")
        if gap["notes"] != "No data source identified":
            # Wrap long notes
            notes = gap["notes"]
            while notes:
                print(f"             {notes[:65]}")
                notes = notes[65:]

    # Sources
    print(f"\n--- DATA SOURCES ---")
    print(f"  Used ({len(profile.data_sources_used)}):")
    for src in profile.data_sources_used:
        print(f"    + {src}")
    print(f"  Failed ({len(profile.data_sources_failed)}):")
    for src in profile.data_sources_failed:
        print(f"    x {src}")

    print("\n" + "=" * 70)


async def async_main(args):
    async with ProfileBuilder(
        supervisor_name=args.name,
        legistar_client_name=args.client,
        jurisdiction=args.jurisdiction,
        state=args.state,
        district=args.district,
    ) as builder:
        profile = await builder.build(max_meetings_to_scan=args.max_meetings)

    # Print report
    print_profile_report(profile)

    # Save JSON if requested
    if args.output:
        data = profile.model_dump(mode="json")
        with open(args.output, "w") as f:
            json.dump(data, f, indent=2, default=_json_serial)
        print(f"\nJSON profile saved to: {args.output}")


def main():
    parser = argparse.ArgumentParser(
        description="Build a responsiveness profile for a supervisor using public data",
    )
    parser.add_argument("--name", required=True, help="Supervisor's full name")
    parser.add_argument("--client", required=True, help="Legistar client name (e.g., 'monterey')")
    parser.add_argument("--jurisdiction", required=True, help="Jurisdiction name (e.g., 'Monterey County')")
    parser.add_argument("--state", required=True, help="State abbreviation (e.g., 'CA')")
    parser.add_argument("--district", default=None, help="District number or name")
    parser.add_argument("--output", "-o", default=None, help="Output JSON file path")
    parser.add_argument("--max-meetings", type=int, default=20, help="Max meetings to scan for votes")

    args = parser.parse_args()
    asyncio.run(async_main(args))


if __name__ == "__main__":
    main()
