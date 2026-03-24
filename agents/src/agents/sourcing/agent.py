from __future__ import annotations

import json
import logging
from datetime import UTC, datetime

import asyncpg

from src.agents.base import BaseAgent
from src.agents.sourcing.matcher_1688 import Matcher1688
from src.agents.sourcing.scraper import scrape_product_url

logger = logging.getLogger(__name__)

_PLATFORM_MAP = {
    "1688": "ALIBABA_1688",
    "alibaba": "ALIBABA",
    "taobao": "TAOBAO",
    "tiktok": "TIKTOK",
}


class SourcingAgent(BaseAgent):
    agent_type = "sourcing"

    def __init__(self) -> None:
        self._matcher = Matcher1688()

    async def execute(self, pool: asyncpg.Pool, task_input: dict | None) -> dict:
        if not task_input:
            return {"error": "task_input is required"}

        action = task_input.get("action", "")

        if action == "scrape_url":
            return await self._handle_scrape_url(pool, task_input)
        elif action == "match_1688":
            return await self._handle_match_1688(pool, task_input)
        elif action == "match_pending":
            return await self._handle_match_pending(pool)
        else:
            return {"error": f"Unknown action: {action}"}

    async def _handle_scrape_url(self, pool: asyncpg.Pool, task_input: dict) -> dict:
        url = task_input.get("url", "").strip()
        company_id = task_input.get("company_id", "")
        if not url:
            return {"error": "url is required"}
        if not company_id:
            return {"error": "company_id is required"}

        if "1688.com" not in url and "alibaba.com" not in url:
            return {"error": "Only 1688.com and alibaba.com URLs supported"}

        data = await scrape_product_url(url)
        if not data or not data.get("title"):
            return {"error": "Failed to extract product data from URL"}

        title = data.get("title", "")
        source_platform = data.get("source_platform", "1688").lower()
        platform = _PLATFORM_MAP.get(source_platform, "OTHER")
        images = data.get("images", [])
        thumbnail_url = images[0] if images else None
        now = datetime.now(UTC)

        existing = await pool.fetchrow(
            "SELECT id FROM products WHERE source_url = $1 LIMIT 1", data.get("source_url", url)
        )

        if existing:
            product_id = existing["id"]
            await pool.execute(
                """
                UPDATE products
                SET name = $1, description = $2, raw_data = $3,
                    thumbnail_url = $4, updated_at = $5
                WHERE id = $6
                """,
                title,
                data.get("description", ""),
                json.dumps(data, ensure_ascii=False),
                thumbnail_url,
                now,
                product_id,
            )
        else:
            row = await pool.fetchrow(
                """
                INSERT INTO products
                    (id, company_id, name, description, status, source_url,
                     source_platform, thumbnail_url, category, raw_data,
                     created_at, updated_at)
                VALUES (gen_random_uuid(), $1, $2, $3, 'draft', $4, $5, $6, $7, $8, $9, $9)
                RETURNING id
                """,
                company_id,
                title,
                data.get("description", ""),
                data.get("source_url", url),
                platform,
                thumbnail_url,
                data.get("category_name"),
                json.dumps(data, ensure_ascii=False),
                now,
            )
            product_id = row["id"]

        logger.info(
            "scrape_url_saved product_id=%s title=%s images=%d",
            product_id,
            title[:80],
            len(images),
        )

        return {
            "product_id": str(product_id),
            "title": title[:80],
            "images": len(images),
        }

    async def _handle_match_1688(self, pool: asyncpg.Pool, task_input: dict) -> dict:
        product_id = task_input.get("product_id")
        if not product_id:
            return {"error": "product_id is required"}

        row = await pool.fetchrow(
            "SELECT id, product_name, image_url FROM douyin_live_products WHERE id = $1",
            product_id,
        )
        if not row:
            return {"error": f"Product {product_id} not found"}

        self._matcher._pool = pool
        result = await self._matcher.match_via_tmapi(
            row["id"], row["product_name"], row["image_url"]
        )

        if result:
            return {
                "matched": True,
                "title": result.title,
                "price": result.price,
                "url": result.url,
                "score": result.score,
            }
        return {"matched": False}

    async def _handle_match_pending(self, pool: asyncpg.Pool) -> dict:
        rows = await pool.fetch(
            """
            SELECT id, product_name, image_url
            FROM douyin_live_products
            WHERE match_status = 'PENDING' AND product_name != ''
            LIMIT 10
            """
        )

        matched_count = 0
        self._matcher._pool = pool
        for row in rows:
            result = await self._matcher.match_via_tmapi(
                row["id"], row["product_name"], row["image_url"]
            )
            if result:
                matched_count += 1

        return {"checked": len(rows), "matched": matched_count}
