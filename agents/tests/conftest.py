from __future__ import annotations

import json
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.agents.content.models import (
    DetailPageData,
    ExtensionProductData,
    GeneratedContent,
)


@pytest.fixture
def sample_product_id():
    return str(uuid.uuid4())


@pytest.fixture
def sample_raw_data():
    """Minimal raw_data for ExtensionProductData validation."""
    return {
        "source_url": "https://detail.1688.com/offer/123.html",
        "source_platform": "1688",
        "title": "테스트 봉제 인형",
        "images": [
            "https://example.com/img1.jpg",
            "https://example.com/img2.jpg",
            "https://example.com/img3.jpg",
        ],
        "description_images": [
            "https://example.com/desc1.jpg",
            "https://example.com/desc2.jpg",
        ],
        "category_name": "봉제",
        "price_min": 10.0,
        "price_max": 15.0,
        "specs": [{"key": "소재", "value": "폴리에스터"}],
        "pack_info": [],
    }


@pytest.fixture
def sample_ext_data(sample_raw_data):
    return ExtensionProductData.model_validate(sample_raw_data)


@pytest.fixture
def sample_generated_content():
    """Minimal GeneratedContent for step1 output."""
    return GeneratedContent(
        title_ko="귀여운 봉제 인형",
        hook_text="폭신폭신 보들보들",
        hook_subtext="아이들이 좋아하는 인형",
        description_ko=["부드러운 소재의 봉제 인형입니다"],
        key_points=[],
        specs_ko=[],
        materials_ko=[],
        features=[],
        theme_color_main="#ff8c69",
        theme_color_bg_light="#fffaf0",
    )


@pytest.fixture
def sample_draft_content():
    """A draft_content snapshot as would be stored in DB / passed to Step 2."""
    return {
        "title": "귀여운 봉제 인형",
        "hook_text": "폭신폭신 보들보들",
        "hook_subtext": "아이들이 좋아하는 인형",
        "description": ["부드러운 소재의 봉제 인형입니다"],
        "images": ["https://example.com/img1.jpg"],
        "heroImageUrl": "https://example.com/hero.jpg",
        "theme_color_main": "#ff8c69",
        "theme_color_bg_light": "#fffaf0",
        "theme_color_badge_1": "#ff8c69",
        "theme_color_badge_2": "#69c9ff",
        "theme_section_bg": "#f4f1eb",
        "theme_text_primary": "#4a4a4a",
        "theme_text_secondary": "#8a8a8a",
        "theme_border_radius": "32px",
        "key_points": [],
        "specs": [],
        "features": [],
        "materials": [],
        "notes": [],
        "price": 1900,
        "original_price": 2850,
        "discount_rate": 33,
        "debug_info": {
            "pipeline": "template-step1",
            "size_chart_indices": [0],
            "original_images": [
                "https://example.com/img1.jpg",
                "https://example.com/img2.jpg",
                "https://example.com/img3.jpg",
            ],
        },
    }


@pytest.fixture
def mock_pool(sample_product_id, sample_raw_data):
    """Mock asyncpg pool that returns product data and tracks SQL calls."""
    pool = AsyncMock()

    # fetchrow returns product row
    product_row = {
        "id": sample_product_id,
        "company_id": str(uuid.uuid4()),
        "raw_data": json.dumps(sample_raw_data),
        "status": "draft",
    }
    pool.fetchrow = AsyncMock(return_value=product_row)
    pool.execute = AsyncMock()
    pool.fetchval = AsyncMock(return_value=None)

    return pool


@pytest.fixture
def mock_ai_client():
    """Mock AIClient that returns predictable results."""
    with patch("src.agents.content.pipeline_base.AIClient") as MockAI:
        mock_ai = MagicMock()
        mock_ai.generate_with_healing = AsyncMock()
        mock_ai.fal_edit_image = AsyncMock(return_value="https://fal.ai/result/edited.jpg")
        mock_ai.edit_images_multi = AsyncMock(return_value=b"fake-image-bytes")
        mock_ai.analyze_images_batch = AsyncMock(
            return_value='{"description": "test", "detail_indices": [1, 2]}'
        )
        MockAI.return_value = mock_ai
        yield mock_ai
