# Endorsement Crawler & Questionnaire Editor

A political race endorsement crawler with a web-based questionnaire editor for managing election configurations.

## Components

### Endorsement Crawler
An AI-powered agent that crawls the web to find endorsements for political candidates.

```bash
endorsement-crawler --config races.json --output results --max-pages 20
```

### Questionnaire Editor
A web-based UI for creating and managing election questionnaires with:
- Version control and change tracking
- Import/export JSON files
- Date and geographic area filtering
- Crawler integration

```bash
questionnaire-editor --port 5000
```

## Installation

```bash
pip install -e .
```

## Usage

### Starting the Questionnaire Editor

```bash
questionnaire-editor
```

Then open http://127.0.0.1:5000 in your browser.

### Running the Crawler

```bash
endorsement-crawler --config data/fort_worth_charlotte_2026.json --output results
```

## JSON Schema

Questionnaires follow this structure:

```json
{
  "name": "2026 Primary Races - Fort Worth",
  "description": "Primary races for Fort Worth, TX",
  "races": [
    {
      "name": "US Senate Texas 2026",
      "position": "US Senator",
      "race_type": "federal",
      "year": 2026,
      "state": "TX",
      "city": "Fort Worth",
      "candidates": [
        {"name": "Candidate Name", "party": "Democratic", "incumbent": false}
      ],
      "primary_date": "2026-03-03"
    }
  ]
}
```
