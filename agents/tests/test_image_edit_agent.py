from __future__ import annotations

import base64
import io
import sys
import types
from unittest.mock import AsyncMock, MagicMock, patch

from PIL import Image

try:
    import fal_client  # noqa: F401
except ModuleNotFoundError:
    sys.modules["fal_client"] = types.SimpleNamespace(run_async=None)

try:
    from langfuse import get_client, observe  # noqa: F401
except (ImportError, ModuleNotFoundError):
    class _LangfuseClient:
        def update_current_generation(self, *args, **kwargs):
            return None

    def _observe(*args, **kwargs):
        def decorator(func):
            return func
        return decorator

    sys.modules["langfuse"] = types.SimpleNamespace(
        get_client=lambda: _LangfuseClient(),
        observe=_observe,
    )

from src.agents.image_edit.agent import ImageEditAgent


def data_url(color: tuple[int, int, int] = (255, 192, 203)) -> str:
    image = Image.new("RGB", (8, 8), color)
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    encoded = base64.b64encode(buf.getvalue()).decode()
    return f"data:image/png;base64,{encoded}"


class TestImageEditAgent:
    async def test_custom_edit_uses_byte_edit_for_data_urls(self):
        agent = ImageEditAgent()
        edited = Image.new("RGB", (4, 4), (0, 255, 0))
        edited_buf = io.BytesIO()
        edited.save(edited_buf, format="PNG")

        mock_ai = MagicMock()
        mock_ai.edit_image = AsyncMock(return_value=edited_buf.getvalue())
        mock_ai.fal_edit_image = AsyncMock()

        with patch("src.agents.image_edit.agent.AI_IMAGE_MODEL", "gemini-image-test"), \
             patch("src.agents.image_edit.agent.AIClient", return_value=mock_ai):
            result = await agent.execute(
                None,
                {
                    "image_url": data_url(),
                    "preset": "custom",
                    "user_prompt": "광고성 있는 히어로 액션 이미지로 만들어줘",
                },
            )

        assert result["image_url"].startswith("data:image/png;base64,")
        mock_ai.edit_image.assert_awaited_once()
        mock_ai.fal_edit_image.assert_not_called()
        prompt = mock_ai.edit_image.await_args.kwargs["prompt"]
        assert "product-preservation editing" in prompt
        assert "광고성 있는 히어로 액션 이미지로 만들어줘" in prompt

    async def test_remove_background_stays_local_without_model_call(self):
        agent = ImageEditAgent()

        mock_ai = MagicMock()
        mock_ai.edit_image = AsyncMock()
        mock_ai.fal_edit_image = AsyncMock()

        with patch("src.agents.image_edit.agent.AIClient", return_value=mock_ai), \
             patch("src.agents.image_edit.agent.remove", return_value=base64.b64decode(data_url().split(",", 1)[1])):
            result = await agent.execute(
                None,
                {"image_url": data_url(), "preset": "remove_background"},
            )

        assert result["image_url"].startswith("data:image/png;base64,")
        mock_ai.edit_image.assert_not_called()
        mock_ai.fal_edit_image.assert_not_called()
