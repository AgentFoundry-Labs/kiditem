from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

import structlog
from langfuse import observe

from src.agents.content.models import (
    CSInfo,
    DetailPageData,
    ExtensionProductData,
    GeneratedContent,
    LayoutConfig,
    SpecItem,
)
from src.agents.content.paths import cleanup_product_artifacts, product_images_dir, to_processed_url
from src.agents.content.pipeline_base import PipelineBase, _KRW_PER_CNY
from src.config import (
    AI_IMAGE_DETAIL_MODEL,
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

_DETAIL_PROMPTS = [
    "Using the provided product photo, create a single front-facing product shot on a clean white backdrop. "
    "Straight-on angle, soft studio lighting. Output exactly ONE product in ONE image. "
    "Do NOT create collages or multi-panel layouts. Preserve product shape, color, details unchanged. "
    "Erase any watermarks, logos, or Chinese characters.",
    "Using the provided product photo, create a single 45-degree angled product shot on a clean white backdrop. "
    "Three-quarter view highlighting depth and dimension. Soft studio lighting. Output exactly ONE product in ONE image. "
    "Do NOT create collages or multi-panel layouts. Preserve product shape, color, details unchanged. "
    "Erase any watermarks, logos, or Chinese characters.",
    "Using the provided product photo, create a single close-up detail shot emphasizing texture and craftsmanship. "
    "Slightly cropped to show material quality. Soft studio lighting. Output exactly ONE product in ONE image. "
    "Do NOT create collages or multi-panel layouts. Preserve product shape, color, details unchanged. "
    "Erase any watermarks, logos, or Chinese characters.",
]

_SIZE_CHART_PROMPT = (
    "이 이미지에서 치수/사이즈가 표시된 영역만 잘라내고, "
    "중국어 라벨을 한국어로 번역하세요.\n\n"
    "1. 추출: 치수선, 화살표, 숫자(cm, mm)가 표시된 제품 사진만 잘라내세요.\n"
    "   제거: 페이지 제목(产品包装, 产品信息 등), 설명 텍스트, 장식 배경.\n\n"
    "2. 번역: 치수 관련 중국어 라벨만 한국어로 바꾸세요.\n"
    "   예: 高度 → 높이, 宽 → 너비, 长 → 길이, 直径 → 지름.\n"
    "   번역 금지: 상품 자체에 인쇄/각인된 텍스트, 브랜드명, 로고.\n\n"
    "레이아웃: 각 제품/포장 사진을 세로로 1장씩 풀폭 배치하세요. "
    "제품이 2개 이상일 경우, 제품과 제품 사이에 최소 150px 이상의 빈 공간을 두세요.\n\n"
    "중요:\n"
    "- 제품/포장 사진을 절대 변형하지 마세요. 와이어프레임이나 윤곽선으로 바꾸지 마세요.\n"
    "- 숫자를 절대 변경하지 마세요.\n"
    "- 치수선, 화살표, 제품 실루엣은 원본 그대로 유지하세요."
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
    "You are an expert Korean e-commerce copywriter for a BOLD VERTICAL detail page.\n\n"
    "Product: {title}\n"
    "Category: {category}\n"
    "Description: {description}\n"
    "Price range (CNY): {price_range}\n"
    "Supplier: {supplier} ({supplier_years})\n"
    "Rating: {good_rates}%\n"
    "Specs:\n{specs_text}\n"
    "Pack info:\n{pack_info_text}\n\n"
    "TONE: Editorial, impactful. Short punchy copy. Confident, not cute. {category_tone}\n\n"
    "Generate ALL fields in Korean with STRICT character limits:\n"
    "1. **title_ko**: Search-optimized Korean product title for Coupang.\n"
    "2. **hook_text**: Hero main title (1st line). MUST include product type/name. Max 10 chars.\n"
    "3. **hook_title_sub**: Hero emphasis title (2nd line). Key selling point. 15-20 chars.\n"
    "4. **description_ko**: Hero subtitle 2-3 lines. JSON array. Each line ~25 chars.\n"
    "5. **section_name**: POINT section heading. Max 15 chars.\n"
    "6. **section_title**: POINT section highlight. Max 10 chars.\n"
    "7. **section_subtitle**: POINT section subtitle 2 lines. JSON array. Each ~20 chars.\n"
    "8. **size_subtitle**: Size section description. Max 25 chars.\n"
    "9. **detail_text**: Detail section one-line copy. Max 25 chars.\n"
    "10. **color_text**: Color section copy. Max 20 chars. Empty if no color info.\n"
    "13. **product_info_ko**: Product safety labeling. List of objects with key and value fields. "
    "MUST include 5 items: 제품명, 사이즈, 재질, 원산지, 사용연령. If unknown use 상세페이지 참조. Pure Korean only.\n"
    "14-20. **theme colors**: theme_color_main, theme_color_bg_light, "
    "theme_color_badge_1, theme_color_badge_2, "
    "theme_section_bg, theme_text_primary, theme_text_secondary.\n\n"
    "CRITICAL: Respect character limits. Overlong text breaks the template layout."
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

    @observe(name="pipeline-step1", capture_input=False)
    async def run_step1(
        self,
        ext_data: ExtensionProductData,
        *,
        product_id: str,
        seed_hook_text: str | None = None,
        seed_hook_title_sub: str | None = None,
        seed_hero_image: str | None = None,
    ) -> DetailPageData:
        """Step 1: Generate Korean copywriting + theme colors. No image generation."""
        structlog.contextvars.bind_contextvars(product_id=product_id)

        if not ext_data.images and not seed_hero_image:
            raise ValueError("No hero image available -- cannot run step 1")

        seed_product_name = ""
        if seed_hook_text:
            seed_product_name = seed_hook_text
            if seed_hook_title_sub:
                seed_product_name += " " + seed_hook_title_sub

        if seed_hero_image:
            hero_url = seed_hero_image
        elif len(ext_data.images) > 1:
            analysis = await self._analyze_product(ext_data)
            hero_idx = analysis.get("hero_index", 0)
            hero_url = ext_data.images[hero_idx]
            logger.info("Hero image selected", hero_index=hero_idx, url=hero_url[:80])
        else:
            hero_url = ext_data.images[0]

        size_indices, content = await asyncio.gather(
            self._scan_size_charts(list(ext_data.description_images)),
            self._generate_korean_content(
                ext_data,
                hero_url=hero_url,
                seed_product_name=seed_product_name or None,
            ),
        )

        logger.info(
            "Step 1 completed",
            size_chart_indices=size_indices,
            hero_url=hero_url[:80],
            title=content.title_ko[:50],
        )

        result = self._assemble_step1(
            content=content,
            ext_data=ext_data,
            size_indices=size_indices,
            hero_url=hero_url,
        )

        if seed_hook_text:
            result.hook_text = seed_hook_text
        if seed_hook_title_sub:
            result.hook_title_sub = seed_hook_title_sub
        return result

    def _assemble_step1(
        self,
        *,
        content: GeneratedContent,
        ext_data: ExtensionProductData,
        size_indices: list[int],
        hero_url: str | None = None,
    ) -> DetailPageData:
        price_krw = int(ext_data.price_min * _KRW_PER_CNY) if ext_data.price_min else None
        original_krw = int(ext_data.price_max * _KRW_PER_CNY) if ext_data.price_max else None
        discount_rate = None
        if price_krw and original_krw and original_krw > price_krw:
            discount_rate = int((1 - price_krw / original_krw) * 100)

        return DetailPageData(
            title=content.title_ko,
            description=content.description_ko,
            hook_text=content.hook_text,
            hook_title_sub=content.hook_title_sub,
            images=[hero_url] if hero_url else list(ext_data.images[:1]),
            price=price_krw,
            original_price=original_krw,
            discount_rate=discount_rate,
            color_text=content.color_text,
            detail_text=content.detail_text,
            section_name=content.section_name,
            section_title=content.section_title,
            section_subtitle=content.section_subtitle,
            size_subtitle=content.size_subtitle,
            product_info=content.product_info_ko,
            theme_color_main=content.theme_color_main,
            theme_color_bg_light=content.theme_color_bg_light,
            theme_color_badge_1=content.theme_color_badge_1,
            theme_color_badge_2=content.theme_color_badge_2,
            theme_section_bg=content.theme_section_bg,
            theme_text_primary=content.theme_text_primary,
            theme_text_secondary=content.theme_text_secondary,
            generation_mode="draft",
            _debug={
                "pipeline": "template-step1",
                "size_chart_indices": size_indices,
                "original_images": list(ext_data.description_images),
            },
        )

    @observe(name="pipeline-step2", capture_input=False)
    async def run_step2(
        self,
        draft_snapshot: dict,
        *,
        product_id: str,
        on_progress: Callable[..., Awaitable[None]] | None = None,
    ) -> DetailPageData:
        """Step 2: Generate images from confirmed snapshot. Reads from snapshot only."""
        structlog.contextvars.bind_contextvars(product_id=product_id)

        hero_image_url = draft_snapshot.get("heroImageUrl") or ""
        if not hero_image_url:
            images = draft_snapshot.get("images") or []
            if images:
                hero_image_url = images[0]
        if not hero_image_url:
            raise ValueError("No hero image URL in draft snapshot")

        debug_info = draft_snapshot.get("debug_info") or draft_snapshot.get("_debug") or {}
        size_indices = debug_info.get("size_chart_indices", [])
        original_images = debug_info.get("original_images", [])

        size_urls = [original_images[i] for i in size_indices if i < len(original_images)]

        content = GeneratedContent(
            title_ko=draft_snapshot.get("title", ""),
            hook_text=draft_snapshot.get("hook_text", ""),
            description_ko=draft_snapshot.get("description", []),
            theme_color_main=draft_snapshot.get("theme_color_main", "#ff8c69"),
            theme_color_bg_light=draft_snapshot.get("theme_color_bg_light", "#fffaf0"),
        )

        category = ""

        main_url, size_img_urls = await asyncio.gather(
            self._edit_main_image(hero_image_url),
            self._edit_size_charts(size_urls, product_id),
        )

        if on_progress:
            await on_progress({"main_image": main_url, "size_images": size_img_urls})

        hero_banner_url, detail_img_urls = await asyncio.gather(
            self._edit_hero_banner(content, category, main_url),
            self._edit_detail_images(main_url),
        )

        if on_progress:
            await on_progress(
                {
                    "main_image": main_url,
                    "banner": hero_banner_url,
                    "size_images": size_img_urls,
                    "detail_images": detail_img_urls,
                }
            )

        logger.info(
            "Step 2 completed",
            edit_model=self._edit_model,
            detail_count=len(detail_img_urls),
            size_count=len(size_img_urls),
        )

        return self._assemble_step2(
            draft_snapshot=draft_snapshot,
            hero_imgs=[main_url],
            hero_banner=hero_banner_url,
            size_imgs=size_img_urls,
            detail_imgs=detail_img_urls,
        )

    def _assemble_step2(
        self,
        *,
        draft_snapshot: dict,
        hero_imgs: list[str],
        hero_banner: str,
        size_imgs: list[str],
        detail_imgs: list[str],
    ) -> DetailPageData:
        product_info: list[SpecItem] = []
        for pi in draft_snapshot.get("product_info", []):
            if isinstance(pi, dict):
                product_info.append(SpecItem(key=pi.get("key", ""), value=pi.get("value", "")))

        return DetailPageData(
            title=draft_snapshot.get("title", ""),
            description=draft_snapshot.get("description", []),
            hook_text=draft_snapshot.get("hook_text", ""),
            hook_title_sub=draft_snapshot.get("hook_title_sub", ""),
            images=hero_imgs,
            hero_banner=hero_banner,
            size_images=size_imgs,
            size_display_mode=draft_snapshot.get("size_display_mode", "normal"),
            detail_images=detail_imgs,
            price=draft_snapshot.get("price"),
            original_price=draft_snapshot.get("original_price"),
            discount_rate=draft_snapshot.get("discount_rate"),
            color_text=draft_snapshot.get("color_text", ""),
            detail_text=draft_snapshot.get("detail_text", ""),
            section_name=draft_snapshot.get("section_name", ""),
            section_title=draft_snapshot.get("section_title", ""),
            section_subtitle=draft_snapshot.get("section_subtitle", []),
            size_subtitle=draft_snapshot.get("size_subtitle", ""),
            product_info=product_info,
            theme_color_main=draft_snapshot.get("theme_color_main", "#ff8c69"),
            theme_color_bg_light=draft_snapshot.get("theme_color_bg_light", "#fffaf0"),
            theme_color_badge_1=draft_snapshot.get("theme_color_badge_1", "#ff8c69"),
            theme_color_badge_2=draft_snapshot.get("theme_color_badge_2", "#69c9ff"),
            theme_section_bg=draft_snapshot.get("theme_section_bg", "#f4f1eb"),
            theme_text_primary=draft_snapshot.get("theme_text_primary", "#4a4a4a"),
            theme_text_secondary=draft_snapshot.get("theme_text_secondary", "#8a8a8a"),
            generation_mode="image",
            _debug={
                "pipeline": "template-step2",
                "edit_model": self._edit_model,
                "detail_images_count": len(detail_imgs),
                "size_charts_count": len(size_imgs),
            },
        )

    async def process(
        self,
        ext_data: ExtensionProductData,
        *,
        product_id: str,
        layout: LayoutConfig | None = None,
        template_name: str = "",
    ) -> DetailPageData:
        """DEPRECATED: Use run_step1() + run_step2() instead.

        This monolithic method is superseded by the two-step pipeline.
        Kept for backward reference only -- not called by ContentAgent.
        """
        structlog.contextvars.bind_contextvars(product_id=product_id)
        cleanup_product_artifacts(product_id)

        if not ext_data.images:
            raise ValueError("No hero image available — cannot run template pipeline")

        template = template_name or DETAIL_PAGE_TEMPLATE
        category = ext_data.category_name or ""
        hero_url = ext_data.images[0]

        # Image classification removed from flow. Detail images come from hero URL.
        size_indices, content = await asyncio.gather(
            self._scan_size_charts(list(ext_data.description_images)),
            self._generate_korean_content(ext_data, hero_url=hero_url, template=template),
        )

        size_urls = [
            ext_data.description_images[i]
            for i in size_indices
            if i < len(ext_data.description_images)
        ]

        main_url, size_img_urls = await asyncio.gather(
            self._edit_main_image(hero_url),
            self._edit_size_charts(size_urls, product_id),
        )

        hero_banner_url, detail_img_urls = await asyncio.gather(
            self._edit_hero_banner(content, category, main_url),
            self._edit_detail_images(main_url),
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

    @observe(name="generate-korean-content", capture_input=False)
    async def _generate_korean_content(
        self,
        ext_data: ExtensionProductData,
        *,
        hero_url: str = "",
        template: str = "default",
        seed_product_name: str | None = None,
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

        if seed_product_name:
            prompt += (
                f'\n\nThe Korean product name is: "{seed_product_name}". '
                "Base all marketing copy on this name."
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

    @observe(name="edit-hero-banner", capture_input=False)
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

    @observe(name="edit-main-image", capture_input=False)
    async def _edit_main_image(self, hero_url: str) -> str:
        try:
            return await self._fal_edit(hero_url, _MAIN_STUDIO_PROMPT)
        except Exception:
            logger.warning("Main image edit failed, using original", exc_info=True)
            return hero_url

    @observe(name="edit-detail-images", capture_input=False)
    async def _edit_detail_images(self, hero_url: str) -> list[str]:
        if not hero_url:
            return []

        async def _gen_one(prompt: str) -> str:
            return await self._ai.fal_edit_image(
                image_url=hero_url,
                prompt=prompt,
                model=AI_IMAGE_DETAIL_MODEL,
            )

        try:
            results = await asyncio.gather(
                *[_gen_one(p) for p in _DETAIL_PROMPTS],
                return_exceptions=True,
            )
            return [r for r in results if isinstance(r, str)]
        except Exception:
            logger.warning("Detail image generation failed", exc_info=True)
            return [hero_url]

    @observe(name="edit-size-charts", capture_input=False)
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
        price_krw = int(ext_data.price_min * _KRW_PER_CNY) if ext_data.price_min else None
        original_krw = int(ext_data.price_max * _KRW_PER_CNY) if ext_data.price_max else None
        discount_rate = None
        if price_krw and original_krw and original_krw > price_krw:
            discount_rate = int((1 - price_krw / original_krw) * 100)

        return DetailPageData(
            title=content.title_ko,
            description=content.description_ko,
            hook_text=content.hook_text,
            hook_title_sub=content.hook_title_sub,
            images=hero_imgs,
            hero_banner=hero_banner,
            size_images=size_imgs,
            size_display_mode="normal",
            detail_images=detail_imgs,
            price=price_krw,
            original_price=original_krw,
            discount_rate=discount_rate,
            color_text=content.color_text,
            detail_text=content.detail_text,
            section_name=content.section_name,
            section_title=content.section_title,
            section_subtitle=content.section_subtitle,
            detail_title="DETAIL",
            size_title="사이즈 안내",
            size_subtitle=content.size_subtitle,
            product_info=content.product_info_ko,
            theme_color_main=content.theme_color_main,
            theme_color_bg_light=content.theme_color_bg_light,
            theme_color_badge_1=content.theme_color_badge_1,
            theme_color_badge_2=content.theme_color_badge_2,
            theme_section_bg=content.theme_section_bg,
            theme_text_primary=content.theme_text_primary,
            theme_text_secondary=content.theme_text_secondary,
            layout=layout,
            _debug={
                "pipeline": "template",
                "edit_model": self._edit_model,
                "detail_images_count": len(detail_imgs),
                "size_charts_count": len(size_imgs),
            },
        )
