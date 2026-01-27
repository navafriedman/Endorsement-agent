"""Command-line interface for the endorsement crawler."""

import argparse
import asyncio
import json
import sys
from pathlib import Path

from rich.console import Console

from .crawler import EndorsementCrawler
from .models import Candidate, Race, RaceConfig, RaceType


console = Console()


def load_config_from_file(filepath: str) -> RaceConfig:
    """Load race configuration from a JSON file."""
    with open(filepath, 'r') as f:
        data = json.load(f)

    races = []
    for race_data in data.get("races", []):
        candidates = [
            Candidate(**c) for c in race_data.get("candidates", [])
        ]
        race = Race(
            name=race_data["name"],
            position=race_data["position"],
            race_type=RaceType(race_data.get("race_type", "other")),
            year=race_data["year"],
            state=race_data["state"],
            city=race_data.get("city"),
            district=race_data.get("district"),
            candidates=candidates,
            primary_date=race_data.get("primary_date"),
            general_date=race_data.get("general_date")
        )
        races.append(race)

    return RaceConfig(
        name=data.get("name", "Unnamed Config"),
        description=data.get("description"),
        races=races
    )


def create_sample_config() -> RaceConfig:
    """Create a sample configuration for testing."""
    return RaceConfig(
        name="Sample Races",
        description="Sample configuration for testing",
        races=[
            Race(
                name="US Senate Texas",
                position="US Senator",
                race_type=RaceType.FEDERAL,
                year=2026,
                state="TX",
                city="Fort Worth",
                candidates=[
                    Candidate(name="John Cornyn", party="Republican", incumbent=True),
                ]
            )
        ]
    )


async def run_crawler(args):
    """Run the endorsement crawler."""
    crawler = EndorsementCrawler(
        anthropic_api_key=args.api_key,
        output_dir=args.output
    )

    if args.config:
        config = load_config_from_file(args.config)
    else:
        console.print("[yellow]No config file specified. Use --config to specify a race configuration file.[/yellow]")
        console.print("[dim]You can generate a sample config with: endorsement-crawler --generate-sample[/dim]")
        return

    results = await crawler.crawl_config(
        config,
        max_pages_per_race=args.max_pages
    )

    crawler.print_summary(results)


def generate_sample_config(output_path: str):
    """Generate a sample configuration file."""
    sample = {
        "name": "2026 Primary Races - Fort Worth & Charlotte",
        "description": "Primary races for residents of Fort Worth, TX and Charlotte, NC",
        "races": [
            {
                "name": "US Senate Texas 2026",
                "position": "US Senator",
                "race_type": "federal",
                "year": 2026,
                "state": "TX",
                "city": "Fort Worth",
                "candidates": [
                    {"name": "Candidate Name", "party": "Democratic", "incumbent": False},
                    {"name": "Candidate Name 2", "party": "Republican", "incumbent": True}
                ],
                "primary_date": "2026-03-03"
            },
            {
                "name": "NC Governor 2026",
                "position": "Governor",
                "race_type": "state",
                "year": 2026,
                "state": "NC",
                "city": "Charlotte",
                "candidates": [],
                "primary_date": "2026-05-05"
            }
        ]
    }

    with open(output_path, 'w') as f:
        json.dump(sample, f, indent=2)

    console.print(f"[green]Sample configuration saved to {output_path}[/green]")
    console.print("[dim]Edit this file with your actual race data and candidates.[/dim]")


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Crawl for political race endorsements"
    )
    parser.add_argument(
        "--config", "-c",
        help="Path to race configuration JSON file"
    )
    parser.add_argument(
        "--output", "-o",
        default="output",
        help="Output directory for results (default: output)"
    )
    parser.add_argument(
        "--max-pages", "-m",
        type=int,
        default=20,
        help="Maximum pages to crawl per race (default: 20)"
    )
    parser.add_argument(
        "--api-key",
        help="Anthropic API key (or set ANTHROPIC_API_KEY env var)"
    )
    parser.add_argument(
        "--generate-sample",
        metavar="FILE",
        help="Generate a sample configuration file"
    )

    args = parser.parse_args()

    if args.generate_sample:
        generate_sample_config(args.generate_sample)
        return

    if not args.config:
        parser.print_help()
        sys.exit(1)

    asyncio.run(run_crawler(args))


if __name__ == "__main__":
    main()
