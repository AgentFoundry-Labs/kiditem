"""Integration tests for ContentAgent routing and DB writes.

Covers:
- PIPE-01: Step 1 writes to draft_content, NOT processed_data
- PIPE-02: Step 2 triggered by generation_mode='image'
- PIPE-06: Step 2 reads from task_input snapshot, not from live DB
"""
from __future__ import annotations

import json
import uuid
from unittest.mock import AsyncMock, patch, MagicMock

import pytest

from src.agents.content.agent import ContentAgent
from src.agents.content.models import DetailPageData


@pytest.fixture
def mock_step1_result():
    return DetailPageData(
        title="테스트 상품",
        images=["https://example.com/img1.jpg"],
        generation_mode="draft",
        _debug={"pipeline": "template-step1", "size_chart_indices": [], "original_images": []},
    )


@pytest.fixture
def mock_step2_result():
    return DetailPageData(
        title="테스트 상품",
        images=["https://fal.ai/main.jpg"],
        hero_banner="https://fal.ai/banner.jpg",
        detail_images=["https://fal.ai/detail1.jpg", "https://fal.ai/detail2.jpg"],
        generation_mode="image",
        _debug={"pipeline": "template-step2"},
    )


class TestContentAgentRouting:
    """Test generation_mode routing in ContentAgent.execute()."""

    async def test_draft_mode_calls_step1(
        self, mock_pool, sample_product_id, mock_step1_result
    ):
        """PIPE-01/PIPE-02: generation_mode='draft' routes to Step 1."""
        agent = ContentAgent()
        task_input = {
            "productId": sample_product_id,
            "generation_mode": "draft",
        }

        with patch.object(agent, "_execute_step1", new_callable=AsyncMock) as mock_step1, \
             patch.object(agent, "_execute_step2", new_callable=AsyncMock) as mock_step2:
            mock_step1.return_value = {"product_id": sample_product_id, "generation_mode": "draft"}
            await agent.execute(mock_pool, task_input)

            mock_step1.assert_called_once()
            mock_step2.assert_not_called()

    async def test_image_mode_calls_step2(
        self, mock_pool, sample_product_id, mock_step2_result
    ):
        """PIPE-02: generation_mode='image' routes to Step 2."""
        agent = ContentAgent()
        task_input = {
            "productId": sample_product_id,
            "generation_mode": "image",
            "draftContent": {"title": "test", "images": ["https://example.com/hero.jpg"]},
        }

        with patch.object(agent, "_execute_step1", new_callable=AsyncMock) as mock_step1, \
             patch.object(agent, "_execute_step2", new_callable=AsyncMock) as mock_step2:
            mock_step2.return_value = {"product_id": sample_product_id, "generation_mode": "image"}
            await agent.execute(mock_pool, task_input)

            mock_step1.assert_not_called()
            mock_step2.assert_called_once()

    async def test_unknown_mode_raises(self, mock_pool, sample_product_id):
        """Old generation_mode values (template, oneshot) are rejected."""
        agent = ContentAgent()
        task_input = {
            "productId": sample_product_id,
            "generation_mode": "template",
        }

        with pytest.raises(ValueError, match="Unknown generation_mode"):
            await agent.execute(mock_pool, task_input)

    async def test_missing_mode_raises(self, mock_pool, sample_product_id):
        """Missing generation_mode raises ValueError."""
        agent = ContentAgent()
        task_input = {
            "productId": sample_product_id,
        }

        with pytest.raises(ValueError, match="generation_mode"):
            await agent.execute(mock_pool, task_input)


class TestStep1DBWrites:
    """Test that Step 1 writes to draft_content, not processed_data."""

    async def test_step1_writes_draft_content(
        self, mock_pool, sample_product_id, mock_step1_result
    ):
        """PIPE-01: Step 1 SQL writes to draft_content column."""
        agent = ContentAgent()

        with patch(
            "src.agents.content.agent.TemplatePipeline"
        ) as MockPipeline:
            mock_pipeline = MagicMock()
            mock_pipeline.run_step1 = AsyncMock(return_value=mock_step1_result)
            MockPipeline.return_value = mock_pipeline

            result = await agent._execute_step1(
                mock_pool, mock_pipeline, sample_product_id,
                {"productId": sample_product_id, "generation_mode": "draft"},
            )

        # Verify SQL calls
        sql_calls = [str(call) for call in mock_pool.execute.call_args_list]
        sql_joined = " ".join(sql_calls)

        assert "draft_content" in sql_joined, "Step 1 must write to draft_content"
        assert "content_ready" in sql_joined, \
            "Step 1 must set pipeline_step to content_ready"
        # Step 1 must NOT write to processed_data
        assert "processed_data" not in sql_joined, \
            "Step 1 must NOT write to processed_data"

    async def test_step1_sets_pipeline_step_content_ready(
        self, mock_pool, sample_product_id, mock_step1_result
    ):
        """D-10: Step 1 success sets pipeline_step = 'content_ready'."""
        agent = ContentAgent()

        with patch("src.agents.content.agent.TemplatePipeline") as MockPipeline:
            mock_pipeline = MagicMock()
            mock_pipeline.run_step1 = AsyncMock(return_value=mock_step1_result)
            MockPipeline.return_value = mock_pipeline

            await agent._execute_step1(
                mock_pool, mock_pipeline, sample_product_id,
                {"productId": sample_product_id},
            )

        # Find the UPDATE call that sets content_ready
        found_content_ready = False
        for call in mock_pool.execute.call_args_list:
            sql = str(call.args[0]) if call.args else ""
            if "content_ready" in sql:
                found_content_ready = True
                break
        assert found_content_ready, "Step 1 must set pipeline_step = 'content_ready'"


class TestStep2Snapshot:
    """Test that Step 2 reads from snapshot, not live DB."""

    async def test_step2_reads_from_snapshot(
        self, mock_pool, sample_product_id, sample_draft_content, mock_step2_result
    ):
        """PIPE-06: Step 2 passes draftContent snapshot to pipeline.run_step2()."""
        agent = ContentAgent()

        # Minimal product row (only id and company_id needed)
        mock_pool.fetchrow = AsyncMock(return_value={
            "id": sample_product_id,
            "company_id": str(uuid.uuid4()),
        })

        with patch("src.agents.content.agent.TemplatePipeline") as MockPipeline:
            mock_pipeline = MagicMock()
            mock_pipeline.run_step2 = AsyncMock(return_value=mock_step2_result)
            MockPipeline.return_value = mock_pipeline

            task_input = {
                "productId": sample_product_id,
                "generation_mode": "image",
                "draftContent": sample_draft_content,
            }

            await agent._execute_step2(
                mock_pool, mock_pipeline, sample_product_id, task_input
            )

        # Verify run_step2 was called with the snapshot dict
        mock_pipeline.run_step2.assert_called_once()
        call_args = mock_pipeline.run_step2.call_args
        passed_snapshot = call_args.args[0] if call_args.args else call_args.kwargs.get("draft_snapshot")
        assert passed_snapshot == sample_draft_content, \
            "Step 2 must pass the exact draftContent snapshot to pipeline"

    async def test_step2_requires_snapshot(self, mock_pool, sample_product_id):
        """PIPE-06: Step 2 raises if draftContent is missing from task_input."""
        agent = ContentAgent()

        mock_pool.fetchrow = AsyncMock(return_value={
            "id": sample_product_id,
            "company_id": str(uuid.uuid4()),
        })

        with patch("src.agents.content.agent.TemplatePipeline") as MockPipeline:
            mock_pipeline = MagicMock()
            MockPipeline.return_value = mock_pipeline

            task_input = {
                "productId": sample_product_id,
                "generation_mode": "image",
                # draftContent intentionally missing
            }

            with pytest.raises(ValueError, match="draftContent"):
                await agent._execute_step2(
                    mock_pool, mock_pipeline, sample_product_id, task_input
                )

    async def test_step2_writes_processed_data(
        self, mock_pool, sample_product_id, sample_draft_content, mock_step2_result
    ):
        """D-09: Step 2 writes to processed_data (not draft_content)."""
        agent = ContentAgent()

        mock_pool.fetchrow = AsyncMock(return_value={
            "id": sample_product_id,
            "company_id": str(uuid.uuid4()),
        })

        with patch("src.agents.content.agent.TemplatePipeline") as MockPipeline:
            mock_pipeline = MagicMock()
            mock_pipeline.run_step2 = AsyncMock(return_value=mock_step2_result)
            MockPipeline.return_value = mock_pipeline

            await agent._execute_step2(
                mock_pool, mock_pipeline, sample_product_id,
                {"productId": sample_product_id, "generation_mode": "image", "draftContent": sample_draft_content},
            )

        sql_calls = [str(call) for call in mock_pool.execute.call_args_list]
        sql_joined = " ".join(sql_calls)

        assert "processed_data" in sql_joined, "Step 2 must write to processed_data"
        assert "pipeline_step" in sql_joined, \
            "Step 2 success must set pipeline_step"

    async def test_step2_triggered_by_image_mode(
        self, mock_pool, sample_product_id, sample_draft_content, mock_step2_result
    ):
        """PIPE-02: Separate agent_task with generation_mode='image' triggers Step 2."""
        agent = ContentAgent()

        mock_pool.fetchrow = AsyncMock(return_value={
            "id": sample_product_id,
            "company_id": str(uuid.uuid4()),
            "raw_data": None,  # Step 2 should NOT need raw_data
            "status": "draft",
        })

        with patch("src.agents.content.agent.TemplatePipeline") as MockPipeline:
            mock_pipeline = MagicMock()
            mock_pipeline.run_step2 = AsyncMock(return_value=mock_step2_result)
            MockPipeline.return_value = mock_pipeline

            task_input = {
                "productId": sample_product_id,
                "generation_mode": "image",
                "draftContent": sample_draft_content,
            }

            result = await agent.execute(mock_pool, task_input)

        assert result["generation_mode"] == "image"
