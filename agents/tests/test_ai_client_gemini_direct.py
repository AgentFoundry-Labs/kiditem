from __future__ import annotations

import base64
import sys
import types

import pytest

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

        def update_current_span(self, *args, **kwargs):
            return None

    def _observe(*args, **kwargs):
        def decorator(func):
            return func
        return decorator

    sys.modules["langfuse"] = types.SimpleNamespace(
        get_client=lambda: _LangfuseClient(),
        observe=_observe,
    )

from src.core import ai_client


class FakeGeminiResponse:
    status_code = 200
    text = ""

    def raise_for_status(self):
        return None

    def json(self):
        return {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {
                                "inlineData": {
                                    "mimeType": "image/png",
                                    "data": base64.b64encode(b"edited").decode(),
                                }
                            }
                        ]
                    }
                }
            ]
        }


class FakeAsyncClient:
    calls: list[dict] = []

    def __init__(self, *args, **kwargs):
        return None

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return None

    async def post(self, url, *, json, headers):
        self.calls.append({"url": url, "json": json, "headers": headers})
        return FakeGeminiResponse()


@pytest.mark.asyncio
async def test_direct_gemini_edit_image_uses_gemini_rest(monkeypatch):
    FakeAsyncClient.calls = []
    monkeypatch.setattr(ai_client.cfg, "AI_MODE", "direct")
    monkeypatch.setattr(ai_client.cfg, "GEMINI_API_KEY", "test-gemini-key")
    monkeypatch.setattr(ai_client.cfg, "AI_TEXT_MODEL", "gemini-2.5-flash")
    monkeypatch.setattr(ai_client.cfg, "AI_IMAGE_ANALYSIS_MODEL", "gemini-2.5-flash")
    monkeypatch.setattr(ai_client, "AsyncOpenAI", lambda *args, **kwargs: object())
    monkeypatch.setattr(ai_client.httpx, "AsyncClient", FakeAsyncClient)

    client = ai_client.AIClient()
    result = await client.edit_image(
        image_bytes=b"input",
        prompt="remove the yellow product",
        model="gemini-3.1-flash-image-preview",
        mime_type="image/png",
    )

    assert result == b"edited"
    assert len(FakeAsyncClient.calls) == 1
    call = FakeAsyncClient.calls[0]
    assert call["url"] == (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        "gemini-3.1-flash-image-preview:generateContent"
    )
    assert call["headers"]["x-goog-api-key"] == "test-gemini-key"
    assert call["json"]["generationConfig"]["responseModalities"] == ["IMAGE", "TEXT"]
    assert call["json"]["contents"][0]["parts"][0]["inlineData"] == {
        "mimeType": "image/png",
        "data": base64.b64encode(b"input").decode(),
    }
