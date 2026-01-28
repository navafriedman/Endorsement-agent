#!/usr/bin/env python3
"""Run the Questionnaire Editor web application."""

import argparse
import os
import sys

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from questionnaire_editor import create_app


def main():
    parser = argparse.ArgumentParser(description='Run the Questionnaire Editor')
    parser.add_argument('--host', default='127.0.0.1', help='Host to bind to')
    parser.add_argument('--port', type=int, default=5000, help='Port to bind to')
    parser.add_argument('--debug', action='store_true', help='Enable debug mode')
    args = parser.parse_args()

    app = create_app()

    print(f"\n{'='*60}")
    print("  Election Questionnaire Editor")
    print(f"{'='*60}")
    print(f"\n  Starting server at http://{args.host}:{args.port}")
    print("\n  Features:")
    print("    - Create and edit election questionnaires")
    print("    - Track changes with version control")
    print("    - Import/export JSON files")
    print("    - Filter by date and geographic area")
    print("    - Trigger endorsement crawler")
    print(f"\n{'='*60}\n")

    app.run(host=args.host, port=args.port, debug=args.debug)


if __name__ == '__main__':
    main()
