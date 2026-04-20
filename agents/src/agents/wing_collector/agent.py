"""
Wing 수집 에이전트 — 쿠팡 Wing 상품 데이터 신선도 모니터링.

실제 Wing 스크래핑은 Chrome 확장이 담당.
이 에이전트는 DB의 trafficStats/adSnapshot 데이터 신선도를 감시하고,
미갱신 상품을 식별하여 리포트한다.
"""
import asyncpg
from src.agents.base import BaseAgent


class WingCollectorAgent(BaseAgent):
    agent_type = "wing_collector"
    timeout_seconds = 120

    async def execute(self, pool: asyncpg.Pool, task_input: dict | None) -> dict:
        company_id = (task_input or {}).get("company_id")

        # 전체 활성 상품 수
        total_row = await pool.fetchrow(
            """
            SELECT count(*) AS cnt
            FROM products
            WHERE company_id = $1 AND is_deleted = false
            """,
            company_id,
        ) if company_id else await pool.fetchrow(
            "SELECT count(*) AS cnt FROM products WHERE is_deleted = false"
        )
        total = total_row["cnt"] if total_row else 0

        # trafficStats 기준 최근 동기화된 상품 (24시간 이내)
        synced_rows = await pool.fetch(
            """
            SELECT DISTINCT ts.product_id, p.name,
                   ts.created_at AS last_sync_at
            FROM traffic_stats ts
            JOIN products p ON p.id = ts.product_id
            WHERE ts.created_at > now() - interval '24 hours'
              AND p.is_deleted = false
            ORDER BY ts.created_at DESC
            LIMIT 500
            """
        )
        synced_ids = {r["product_id"] for r in synced_rows}

        # 24시간 이상 미갱신 (stale) 상품
        stale_rows = await pool.fetch(
            """
            SELECT p.id AS product_id, p.name,
                   max(ts.created_at) AS last_sync_at
            FROM products p
            LEFT JOIN traffic_stats ts ON ts.product_id = p.id
            WHERE p.is_deleted = false
            GROUP BY p.id, p.name
            HAVING max(ts.created_at) IS NULL
               OR max(ts.created_at) < now() - interval '24 hours'
            ORDER BY max(ts.created_at) ASC NULLS FIRST
            LIMIT 100
            """
        )

        products = []
        for r in stale_rows:
            products.append({
                "productId": str(r["product_id"]),
                "name": r["name"] or "",
                "status": "stale",
                "lastSyncAt": r["last_sync_at"].isoformat() if r["last_sync_at"] else None,
                "isStale": True,
            })

        # 마지막 전체 동기화 시점
        last_sync = await pool.fetchrow(
            "SELECT max(created_at) AS last_at FROM traffic_stats"
        )

        return {
            "products": products,
            "summary": {
                "total": total,
                "synced": len(synced_ids),
                "stale": len(stale_rows),
            },
            "lastSyncAt": last_sync["last_at"].isoformat() if last_sync and last_sync["last_at"] else None,
        }
