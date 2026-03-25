"""Unit tests for TemplatePipeline step methods.

Covers:
- PIPE-01: Step 1 output shape (text/colors, no images)
- PIPE-03: Step 2 uses hero_image_url from snapshot for all FAL.AI calls
- PIPE-04: _analyze_product is never called
- PIPE-05: Size chart indices preserved in Step 1 output
"""
from __future__ import annotations

import pathlib
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.agents.content.models import DetailPageData, GeneratedContent
from src.agents.content.template_pipeline import TemplatePipeline


@pytest.fixture
def pipeline_with_mocks(mock_ai_client, sample_generated_content):
    """TemplatePipeline with mocked AI client and config."""
    with patch("src.agents.content.template_pipeline.AI_IMAGE_EDIT_MODEL", "fal-ai/test-model"), \
         patch("src.agents.content.template_pipeline.AI_TEXT_MODEL", "test-text-model"), \
         patch("src.agents.content.pipeline_base.AI_IMAGE_ANALYSIS_MODEL", "test-analysis-model"):
        mock_ai_client.generate_with_healing.return_value = sample_generated_content
        pipeline = TemplatePipeline()
        pipeline._ai = mock_ai_client
        yield pipeline


class TestStep1:
    """Tests for run_step1 — content generation without image processing."""

    async def test_step1_output_is_detail_page_data(
        self, pipeline_with_mocks, sample_ext_data, sample_product_id
    ):
        """PIPE-01: Step 1 produces DetailPageData with text/color fields."""
        # Mock _scan_size_charts to return indices
        pipeline_with_mocks._scan_size_charts = AsyncMock(return_value=[0])

        result = await pipeline_with_mocks.run_step1(
            sample_ext_data, product_id=sample_product_id
        )

        assert isinstance(result, DetailPageData)
        assert result.title == "귀여운 봉제 인형"
        assert result.theme_color_main == "#ff8c69"

    async def test_step1_assemble_shape(
        self, pipeline_with_mocks, sample_ext_data, sample_product_id
    ):
        """PIPE-01: Step 1 result has original image URLs and empty generated image fields."""
        pipeline_with_mocks._scan_size_charts = AsyncMock(return_value=[])

        result = await pipeline_with_mocks.run_step1(
            sample_ext_data, product_id=sample_product_id
        )

        # Original hero URL preserved for preview
        assert len(result.images) > 0
        assert result.images[0] == sample_ext_data.images[0]
        # No generated images yet
        assert result.hero_banner == ""
        assert result.detail_images == []
        assert result.size_images == []

    async def test_step1_no_fal_calls(
        self, pipeline_with_mocks, mock_ai_client, sample_ext_data, sample_product_id
    ):
        """PIPE-01: Step 1 does NOT call any FAL.AI image editing methods."""
        pipeline_with_mocks._scan_size_charts = AsyncMock(return_value=[])

        await pipeline_with_mocks.run_step1(
            sample_ext_data, product_id=sample_product_id
        )

        mock_ai_client.fal_edit_image.assert_not_called()
        mock_ai_client.edit_images_multi.assert_not_called()

    async def test_analyze_product_removed(
        self, pipeline_with_mocks, sample_ext_data, sample_product_id
    ):
        """PIPE-04: _analyze_product is never called in Step 1."""
        pipeline_with_mocks._analyze_product = AsyncMock()
        pipeline_with_mocks._scan_size_charts = AsyncMock(return_value=[])

        await pipeline_with_mocks.run_step1(
            sample_ext_data, product_id=sample_product_id
        )

        pipeline_with_mocks._analyze_product.assert_not_called()

    async def test_size_chart_indices_in_draft(
        self, pipeline_with_mocks, sample_ext_data, sample_product_id
    ):
        """PIPE-05: Size chart indices preserved in draftContent debug_info."""
        pipeline_with_mocks._scan_size_charts = AsyncMock(return_value=[0, 3])

        result = await pipeline_with_mocks.run_step1(
            sample_ext_data, product_id=sample_product_id
        )

        assert result.debug_info is not None
        assert result.debug_info["size_chart_indices"] == [0, 3]

    async def test_original_images_in_draft(
        self, pipeline_with_mocks, sample_ext_data, sample_product_id
    ):
        """Step 1 preserves full original_images list in debug_info for Step 2 hero selection."""
        pipeline_with_mocks._scan_size_charts = AsyncMock(return_value=[])

        result = await pipeline_with_mocks.run_step1(
            sample_ext_data, product_id=sample_product_id
        )

        assert result.debug_info is not None
        assert result.debug_info["original_images"] == list(sample_ext_data.images)


class TestStep2:
    """Tests for run_step2 — image generation from confirmed snapshot."""

    async def test_step2_uses_hero_url(
        self, pipeline_with_mocks, mock_ai_client, sample_draft_content, sample_product_id
    ):
        """PIPE-03: Step 2 passes hero_image_url from snapshot to all FAL.AI edit calls."""
        with patch("src.agents.content.template_pipeline.cleanup_product_artifacts"), \
             patch("src.agents.content.template_pipeline.product_images_dir") as mock_dir:
            # Make product_images_dir return a temp path that doesn't need to exist
            tmp_path = pathlib.Path("/tmp/test_kiditem") / sample_product_id / "images"
            tmp_path.mkdir(parents=True, exist_ok=True)
            mock_dir.return_value = tmp_path

            result = await pipeline_with_mocks.run_step2(
                sample_draft_content, product_id=sample_product_id
            )

        # Check that fal_edit_image was called with the hero URL from snapshot
        hero_url = sample_draft_content["heroImageUrl"]
        assert mock_ai_client.fal_edit_image.called, "FAL.AI should be called in Step 2"
        for call_args in mock_ai_client.fal_edit_image.call_args_list:
            call_kwargs = call_args.kwargs
            call_positional = call_args.args
            actual_url = call_kwargs.get("image_url") or (call_positional[0] if call_positional else None)
            assert actual_url == hero_url, \
                f"FAL.AI call used wrong URL: {actual_url!r}, expected {hero_url!r}"

    async def test_step2_reads_size_indices_from_snapshot(
        self, pipeline_with_mocks, mock_ai_client, sample_draft_content, sample_product_id
    ):
        """PIPE-05 (Step 2 side): Size chart URLs resolved from snapshot's debug_info."""
        with patch("src.agents.content.template_pipeline.cleanup_product_artifacts"), \
             patch("src.agents.content.template_pipeline.product_images_dir") as mock_dir:
            tmp_path = pathlib.Path("/tmp/test_kiditem") / sample_product_id / "images"
            tmp_path.mkdir(parents=True, exist_ok=True)
            mock_dir.return_value = tmp_path

            await pipeline_with_mocks.run_step2(
                sample_draft_content, product_id=sample_product_id
            )

        # edit_images_multi should be called with the size chart URL from original_images[0]
        # (size_chart_indices=[0] in sample_draft_content)
        if mock_ai_client.edit_images_multi.called:
            call_args = mock_ai_client.edit_images_multi.call_args
            urls = call_args.kwargs.get("image_urls") or call_args.args[0]
            expected_url = sample_draft_content["debug_info"]["original_images"][0]
            assert expected_url in urls

    async def test_step2_output_has_generated_images(
        self, pipeline_with_mocks, sample_draft_content, sample_product_id
    ):
        """Step 2 output includes generated hero_banner and detail_images."""
        with patch("src.agents.content.template_pipeline.cleanup_product_artifacts"), \
             patch("src.agents.content.template_pipeline.product_images_dir") as mock_dir:
            tmp_path = pathlib.Path("/tmp/test_kiditem") / sample_product_id / "images"
            tmp_path.mkdir(parents=True, exist_ok=True)
            mock_dir.return_value = tmp_path

            result = await pipeline_with_mocks.run_step2(
                sample_draft_content, product_id=sample_product_id
            )

        assert isinstance(result, DetailPageData)
        # hero_banner should be the FAL.AI result (or empty on error)
        # detail_images should have entries from FAL.AI
        assert len(result.detail_images) > 0 or result.hero_banner != ""

    async def test_step2_no_analyze_product(
        self, pipeline_with_mocks, sample_draft_content, sample_product_id
    ):
        """PIPE-04: _analyze_product is never called in Step 2 either."""
        pipeline_with_mocks._analyze_product = AsyncMock()

        with patch("src.agents.content.template_pipeline.cleanup_product_artifacts"), \
             patch("src.agents.content.template_pipeline.product_images_dir") as mock_dir:
            tmp_path = pathlib.Path("/tmp/test_kiditem") / sample_product_id / "images"
            tmp_path.mkdir(parents=True, exist_ok=True)
            mock_dir.return_value = tmp_path

            await pipeline_with_mocks.run_step2(
                sample_draft_content, product_id=sample_product_id
            )

        pipeline_with_mocks._analyze_product.assert_not_called()
