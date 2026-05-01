from __future__ import annotations

import json

import asyncpg
import structlog
from langfuse import get_client, observe, propagate_attributes

from src.agents.base import BaseAgent
from src.agents.content.models import (
    DetailPageData,
    ExtensionProductData,
)
from src.agents.content.template_pipeline import TemplatePipeline

logger = structlog.get_logger()
_lf = get_client()


class ContentAgent(BaseAgent):
    agent_type = "content"
    timeout_seconds = 600

    @observe(name="content-pipeline", capture_input=False)
    async def execute(self, pool: asyncpg.Pool, task_input: dict | None) -> dict:
        if not task_input:
            raise ValueError("task_input is required for content agent")

        product_id = task_input.get("productId") or task_input.get("product_id")
        if not product_id:
            raise ValueError("product_id is required in task_input")

        generation_mode = task_input.get("generation_mode") or task_input.get("generationMode")
        if generation_mode not in ("draft", "image", "full"):
            raise ValueError(
                f"Unknown generation_mode: {generation_mode!r}. Must be 'draft', 'image', or 'full'."
            )

        with propagate_attributes(
            session_id=task_input.get("_task_id", ""),
            trace_name=f"content-{generation_mode}",
            metadata={
                "product_id": str(product_id),
                "generation_mode": generation_mode,
            },
            tags=["content", generation_mode],
        ):
            pipeline = TemplatePipeline()

            if generation_mode == "full":
                return await self._execute_full(pool, pipeline, product_id, task_input)
            elif generation_mode == "draft":
                return await self._execute_step1(pool, pipeline, product_id, task_input)
            else:
                return await self._execute_step2(pool, pipeline, product_id, task_input)

    @observe(name="execute-step1", capture_input=False)
    async def _execute_step1(
        self,
        pool: asyncpg.Pool,
        pipeline: TemplatePipeline,
        product_id: str,
        task_input: dict,
    ) -> dict:
        """Step 1: Generate copywriting + theme colors, write to draft_content."""
        product = await pool.fetchrow(
            "SELECT id, organization_id, raw_data, status FROM products WHERE id = $1",
            product_id,
        )
        if not product:
            raise ValueError(f"Product not found: {product_id}")

        raw_data = product["raw_data"]
        if isinstance(raw_data, str):
            raw_data = json.loads(raw_data)
        if not raw_data:
            raise ValueError(f"Product has no raw_data: {product_id}")

        # D-10: Set status to processing at start
        await pool.execute(
            "UPDATE products SET status = 'processing', updated_at = NOW() WHERE id = $1",
            product_id,
        )

        try:
            ext_data = ExtensionProductData.model_validate(raw_data)

            seed_hook_text = task_input.get("seed_hook_text")
            seed_hook_title_sub = task_input.get("seed_hook_title_sub")
            seed_hero_image = task_input.get("seed_hero_image")

            draft_data = await pipeline.run_step1(
                ext_data,
                product_id=str(product_id),
                seed_hook_text=seed_hook_text,
                seed_hook_title_sub=seed_hook_title_sub,
                seed_hero_image=seed_hero_image,
            )

            draft_json = json.dumps(draft_data.model_dump(mode="json"), ensure_ascii=False)

            async with pool.acquire() as conn:
                async with conn.transaction():
                    await conn.execute(
                        """
                        UPDATE products
                        SET draft_content = $1::jsonb,
                            status = 'draft',
                            pipeline_step = 'content_ready',
                            updated_at = NOW()
                        WHERE id = $2
                        """,
                        draft_json,
                        product_id,
                    )

                    await self._upsert_content_generation(
                        conn,
                        product_id=product_id,
                        organization_id=product["organization_id"],
                        page_data=draft_data,
                        status="COMPLETED",
                    )

            return {
                "product_id": str(product_id),
                "generation_mode": "draft",
                "title": draft_data.title,
                "step": "content_ready",
            }

        except Exception as exc:
            error_msg = f"{type(exc).__name__}: {exc}"
            logger.exception(
                "Step 1 content generation failed",
                product_id=str(product_id),
                error=error_msg,
            )

            # Error rollback: revert to null/draft state (no partial content)
            await pool.execute(
                "UPDATE products SET status = 'draft', pipeline_step = NULL, updated_at = NOW() WHERE id = $1",
                product_id,
            )

            await self._upsert_content_generation(
                pool,
                product_id=product_id,
                organization_id=product["organization_id"],
                status="FAILED",
                error_message=error_msg[:1000],
            )

            raise

    @observe(name="execute-full", capture_input=False)
    async def _execute_full(
        self,
        pool: asyncpg.Pool,
        pipeline: TemplatePipeline,
        product_id: str,
        task_input: dict,
    ) -> dict:
        progress_callback = task_input.get("_progress_callback")

        product = await pool.fetchrow(
            "SELECT id, organization_id, raw_data, status FROM products WHERE id = $1",
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

            seed_hook_text = task_input.get("seed_hook_text")
            seed_hook_title_sub = task_input.get("seed_hook_title_sub")
            seed_hero_image = task_input.get("seed_hero_image")

            draft_data = await pipeline.run_step1(
                ext_data,
                product_id=str(product_id),
                seed_hook_text=seed_hook_text,
                seed_hook_title_sub=seed_hook_title_sub,
                seed_hero_image=seed_hero_image,
            )

            draft_json = draft_data.model_dump(mode="json")

            color_image_urls = task_input.get("color_image_urls") or []
            if color_image_urls:
                draft_json["color_image_urls"] = color_image_urls

            if progress_callback:
                await progress_callback(
                    {
                        "step": "content_ready",
                        "draft": draft_json,
                    }
                )

            async def on_image_progress(images: dict):
                if progress_callback:
                    await progress_callback(
                        {
                            "step": "image_progress",
                            "draft": draft_json,
                            "images": images,
                        }
                    )

            result = await pipeline.run_step2(
                draft_json,
                product_id=str(product_id),
                on_progress=on_image_progress,
            )

            result_json = json.dumps(result.model_dump(mode="json"), ensure_ascii=False)

            async with pool.acquire() as conn:
                async with conn.transaction():
                    await conn.execute(
                        """
                        UPDATE products
                        SET processed_data = $1::jsonb,
                            status = 'processed',
                            pipeline_step = NULL,
                            updated_at = NOW()
                        WHERE id = $2
                        """,
                        result_json,
                        product_id,
                    )

                    await self._upsert_content_generation(
                        conn,
                        product_id=product_id,
                        organization_id=product["organization_id"],
                        page_data=result,
                        status="COMPLETED",
                    )

            return {
                "product_id": str(product_id),
                "generation_mode": "full",
                "step": "completed",
                "title": result.title,
            }

        except Exception as exc:
            error_msg = f"{type(exc).__name__}: {exc}"
            logger.exception("Full pipeline failed", product_id=str(product_id), error=error_msg)

            await pool.execute(
                "UPDATE products SET status = 'draft', pipeline_step = NULL, updated_at = NOW() WHERE id = $1",
                product_id,
            )

            await self._upsert_content_generation(
                pool,
                product_id=product_id,
                organization_id=product["organization_id"],
                status="FAILED",
                error_message=error_msg[:1000],
            )

            raise

    @observe(name="execute-step2", capture_input=False)
    async def _execute_step2(
        self,
        pool: asyncpg.Pool,
        pipeline: TemplatePipeline,
        product_id: str,
        task_input: dict,
    ) -> dict:
        """Step 2: Generate images from confirmed snapshot, write to processed_data."""
        # D-06: Read snapshot from task_input, NOT from live DB
        draft_snapshot = task_input.get("draftContent") or task_input.get("draft_content")
        if not draft_snapshot:
            raise ValueError("draftContent snapshot required in task_input for image mode")

        product = await pool.fetchrow(
            "SELECT id, organization_id FROM products WHERE id = $1",
            product_id,
        )
        if not product:
            raise ValueError(f"Product not found: {product_id}")

        # D-11: Set status to processing, pipeline_step to images_generating
        await pool.execute(
            "UPDATE products SET status = 'processing', pipeline_step = 'images_generating', updated_at = NOW() WHERE id = $1",
            product_id,
        )

        try:
            page_data = await pipeline.run_step2(draft_snapshot, product_id=str(product_id))

            processed_json = json.dumps(page_data.model_dump(mode="json"), ensure_ascii=False)

            async with pool.acquire() as conn:
                async with conn.transaction():
                    await conn.execute(
                        """
                        UPDATE products
                        SET processed_data = $1::jsonb,
                            status = 'draft',
                            pipeline_step = NULL,
                            updated_at = NOW()
                        WHERE id = $2
                        """,
                        processed_json,
                        product_id,
                    )

                    await self._upsert_content_generation(
                        conn,
                        product_id=product_id,
                        organization_id=product["organization_id"],
                        page_data=page_data,
                        status="COMPLETED",
                    )

            return {
                "product_id": str(product_id),
                "generation_mode": "image",
                "title": page_data.title,
                "image_count": len(page_data.detail_images),
            }

        except Exception as exc:
            error_msg = f"{type(exc).__name__}: {exc}"
            logger.exception(
                "Step 2 image generation failed",
                product_id=str(product_id),
                error=error_msg,
            )

            # Error rollback: revert to content_ready (Step 1 output preserved)
            await pool.execute(
                "UPDATE products SET status = 'draft', pipeline_step = 'content_ready', updated_at = NOW() WHERE id = $1",
                product_id,
            )

            await self._upsert_content_generation(
                pool,
                product_id=product_id,
                organization_id=product["organization_id"],
                status="FAILED",
                error_message=error_msg[:1000],
            )

            raise

    async def _upsert_content_generation(
        self,
        db: asyncpg.Pool | asyncpg.Connection,
        *,
        product_id: str,
        organization_id: str,
        page_data: DetailPageData | None = None,
        status: str = "PENDING",
        error_message: str | None = None,
    ) -> None:
        existing = await db.fetchval(
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
            await db.execute(
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
            await db.execute(
                """
                INSERT INTO content_generations
                    (id, organization_id, product_id, generated_title, detail_page_html,
                     original_images, processed_images, status, error_message,
                     created_at, updated_at)
                VALUES
                    (gen_random_uuid(), $1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, NOW(), NOW())
                """,
                organization_id,
                product_id,
                generated_title,
                detail_page_json,
                original_images,
                processed_images,
                status,
                error_message,
            )
