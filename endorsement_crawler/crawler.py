"""Main crawler orchestration."""

import asyncio
import json
from datetime import datetime
from pathlib import Path
from typing import Optional

from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, TaskProgressColumn
from rich.table import Table

from .extractor import EndorsementExtractor
from .models import CrawlResult, Endorsement, Race, RaceConfig
from .scraper import WebScraper
from .search import WebSearcher


console = Console()


class EndorsementCrawler:
    """Main crawler for finding political endorsements."""

    def __init__(
        self,
        anthropic_api_key: Optional[str] = None,
        output_dir: str = "output"
    ):
        self.anthropic_api_key = anthropic_api_key
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(exist_ok=True)

    async def crawl_race(
        self,
        race: Race,
        max_pages: int = 20,
        validate_endorsements: bool = False
    ) -> CrawlResult:
        """Crawl for endorsements for a single race."""
        console.print(f"\n[bold blue]Crawling: {race.name}[/bold blue]")
        console.print(f"  Position: {race.position}")
        console.print(f"  Location: {race.city or race.state}, {race.state}")
        console.print(f"  Year: {race.year}")
        if race.candidates:
            console.print(f"  Candidates: {', '.join(c.name for c in race.candidates)}")

        result = CrawlResult(race=race)

        async with WebSearcher() as searcher:
            async with WebScraper() as scraper:
                extractor = EndorsementExtractor(api_key=self.anthropic_api_key)

                # Search for endorsement pages
                console.print("\n[yellow]Searching for endorsement pages...[/yellow]")

                # Search by race
                search_results = await searcher.search_for_race(race)

                # Also search by candidate if we have them
                for candidate in race.candidates:
                    candidate_results = await searcher.search_for_candidate(candidate, race)
                    search_results.extend(candidate_results)

                # Filter to relevant results
                relevant_results = searcher.filter_relevant_results(search_results)

                # Deduplicate by URL
                seen_urls = set()
                unique_results = []
                for r in relevant_results:
                    if r.url not in seen_urls:
                        seen_urls.add(r.url)
                        unique_results.append(r)

                console.print(f"[green]Found {len(unique_results)} potentially relevant pages[/green]")

                # Limit pages to crawl
                pages_to_crawl = unique_results[:max_pages]

                with Progress(
                    SpinnerColumn(),
                    TextColumn("[progress.description]{task.description}"),
                    BarColumn(),
                    TaskProgressColumn(),
                    console=console
                ) as progress:
                    task = progress.add_task(
                        "[cyan]Processing pages...",
                        total=len(pages_to_crawl)
                    )

                    all_endorsements = []

                    for search_result in pages_to_crawl:
                        progress.update(task, description=f"[cyan]Processing: {search_result.url[:50]}...")

                        try:
                            # Fetch and parse the page
                            page = await scraper.fetch_page(search_result.url)
                            if not page:
                                progress.advance(task)
                                continue

                            result.sources_checked.append(search_result.url)

                            # Extract endorsements
                            endorsements = extractor.extract_endorsements(page, race)

                            if endorsements:
                                console.print(f"\n  [green]Found {len(endorsements)} endorsement(s) on {search_result.url}[/green]")
                                for e in endorsements:
                                    console.print(f"    - {e.endorser_name} endorses {e.candidate_name}")

                            all_endorsements.extend(endorsements)

                        except Exception as e:
                            result.errors.append(f"Error processing {search_result.url}: {str(e)}")

                        progress.advance(task)

                        # Be respectful with rate limiting
                        await asyncio.sleep(0.5)

                # Deduplicate endorsements
                unique_endorsements = list(set(all_endorsements))
                result.endorsements = unique_endorsements
                result.completed_at = datetime.utcnow()

                console.print(f"\n[bold green]Found {len(unique_endorsements)} unique endorsement(s) for {race.name}[/bold green]")

        return result

    async def crawl_config(
        self,
        config: RaceConfig,
        max_pages_per_race: int = 20
    ) -> list[CrawlResult]:
        """Crawl all races in a configuration."""
        console.print(f"\n[bold]Starting crawl for: {config.name}[/bold]")
        console.print(f"Total races to crawl: {len(config.races)}")

        results = []
        for race in config.races:
            try:
                result = await self.crawl_race(race, max_pages=max_pages_per_race)
                results.append(result)
                self._save_result(result)
            except Exception as e:
                console.print(f"[red]Failed to crawl {race.name}: {e}[/red]")

        # Save combined results
        self._save_combined_results(config, results)

        return results

    def _save_result(self, result: CrawlResult):
        """Save crawl result to a JSON file."""
        filename = f"{result.race.name.replace(' ', '_').lower()}_{result.race.year}.json"
        filepath = self.output_dir / filename

        data = {
            "race": result.race.model_dump(),
            "endorsements": [e.model_dump() for e in result.endorsements],
            "sources_checked": result.sources_checked,
            "errors": result.errors,
            "started_at": result.started_at.isoformat(),
            "completed_at": result.completed_at.isoformat() if result.completed_at else None
        }

        with open(filepath, 'w') as f:
            json.dump(data, f, indent=2, default=str)

        console.print(f"[dim]Saved results to {filepath}[/dim]")

    def _save_combined_results(self, config: RaceConfig, results: list[CrawlResult]):
        """Save all results to a combined JSON file."""
        filename = f"{config.name.replace(' ', '_').lower()}_all_results.json"
        filepath = self.output_dir / filename

        data = {
            "config": config.model_dump(),
            "results": [
                {
                    "race": r.race.model_dump(),
                    "endorsements": [e.model_dump() for e in r.endorsements],
                    "sources_checked": r.sources_checked,
                    "errors": r.errors,
                    "started_at": r.started_at.isoformat(),
                    "completed_at": r.completed_at.isoformat() if r.completed_at else None
                }
                for r in results
            ],
            "summary": {
                "total_races": len(results),
                "total_endorsements": sum(len(r.endorsements) for r in results),
                "total_sources_checked": sum(len(r.sources_checked) for r in results),
                "total_errors": sum(len(r.errors) for r in results)
            }
        }

        with open(filepath, 'w') as f:
            json.dump(data, f, indent=2, default=str)

        console.print(f"\n[bold]Saved combined results to {filepath}[/bold]")

    def print_summary(self, results: list[CrawlResult]):
        """Print a summary table of results."""
        table = Table(title="Endorsement Crawl Summary")
        table.add_column("Race", style="cyan")
        table.add_column("Endorsements", justify="right", style="green")
        table.add_column("Sources Checked", justify="right")
        table.add_column("Errors", justify="right", style="red")

        total_endorsements = 0
        total_sources = 0
        total_errors = 0

        for result in results:
            table.add_row(
                result.race.name,
                str(len(result.endorsements)),
                str(len(result.sources_checked)),
                str(len(result.errors))
            )
            total_endorsements += len(result.endorsements)
            total_sources += len(result.sources_checked)
            total_errors += len(result.errors)

        table.add_section()
        table.add_row(
            "[bold]Total[/bold]",
            f"[bold]{total_endorsements}[/bold]",
            f"[bold]{total_sources}[/bold]",
            f"[bold]{total_errors}[/bold]"
        )

        console.print(table)

        # Print all endorsements
        if total_endorsements > 0:
            console.print("\n[bold]All Endorsements Found:[/bold]")
            for result in results:
                if result.endorsements:
                    console.print(f"\n[cyan]{result.race.name}:[/cyan]")
                    for e in result.endorsements:
                        confidence = "high" if e.confidence >= 0.8 else "medium" if e.confidence >= 0.6 else "low"
                        console.print(f"  • {e.endorser_name} ({e.endorser_type.value}) → {e.candidate_name} [{confidence} confidence]")
                        if e.excerpt:
                            console.print(f"    [dim]\"{e.excerpt[:100]}...\"[/dim]")
                        console.print(f"    [dim]Source: {e.source_url}[/dim]")
