from datetime import datetime, timezone

import asyncpg

from src.agents.base import BaseAgent


class InventoryAgent(BaseAgent):
    agent_type = "inventory"
    timeout_seconds = 60

    async def execute(self, pool: asyncpg.Pool, task_input: dict | None) -> dict:
        async with pool.acquire() as conn:
            async with conn.transaction():
                rows = await conn.fetch(
                    """
                    SELECT
                        i.id, i.product_id, i.company_id,
                        i.current_stock, i.reorder_point, i.reorder_quantity,
                        i.daily_sales_avg, i.lead_time_days,
                        p.name AS product_name
                    FROM inventory i
                    JOIN products p ON p.id = i.product_id
                    LEFT JOIN alerts a
                        ON a.product_id = i.product_id
                        AND a.type = 'stock_low'
                        AND a.is_read = false
                    WHERE i.current_stock <= i.reorder_point
                      AND i.current_stock > 0
                      AND a.id IS NULL
                    """
                )

                alerts_created = 0
                now = datetime.now(timezone.utc)
                for row in rows:
                    days_remaining = (
                        int(row["current_stock"] / row["daily_sales_avg"])
                        if row["daily_sales_avg"] > 0
                        else 999
                    )

                    await conn.execute(
                        """
                        INSERT INTO alerts (id, company_id, product_id, type, severity, title, message, is_read, created_at)
                        VALUES (gen_random_uuid(), $1, $2, 'stock_low', $3, $4, $5, false, $6)
                        """,
                        row["company_id"],
                        row["product_id"],
                        "critical" if days_remaining <= 7 else "warning",
                        f"재고 부족: {row['product_name']}",
                        f"현재고 {row['current_stock']}개, 발주점 {row['reorder_point']}개 이하. "
                        f"예상 소진일 {days_remaining}일. 추천 발주량 {row['reorder_quantity']}개.",
                        now,
                    )
                    alerts_created += 1

        return {
            "checked": len(rows),
            "alerts_created": alerts_created,
            "products": [
                {
                    "name": r["product_name"],
                    "current_stock": r["current_stock"],
                    "reorder_point": r["reorder_point"],
                }
                for r in rows
            ],
        }
