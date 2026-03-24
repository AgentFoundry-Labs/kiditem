from __future__ import annotations

import asyncio
import json
import pathlib
import re
import uuid

import httpx
import structlog

from src.agents.content.http_utils import download_image_with_type
from src.agents.content.models import ExtensionProductData
from src.agents.content.paths import product_images_dir, to_processed_url, cleanup_product_artifacts
from src.config import AI_IMAGE_ANALYSIS_MODEL
from src.core.ai_client import AIClient

logger = structlog.get_logger()

_json_decoder = json.JSONDecoder(strict=False)


def _parse_llm_json(raw: str) -> dict:
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[-1]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()

    try:
        return json.loads(cleaned, strict=False)
    except json.JSONDecodeError:
        obj, _ = _json_decoder.raw_decode(cleaned)
        return obj


_KRW_PER_CNY = 190

_PRODUCT_ANALYSIS_PROMPT = """\
You are a professional product photographer preparing to recreate these product photos \
for a premium Korean e-commerce listing (Coupang).

Product title: {title}
Category: {category}
Specifications:
{specs}

You will see {image_count} product photos (P0–P{last_index}).

TASK 1 — PRODUCT DESCRIPTION:
Examine the product photos carefully. Describe what you see with enough precision \
that another photographer could recreate an identical product shot:
1. FORM: Exact product shape, silhouette, proportions, and approximate dimensions. \
Is it round, rectangular, organic? How tall vs. wide?
2. SURFACE: Every color present (use specific color names like "dusty rose" or \
"charcoal gray"), material finish (matte, glossy, satin, textured), \
and any visible grain, weave, or pattern.
3. DETAILS: Stitching, seams, buttons, zippers, embossing, engraving, \
printed graphics, labels, hang tags — anything that makes this product unique.
4. TEXT: Any Chinese/English text visible on the product, packaging, or labels. \
Provide the exact text and its Korean translation equivalent.
5. STYLING: How the product is positioned, any props or context visible, \
the background type and color.

TASK 2 — DETAIL SHOT SELECTION:
- detail_indices: Which product photo indices (P, excluding P0 which is always hero) \
show the best angles for detail shots? Pick up to 3.
- EXCLUDE images that primarily show: packaging boxes, hang tags, labels, \
certificate cards, or any surface dominated by Chinese text. \
Only select images where the product itself is the clear focus.

Return JSON:
{{
  "description": "<detailed English description>",
  "detail_indices": [1, 2]
}}\
"""

_DIMENSION_RE = re.compile(
    r"\d+\.?\d*\s*(?:cm|mm|inch(?:es)?|in|厘米|毫米)",
    re.IGNORECASE,
)
_DIMENSION_NUMBER_RE = re.compile(
    r"(\d+\.?\d*)\s*(?:cm|mm|inch(?:es)?|in|厘米|毫米)",
    re.IGNORECASE,
)
_EXCLUDE_KEYWORDS = frozenset({"店铺推荐", "推荐商品", "猜你喜欢", "热销", "点击进入"})

_OCR_DOWNLOAD_SEMAPHORE = asyncio.Semaphore(5)
_OCR_DOWNLOAD_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Referer": "https://detail.1688.com/",
}


class PipelineBase:
    def __init__(self) -> None:
        self._ai = AIClient()
        if not AI_IMAGE_ANALYSIS_MODEL:
            raise ValueError("AI_IMAGE_ANALYSIS_MODEL is required")
        self._analysis_model = AI_IMAGE_ANALYSIS_MODEL
        self._ocr_engine: object | None = None

    def _get_ocr_engine(self) -> object:
        if self._ocr_engine is None:
            from paddleocr import PaddleOCR

            self._ocr_engine = PaddleOCR(
                lang="ch",
                use_angle_cls=True,
                show_log=False,
            )
        return self._ocr_engine

    async def _analyze_product(
        self,
        ext_data: ExtensionProductData,
    ) -> dict:
        if not ext_data.images:
            raise ValueError("No product images available for analysis")

        specs_text = "\n".join(f"  - {s.key}: {s.value}" for s in ext_data.specs) or "  (none)"

        product_urls = list(ext_data.images[:10])

        prompt = _PRODUCT_ANALYSIS_PROMPT.format(
            title=ext_data.title,
            category=ext_data.category_name or "",
            specs=specs_text,
            image_count=len(product_urls),
            last_index=len(product_urls) - 1,
        )

        raw = await self._ai.analyze_images_batch(
            image_urls=product_urls,
            prompt=prompt,
            model=self._analysis_model,
        )

        parsed = _parse_llm_json(raw)
        data = parsed if isinstance(parsed, dict) else {"description": raw, "detail_indices": []}
        logger.info(
            "Product analyzed",
            image_count=len(product_urls),
            description_length=len(data.get("description", "")),
            detail_indices=data.get("detail_indices", []),
        )
        return data

    _OCR_MAX_LONG_SIDE = 1280

    def _check_size_chart_ocr(self, img_bytes: bytes) -> frozenset[str] | None:
        import io

        import numpy as np
        from PIL import Image

        img = Image.open(io.BytesIO(img_bytes))
        long_side = max(img.size)
        if long_side > self._OCR_MAX_LONG_SIDE:
            ratio = self._OCR_MAX_LONG_SIDE / long_side
            img = img.resize(
                (int(img.width * ratio), int(img.height * ratio)),
                Image.LANCZOS,
            )
        img_np = np.array(img)

        engine = self._get_ocr_engine()
        results = engine.ocr(img_np, cls=True)

        if not results or not results[0]:
            return None

        texts: list[str] = []
        for line in results[0]:
            _bbox, (text, _conf) = line
            texts.append(text)

        joined = " ".join(texts)

        for kw in _EXCLUDE_KEYWORDS:
            if kw in joined:
                return None

        if not _DIMENSION_RE.search(joined):
            return None

        numbers = _DIMENSION_NUMBER_RE.findall(joined)
        if len(numbers) < 2:
            return None
        return frozenset(numbers)

    async def _scan_size_charts(
        self,
        description_images: list[str],
    ) -> list[int]:
        if not description_images:
            return []

        urls = list(description_images[:20])

        async def _download(url: str) -> bytes | None:
            async with _OCR_DOWNLOAD_SEMAPHORE:
                try:
                    async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
                        resp = await client.get(url, headers=_OCR_DOWNLOAD_HEADERS)
                        resp.raise_for_status()
                        return resp.content
                except Exception:
                    logger.warning("Size chart image download failed", url=url[:80], exc_info=True)
                    return None

        downloaded = await asyncio.gather(*[_download(u) for u in urls])

        max_size_charts = 2
        size_indices: list[int] = []
        seen_dimensions: set[frozenset[str]] = set()
        for idx, img in enumerate(downloaded):
            if img is None:
                continue
            try:
                dims = await asyncio.to_thread(self._check_size_chart_ocr, img)
                if dims is None:
                    continue
                if dims in seen_dimensions:
                    logger.info("Skipping duplicate size chart", index=idx, dimensions=sorted(dims))
                    continue
                seen_dimensions.add(dims)
                size_indices.append(idx)
                if len(size_indices) >= max_size_charts:
                    break
            except Exception:
                logger.warning("Size chart OCR failed", index=idx, exc_info=True)

        logger.info(
            "Size chart scan completed (OCR)",
            image_count=len(urls),
            downloaded=sum(1 for d in downloaded if d is not None),
            size_chart_count=len(size_indices),
            size_chart_indices=size_indices,
            unique_dimension_sets=len(seen_dimensions),
        )
        return size_indices

    async def _save_generated_image(
        self,
        img_bytes: bytes,
        suffix: str,
        output_dir: pathlib.Path,
    ) -> str:
        output_dir.mkdir(parents=True, exist_ok=True)
        filename = f"{uuid.uuid4()}_{suffix}.png"
        output_path = output_dir / filename
        output_path.write_bytes(img_bytes)
        logger.info("Image generated", filename=filename, suffix=suffix)
        return to_processed_url(output_path)

    @staticmethod
    async def _download_refs(
        urls: list[str],
        max_count: int,
    ) -> list[tuple[bytes, str]]:
        refs: list[tuple[bytes, str]] = []
        for url in urls[:max_count]:
            try:
                img_bytes, mime = await download_image_with_type(url)
                refs.append((img_bytes, mime))
            except Exception:
                continue
        return refs
