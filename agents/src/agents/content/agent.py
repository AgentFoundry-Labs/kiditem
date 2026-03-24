from __future__ import annotations

import json
import traceback

import asyncpg
import structlog

from src.agents.base import BaseAgent
from src.agents.content.models import (
    DetailPageData,
    ExtensionProductData,
    GenerationMode,
)
from src.agents.content.oneshot import OneshotPipeline
from src.agents.content.template_pipeline import TemplatePipeline

logger = structlog.get_logger()


class ContentAgent(BaseAgent):
    agent_type = "content"

    async def execute(self, pool: asyncpg.Pool, task_input: dict | None) -> dict:
        if not task_input:
            raise ValueError("task_input is required for content agent")

        product_id = task_input.get("productId") or task_input.get("product_id")
        if not product_id:
            raise ValueError("product_id is required in task_input")

        generation_mode = (
            task_input.get("generation_mode") or task_input.get("generationMode") or "template"
        )
        reference_image_url = (
            task_input.get("reference_image_url") or task_input.get("referenceImageUrl") or ""
        )

        product = await pool.fetchrow(
            "SELECT id, company_id, raw_data, status FROM products WHERE id = $1",
            product_id,
        )
        if not product:
            raise ValueError(f"Product not found: {product_id}")

        raw_data = product["raw_data"]
        if isinstance(raw_data, str):
            raw_data = json.loads(raw_data)
        if not raw_data:
            raise ValueError(f"Product has no raw_data: {product_id}")

        await pool.execute(
            "UPDATE products SET status = 'processing', updated_at = NOW() WHERE id = $1",
            product_id,
        )

        try:
            ext_data = ExtensionProductData.model_validate(raw_data)

            if generation_mode == GenerationMode.TEMPLATE:
                pipeline = TemplatePipeline()
                page_data = await pipeline.process(
                    ext_data,
                    product_id=str(product_id),
                )
            else:
                pipeline = OneshotPipeline()
                page_data = await pipeline.process(
                    ext_data,
                    product_id=str(product_id),
                    reference_image_url=reference_image_url,
                )

            processed_json = json.dumps(page_data.model_dump(mode="json"), ensure_ascii=False)

            await pool.execute(
                """
                UPDATE products
                SET processed_data = $1::jsonb,
                    status = 'draft',
                    updated_at = NOW()
                WHERE id = $2
                """,
                processed_json,
                product_id,
            )

            await self._upsert_content_generation(
                pool,
                product_id=product_id,
                company_id=product["company_id"],
                page_data=page_data,
                status="COMPLETED",
            )

            return {
                "product_id": str(product_id),
                "generation_mode": generation_mode,
                "title": page_data.title,
                "image_count": len(page_data.detail_images),
            }

        except Exception as exc:
            error_msg = f"{type(exc).__name__}: {exc}"
            logger.exception(
                "Content generation failed",
                product_id=str(product_id),
                error=error_msg,
            )

            await pool.execute(
                "UPDATE products SET status = 'draft', updated_at = NOW() WHERE id = $1",
                product_id,
            )

            await self._upsert_content_generation(
                pool,
                product_id=product_id,
                company_id=product["company_id"],
                status="FAILED",
                error_message=error_msg[:1000],
            )

            raise

    async def _upsert_content_generation(
        self,
        pool: asyncpg.Pool,
        *,
        product_id: str,
        company_id: str,
        page_data: DetailPageData | None = None,
        status: str = "PENDING",
        error_message: str | None = None,
    ) -> None:
        existing = await pool.fetchval(
            "SELECT id FROM content_generations WHERE product_id = $1",
            product_id,
        )

        if page_data:
            generated_title = page_data.title
            detail_page_json = json.dumps(page_data.model_dump(mode="json"), ensure_ascii=False)
            original_images = json.dumps(list(page_data.images), ensure_ascii=False)
            processed_images = json.dumps(list(page_data.detail_images), ensure_ascii=False)
        else:
            generated_title = None
            detail_page_json = None
            original_images = None
            processed_images = None

        if existing:
            await pool.execute(
                """
                UPDATE content_generations
                SET generated_title = $1,
                    detail_page_html = $2,
                    original_images = $3::jsonb,
                    processed_images = $4::jsonb,
                    status = $5,
                    error_message = $6,
                    updated_at = NOW()
                WHERE product_id = $7
                """,
                generated_title,
                detail_page_json,
                original_images,
                processed_images,
                status,
                error_message,
                product_id,
            )
        else:
            await pool.execute(
                """
                INSERT INTO content_generations
                    (id, company_id, product_id, generated_title, detail_page_html,
                     original_images, processed_images, status, error_message,
                     created_at, updated_at)
                VALUES
                    (gen_random_uuid(), $1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, NOW(), NOW())
                """,
                company_id,
                product_id,
                generated_title,
                detail_page_json,
                original_images,
                processed_images,
                status,
                error_message,
            )
