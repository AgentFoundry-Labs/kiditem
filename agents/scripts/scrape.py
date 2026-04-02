#!/usr/bin/env python3
"""CLI wrapper for sourcing scraper and 1688 matcher.

Called by Claude CLI sourcing_scraper agent:
  python agents/scripts/scrape.py --action scrape_url --url "https://..."
  python agents/scripts/scrape.py --action match_1688 --keyword "..." [--image-url "..."]

Outputs JSON to stdout. Reuses existing logic from agents/src/agents/sourcing/.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import os
from pathlib import Path

# Add agents/ root to sys.path so `src.` imports work
_AGENTS_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_AGENTS_ROOT))

# Load .env before config import
from dotenv import load_dotenv
load_dotenv(_AGENTS_ROOT / ".env")


def _scrape_url(url: str) -> dict:
    """Scrape a 1688/Alibaba product URL and return extracted data."""
    from src.agents.sourcing.scraper import scrape_product_url

    result = asyncio.run(scrape_product_url(url))
    if not result:
        return {"error": "Failed to extract product data from URL", "url": url}
    return result


def _match_1688(keyword: str, image_url: str | None) -> dict:
    """Search 1688 via TMAPI for matching products."""
    from src.agents.sourcing.matcher_1688 import Matcher1688, MatchCandidate

    matcher = Matcher1688()

    async def _run() -> list[MatchCandidate]:
        return await matcher._tmapi_search_candidates(keyword, image_url or "")

    candidates = asyncio.run(_run())
    if not candidates:
        return {"matched": False, "keyword": keyword, "candidates": []}

    return {
        "matched": True,
        "keyword": keyword,
        "candidates": [
            {
                "title": c.title,
                "price": c.price,
                "url": c.url,
                "image_url": c.image_url,
                "score": c.score,
            }
            for c in candidates[:10]
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Sourcing scraper/matcher CLI")
    parser.add_argument(
        "--action",
        required=True,
        choices=["scrape_url", "match_1688"],
        help="Action to perform",
    )
    parser.add_argument("--url", help="Product URL to scrape (for scrape_url action)")
    parser.add_argument("--keyword", help="Search keyword (for match_1688 action)")
    parser.add_argument("--image-url", help="Image URL for image search (for match_1688 action)")

    args = parser.parse_args()

    if args.action == "scrape_url":
        if not args.url:
            print(json.dumps({"error": "--url is required for scrape_url action"}))
            sys.exit(1)
        result = _scrape_url(args.url)

    elif args.action == "match_1688":
        if not args.keyword:
            print(json.dumps({"error": "--keyword is required for match_1688 action"}))
            sys.exit(1)
        result = _match_1688(args.keyword, args.image_url)

    else:
        print(json.dumps({"error": f"Unknown action: {args.action}"}))
        sys.exit(1)

    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
