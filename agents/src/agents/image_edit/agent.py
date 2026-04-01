import json
from src.agents.base import BaseAgent
from src.core.ai_client import AIClient
from src.config import AI_IMAGE_EDIT_MODEL, AI_IMAGE_EDIT_SIZE_MODEL

PRESET_PROMPTS = {
    "remove_background": "Remove the background completely, keep only the main subject on a transparent/white background",
    "remove_text": "Remove all text and watermarks from the image, inpaint the areas cleanly",
    "replace_background": "",  # Uses user_prompt directly
    "enhance": "Enhance the image quality, improve clarity and sharpness while preserving the original content",
    "full_regenerate": "Regenerate this product image with better lighting, composition, and professional quality",
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

        if not AI_IMAGE_EDIT_MODEL:
            raise ValueError("AI_IMAGE_EDIT_MODEL is not configured")

        preset_prompt = PRESET_PROMPTS.get(preset, "")
        if preset in ("replace_background", "custom"):
            prompt = user_prompt if user_prompt else "Edit this image"
        elif preset_prompt and user_prompt:
            prompt = f"{preset_prompt}. Additional: {user_prompt}"
        elif preset_prompt:
            prompt = preset_prompt
        else:
            prompt = user_prompt or "Edit this image"

        ai = AIClient()
        result_url = await ai.fal_edit_image(
            image_url=image_url,
            prompt=prompt,
            model=AI_IMAGE_EDIT_MODEL,
        )

        return {"image_url": result_url}

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

        import base64

        b64 = base64.b64encode(result_bytes).decode()
        return {"image_url": f"data:image/png;base64,{b64}"}
