from __future__ import annotations

import asyncio

import structlog

from src.agents.content.models import (
    DetailPageData,
    ExtensionProductData,
    GenerationMode,
    OneshotContent,
)
from src.agents.content.paths import cleanup_product_artifacts, product_images_dir
from src.agents.content.pipeline_base import PipelineBase, _KRW_PER_CNY
from src.config import AI_IMAGE_MODEL, AI_TEXT_MODEL

logger = structlog.get_logger()

_TEMPLATE_HTML = """\
<!-- 상세페이지 디자인 템플릿. 이 HTML 구조와 인라인 스타일을 따라 이미지를 생성하세요. -->
<!-- 폰트: Black Han Sans (제목), Noto Sans KR 700 (본문) -->

<div style="max-width:860px; margin:40px auto; background:#fff; box-shadow:0 25px 50px rgba(0,0,0,0.25); font-family:'Noto Sans KR',sans-serif">

  <!-- Hero -->
  <section style="background:#FFF5F5; padding-bottom:80px">
    <img src="[상품 메인 이미지]" style="width:100%; height:256px; object-fit:cover">
    <div style="text-align:center; margin-top:64px; padding:0 16px">
      <div style="width:192px; height:2px; background:#E85A71; opacity:0.4; margin:0 auto"></div>
      <h1 style="font-family:'Black Han Sans',sans-serif; font-size:72px; color:#E85A71; letter-spacing:-0.025em; line-height:1.1; margin:24px 0">[상품 한줄 카피]</h1>
      <div style="width:256px; height:2px; background:#E85A71; opacity:0.4; margin:0 auto"></div>
      <p style="margin-top:24px; font-size:20px; font-weight:700; color:#333">[상품 설명 1~2줄]</p>
    </div>
    <div style="margin-top:64px"><img src="[상품 메인 이미지]" style="width:100%; height:auto"></div>
  </section>

  <!-- Point 1 (사이즈) -->
  <section style="background:#fff; padding-bottom:80px; position:relative">
    <div style="position:absolute; left:50%; transform:translateX(-50%); top:-28px; width:56px; height:56px; background:#000; color:#fff; border-radius:50%; display:flex; flex-direction:column; align-items:center; justify-content:center; box-shadow:0 4px 6px rgba(0,0,0,0.1); z-index:10">
      <span style="font-size:10px; font-weight:700; letter-spacing:0.1em">POINT</span>
      <span style="font-family:'Black Han Sans'; font-size:24px; line-height:1">1</span>
    </div>
    <div style="text-align:center; padding-top:80px; font-family:'Black Han Sans',sans-serif; font-size:48px; line-height:1.25">
      <span style="color:#E85A71">[섹션 이름]</span><br>
      <span style="color:#4A90D9; position:relative; display:inline-block; margin-top:8px">[섹션 타이틀]</span>
    </div>
    <p style="margin-top:32px; text-align:center; color:#666; font-weight:700; font-size:20px">[한 줄 설명]</p>
    <div style="text-align:center; margin-top:64px">
      <span style="display:inline-block; background:#7C8B9A; color:#fff; border-radius:9999px; padding:8px 48px; font-weight:700; font-size:20px; letter-spacing:0.1em; box-shadow:0 4px 6px rgba(0,0,0,0.1)">사이즈 안내</span>
    </div>
    <div style="margin-top:40px; display:flex; flex-direction:column; gap:24px; max-width:640px; margin-left:auto; margin-right:auto; padding:0 24px">
      <img src="[사이즈 이미지]" style="width:100%; height:auto; border-radius:16px; box-shadow:0 4px 6px rgba(0,0,0,0.1)">
    </div>
  </section>

  <!-- Detail -->
  <section style="background:#fff; padding-bottom:80px; border-top:1px solid #F3F4F6">
    <div style="text-align:center; padding-top:64px">
      <span style="display:inline-block; background:#7C8B9A; color:#fff; border-radius:9999px; padding:8px 48px; font-weight:700; font-size:20px; letter-spacing:0.1em; box-shadow:0 4px 6px rgba(0,0,0,0.1)">DETAIL</span>
      <p style="margin-top:24px; color:#666; font-weight:700; font-size:18px">[한 줄 설명]</p>
    </div>
    <div style="margin-top:40px; display:flex; flex-direction:column; gap:24px; max-width:640px; margin-left:auto; margin-right:auto; padding:0 24px">
      <img src="[디테일 이미지 1]" style="width:100%; height:auto; border-radius:16px; box-shadow:0 4px 6px rgba(0,0,0,0.1)">
      <img src="[디테일 이미지 2]" style="width:100%; height:auto; border-radius:16px; box-shadow:0 4px 6px rgba(0,0,0,0.1)">
      <img src="[디테일 이미지 3]" style="width:100%; height:auto; border-radius:16px; box-shadow:0 4px 6px rgba(0,0,0,0.1)">
    </div>
  </section>

  <!-- Specs -->
  <section style="background:#FFF5F5; padding:80px 16px">
    <div style="text-align:center">
      <span style="display:inline-block; background:#7C8B9A; color:#fff; border-radius:9999px; padding:8px 48px; font-weight:700; font-size:20px; letter-spacing:0.1em; box-shadow:0 4px 6px rgba(0,0,0,0.1)">제품 안전 특별법에 의한 품질표시</span>
    </div>
    <div style="margin-top:48px; max-width:448px; margin-left:auto; margin-right:auto; background:rgba(255,255,255,0.6); border-radius:24px; padding:40px; text-align:center; color:#333; font-weight:700; font-size:18px; line-height:2; box-shadow:0 1px 2px rgba(0,0,0,0.05); border:1px solid rgba(255,255,255,0.5)">
      <p>*[스펙 키] : [스펙 값]</p>
      <p>*[스펙 키] : [스펙 값]</p>
    </div>
  </section>

</div>\
"""

_ONESHOT_PROMPT = """\
상품 사진을 활용해서 한국 이커머스 상세페이지 이미지를 만들어주세요.

규칙:
- 모든 텍스트는 한국어로만 작성. 중국어/영어 텍스트 절대 금지.
- 제공된 상품 사진만 사용. 새로운 상품 이미지를 만들지 마세요.
- 상품 사진의 색상, 형태, 디테일을 변형하지 말고 원본 그대로 사용하세요. 배경 제거(누끼)만 허용.
- 모든 콘텐츠는 이미지 상단부터 배치하고, 마지막 섹션 아래의 남는 영역만 흰색으로 비워두세요.

아래 HTML/CSS 디자인(레이아웃, 폰트, 색상, 간격, 뱃지 스타일)을 정확히 따르세요:

{template_html}\
"""


class OneshotPipeline(PipelineBase):
    def __init__(self) -> None:
        super().__init__()
        if not AI_TEXT_MODEL:
            raise ValueError("AI_TEXT_MODEL is required")
        if not AI_IMAGE_MODEL:
            raise ValueError("AI_IMAGE_MODEL is required")
        self._text_model = AI_TEXT_MODEL
        self._image_model = AI_IMAGE_MODEL

    async def _generate_korean_content(
        self,
        ext_data: ExtensionProductData,
        *,
        hero_url: str = "",
    ) -> OneshotContent:
        specs_text = "\n".join(f"  - {s.key}: {s.value}" for s in ext_data.specs) or "  (none)"

        seen_dims: set[str] = set()
        unique_pack: list[str] = []
        for p in ext_data.pack_info:
            if p.value not in seen_dims:
                seen_dims.add(p.value)
                unique_pack.append(f"  - {p.key}: {p.value}")
        pack_info_text = "\n".join(unique_pack[:5]) or "  (none)"

        prompt = (
            f"중국 도매(1688) 상품을 한국 쿠팡 상세페이지용으로 변환하세요.\n\n"
            f"상품명: {ext_data.title}\n"
            f"카테고리: {ext_data.category_name or ''}\n"
            f"스펙:\n{specs_text}\n"
            f"포장:\n{pack_info_text}\n\n"
            f"규칙: 위 데이터에 명시된 정보만 사용. 없는 기능/소재 추측 금지. "
            f"B2B 스펙(수출, 하류 플랫폼, MOQ, 3C 인증) 제외.\n\n"
            f"생성 필드:\n"
            f"1. title_ko: 쿠팡 검색 최적화 한국어 상품명\n"
            f"2. key_points: 셀링포인트 3개 (title + description)\n"
            f"3. specs_ko: 소비자용 스펙 (소재, 크기, 연령, 색상 등)\n"
            f"4. product_info_ko: 제품/패키지 크기, 무게\n"
            f"5. notes: 주의사항 (있을 경우만)"
        )

        return await self._ai.generate_with_healing(
            prompt=prompt,
            response_model=OneshotContent,
            model=self._text_model,
            image_urls=[hero_url] if hero_url else None,
        )

    async def process(
        self,
        ext_data: ExtensionProductData,
        *,
        product_id: str,
        reference_image_url: str = "",
    ) -> DetailPageData:
        structlog.contextvars.bind_contextvars(product_id=product_id)
        cleanup_product_artifacts(product_id)

        if not ext_data.images:
            raise ValueError("No hero image available — cannot run oneshot pipeline")

        images_dir = product_images_dir(product_id)

        hero_url = ext_data.images[0]

        analysis_result: dict = {}
        size_indices: list[int] = []
        content: OneshotContent | None = None
        try:
            analysis_result, size_indices, content = await asyncio.gather(
                self._analyze_product(ext_data),
                self._scan_size_charts(list(ext_data.description_images)),
                self._generate_korean_content(ext_data, hero_url=hero_url),
            )
        except Exception:
            logger.warning("Oneshot parallel analysis failed, using defaults", exc_info=True)

        detail_indices: list[int] = analysis_result.get("detail_indices", [])
        selected_urls = [ext_data.images[i] for i in detail_indices if i < len(ext_data.images)]
        if not selected_urls:
            selected_urls = list(ext_data.images[:5])

        if hero_url not in selected_urls:
            selected_urls = [hero_url] + selected_urls
        selected_urls = selected_urls[:5]

        size_urls = [
            ext_data.description_images[i]
            for i in size_indices
            if i < len(ext_data.description_images)
        ]
        size_urls = size_urls[:2]

        ref_images = await self._download_refs(selected_urls, 5)
        if not ref_images:
            raise ValueError("No product images available for oneshot generation")

        size_images = await self._download_refs(size_urls, 2) if size_urls else []

        all_images = ref_images + size_images

        prompt = _ONESHOT_PROMPT.format(template_html=_TEMPLATE_HTML)

        image_bytes = await self._ai.generate_with_images(
            prompt=prompt,
            images=all_images,
            model=self._image_model,
            aspect_ratio="1:4",
            image_size="4K",
            thinking_level="HIGH",
        )

        oneshot_url = await self._save_generated_image(image_bytes, "oneshot_full", images_dir)

        logger.info(
            "Oneshot generation completed",
            model=self._image_model,
            product_ref_count=len(ref_images),
            size_chart_count=len(size_images),
            total_images=len(all_images),
        )

        return self._assemble(
            oneshot_image=oneshot_url,
            ext_data=ext_data,
            content=content,
        )

    def _assemble(
        self,
        *,
        oneshot_image: str,
        ext_data: ExtensionProductData,
        content: OneshotContent | None,
    ) -> DetailPageData:
        price_krw = int(ext_data.price_min * _KRW_PER_CNY) if ext_data.price_min else None
        original_krw = int(ext_data.price_max * _KRW_PER_CNY) if ext_data.price_max else None
        discount_rate = None
        if price_krw and original_krw and original_krw > price_krw:
            discount_rate = int((1 - price_krw / original_krw) * 100)

        title = content.title_ko if content else ext_data.title

        return DetailPageData(
            title=title,
            description=[],
            images=list(ext_data.images[:1]),
            detail_images=[oneshot_image],
            price=price_krw,
            original_price=original_krw,
            discount_rate=discount_rate,
            product_info=[],
            notes=[],
            generation_mode=GenerationMode.ONESHOT,
            _debug={
                "pipeline": "studio-oneshot",
                "oneshot_model": self._image_model,
                "has_korean_content": content is not None,
            },
        )
