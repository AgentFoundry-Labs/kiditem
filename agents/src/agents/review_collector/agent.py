"""
리뷰 수집 에이전트 — 상품 리뷰 데이터 수집 상태 모니터링.

DB에서 상품별 리뷰 수/평점을 분석하고,
A등급 상품 중 리뷰가 부족한 상품을 식별한다.
"""
import asyncpg
from src.agents.base import BaseAgent


class ReviewCollectorAgent(BaseAgent):
    agent_type = "review_collector"
    timeout_seconds = 120

    async def execute(self, pool: asyncpg.Pool, task_input: dict | None) -> dict:
        company_id = (task_input or {}).get("company_id")

        where_company = "AND p.company_id = $1" if company_id else ""
        params: list = [company_id] if company_id else []

        # 상품별 리뷰 집계
        rows = await pool.fetch(
            f"""
            SELECT p.id AS product_id, p.name,
                   count(r.id) AS total_reviews,
                   coalesce(avg(r.rating), 0) AS avg_rating,
                   count(r.id) FILTER (WHERE r.created_at > now() - interval '7 days') AS new_reviews,
                   p.abc_grade
            FROM products p
            LEFT JOIN reviews r ON r.product_id = p.id
            WHERE p.is_deleted = false {where_company}
            GROUP BY p.id, p.name, p.abc_grade
            ORDER BY total_reviews ASC
            LIMIT 200
            """,
            *params,
        )

        reviews = []
        low_review_count = 0
        total_new = 0

        for r in rows:
            new_count = r["new_reviews"]
            total_new += new_count
            total = r["total_reviews"]

            # A등급인데 리뷰 10개 미만
            is_low = r["abc_grade"] == "A" and total < 10
            if is_low:
                low_review_count += 1

            reviews.append({
                "productId": str(r["product_id"]),
                "name": r["name"] or "",
                "totalReviews": total,
                "newReviewCount": new_count,
                "avgRating": round(float(r["avg_rating"]), 1),
            })

        return {
            "reviews": reviews,
            "summary": {
                "total": len(rows),
                "productsChecked": len(rows),
                "newReviews": total_new,
                "lowReviewProducts": low_review_count,
            },
        }
