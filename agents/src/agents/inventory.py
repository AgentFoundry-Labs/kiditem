import json
from datetime import datetime, timezone

import asyncpg

from src.agents.base import BaseAgent


class InventoryAgent(BaseAgent):
    agent_type = "inventory"

    async def execute(self, pool: asyncpg.Pool, task_input: dict | None) -> dict:
        rows = await pool.fetch(
            """
            SELECT
                i.id, i.product_id, i.company_id,
                i.current_stock, i.reorder_point, i.reorder_quantity,
                i.daily_sales_avg, i.lead_time_days,
                p.name AS product_name
            FROM inventory i
            JOIN products p ON p.id = i.product_id
            WHERE i.current_stock <= i.reorder_point
              AND i.current_stock > 0
            """
        )

        alerts_created = 0
        for row in rows:
            days_remaining = (
                int(row["current_stock"] / row["daily_sales_avg"])
                if row["daily_sales_avg"] > 0
                else 999
            )

            existing = await pool.fetchval(
                """
                SELECT COUNT(*) FROM alerts
                WHERE product_id = $1 AND type = 'stock_low' AND is_read = false
                """,
                row["product_id"],
            )

            if existing > 0:
                continue

            await pool.execute(
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
                datetime.now(timezone.utc),
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
