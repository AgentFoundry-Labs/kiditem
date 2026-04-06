from __future__ import annotations

import asyncpg
import structlog

from src.agents.base import BaseAgent

logger = structlog.get_logger()


class SourcingAgent(BaseAgent):
    agent_type = "sourcing"
    timeout_seconds = 180

    async def execute(self, pool: asyncpg.Pool, task_input: dict | None) -> dict:
        if not task_input:
            raise ValueError("task_input is required for sourcing agent")

        action = task_input.get("action")
        if action == "scrape_url":
            return await self._scrape_url(task_input)
        raise ValueError(f"Unknown sourcing action: {action}")

    async def _scrape_url(self, task_input: dict) -> dict:
        url = task_input.get("url")
        if not url:
            raise ValueError("url is required for scrape_url action")

        logger.info("scraping_url", url=url)

        from src.agents.sourcing.scraper import scrape_product_url

        data = await scrape_product_url(url)

        if not data:
            logger.warning("scraping_failed", url=url)
            return {"ok": False, "error": "Failed to extract data", "source_url": url}

        logger.info("scraping_success", url=url, title=data.get("title", ""))
        return {
            "ok": True,
            "scraped_data": data,
            "source_url": url,
            "platform": data.get("platform"),
        }
