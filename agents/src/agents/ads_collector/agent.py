"""
광고 수집 에이전트 — 쿠팡 광고 데이터 수집 및 이상 감지.

adSnapshot/ads 테이블에서 캠페인별 성과를 집계하고,
데이터 누락이나 전일 대비 급변을 감지한다.
"""
import asyncpg
from src.agents.base import BaseAgent


class AdsCollectorAgent(BaseAgent):
    agent_type = "ads_collector"
    timeout_seconds = 180

    async def execute(self, pool: asyncpg.Pool, task_input: dict | None) -> dict:
        # 오늘 vs 어제 광고 데이터 비교
        today_rows = await pool.fetch(
            """
            SELECT
                a.campaign_id AS id,
                coalesce(a.campaign_name, a.campaign_id) AS name,
                sum(a.ad_spend) AS spend,
                sum(a.clicks) AS clicks,
                sum(a.impressions) AS impressions,
                CASE WHEN sum(a.impressions) > 0
                     THEN round(sum(a.clicks)::numeric / sum(a.impressions) * 100, 2)
                     ELSE 0 END AS ctr,
                CASE WHEN sum(a.ad_spend) > 0
                     THEN round(sum(a.ad_revenue)::numeric / sum(a.ad_spend), 2)
                     ELSE 0 END AS roas
            FROM ads a
            WHERE a.date >= current_date - interval '1 day'
            GROUP BY a.campaign_id, a.campaign_name
            ORDER BY spend DESC
            LIMIT 100
            """
        )

        yesterday_totals = await pool.fetchrow(
            """
            SELECT
                count(DISTINCT campaign_id) AS campaigns,
                coalesce(sum(ad_spend), 0) AS spend,
                CASE WHEN sum(impressions) > 0
                     THEN round(sum(clicks)::numeric / sum(impressions) * 100, 2)
                     ELSE 0 END AS avg_ctr,
                CASE WHEN sum(ad_spend) > 0
                     THEN round(sum(ad_revenue)::numeric / sum(ad_spend), 2)
                     ELSE 0 END AS avg_roas
            FROM ads
            WHERE date = current_date - interval '1 day'
            """
        )

        # 이상 감지: CTR 0%이거나 spend > 0인데 impressions = 0
        anomaly_count = 0
        campaigns = []
        for r in today_rows:
            spend = float(r["spend"] or 0)
            clicks = int(r["clicks"] or 0)
            impressions = int(r["impressions"] or 0)
            ctr = float(r["ctr"] or 0)
            roas = float(r["roas"] or 0)

            if spend > 0 and impressions == 0:
                anomaly_count += 1

            campaigns.append({
                "id": r["id"] or "",
                "name": r["name"] or "",
                "spend": spend,
                "clicks": clicks,
                "impressions": impressions,
                "ctr": ctr,
                "roas": roas,
            })

        total_spend = sum(c["spend"] for c in campaigns)
        avg_ctr = sum(c["ctr"] for c in campaigns) / max(len(campaigns), 1)

        return {
            "campaigns": campaigns,
            "summary": {
                "totalCampaigns": len(campaigns),
                "totalSpend": total_spend,
                "avgCtr": round(avg_ctr, 2),
                "avgRoas": float(yesterday_totals["avg_roas"]) if yesterday_totals else 0,
                "anomalies": anomaly_count,
            },
        }
