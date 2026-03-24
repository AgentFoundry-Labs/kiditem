from __future__ import annotations

import asyncio
import io
import pathlib
import re
import uuid
from dataclasses import dataclass

import httpx
import numpy as np
import structlog
from PIL import Image, ImageDraw, ImageFont

from src.agents.content.paths import FONTS_DIR, IMAGES_DIR
from src.config import AI_IMAGE_ANALYSIS_MODEL, AI_TEXT_MODEL
from src.core.ai_client import AIClient

logger = structlog.get_logger()

NOTO_SANS_KR_BOLD_URL = (
    "https://github.com/google/fonts/raw/main/ofl/notosanskr/NotoSansKR%5Bwght%5D.ttf"
)
NOTO_SANS_KR_FONT_FILE = "NotoSansKR-variable.ttf"

TRANSLATION_PROMPT = (
    "Translate the following Chinese texts to natural Korean. "
    "Return ONLY the translations, one per line, in the same order. "
    "Keep numbers, units, symbols as-is.\n\n"
    "{texts}"
)

_VISION_DETECT_PROMPT = """\
Analyze this image and find ONLY Chinese text regions. Ignore English, Korean, numbers-only, and symbols.

For each Chinese text region, return:
- bbox: [x_min, y_min, x_max, y_max] in pixel coordinates
- text: the original Chinese text
- translation: natural, concise Korean translation
- text_color: [R, G, B] dominant text color
- bg_color: [R, G, B] background color behind the text
- font_weight: "bold" or "normal"
- font_size_px: estimated font size in pixels
- align: "left", "center", or "right"

Return JSON only (no markdown):
{"regions": [
  {"bbox": [100, 200, 400, 250], "text": "原文", "translation": "번역", "text_color": [255, 255, 255], "bg_color": [0, 0, 0], "font_weight": "bold", "font_size_px": 32, "align": "center"}
]}

If no Chinese text is found, return: {"regions": []}

CRITICAL RULES:
- Return raw JSON only. No markdown, no ```json blocks, no explanation.
- Do NOT skip ANY Chinese text — large titles, small captions, watermarks, ALL of them.
- bbox coordinates must be accurate pixel positions matching the actual text boundaries.
- Include ALL Chinese text regions even if they overlap with product images."""

_CJK_RE = re.compile(
    r"[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\U00020000-\U0002a6df"
    r"\U0002a700-\U0002b73f\U0002b740-\U0002b81f]"
)


def _contains_chinese(text: str) -> bool:
    return bool(_CJK_RE.search(text))


@dataclass
class TextRegion:
    bbox: list[list[int]]
    text: str
    confidence: float
    x: int
    y: int
    width: int
    height: int
    font_size: int
    text_color: tuple[int, int, int]
    bg_color: tuple[int, int, int]
    font_weight: str = "normal"
    align: str = "center"


class ImageTranslator:
    MIN_CONFIDENCE = 0.3

    def __init__(self) -> None:
        IMAGES_DIR.mkdir(parents=True, exist_ok=True)
        FONTS_DIR.mkdir(parents=True, exist_ok=True)
        self._ai = AIClient()
        if not AI_IMAGE_ANALYSIS_MODEL:
            raise ValueError("AI_IMAGE_ANALYSIS_MODEL is required")
        if not AI_TEXT_MODEL:
            raise ValueError("AI_TEXT_MODEL is required")
        self._vision_model = AI_IMAGE_ANALYSIS_MODEL
        self._text_model = AI_TEXT_MODEL
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

    async def _ensure_font(self) -> pathlib.Path:
        font_path = FONTS_DIR / NOTO_SANS_KR_FONT_FILE
        if font_path.exists():
            return font_path

        logger.info("Downloading Noto Sans KR font...")
        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
            resp = await client.get(NOTO_SANS_KR_BOLD_URL)
            resp.raise_for_status()
            await asyncio.to_thread(font_path.write_bytes, resp.content)
        logger.info("Font saved", font_path=str(font_path))
        return font_path

    async def _load_image(self, source: str) -> bytes:
        if source.startswith(("http://", "https://")):
            async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
                resp = await client.get(source)
                resp.raise_for_status()
                return resp.content
        path = pathlib.Path(source)
        if path.exists():
            return await asyncio.to_thread(path.read_bytes)
        raise FileNotFoundError(f"Image source not found: {source}")

    def _detect_text_regions(self, cv_img: np.ndarray) -> list[TextRegion]:
        engine = self._get_ocr_engine()
        results = engine.ocr(cv_img, cls=True)

        regions: list[TextRegion] = []

        page = results[0] if results else None
        if not page:
            return regions

        for line in page:
            bbox_raw, (text, conf) = line
            text = text.strip()

            if conf < self.MIN_CONFIDENCE or len(text) == 0:
                continue
            if not _contains_chinese(text):
                continue

            pts = np.array(bbox_raw, dtype=np.int32)
            x_min, y_min = pts.min(axis=0)
            x_max, y_max = pts.max(axis=0)
            x_min, y_min = max(0, int(x_min)), max(0, int(y_min))
            x_max = min(cv_img.shape[1], int(x_max))
            y_max = min(cv_img.shape[0], int(y_max))

            width = x_max - x_min
            height = y_max - y_min
            if width < 10 or height < 10:
                continue

            font_size = int(height * 0.75)
            text_color = self._detect_text_color(cv_img, x_min, y_min, x_max, y_max)
            bg_color = self._detect_bg_color(cv_img, x_min, y_min, x_max, y_max)

            regions.append(
                TextRegion(
                    bbox=pts.tolist(),
                    text=text,
                    confidence=conf,
                    x=x_min,
                    y=y_min,
                    width=width,
                    height=height,
                    font_size=font_size,
                    text_color=text_color,
                    bg_color=bg_color,
                )
            )

        logger.info(
            "PaddleOCR detected Chinese text regions",
            detected_count=len(regions),
            raw_count=len(page),
        )
        return regions

    def _detect_text_color(
        self, cv_img: np.ndarray, x1: int, y1: int, x2: int, y2: int
    ) -> tuple[int, int, int]:
        import cv2

        roi = cv_img[y1:y2, x1:x2]
        if roi.size == 0:
            return (255, 255, 255)

        gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
        _, mask = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

        bg_mean = cv2.mean(roi, mask=mask)
        inv_mask = cv2.bitwise_not(mask)
        fg_mean = cv2.mean(roi, mask=inv_mask)

        bg_brightness = sum(bg_mean[:3]) / 3
        fg_brightness = sum(fg_mean[:3]) / 3

        text_mean = fg_mean if bg_brightness > fg_brightness else bg_mean
        b, g, r = int(text_mean[0]), int(text_mean[1]), int(text_mean[2])
        return (r, g, b)

    def _detect_bg_color(
        self, cv_img: np.ndarray, x1: int, y1: int, x2: int, y2: int
    ) -> tuple[int, int, int]:
        import cv2

        pad = 20
        h, w = cv_img.shape[:2]
        sx, sy = max(0, x1 - pad), max(0, y1 - pad)
        ex, ey = min(w, x2 + pad), min(h, y2 + pad)

        outer = cv_img[sy:ey, sx:ex].copy()
        inner_y1, inner_x1 = y1 - sy, x1 - sx
        inner_y2, inner_x2 = inner_y1 + (y2 - y1), inner_x1 + (x2 - x1)

        mask = np.ones(outer.shape[:2], dtype=np.uint8) * 255
        mask[inner_y1:inner_y2, inner_x1:inner_x2] = 0

        if mask.sum() == 0:
            return (0, 0, 0)

        mean = cv2.mean(outer, mask=mask)
        b, g, r = int(mean[0]), int(mean[1]), int(mean[2])
        return (r, g, b)

    def _inpaint_regions(self, cv_img: np.ndarray, regions: list[TextRegion]) -> np.ndarray:
        import cv2

        mask = np.zeros(cv_img.shape[:2], dtype=np.uint8)
        for region in regions:
            pts = np.array(region.bbox, dtype=np.int32)
            cv2.fillPoly(mask, [pts], 255)

        kernel = np.ones((7, 7), np.uint8)
        mask = cv2.dilate(mask, kernel, iterations=4)

        return cv2.inpaint(cv_img, mask, inpaintRadius=10, flags=cv2.INPAINT_NS)

    async def _translate_texts(self, texts: list[str]) -> list[str]:
        if not texts:
            return []

        numbered = "\n".join(f"{i + 1}. {t}" for i, t in enumerate(texts))
        prompt = TRANSLATION_PROMPT.format(texts=numbered)

        raw = await self._ai.generate(prompt=prompt, model=self._text_model)

        lines = [line.strip() for line in raw.strip().split("\n") if line.strip()]
        translations: list[str] = []
        for line in lines:
            cleaned = line
            for prefix_len in range(1, 4):
                if (
                    len(line) > prefix_len + 1
                    and line[prefix_len] in ".)"
                    and line[:prefix_len].isdigit()
                ):
                    cleaned = line[prefix_len + 1 :].strip()
                    break
            translations.append(cleaned)

        if len(translations) < len(texts):
            translations.extend(texts[len(translations) :])

        return translations[: len(texts)]

    def _render_text_on_image(
        self,
        pil_img: Image.Image,
        regions: list[TextRegion],
        translations: list[str],
        font_path: pathlib.Path,
    ) -> Image.Image:
        draw = ImageDraw.Draw(pil_img)

        for region, translated in zip(regions, translations):
            self._render_single_text(draw, region, translated, font_path)

        return pil_img

    def _render_single_text(
        self,
        draw: ImageDraw.ImageDraw,
        region: TextRegion,
        text: str,
        font_path: pathlib.Path,
    ) -> None:
        font_size = max(region.font_size, 14)
        max_width = region.width
        max_height = region.height

        font: ImageFont.FreeTypeFont | ImageFont.ImageFont
        wrapped: list[str] = [text]
        for attempt_size in range(font_size, 10, -2):
            try:
                font = ImageFont.truetype(str(font_path), attempt_size)
            except OSError:
                font = ImageFont.load_default()
                break

            wrapped = self._wrap_text(draw, text, font, max_width)
            block_h = self._get_text_block_height(draw, wrapped, font)
            if block_h <= max_height:
                break
        else:
            try:
                font = ImageFont.truetype(str(font_path), 12)
            except OSError:
                font = ImageFont.load_default()
            wrapped = self._wrap_text(draw, text, font, max_width)

        block_h = self._get_text_block_height(draw, wrapped, font)

        text_y = region.y + max(0, (max_height - block_h) // 2)

        for line in wrapped:
            line_bbox = draw.textbbox((0, 0), line, font=font)
            line_w = line_bbox[2] - line_bbox[0]
            text_x = region.x + max(0, (max_width - line_w) // 2)

            draw.text((text_x, text_y), line, fill=region.text_color, font=font)
            line_h = line_bbox[3] - line_bbox[1]
            text_y += line_h + 2

    def _wrap_text(
        self,
        draw: ImageDraw.ImageDraw,
        text: str,
        font: ImageFont.FreeTypeFont | ImageFont.ImageFont,
        max_width: int,
    ) -> list[str]:
        if max_width <= 0:
            return [text]

        bbox = draw.textbbox((0, 0), text, font=font)
        if bbox[2] - bbox[0] <= max_width:
            return [text]

        lines: list[str] = []
        current = ""
        for char in text:
            test = current + char
            test_bbox = draw.textbbox((0, 0), test, font=font)
            if test_bbox[2] - test_bbox[0] > max_width and current:
                lines.append(current)
                current = char
            else:
                current = test
        if current:
            lines.append(current)
        return lines

    def _get_text_block_height(
        self,
        draw: ImageDraw.ImageDraw,
        lines: list[str],
        font: ImageFont.FreeTypeFont | ImageFont.ImageFont,
    ) -> int:
        total: int = 0
        for line in lines:
            bbox = draw.textbbox((0, 0), line, font=font)
            total += int(bbox[3] - bbox[1]) + 2
        return total

    async def _detect_and_translate_via_vision(
        self,
        image_bytes: bytes,
    ) -> tuple[list[TextRegion], list[str]]:
        import json as _json

        raw = await self._ai.analyze_image(
            image_bytes=image_bytes,
            prompt=_VISION_DETECT_PROMPT,
            model=self._vision_model,
        )

        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[-1]
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3]
            cleaned = cleaned.strip()

        try:
            data = _json.loads(cleaned)
        except _json.JSONDecodeError:
            logger.warning("Vision detect returned non-JSON", raw_response=raw[:200])
            return [], []

        regions: list[TextRegion] = []
        translations: list[str] = []
        for r in data.get("regions", []):
            bbox = r.get("bbox", [0, 0, 0, 0])
            x_min, y_min, x_max, y_max = int(bbox[0]), int(bbox[1]), int(bbox[2]), int(bbox[3])
            width = x_max - x_min
            height = y_max - y_min
            if width < 5 or height < 5:
                continue

            tc = r.get("text_color", [255, 255, 255])
            bc = r.get("bg_color", [0, 0, 0])

            font_size_px = r.get("font_size_px") or int(height * 0.75)

            regions.append(
                TextRegion(
                    bbox=[[x_min, y_min], [x_max, y_min], [x_max, y_max], [x_min, y_max]],
                    text=r.get("text", ""),
                    confidence=1.0,
                    x=x_min,
                    y=y_min,
                    width=width,
                    height=height,
                    font_size=int(font_size_px),
                    text_color=(int(tc[0]), int(tc[1]), int(tc[2])),
                    bg_color=(int(bc[0]), int(bc[1]), int(bc[2])),
                    font_weight=r.get("font_weight", "normal"),
                    align=r.get("align", "center"),
                )
            )
            translations.append(r.get("translation", r.get("text", "")))

        logger.info("Vision API detected text regions", region_count=len(regions))
        return regions, translations

    async def _render_text_html(
        self,
        width: int,
        height: int,
        regions: list[TextRegion],
        translations: list[str],
    ) -> bytes:
        from playwright.async_api import async_playwright

        divs: list[str] = []
        for region, text in zip(regions, translations):
            r, g, b = region.text_color
            justify = (
                "center"
                if region.align == "center"
                else "flex-start"
                if region.align == "left"
                else "flex-end"
            )
            style = (
                f"position:absolute;"
                f"left:{region.x}px;top:{region.y}px;"
                f"width:{region.width}px;height:{region.height}px;"
                f"font-size:{region.font_size}px;"
                f"font-weight:{region.font_weight};"
                f"color:rgb({r},{g},{b});"
                f"text-align:{region.align};"
                f"display:flex;align-items:center;"
                f"justify-content:{justify};"
                f"line-height:1.2;"
                f"font-family:'Noto Sans KR',sans-serif;"
                f"overflow:hidden;word-break:keep-all;"
            )
            escaped = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            divs.append(f'<div style="{style}">{escaped}</div>')

        html = f"""\
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700&display=swap');
body {{ margin:0; padding:0; width:{width}px; height:{height}px; position:relative; background:transparent; }}
</style>
</head>
<body>
{"".join(divs)}
</body>
</html>"""

        async with async_playwright() as p:
            browser = await p.chromium.launch()
            page = await browser.new_page(
                viewport={"width": width, "height": height},
                device_scale_factor=1,
            )
            await page.set_content(html, wait_until="networkidle")
            png_bytes = await page.screenshot(type="png", omit_background=True)
            await browser.close()

        return png_bytes

    async def remove_chinese_text(self, image_source: str) -> str:
        import cv2

        image_bytes = await self._load_image(image_source)

        np_arr = np.frombuffer(image_bytes, dtype=np.uint8)
        cv_img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if cv_img is None:
            raise ValueError(f"Failed to decode image: {image_source}")

        regions = await asyncio.to_thread(self._detect_text_regions, cv_img)
        if not regions:
            logger.info("No Chinese text detected", image_source=str(image_source)[:80])
            filename = f"{uuid.uuid4()}_cleaned.png"
            output_path = IMAGES_DIR / filename
            pil_img = Image.open(io.BytesIO(image_bytes))
            await asyncio.to_thread(pil_img.save, str(output_path))
            return f"/processed/{filename}"

        logger.info(
            "Removing Chinese text from size chart",
            region_count=len(regions),
            texts=[r.text for r in regions],
        )

        inpainted = await asyncio.to_thread(self._inpaint_regions, cv_img, regions)
        result = Image.fromarray(cv2.cvtColor(inpainted, cv2.COLOR_BGR2RGB))

        filename = f"{uuid.uuid4()}_cleaned.png"
        output_path = IMAGES_DIR / filename
        await asyncio.to_thread(result.save, str(output_path))
        logger.info("Chinese text removed", output_path=str(output_path))
        return f"/processed/{filename}"

    async def translate_image(
        self,
        image_source: str,
        source_lang: str = "zh",
        target_lang: str = "ko",
    ) -> str:
        import cv2

        image_bytes = await self._load_image(image_source)

        np_arr = np.frombuffer(image_bytes, dtype=np.uint8)
        cv_img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if cv_img is None:
            raise ValueError(f"Failed to decode image: {image_source}")

        regions = await asyncio.to_thread(self._detect_text_regions, cv_img)
        if not regions:
            logger.info("No Chinese text detected", image_source=str(image_source))
            filename = f"{uuid.uuid4()}_translated.png"
            output_path = IMAGES_DIR / filename
            pil_img = Image.open(io.BytesIO(image_bytes))
            await asyncio.to_thread(pil_img.save, str(output_path))
            return f"/processed/{filename}"

        original_texts = [r.text for r in regions]
        translations = await self._translate_texts(original_texts)
        logger.info(
            "OCR regions processed",
            region_count=len(regions),
            translations=[(o, t) for o, t in zip(original_texts, translations)],
        )

        inpainted = await asyncio.to_thread(self._inpaint_regions, cv_img, regions)

        base_img = Image.fromarray(cv2.cvtColor(inpainted, cv2.COLOR_BGR2RGB))
        font_path = await self._ensure_font()
        result = self._render_text_on_image(base_img, regions, translations, font_path)

        filename = f"{uuid.uuid4()}_translated.png"
        output_path = IMAGES_DIR / filename
        await asyncio.to_thread(result.save, str(output_path))
        logger.info("Translated image saved", method="ocr+pillow", output_path=str(output_path))
        return f"/processed/{filename}"

    async def translate_images_batch(
        self,
        image_sources: list[str],
        source_lang: str = "zh",
        target_lang: str = "ko",
    ) -> list[str]:
        output: list[str] = []
        for src in image_sources:
            try:
                result = await self.translate_image(src, source_lang, target_lang)
                output.append(result)
            except Exception as exc:
                logger.error("Translation failed", image_source=src, result=str(exc))
                output.append(src)
        return output
