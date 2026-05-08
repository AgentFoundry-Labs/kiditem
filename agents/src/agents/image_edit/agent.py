import asyncio
import base64
import io
import json
from PIL import Image
from rembg import remove
from src.agents.base import BaseAgent
from src.agents.content.http_utils import load_image
from src.core.ai_client import AIClient
from src.config import AI_IMAGE_EDIT_SIZE_MODEL, AI_IMAGE_MODEL

PRODUCT_PRESERVATION_RULES = (
    "This is product-preservation editing, not product generation. "
    "Preserve the exact product identity, silhouette, shape, proportions, material, color, "
    "texture, surface pattern, printed artwork, seams, holes, caps, buttons, and all visible "
    "details from the input image. Do not synthesize, redesign, reinterpret, beautify, simplify, "
    "repair, complete, or replace the product. If the request requires a new commercial mood, "
    "change only the surrounding background, lighting, crop, or staging context while keeping "
    "the product unchanged. Do not add text, captions, price badges, logos, or watermarks unless "
    "the user explicitly asks for text."
)

PRESET_PROMPTS = {
    "remove_background": (
        "Remove the entire background and return a clean product cutout as a transparent PNG "
        "with an alpha channel. Keep only the visible main subject, preserve the original product "
        "shape and edges, do not redraw the product, do not add text, and do not replace the "
        "background with white, gray, color, studio, or shadow-only scenery."
    ),
    "remove_text": (
        "Remove all overlay text and watermarks from the image and inpaint those areas cleanly. "
        "Do not remove text, logos, graphics, or labels that are physically printed on the product or packaging."
    ),
    "replace_background": "",  # Uses user_prompt directly
    "enhance": "Enhance image quality, improve clarity and sharpness while preserving the original product exactly.",
    "full_regenerate": (
        "Create a more commercial product photo from this image while preserving the product exactly. "
        "Do not create a different product."
    ),
    "custom": "",  # Uses user_prompt directly
}


class ImageEditAgent(BaseAgent):
    agent_type = "image_edit"
    timeout_seconds = 120

    async def execute(self, pool, task_input: dict | None) -> dict:
        if not task_input:
            raise ValueError("task_input is required")

        preset = task_input.get("preset", "custom")

        if preset == "color_guide":
            return await self._execute_color_guide(task_input)

        image_url = task_input.get("image_url")
        user_prompt = task_input.get("user_prompt", "")

        if not image_url:
            raise ValueError("image_url is required")

        if preset == "remove_background":
            return await self._execute_remove_background(image_url)

        preset_prompt = PRESET_PROMPTS.get(preset, "")
        if preset in ("replace_background", "custom"):
            prompt = user_prompt if user_prompt else "Edit this image"
        elif preset_prompt and user_prompt:
            prompt = f"{preset_prompt}. Additional: {user_prompt}"
        elif preset_prompt:
            prompt = preset_prompt
        else:
            prompt = user_prompt or "Edit this image"

        return await self._execute_bytes_edit(image_url, prompt)

    async def _execute_remove_background(self, image_url: str) -> dict:
        raw = await self._load_image_bytes(image_url)
        cutout = await asyncio.to_thread(remove, raw)
        png = await self._to_png_bytes(cutout)
        b64 = base64.b64encode(png).decode()
        return {"image_url": f"data:image/png;base64,{b64}"}

    async def _load_image_bytes(self, source: str) -> bytes:
        if source.startswith("data:"):
            try:
                _, encoded = source.split(",", 1)
            except ValueError as exc:
                raise ValueError("Invalid data URL image source") from exc
            return base64.b64decode(encoded)
        return await load_image(source)

    async def _to_png_bytes(self, image_bytes: bytes) -> bytes:
        def convert() -> bytes:
            img = Image.open(io.BytesIO(image_bytes))
            if img.mode != "RGBA":
                img = img.convert("RGBA")
            buf = io.BytesIO()
            img.save(buf, format="PNG")
            return buf.getvalue()

        return await asyncio.to_thread(convert)

    async def _execute_bytes_edit(self, image_url: str, prompt: str) -> dict:
        if not AI_IMAGE_MODEL:
            raise ValueError("AI_IMAGE_MODEL is required for image edit")

        raw = await self._load_image_bytes(image_url)
        png = await self._to_png_bytes(raw)
        full_prompt = f"{PRODUCT_PRESERVATION_RULES}\n\nUser edit request:\n{prompt.strip()}"

        ai = AIClient()
        result = await ai.edit_image(
            image_bytes=png,
            prompt=full_prompt,
            model=AI_IMAGE_MODEL,
            mime_type="image/png",
        )
        b64 = base64.b64encode(result).decode()
        return {"image_url": f"data:image/png;base64,{b64}"}

    async def _execute_color_guide(self, task_input: dict) -> dict:
        image_urls = task_input.get("image_urls") or []
        if len(image_urls) < 2:
            raise ValueError("color_guide requires at least 2 image_urls")

        prompt = (
            "Arrange these product photos side by side on a clean white background. "
            "Keep each product exactly as-is, no modifications to shape, color, or details. "
            "Equal spacing between items. Professional product catalog layout. "
            "Do NOT add any text, labels, or decorations."
        )

        ai = AIClient()
        result_bytes = await ai.edit_images_multi(
            image_urls=image_urls,
            prompt=prompt,
            model=AI_IMAGE_EDIT_SIZE_MODEL,
        )

        b64 = base64.b64encode(result_bytes).decode()
        return {"image_url": f"data:image/png;base64,{b64}"}
