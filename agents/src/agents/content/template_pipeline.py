from __future__ import annotations

import asyncio
from dataclasses import dataclass

import structlog

from src.agents.content.models import (
    CSInfo,
    DetailPageData,
    ExtensionProductData,
    FeatureItem,
    GeneratedContent,
    KeyPointItem,
    LayoutConfig,
    MaterialItem,
)
from src.agents.content.paths import cleanup_product_artifacts, product_images_dir, to_processed_url
from src.agents.content.pipeline_base import PipelineBase, _KRW_PER_CNY
from src.config import (
    AI_IMAGE_EDIT_MODEL,
    AI_IMAGE_EDIT_SIZE_MODEL,
    AI_TEXT_MODEL,
    DETAIL_PAGE_TEMPLATE,
)

logger = structlog.get_logger()

_CATEGORY_TONES: dict[str, str] = {
    "봉제": "Focus on 촉감 (texture), 포근함, 귀여움. Use words like 폭신폭신, 보들보들, 몽글몽글, 안아주고 싶은.",
    "인형": "Focus on 촉감 (texture), 포근함, 귀여움. Use words like 폭신폭신, 보들보들, 몽글몽글, 안아주고 싶은.",
    "plush": "Focus on 촉감 (texture), 포근함, 귀여움. Use words like 폭신폭신, 보들보들, 몽글몽글, 안아주고 싶은.",
    "완구": "Focus on 재미, 안전성, 감각 발달. Use words like 쫀득쫀득, 말랑말랑, 반짝반짝, 신기한.",
    "toy": "Focus on 재미, 안전성, 감각 발달. Use words like 쫀득쫀득, 말랑말랑, 반짝반짝, 신기한.",
    "문구": "Focus on 공부 의욕, 귀여운 디자인, 실용성. Use words like 깔끔한, 예쁜, 공부가 즐거워지는.",
    "stationery": "Focus on 공부 의욕, 귀여운 디자인, 실용성. Use words like 깔끔한, 예쁜, 공부가 즐거워지는.",
    "가방": "Focus on 수납력, 내구성, 스타일. Use words like 넉넉한, 가벼운, 트렌디한.",
    "bag": "Focus on 수납력, 내구성, 스타일. Use words like 넉넉한, 가벼운, 트렌디한.",
    "식품": "Focus on 맛, 신선함, 행복감. Use words like 바삭바삭, 촉촉한, 달콤한, 입안 가득.",
    "food": "Focus on 맛, 신선함, 행복감. Use words like 바삭바삭, 촉촉한, 달콤한, 입안 가득.",
    "의류": "Focus on 착용감, 소재감, 스타일링. Use words like 부드러운, 편안한, 데일리로 딱.",
    "clothing": "Focus on 착용감, 소재감, 스타일링. Use words like 부드러운, 편안한, 데일리로 딱.",
    "생활": "Focus on 편리함, 실용성, 만족감. Use words like 간편한, 깔끔한, 든든한.",
    "home": "Focus on 편리함, 실용성, 만족감. Use words like 간편한, 깔끔한, 든든한.",
}
_DEFAULT_TONE = (
    "Write in a warm, emotional, cute Korean e-commerce style appropriate for the product category."
)


def _resolve_category_tone(category: str) -> str:
    cat_lower = category.lower()
    for keyword, tone in _CATEGORY_TONES.items():
        if keyword in cat_lower:
            return tone
    return _DEFAULT_TONE


_BANNER_MOODS: dict[str, str] = {
    "완구": (
        "Create a bright, clean {bg_color} background — a solid pastel tone "
        "or soft gradient. No dark, moody, or realistic lifestyle environments. "
        "Use {accent_color} as a playful accent. Bright, even studio lighting."
    ),
    "장난감": (
        "Create a bright, clean {bg_color} background — a solid pastel tone "
        "or soft gradient. No dark, moody, or realistic lifestyle environments. "
        "Use {accent_color} as a playful accent. Bright, even studio lighting."
    ),
}
_DEFAULT_BANNER_MOOD = (
    "Establish a {bg_color} toned lifestyle environment. "
    "Add subtle atmospheric depth. Use {accent_color} as a subtle accent. "
    "Soft, warm ambient lighting. Editorial photography style."
)


def _resolve_banner_mood(category: str) -> str:
    cat_lower = category.lower()
    for keyword, mood in _BANNER_MOODS.items():
        if keyword in cat_lower:
            return mood
    return _DEFAULT_BANNER_MOOD


_HERO_BANNER_PROMPT = (
    "Using the provided product photo, replace the background for: {product_context}.\n\n"
    "{banner_mood}\n\n"
    "Keep the product exactly as-is — do not alter its shape, color, or details. "
    "Only replace the background. Erase any text, watermarks, or characters in any language."
)

_MAIN_STUDIO_PROMPT = (
    "Using the provided product photo, create a professional studio product shot. "
    "Center the product on a clean, seamless white backdrop with softbox lighting, "
    "gentle fill light, and a subtle drop shadow. "
    "Preserve the product exactly as-is — its shape, color, and every detail must remain unchanged. "
    "Erase any watermarks, logos, or Chinese characters visible on the product."
)

_DETAIL_PROMPT = (
    "Using the provided product photo, create a clean detail shot on a white backdrop with soft studio lighting. "
    "The product must remain exactly as it appears — do not add, remove, or alter any item in the scene. "
    "Erase any watermarks, logos, or Chinese characters. Keep everything else untouched."
)

_SIZE_CHART_PROMPT = (
    "Using the provided product images, create a clean size measurement reference sheet. "
    "Each image may contain a mix of measurement diagrams and regular product photos.\n\n"
    "KEEP ONLY items that have visible dimension arrows, measurement lines, or ruler markings "
    "with numbers like 9CM, 22CM, 5CM attached to them. "
    "Completely remove any product photo that does NOT have dimension arrows or measurement lines — "
    "even if the product looks similar, if there are no measurement annotations it must be deleted.\n\n"
    "PRESERVE the product and packaging exactly as they appear — all text printed ON the product "
    "or packaging box (brand names, model numbers, labels like 'RACING', '1:18') must stay untouched. "
    "Also preserve all measurement annotations: dimension numbers, unit labels (CM, MM, inch), "
    "arrow lines, and dotted guide lines.\n\n"
    "REMOVE ONLY the Chinese overlay text added by the seller as annotations on top of the photo "
    "(e.g. headings like '产品包装', '尺寸参考'). These are floating text overlays, not printed on the product.\n\n"
    "Arrange the remaining measurement diagrams on a clean white background "
    "with generous spacing between each item — leave at least 150px of blank white space between diagrams."
)


@dataclass(frozen=True)
class ModelProvider:
    name: str
    prompt_key: str


def _detect_provider(model: str) -> ModelProvider:
    lower = model.lower()
    if lower.startswith("gemini-"):
        return ModelProvider(name="gemini", prompt_key="gemini")
    return ModelProvider(name="openai", prompt_key="openai")


_DEFAULT_CONTENT_PROMPT = (
    "You are an expert Korean e-commerce copywriter.\n\n"
    "Product: {title}\n"
    "Category: {category}\n"
    "Description: {description}\n"
    "Price range (CNY): {price_range}\n"
    "Supplier: {supplier} ({supplier_years})\n"
    "Rating: {good_rates}%\n"
    "Specs:\n{specs_text}\n"
    "Pack info:\n{pack_info_text}\n\n"
    "TONE: {category_tone}\n\n"
    "Generate Korean marketing content for a Coupang product detail page.\n"
    "Include: title_ko, hook_text, hook_subtext, description_ko, key_points, "
    "specs_ko, materials_ko, features, notes, theme colors, section titles."
)


class TemplatePipeline(PipelineBase):
    def __init__(self) -> None:
        super().__init__()
        if not AI_IMAGE_EDIT_MODEL:
            raise ValueError("AI_IMAGE_EDIT_MODEL is required for TemplatePipeline")
        if not AI_TEXT_MODEL:
            raise ValueError("AI_TEXT_MODEL is required")
        self._edit_model = AI_IMAGE_EDIT_MODEL
        self._generation_model = AI_TEXT_MODEL

    async def process(
        self,
        ext_data: ExtensionProductData,
        *,
        product_id: str,
        layout: LayoutConfig | None = None,
        template_name: str = "",
    ) -> DetailPageData:
        structlog.contextvars.bind_contextvars(product_id=product_id)
        cleanup_product_artifacts(product_id)

        if not ext_data.images:
            raise ValueError("No hero image available — cannot run template pipeline")

        images_dir = product_images_dir(product_id)
        template = template_name or DETAIL_PAGE_TEMPLATE
        category = ext_data.category_name or ""
        hero_url = ext_data.images[0]

        analysis, size_indices, content = await asyncio.gather(
            self._analyze_product(ext_data),
            self._scan_size_charts(list(ext_data.description_images)),
            self._generate_korean_content(ext_data, hero_url=hero_url, template=template),
        )

        product_desc = analysis.get("description", "")
        detail_indices = analysis.get("detail_indices", [])
        detail_urls = [ext_data.images[i] for i in detail_indices if i < len(ext_data.images)]
        if not detail_urls:
            detail_urls = list(ext_data.images[1:4])
        detail_urls = detail_urls[:3]

        size_urls = [
            ext_data.description_images[i]
            for i in size_indices
            if i < len(ext_data.description_images)
        ]

        hero_banner_url, main_url, detail_img_urls, size_img_urls = await asyncio.gather(
            self._edit_hero_banner(content, category, hero_url),
            self._edit_main_image(hero_url),
            self._edit_detail_images(detail_urls),
            self._edit_size_charts(size_urls, product_id),
        )

        logger.info(
            "Template pipeline completed",
            edit_model=self._edit_model,
            detail_count=len(detail_img_urls),
            size_count=len(size_img_urls),
        )

        return self._assemble(
            content=content,
            hero_imgs=[main_url],
            hero_banner=hero_banner_url,
            size_imgs=size_img_urls,
            detail_imgs=detail_img_urls,
            ext_data=ext_data,
            layout=layout,
        )

    async def _generate_korean_content(
        self,
        ext_data: ExtensionProductData,
        *,
        hero_url: str = "",
        template: str = "default",
    ) -> GeneratedContent:
        specs_text = "\n".join(f"  - {s.key}: {s.value}" for s in ext_data.specs) or "  (none)"
        pack_info_text = (
            "\n".join(f"  - {p.key}: {p.value}" for p in ext_data.pack_info) or "  (none)"
        )

        price_min = ext_data.price_min or 0
        price_max = ext_data.price_max or 0
        price_range = f"{price_min}~{price_max}" if price_max else str(price_min)

        category_name = ext_data.category_name or ""
        category_tone = _resolve_category_tone(category_name + " " + ext_data.title)

        prompt = _DEFAULT_CONTENT_PROMPT.format(
            title=ext_data.title,
            description=ext_data.description or "",
            category=category_name,
            price_range=price_range,
            supplier=ext_data.supplier_name or "",
            supplier_years=ext_data.supplier_years or "",
            good_rates=ext_data.good_rates or 0,
            specs_text=specs_text,
            pack_info_text=pack_info_text,
            category_tone=category_tone,
        )

        return await self._ai.generate_with_healing(
            prompt=prompt,
            response_model=GeneratedContent,
            model=self._generation_model,
            image_urls=[hero_url] if hero_url else None,
        )

    async def _fal_edit(self, image_url: str, prompt: str) -> str:
        return await self._ai.fal_edit_image(
            image_url=image_url,
            prompt=prompt,
            model=self._edit_model,
        )

    async def _edit_hero_banner(
        self,
        content: GeneratedContent,
        category: str,
        hero_url: str,
    ) -> str:
        product_context = content.title_ko
        if category:
            product_context += f" ({category})"

        banner_mood = _resolve_banner_mood(category).format(
            bg_color=content.theme_color_bg_light,
            accent_color=content.theme_color_main,
            category=category,
        )

        prompt = _HERO_BANNER_PROMPT.format(
            product_context=product_context,
            banner_mood=banner_mood,
        )

        try:
            return await self._ai.fal_edit_image(
                image_url=hero_url,
                prompt=prompt,
                model=self._edit_model,
                image_size={"width": 2100, "height": 900},
            )
        except Exception:
            logger.warning("Hero banner edit failed", exc_info=True)
            return ""

    async def _edit_main_image(self, hero_url: str) -> str:
        try:
            return await self._fal_edit(hero_url, _MAIN_STUDIO_PROMPT)
        except Exception:
            logger.warning("Main image edit failed, using original", exc_info=True)
            return hero_url

    async def _edit_detail_images(
        self,
        source_urls: list[str],
    ) -> list[str]:
        if not source_urls:
            return []

        async def _edit_one(url: str) -> str:
            try:
                return await self._fal_edit(url, _DETAIL_PROMPT)
            except Exception:
                logger.warning("Detail image edit failed, using original", exc_info=True)
                return url

        return list(await asyncio.gather(*[_edit_one(u) for u in source_urls]))

    async def _edit_size_charts(self, size_urls: list[str], product_id: str) -> list[str]:
        if not size_urls:
            return []

        try:
            result_bytes = await self._ai.edit_images_multi(
                image_urls=size_urls,
                prompt=_SIZE_CHART_PROMPT,
                model=AI_IMAGE_EDIT_SIZE_MODEL,
            )
            images_dir = product_images_dir(product_id)
            output_path = images_dir / "size_chart.png"
            output_path.write_bytes(result_bytes)
            logger.info(
                "Size chart edit succeeded", size_bytes=len(result_bytes), url_count=len(size_urls)
            )
            return [to_processed_url(output_path)]
        except Exception as exc:
            logger.error(
                "Size chart edit failed, using originals",
                error_type=type(exc).__name__,
                error_msg=str(exc)[:500],
                model=AI_IMAGE_EDIT_SIZE_MODEL or "(empty)",
                url_count=len(size_urls),
                exc_info=True,
            )
            return size_urls

    def _assemble(
        self,
        *,
        content: GeneratedContent,
        hero_imgs: list[str],
        hero_banner: str = "",
        size_imgs: list[str],
        detail_imgs: list[str],
        ext_data: ExtensionProductData,
        layout: LayoutConfig | None,
    ) -> DetailPageData:
        key_points: list[KeyPointItem] = []
        for i, kp in enumerate(content.key_points):
            key_points.append(
                KeyPointItem(
                    number=i + 1,
                    title=kp.title,
                    description=kp.description,
                    images=[],
                )
            )

        materials: list[MaterialItem] = [
            MaterialItem(title=m.key, description=m.value) for m in content.materials_ko
        ]

        price_krw = int(ext_data.price_min * _KRW_PER_CNY) if ext_data.price_min else None
        original_krw = int(ext_data.price_max * _KRW_PER_CNY) if ext_data.price_max else None
        discount_rate = None
        if price_krw and original_krw and original_krw > price_krw:
            discount_rate = int((1 - price_krw / original_krw) * 100)

        features = content.features
        if not features:
            features = self._fallback_features(ext_data)

        return DetailPageData(
            title=content.title_ko,
            description=content.description_ko,
            hook_text=content.hook_text,
            hook_title_sub=content.hook_title_sub,
            hook_subtext=content.hook_subtext,
            images=hero_imgs,
            hero_banner=hero_banner,
            size_images=size_imgs,
            size_display_mode="normal",
            detail_images=detail_imgs,
            price=price_krw,
            original_price=original_krw,
            discount_rate=discount_rate,
            key_points=key_points,
            specs=content.specs_ko,
            features=features,
            materials=materials,
            color_text=content.color_text,
            detail_text=content.detail_text,
            notes=content.notes,
            section_name=content.section_name,
            section_title=content.section_title,
            section_subtitle=content.section_subtitle,
            detail_title=content.detail_title,
            size_title=content.size_title,
            size_subtitle=content.size_subtitle,
            product_info=content.product_info_ko,
            theme_color_main=content.theme_color_main,
            theme_color_bg_light=content.theme_color_bg_light,
            theme_color_badge_1=content.theme_color_badge_1,
            theme_color_badge_2=content.theme_color_badge_2,
            theme_section_bg=content.theme_section_bg,
            theme_text_primary=content.theme_text_primary,
            theme_text_secondary=content.theme_text_secondary,
            theme_border_radius=content.theme_border_radius,
            recycle_material=content.recycle_material,
            cs_info=CSInfo(
                refund_rules=[
                    "수령 후 7일 이내 교환/반품 가능",
                    "단순 변심 시 반품 배송비 고객 부담",
                    "상품 하자 시 무료 교환/반품",
                ],
            ),
            layout=layout,
            _debug={
                "pipeline": "template",
                "edit_model": self._edit_model,
                "detail_images_count": len(detail_imgs),
                "size_charts_count": len(size_imgs),
            },
        )

    @staticmethod
    def _fallback_features(ext_data: ExtensionProductData) -> list[FeatureItem]:
        features: list[FeatureItem] = []
        if ext_data.moq:
            features.append(
                FeatureItem(
                    icon="📦",
                    title=f"최소주문 {ext_data.moq}{ext_data.unit or '개'}",
                    description="대량 구매 시 할인 가능",
                )
            )
        if ext_data.good_rates and ext_data.good_rates > 0:
            features.append(
                FeatureItem(
                    icon="⭐",
                    title=f"호평률 {ext_data.good_rates}%",
                    description="구매자 만족도 높은 상품",
                )
            )
        return features
