from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from urllib.parse import quote

import asyncpg
import httpx
import structlog

from src import config as cfg

logger = structlog.get_logger()

_TMAPI_KEYWORD_URL = f"{cfg.TMAPI_BASE_URL}/taobao/search/keyword"
_TMAPI_IMAGE_URL = f"{cfg.TMAPI_BASE_URL}/taobao/search/image"
_TMAPI_IMAGE_CONVERT_URL = f"{cfg.TMAPI_BASE_URL}/tools/image-url-convert"
_1688_SEARCH_BASE = "https://s.1688.com/selloffer/offer_search.htm"
_REQUEST_TIMEOUT = 15.0


@dataclass
class MatchCandidate:
    title: str
    price: float
    url: str
    image_url: str
    score: float = 0.0


class Matcher1688:
    def __init__(self) -> None:
        self._running = False
        self._task: asyncio.Task[None] | None = None
        self._poll_interval = 10.0
        self._pending_jobs: dict[str, list[uuid.UUID]] = {}

    async def start(self, pool: asyncpg.Pool) -> None:
        self._running = True
        self._pool = pool
        self._task = asyncio.create_task(self._worker_loop())
        logger.info("1688 matcher worker started")

    async def stop(self) -> None:
        self._running = False
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("1688 matcher worker stopped")

    async def _worker_loop(self) -> None:
        consecutive_errors = 0
        while self._running:
            try:
                await self._enqueue_pending_products()
                consecutive_errors = 0
            except asyncio.CancelledError:
                break
            except Exception:
                consecutive_errors += 1
                if consecutive_errors == 1:
                    logger.warning("Matcher worker error", exc_info=True)
                elif consecutive_errors % 30 == 0:
                    logger.warning("Matcher worker still failing count=%d", consecutive_errors)
            await asyncio.sleep(self._poll_interval)

    async def _enqueue_pending_products(self, pool: asyncpg.Pool | None = None) -> None:
        pool = pool or self._pool
        rows = await pool.fetch(
            """
            SELECT id, promotion_id, product_name, image_url
            FROM douyin_live_products
            WHERE match_status = 'PENDING'
              AND product_name != ''
            LIMIT 10
            """
        )
        for row in rows:
            if not self._running:
                break
            search_url = self._build_1688_search_url(row["product_name"])
            product_id = row["id"]
            if search_url not in self._pending_jobs:
                self._pending_jobs[search_url] = []
                logger.info(
                    "Queued 1688 search promotion_id=%s product_name=%s",
                    row["promotion_id"],
                    row["product_name"][:40],
                )
            self._pending_jobs[search_url].append(product_id)

    def _build_1688_search_url(self, product_name: str) -> str:
        return f"{_1688_SEARCH_BASE}?keywords={quote(product_name)}"

    async def process_extension_results(
        self, source_url: str, items: list[dict], pool: asyncpg.Pool | None = None
    ) -> int:
        pool = pool or self._pool
        product_ids = self._pending_jobs.pop(source_url, [])
        if not product_ids:
            for pending_url in list(self._pending_jobs.keys()):
                if "1688.com" in pending_url and "1688.com" in source_url:
                    product_ids = self._pending_jobs.pop(pending_url, [])
                    break

        if not product_ids:
            return 0

        candidates = self._parse_extension_items(items)
        keyword = self._extract_keyword_from_url(source_url)
        scored = self._deduplicate_and_score(candidates, keyword)
        matched_count = 0

        for product_id in product_ids:
            if scored:
                best = scored[0]
                await self._update_match(
                    pool,
                    product_id,
                    "MATCHED",
                    url=best.url,
                    price=best.price,
                    title=best.title,
                    score=best.score,
                )
                matched_count += 1
            else:
                await self._update_match(pool, product_id, "NO_MATCH")

        return matched_count

    def _parse_extension_items(self, items: list[dict]) -> list[MatchCandidate]:
        candidates: list[MatchCandidate] = []
        for item in items[:30]:
            title = item.get("title", "")
            price = 0.0
            raw_price = item.get("price_min") or item.get("price", 0)
            if raw_price:
                try:
                    price = float(raw_price)
                except (ValueError, TypeError):
                    pass
            candidates.append(
                MatchCandidate(
                    title=title,
                    price=price,
                    url=item.get("url", "") or item.get("detail_url", ""),
                    image_url=item.get("thumbnail", "") or item.get("pic_url", ""),
                )
            )
        return candidates

    def _extract_keyword_from_url(self, url: str) -> str:
        if "keywords=" in url:
            part = url.split("keywords=", 1)[1]
            return part.split("&", 1)[0].replace("+", " ")
        return ""

    async def match_via_tmapi(
        self, pool: asyncpg.Pool, product_id: uuid.UUID, product_name: str, image_url: str
    ) -> MatchCandidate | None:
        try:
            candidates = await self._tmapi_search_candidates(product_name, image_url)
            if not candidates:
                await self._update_match(pool, product_id, "NO_MATCH")
                return None

            best = max(candidates, key=lambda c: c.score)
            await self._update_match(
                pool,
                product_id,
                "MATCHED",
                url=best.url,
                price=best.price,
                title=best.title,
                score=best.score,
            )
            return best
        except Exception:
            logger.error("tmapi_match_failed", product_id=str(product_id), exc_info=True)
            await self._update_match(pool, product_id, "FAILED")
            return None

    async def _tmapi_search_candidates(self, keyword: str, image_url: str) -> list[MatchCandidate]:
        if not cfg.TMAPI_TOKEN:
            return []

        tasks: list[asyncio.Task[list[MatchCandidate]]] = []
        if keyword:
            tasks.append(asyncio.create_task(self._tmapi_search_keyword(keyword)))
        if image_url:
            tasks.append(asyncio.create_task(self._tmapi_search_image(image_url)))

        if not tasks:
            return []

        results = await asyncio.gather(*tasks, return_exceptions=True)
        candidates: list[MatchCandidate] = []
        for result in results:
            if isinstance(result, list):
                candidates.extend(result)

        return self._deduplicate_and_score(candidates, keyword)

    async def _tmapi_search_keyword(self, keyword: str) -> list[MatchCandidate]:
        async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT) as client:
            resp = await client.get(
                _TMAPI_KEYWORD_URL,
                params={"apiToken": cfg.TMAPI_TOKEN, "keyword": keyword, "page": 1},
            )
            resp.raise_for_status()
            data = resp.json()

        items = data.get("data", {}).get("items", [])
        return [
            MatchCandidate(
                title=item.get("title", ""),
                price=float(item.get("price", 0)),
                url=item.get("detail_url", "") or item.get("item_url", ""),
                image_url=item.get("pic_url", ""),
            )
            for item in items[:20]
        ]

    async def _tmapi_search_image(self, image_url: str) -> list[MatchCandidate]:
        converted = await self._tmapi_convert_image(image_url)
        if not converted:
            return []

        async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT) as client:
            resp = await client.get(
                _TMAPI_IMAGE_URL,
                params={"apiToken": cfg.TMAPI_TOKEN, "img_url": converted},
            )
            resp.raise_for_status()
            data = resp.json()

        items = data.get("data", {}).get("items", [])
        return [
            MatchCandidate(
                title=item.get("title", ""),
                price=float(item.get("price", 0)),
                url=item.get("detail_url", "") or item.get("item_url", ""),
                image_url=item.get("pic_url", ""),
            )
            for item in items[:20]
        ]

    async def _tmapi_convert_image(self, image_url: str) -> str:
        if "alicdn.com" in image_url or "1688.com" in image_url:
            return image_url
        try:
            async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT) as client:
                resp = await client.post(
                    _TMAPI_IMAGE_CONVERT_URL,
                    json={"apiToken": cfg.TMAPI_TOKEN, "url": image_url},
                )
                resp.raise_for_status()
                data = resp.json()
            return data.get("data", {}).get("url", "")
        except Exception:
            logger.debug("Image URL conversion failed url=%s", image_url, exc_info=True)
            return ""

    def _deduplicate_and_score(
        self, candidates: list[MatchCandidate], keyword: str
    ) -> list[MatchCandidate]:
        seen_urls: set[str] = set()
        unique: list[MatchCandidate] = []
        for c in candidates:
            if c.url and c.url not in seen_urls:
                seen_urls.add(c.url)
                c.score = self._calculate_score(c, keyword)
                unique.append(c)
        unique.sort(key=lambda c: c.score, reverse=True)
        return unique[:10]

    def _calculate_score(self, candidate: MatchCandidate, keyword: str) -> float:
        score = 0.0
        title_lower = candidate.title.lower()
        keyword_lower = keyword.lower()

        keyword_tokens = keyword_lower.split()
        if keyword_tokens:
            matched = sum(1 for t in keyword_tokens if t in title_lower)
            score += (matched / len(keyword_tokens)) * 50.0

        if 0 < candidate.price <= 500:
            score += 20.0
        elif candidate.price > 500:
            score += 10.0

        if candidate.url:
            score += 10.0
        if candidate.image_url:
            score += 10.0

        return min(score, 100.0)

    async def _update_match(
        self,
        pool: asyncpg.Pool,
        product_id: uuid.UUID,
        status: str,
        *,
        url: str | None = None,
        price: float | None = None,
        title: str | None = None,
        score: float | None = None,
    ) -> None:
        matched_at = datetime.now(UTC) if status == "MATCHED" else None
        await pool.execute(
            """
            UPDATE douyin_live_products
            SET match_status = $1,
                matched_1688_url = COALESCE($2, matched_1688_url),
                matched_1688_price = COALESCE($3, matched_1688_price),
                matched_1688_title = COALESCE($4, matched_1688_title),
                match_score = COALESCE($5, match_score),
                matched_at = COALESCE($6, matched_at)
            WHERE id = $7
            """,
            status,
            url,
            price,
            title,
            score,
            matched_at,
            product_id,
        )
