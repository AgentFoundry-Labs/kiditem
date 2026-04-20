"""
대시보드 동기화 에이전트 — 대시보드 데이터 정합성 확인 및 KPI 스냅샷.

주요 테이블의 데이터 신선도를 체크하고,
KPI 스냅샷을 계산하여 전일 대비 변동을 감지한다.
"""
import asyncpg
from src.agents.base import BaseAgent


class DashboardSyncAgent(BaseAgent):
    agent_type = "dashboard_sync"
    timeout_seconds = 120

    async def execute(self, pool: asyncpg.Pool, task_input: dict | None) -> dict:
        issues: list[str] = []

        # 데이터 신선도 체크
        freshness = {}
        for table, col in [
            ("coupang_orders", "ordered_at"),
            ("ads", "date"),
            ("inventory", "updated_at"),
            ("profit_loss", "month"),
        ]:
            row = await pool.fetchrow(
                f'SELECT max("{col}") AS last_at FROM {table}'
            )
            last_at = row["last_at"] if row else None
            freshness_key = table.replace("coupang_", "").replace("profit_loss", "profitLoss")
            freshness[freshness_key] = last_at.isoformat() if last_at else "no_data"

            if last_at is None:
                issues.append(f"{table}: 데이터 없음")

        # 이번 달 KPI
        current = await pool.fetchrow(
            """
            SELECT
                coalesce(sum(o.total_price), 0) AS revenue,
                count(o.id) AS orders
            FROM coupang_orders o
            WHERE o.ordered_at >= date_trunc('month', current_date)
            """
        )

        ad_current = await pool.fetchrow(
            """
            SELECT coalesce(sum(ad_spend), 0) AS ad_spend
            FROM ads
            WHERE date >= date_trunc('month', current_date)
            """
        )

        pl_current = await pool.fetchrow(
            """
            SELECT coalesce(sum(net_profit), 0) AS profit
            FROM profit_loss
            WHERE month >= date_trunc('month', current_date)
            """
        )

        revenue = float(current["revenue"]) if current else 0
        orders = int(current["orders"]) if current else 0
        ad_spend = float(ad_current["ad_spend"]) if ad_current else 0
        profit = float(pl_current["profit"]) if pl_current else 0

        # 전월 KPI (변동률 계산)
        prev = await pool.fetchrow(
            """
            SELECT
                coalesce(sum(o.total_price), 0) AS revenue,
                count(o.id) AS orders
            FROM coupang_orders o
            WHERE o.ordered_at >= date_trunc('month', current_date - interval '1 month')
              AND o.ordered_at < date_trunc('month', current_date)
            """
        )

        prev_ad = await pool.fetchrow(
            """
            SELECT coalesce(sum(ad_spend), 0) AS ad_spend
            FROM ads
            WHERE date >= date_trunc('month', current_date - interval '1 month')
              AND date < date_trunc('month', current_date)
            """
        )

        prev_pl = await pool.fetchrow(
            """
            SELECT coalesce(sum(net_profit), 0) AS profit
            FROM profit_loss
            WHERE month >= date_trunc('month', current_date - interval '1 month')
              AND month < date_trunc('month', current_date)
            """
        )

        def pct_change(curr: float, prev_val: float) -> float:
            if prev_val == 0:
                return 0
            return round((curr - prev_val) / abs(prev_val) * 100, 1)

        prev_revenue = float(prev["revenue"]) if prev else 0
        prev_orders = int(prev["orders"]) if prev else 0
        prev_ad_spend = float(prev_ad["ad_spend"]) if prev_ad else 0
        prev_profit = float(prev_pl["profit"]) if prev_pl else 0

        changes = {
            "revenueChange": pct_change(revenue, prev_revenue),
            "ordersChange": pct_change(orders, prev_orders),
            "adSpendChange": pct_change(ad_spend, prev_ad_spend),
            "profitChange": pct_change(profit, prev_profit),
        }

        # 이상 감지
        if changes["revenueChange"] < -30:
            issues.append(f"매출 급감: 전월 대비 {changes['revenueChange']}%")
        if changes["adSpendChange"] > 50:
            issues.append(f"광고비 급증: 전월 대비 +{changes['adSpendChange']}%")

        return {
            "metrics": {
                "revenue": revenue,
                "orders": orders,
                "adSpend": ad_spend,
                "profit": profit,
            },
            "dataFreshness": freshness,
            "changes": changes,
            "issues": issues,
        }
