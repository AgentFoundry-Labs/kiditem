from __future__ import annotations

import asyncio
import io
import uuid

import structlog
from PIL import Image
from rembg import remove

from src.agents.content.http_utils import load_image
from src.agents.content.models import RegenerationMode
from src.agents.content.paths import IMAGES_DIR
from src.config import AI_IMAGE_ANALYSIS_MODEL, AI_IMAGE_MODEL
from src.core.ai_client import AIClient

logger = structlog.get_logger()

REMOVE_TEXT_PROMPT = (
    "Remove ALL Chinese text, watermarks, and overlay text from this product image. "
    "Keep the product itself exactly as it is. "
    "Fill text areas naturally with the surrounding background."
)

REMOVE_TEXT_AND_ADD_KOREAN_PROMPT = (
    "Remove ALL Chinese text, watermarks, and overlay text from this product image. "
    "Keep the product itself exactly as it is. "
    "Fill text areas naturally with the surrounding background. "
    "Then add the following Korean text in a clean, professional style: {korean_text}"
)

REPLACE_BACKGROUND_PROMPT = (
    "Place this product on a {style} background. "
    "Keep the product exactly as it is. Professional e-commerce product photography."
)

ENHANCE_PROMPT = (
    "Enhance this product image. Improve lighting, clarity, sharpness, and color balance. "
    "Keep the product exactly the same — only improve image quality."
)

ANALYZE_PRODUCT_PROMPT = (
    "Describe this product image in detail for re-creation. Include:\n"
    "1. Product type, shape, and form factor\n"
    "2. Colors, materials, and textures\n"
    "3. Size proportions and key visual features\n"
    "4. Any distinctive design elements\n"
    "Be specific enough to recreate a very similar product image from scratch.\n"
    "Respond in English."
)

REGENERATE_PROMPT = (
    "Create a professional Korean e-commerce product photo of: {description}. "
    "Clean white background, studio lighting, high resolution. "
    "{extra_prompt}"
)


class AIImageGenerator:
    def __init__(self) -> None:
        IMAGES_DIR.mkdir(parents=True, exist_ok=True)
        self._ai = AIClient()

    @staticmethod
    async def _load_image_bytes(source: str) -> bytes:
        return await load_image(source)

    async def _to_png_bytes(self, image_bytes: bytes) -> bytes:
        img = Image.open(io.BytesIO(image_bytes))
        if img.mode != "RGBA":
            img = img.convert("RGBA")
        buf = io.BytesIO()
        await asyncio.to_thread(img.save, buf, format="PNG")
        return buf.getvalue()

    async def _save_result(self, image_bytes: bytes, suffix: str = "ai") -> str:
        output_path = IMAGES_DIR / f"{uuid.uuid4()}_{suffix}.png"
        img = Image.open(io.BytesIO(image_bytes))
        await asyncio.to_thread(img.save, str(output_path))
        logger.info("AI image saved", output_path=str(output_path))
        return str(output_path)

    async def regenerate(
        self,
        image_source: str,
        mode: RegenerationMode,
        prompt: str = "",
        korean_text: str = "",
    ) -> str:
        if mode == RegenerationMode.REMOVE_TEXT:
            return await self.remove_text(image_source, korean_text)
        if mode == RegenerationMode.REPLACE_BACKGROUND:
            return await self.replace_background(image_source, prompt)
        if mode == RegenerationMode.FULL_REGENERATE:
            return await self.full_regenerate(image_source, prompt)
        if mode == RegenerationMode.ENHANCE:
            return await self.enhance(image_source)
        raise ValueError(f"Unknown regeneration mode: {mode}")

    async def remove_text(self, image_source: str, korean_text: str = "") -> str:
        raw = await self._load_image_bytes(image_source)
        png = await self._to_png_bytes(raw)

        if korean_text:
            prompt = REMOVE_TEXT_AND_ADD_KOREAN_PROMPT.format(korean_text=korean_text)
        else:
            prompt = REMOVE_TEXT_PROMPT

        if not AI_IMAGE_MODEL:
            raise ValueError("AI_IMAGE_MODEL is required")
        result = await self._ai.edit_image(image_bytes=png, prompt=prompt, model=AI_IMAGE_MODEL)
        return await self._save_result(result, suffix="notxt_ai")

    async def replace_background(self, image_source: str, style: str = "") -> str:
        raw = await self._load_image_bytes(image_source)

        nobg_bytes = await asyncio.to_thread(remove, raw)
        nobg_png = await self._to_png_bytes(nobg_bytes)

        bg_style = style or "clean white studio"
        prompt = REPLACE_BACKGROUND_PROMPT.format(style=bg_style)
        if not AI_IMAGE_MODEL:
            raise ValueError("AI_IMAGE_MODEL is required")
        result = await self._ai.edit_image(
            image_bytes=nobg_png, prompt=prompt, model=AI_IMAGE_MODEL
        )
        return await self._save_result(result, suffix="rebg_ai")

    async def full_regenerate(self, image_source: str, extra_prompt: str = "") -> str:
        raw = await self._load_image_bytes(image_source)
        png = await self._to_png_bytes(raw)

        if not AI_IMAGE_ANALYSIS_MODEL:
            raise ValueError("AI_IMAGE_ANALYSIS_MODEL is required")
        description = await self._ai.analyze_image(
            image_bytes=png,
            prompt=ANALYZE_PRODUCT_PROMPT,
            model=AI_IMAGE_ANALYSIS_MODEL,
        )
        logger.info("Product analysis for regeneration", description=description[:200])

        gen_prompt = REGENERATE_PROMPT.format(
            description=description,
            extra_prompt=extra_prompt,
        )
        if not AI_IMAGE_MODEL:
            raise ValueError("AI_IMAGE_MODEL is required")
        result = await self._ai.generate_image(prompt=gen_prompt, model=AI_IMAGE_MODEL)
        return await self._save_result(result, suffix="regen_ai")

    async def enhance(self, image_source: str) -> str:
        raw = await self._load_image_bytes(image_source)
        png = await self._to_png_bytes(raw)

        if not AI_IMAGE_MODEL:
            raise ValueError("AI_IMAGE_MODEL is required")
        result = await self._ai.edit_image(
            image_bytes=png, prompt=ENHANCE_PROMPT, model=AI_IMAGE_MODEL
        )
        return await self._save_result(result, suffix="enhanced_ai")

    async def process_batch(
        self,
        image_urls: list[str],
        mode: RegenerationMode,
        prompt: str = "",
        korean_text: str = "",
    ) -> list[str]:
        tasks = [
            self.regenerate(url, mode=mode, prompt=prompt, korean_text=korean_text)
            for url in image_urls
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        processed: list[str] = []
        for i, result in enumerate(results):
            if isinstance(result, BaseException):
                logger.error("AI regeneration failed", image_url=image_urls[i], result=str(result))
            else:
                processed.append(result)
        return processed
