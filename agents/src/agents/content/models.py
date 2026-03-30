from __future__ import annotations

import enum
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


# ── Enums ──


class ContentStatus(enum.StrEnum):
    PENDING = "PENDING"
    IMAGE_PROCESSING = "IMAGE_PROCESSING"
    COPYWRITING = "COPYWRITING"
    RENDERING = "RENDERING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class GenerationMode(enum.StrEnum):
    DRAFT = "draft"
    IMAGE = "image"


class RegenerationMode(enum.StrEnum):
    REMOVE_TEXT = "remove_text"
    REPLACE_BACKGROUND = "replace_background"
    FULL_REGENERATE = "full_regenerate"
    ENHANCE = "enhance"


# ── Sourcing data (from ExtensionProductData) ──


class ExtensionProductSpec(BaseModel):
    key: str
    value: str


class ExtensionSkuAttr(BaseModel):
    name: str = ""
    values: list[str] = Field(default_factory=list)


class ExtensionSkuItem(BaseModel):
    skuId: int | str = ""
    specAttrs: str = ""
    price: str = ""
    discountPrice: str = ""
    canBookCount: int = 0
    saleCount: int = 0


class ExtensionPriceTier(BaseModel):
    beginAmount: int | str = ""
    price: str = ""


class ExtensionProductData(BaseModel):
    model_config = {"extra": "allow"}

    source_url: str
    source_platform: str
    page_type: str = "detail"
    extracted_at: datetime | None = None

    title: str = ""
    product_id: str = ""
    images: list[str] = Field(default_factory=list)
    price_min: float | None = None
    price_max: float | None = None
    currency: str = "USD"
    moq: int | None = None
    unit: str = ""
    supplier_name: str = ""
    supplier_years: str = ""
    verified_badges: list[str] = Field(default_factory=list)
    description: str = ""
    specs: list[ExtensionProductSpec] = Field(default_factory=list)
    pack_info: list[ExtensionProductSpec] = Field(default_factory=list)
    lead_time: str = ""
    shipping: str = ""

    sku_attrs: list[ExtensionSkuAttr] = Field(default_factory=list)
    sku_list: list[ExtensionSkuItem] = Field(default_factory=list)
    price_tiers: list[ExtensionPriceTier] = Field(default_factory=list)

    category_id: str = ""
    category_name: str = ""
    good_rates: float | None = None
    favor_count: int | None = 0

    video_url: str = ""
    description_images: list[str] = Field(default_factory=list)


# ── Content DTOs ──


class FeatureItem(BaseModel):
    icon: str = "✨"
    title: str
    description: str = ""


class SpecItem(BaseModel):
    key: str
    value: str


class KeyPointItem(BaseModel):
    number: int
    title: str
    description: str
    images: list[str] = Field(default_factory=list)


class MaterialItem(BaseModel):
    image: str = ""
    title: str
    description: str = ""


class CSInfo(BaseModel):
    phone: str = ""
    kakao: str = ""
    refund_rules: list[str] = Field(default_factory=list)


class ImageAssignment(BaseModel):
    image_id: str
    section: str
    reason: str = ""


class GeneratedContent(BaseModel):
    title_ko: str
    hook_text: str
    hook_title_sub: str = ""
    description_ko: list[str]
    color_text: str = ""
    detail_text: str = ""

    theme_color_main: str = "#ff8c69"
    theme_color_bg_light: str = "#fffaf0"
    theme_color_badge_1: str = "#ff8c69"
    theme_color_badge_2: str = "#69c9ff"

    theme_section_bg: str = "#f4f1eb"
    theme_text_primary: str = "#4a4a4a"
    theme_text_secondary: str = "#8a8a8a"

    size_subtitle: str = ""

    section_name: str = ""
    section_title: str = ""
    section_subtitle: list[str] = Field(default_factory=list)

    product_info_ko: list[SpecItem] = Field(default_factory=list)


class ComponentSlot(BaseModel):
    type: str
    enabled: bool = True
    divider: str = "line"
    overrides: dict[str, str] = Field(default_factory=dict)


def _default_layout_components() -> list[ComponentSlot]:
    return [
        ComponentSlot(type="main_hook", divider="none"),
        ComponentSlot(type="product_images", divider="none"),
        ComponentSlot(type="key_points", divider="space"),
        ComponentSlot(type="spec_table", divider="line"),
        ComponentSlot(type="feature_grid", divider="line"),
        ComponentSlot(type="material_info", divider="line"),
        ComponentSlot(type="cs_refund", divider="line"),
    ]


class LayoutConfig(BaseModel):
    components: list[ComponentSlot] = Field(default_factory=_default_layout_components)


class DetailPageData(BaseModel):
    title: str
    subtitle: str = ""
    description: list[str] = Field(default_factory=list)
    badge: str = "BEST PICK"

    hook_text: str = ""
    hook_title_sub: str = ""
    hook_subtext: str = ""

    price: int | None = None
    original_price: int | None = None
    discount_rate: int | None = None

    images: list[str] = Field(default_factory=list)
    hero_banner: str = ""
    size_images: list[str] = Field(default_factory=list)
    size_display_mode: str = "normal"
    color_images: list[str] = Field(default_factory=list)
    color_display_mode: str = "normal"
    detail_images: list[str] = Field(default_factory=list)

    key_points: list[KeyPointItem] = Field(default_factory=list)

    bullet_points: list[str] = Field(default_factory=list)
    features: list[FeatureItem] = Field(default_factory=list)
    specs: list[SpecItem] = Field(default_factory=list)

    materials: list[MaterialItem] = Field(default_factory=list)

    cs_info: CSInfo | None = None

    color_text: str = ""
    detail_text: str = ""
    notes: list[str] = Field(default_factory=list)

    section_name: str = ""
    section_title: str = ""
    section_subtitle: list[str] = Field(default_factory=list)
    detail_title: str = "DETAIL"
    size_title: str = "사이즈 안내"
    size_subtitle: str = ""
    color_title: str = "색상 안내"
    color_subtitle: str = ""

    theme_color_main: str = "#ff8c69"
    theme_color_bg_light: str = "#fffaf0"
    theme_color_badge_1: str = "#ff8c69"
    theme_color_badge_2: str = "#69c9ff"
    theme_section_bg: str = "#f4f1eb"
    theme_text_primary: str = "#4a4a4a"
    theme_text_secondary: str = "#8a8a8a"
    theme_border_radius: str = "32px"
    recycle_material: str = "종이"

    product_info: list[SpecItem] = Field(default_factory=list)

    faqs: list[dict[str, str]] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)
    trust_badges: list[str] = Field(default_factory=list)
    cta_text: str = "지금 바로 구매하기"
    cta_subtext: str = ""

    generation_mode: str = "template"

    layout: LayoutConfig | None = None

    debug_info: dict[str, Any] | None = Field(default=None, alias="_debug")

    model_config = {"populate_by_name": True}
