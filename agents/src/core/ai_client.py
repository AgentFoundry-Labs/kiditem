"""AI text/vision client with structured output and self-healing.

Two modes controlled by ``AI_MODE``:
- **proxy**: all calls route through VectorEngine proxy.
- **direct**: route by provider (OpenAI or Gemini compat endpoint).
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import random
import re
from typing import TypeVar

import fal_client
import httpx
from langfuse import get_client, observe
from openai import AsyncOpenAI
from pydantic import BaseModel, ValidationError

from src import config as cfg
from src.core.ai_cost import _calc_text_cost, _extract_proxy_usage, _report_image_usage
from src.core.providers import ModelProvider, detect_provider

logger = logging.getLogger(__name__)
_lf = get_client()

T = TypeVar("T", bound=BaseModel)

_DATA_URL_RE = re.compile(r"data:image/[^;]+;base64,([A-Za-z0-9+/=\s]+)")

_DOWNLOAD_SEMAPHORE = asyncio.Semaphore(10)
_DOWNLOAD_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Referer": "https://detail.1688.com/",
}


async def _download_one(client: httpx.AsyncClient, url: str) -> str:
    async with _DOWNLOAD_SEMAPHORE:
        resp = await client.get(url, headers=_DOWNLOAD_HEADERS)
        resp.raise_for_status()
    mime = resp.headers.get("content-type", "image/jpeg").split(";")[0].strip()
    b64 = base64.b64encode(resp.content).decode()
    return f"data:{mime};base64,{b64}"


async def _download_images_as_base64(urls: list[str]) -> list[str]:
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        tasks = [_download_one(client, url) for url in urls]
        return list(await asyncio.gather(*tasks))


_IMAGE_SEMAPHORE = asyncio.Semaphore(1)


class AIClient:
    _SERVICE_MODEL_SETTINGS = ("AI_TEXT_MODEL", "AI_IMAGE_ANALYSIS_MODEL")
    _VALID_MODES = ("proxy", "direct")

    def __init__(self) -> None:
        mode = cfg.AI_MODE.strip().lower()
        if mode not in self._VALID_MODES:
            raise ValueError(f"AI_MODE must be one of {self._VALID_MODES}, got {cfg.AI_MODE!r}")
        self._proxy_mode = mode == "proxy"

        _timeout = 300.0

        if self._proxy_mode:
            if not cfg.VECTORENGINE_API_KEY:
                raise ValueError("VECTORENGINE_API_KEY is required for proxy mode")
            if not cfg.AI_BASE_URL:
                raise ValueError("AI_BASE_URL is required for proxy mode")
            self._client = AsyncOpenAI(
                api_key=cfg.VECTORENGINE_API_KEY,
                base_url=cfg.AI_BASE_URL,
                timeout=_timeout,
            )
        else:
            provider = self._detect_text_provider()
            provider_key = (
                getattr(cfg, provider.api_key_setting, "") if provider.api_key_setting else ""
            )
            if not provider_key:
                raise ValueError(
                    f"{provider.api_key_setting} is required for {provider.label} models"
                )
            if provider.compat_base_url:
                self._client = AsyncOpenAI(
                    api_key=provider_key,
                    base_url=provider.compat_base_url,
                    timeout=_timeout,
                )
            else:
                self._client = AsyncOpenAI(api_key=provider_key, timeout=_timeout)

    @classmethod
    def _detect_text_provider(cls) -> ModelProvider:
        for attr in cls._SERVICE_MODEL_SETTINGS:
            model = getattr(cfg, attr, "")
            if model:
                return detect_provider(model)
        raise ValueError("At least one AI service model must be configured")

    @observe(name="llm-generate", as_type="generation", capture_input=False)
    async def generate(
        self,
        prompt: str,
        system_prompt: str = "",
        model: str = "",
        response_format: dict[str, str] | None = None,
        *,
        image_urls: list[str] | None = None,
    ) -> str:
        if not model:
            raise ValueError("model parameter is required for generate()")
        messages: list[dict[str, object]] = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})

        if image_urls:
            user_content: list[dict[str, object]] = [{"type": "text", "text": prompt}]
            for url in image_urls:
                user_content.append(
                    {"type": "image_url", "image_url": {"url": url, "detail": "high"}}
                )
            messages.append({"role": "user", "content": user_content})
        else:
            messages.append({"role": "user", "content": prompt})

        kwargs: dict[str, object] = {"model": model, "messages": messages}
        if response_format is not None:
            kwargs["response_format"] = response_format

        logger.debug("AIClient.generate model=%s", model)
        response = await self._client.chat.completions.create(**kwargs)  # type: ignore[arg-type]
        content = response.choices[0].message.content
        usage = response.usage

        usage_details = {}
        if usage:
            cost = _calc_text_cost(usage, model)
            logger.debug(
                "Usage: in=%d out=%d cost=%s",
                usage.prompt_tokens,
                usage.completion_tokens,
                cost,
            )
            usage_details = {
                "input_tokens": usage.prompt_tokens,
                "output_tokens": usage.completion_tokens,
            }
            _lf.update_current_generation(
                model=model,
                input=prompt[:1000],
                output=(content or "")[:1000],
                usage_details=usage_details,
                metadata={"cost_usd": f"{cost['total']:.6f}" if cost else "0"},
            )

        if content is None:
            return ""
        return content.strip()

    async def generate_structured(
        self,
        prompt: str,
        response_model: type[T],
        system_prompt: str = "",
        model: str = "",
        *,
        image_urls: list[str] | None = None,
    ) -> T:
        schema = json.dumps(response_model.model_json_schema(), ensure_ascii=False, indent=2)
        full_system = (
            f"{system_prompt}\n\n반드시 아래 JSON 스키마에 맞는 JSON 객체로만 응답하세요:\n{schema}"
        ).strip()

        raw = await self.generate(
            prompt=prompt,
            system_prompt=full_system,
            model=model,
            response_format={"type": "json_object"},
            image_urls=image_urls,
        )

        try:
            data = json.loads(raw)
        except json.JSONDecodeError as e:
            raise ValidationError.from_exception_data(
                title=response_model.__name__,
                line_errors=[],
            ) from e

        return response_model.model_validate(data)

    @observe(name="llm-generate-with-healing", capture_input=False)
    async def generate_with_healing(
        self,
        prompt: str,
        response_model: type[T],
        max_retries: int = 3,
        model: str = "",
        *,
        image_urls: list[str] | None = None,
    ) -> T:
        current_prompt = prompt
        last_error: Exception | None = None

        for attempt in range(max_retries):
            try:
                return await self.generate_structured(
                    prompt=current_prompt,
                    response_model=response_model,
                    model=model,
                    image_urls=image_urls,
                )
            except (ValidationError, ValueError, json.JSONDecodeError) as e:
                last_error = e
                logger.warning(
                    "generate_with_healing attempt %d/%d failed: %s",
                    attempt + 1,
                    max_retries,
                    e,
                )
                current_prompt = (
                    f"{current_prompt}\n\n"
                    f"[이전 시도에서 다음 오류 발생: {e}]\n"
                    f"위 오류를 수정하여 올바른 JSON으로 다시 응답하세요."
                )
                if attempt < max_retries - 1:
                    await asyncio.sleep(2**attempt)

        raise ValueError(f"All {max_retries} retry attempts exhausted. Last error: {last_error}")

    # ── Proxy Gemini request (image gen/edit) ───────────────────────────────

    _PROXY_RETRY_MAX = 3
    _PROXY_RETRY_BASE = 10.0

    async def _proxy_gemini_request(
        self,
        *,
        parts: list[dict[str, object]],
        model: str,
        response_modalities: list[str] | None = None,
        image_config: dict[str, str] | None = None,
    ) -> dict:
        body: dict[str, object] = {"contents": [{"role": "user", "parts": parts}]}
        gen_config: dict[str, object] = {}
        if response_modalities:
            gen_config["responseModalities"] = response_modalities
        if image_config:
            gen_config["imageConfig"] = image_config
        if gen_config:
            body["generationConfig"] = gen_config

        base = cfg.AI_BASE_URL.rstrip("/")
        if base.endswith("/v1"):
            base = base[:-3]
        url = f"{base}/v1beta/models/{model}:generateContent"
        headers = {
            "Authorization": f"Bearer {cfg.VECTORENGINE_API_KEY}",
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=300.0) as client:
            for attempt in range(self._PROXY_RETRY_MAX + 1):
                resp = await client.post(url, json=body, headers=headers)

                if resp.status_code != 429:
                    resp.raise_for_status()
                    return resp.json()

                if "PerDay" in resp.text:
                    logger.warning("proxy_gemini_daily_quota_exhausted model=%s", model)
                    resp.raise_for_status()

                if attempt >= self._PROXY_RETRY_MAX:
                    resp.raise_for_status()

                delay = min(self._PROXY_RETRY_BASE * (2**attempt) + random.uniform(0, 1), 60.0)
                logger.warning(
                    "proxy rate limited: model=%s attempt=%d/%d retry_after=%.1f",
                    model,
                    attempt + 1,
                    self._PROXY_RETRY_MAX,
                    delay,
                )
                await asyncio.sleep(delay)

        raise AssertionError("retry loop exited unexpectedly")

    @staticmethod
    def _extract_gemini_image(data: dict) -> bytes:
        for candidate in data.get("candidates", []):
            content = candidate.get("content")
            if not content:
                continue
            for part in content.get("parts", []):
                inline_data = part.get("inlineData") or part.get("inline_data") or {}
                raw = inline_data.get("data")
                if raw:
                    return base64.b64decode(raw)
        raise ValueError("Gemini response contained no image data")

    async def generate_image(self, prompt: str, model: str = "") -> bytes:
        if not model:
            raise ValueError("model parameter is required for generate_image()")
        if not self._proxy_mode:
            raise ValueError("generate_image requires proxy mode")

        parts: list[dict[str, object]] = [{"text": prompt}]
        async with _IMAGE_SEMAPHORE:
            data = await self._proxy_gemini_request(
                parts=parts, model=model, response_modalities=["IMAGE", "TEXT"]
            )
            result = self._extract_gemini_image(data)
            _report_image_usage(_extract_proxy_usage(data), model, f"<image {len(result)} bytes>")
            return result

    async def edit_image(
        self,
        image_bytes: bytes,
        prompt: str,
        model: str = "",
        mime_type: str = "image/jpeg",
    ) -> bytes:
        if not model:
            raise ValueError("model parameter is required for edit_image()")
        if not self._proxy_mode:
            raise ValueError("edit_image requires proxy mode in kiditem")

        b64_data = base64.b64encode(image_bytes).decode()
        parts: list[dict[str, object]] = [
            {"inlineData": {"mimeType": mime_type, "data": b64_data}},
            {"text": prompt},
        ]
        async with _IMAGE_SEMAPHORE:
            data = await self._proxy_gemini_request(
                parts=parts, model=model, response_modalities=["IMAGE", "TEXT"]
            )
            usage = _extract_proxy_usage(data)
            try:
                result = self._extract_gemini_image(data)
                _report_image_usage(usage, model, f"<edited image {len(result)} bytes>")
            except Exception:
                _report_image_usage(usage, model, "<edited image FAILED>")
                raise
            return result

    @observe(name="llm-analyze-images", as_type="generation", capture_input=False)
    async def analyze_images_batch(
        self,
        image_urls: list[str],
        prompt: str,
        model: str = "",
    ) -> str:
        if not model:
            raise ValueError("model parameter is required for analyze_images_batch()")

        downloaded = await _download_images_as_base64(image_urls)
        content: list[dict[str, object]] = [{"type": "text", "text": prompt}]
        for data_uri in downloaded:
            content.append({"type": "image_url", "image_url": {"url": data_uri, "detail": "high"}})
        messages: list[dict[str, object]] = [{"role": "user", "content": content}]

        response = await self._client.chat.completions.create(
            model=model,
            messages=messages,  # type: ignore[arg-type]
            response_format={"type": "json_object"},
        )
        result = response.choices[0].message.content
        usage = response.usage
        if usage:
            _lf.update_current_generation(
                model=model,
                input=prompt[:500],
                output=(result or "")[:500],
                usage_details={
                    "input_tokens": usage.prompt_tokens,
                    "output_tokens": usage.completion_tokens,
                },
            )
        return result.strip() if result else "{}"

    @observe(name="fal-edit-image", capture_input=False)
    async def fal_edit_image(
        self,
        image_url: str,
        prompt: str,
        model: str = "",
        image_size: dict[str, int] | None = None,
    ) -> str:
        """Submit image to FAL.AI for editing; return URL of result image."""
        if not model:
            raise ValueError("model parameter is required for fal_edit_image()")
        uses_plural = "flux-2" in model
        img_key = "image_urls" if uses_plural else "image_url"
        img_val: object = [image_url] if uses_plural else image_url
        arguments: dict[str, object] = {
            img_key: img_val,
            "prompt": prompt,
        }
        if image_size:
            arguments["image_size"] = image_size

        result = await fal_client.run_async(model, arguments=arguments)
        images = result.get("images") or []
        if not images:
            raise ValueError(f"FAL.AI returned no images for model {model}")
        _lf.update_current_span(
            metadata={"model": model, "image_size": str(image_size or "default")},
            output={"url": images[0]["url"]},
        )
        return images[0]["url"]

    @observe(name="fal-edit-image-batch", capture_input=False)
    async def fal_edit_image_batch(
        self,
        image_url: str,
        prompt: str,
        model: str = "",
        num_images: int = 3,
        guidance_scale: float = 3.5,
    ) -> list[str]:
        if not model:
            raise ValueError("model parameter is required for fal_edit_image_batch()")
        uses_plural = "flux-2" in model
        img_key = "image_urls" if uses_plural else "image_url"
        img_val: object = [image_url] if uses_plural else image_url
        arguments: dict[str, object] = {
            img_key: img_val,
            "prompt": prompt,
            "num_images": num_images,
            "guidance_scale": guidance_scale,
        }
        result = await fal_client.run_async(model, arguments=arguments)
        images = result.get("images") or []
        if not images:
            raise ValueError(f"FAL.AI returned no images for model {model}")
        urls = [img["url"] for img in images]
        _lf.update_current_span(
            metadata={"model": model, "num_images": str(num_images)},
            output={"urls": urls},
        )
        return urls

    @observe(name="gemini-edit-images-multi", capture_input=False)
    async def edit_images_multi(
        self,
        image_urls: list[str] | None = None,
        prompt: str = "",
        model: str = "",
        image_bytes_list: list[tuple[bytes, str]] | None = None,
    ) -> bytes:
        """Multi-image edit via Gemini proxy. Returns bytes of generated composite image."""
        if not model:
            raise ValueError("model parameter is required for edit_images_multi()")
        if not self._proxy_mode:
            raise ValueError("edit_images_multi requires proxy mode")
        if not image_urls and not image_bytes_list:
            raise ValueError("At least one image source is required")

        parts: list[dict[str, object]] = []

        if image_bytes_list:
            import base64

            for img_bytes, mime in image_bytes_list:
                b64_data = base64.b64encode(img_bytes).decode()
                parts.append({"inlineData": {"mimeType": mime, "data": b64_data}})

        if image_urls:
            downloaded = await _download_images_as_base64(image_urls)
        else:
            downloaded = []

        for data_uri in downloaded:
            match = _DATA_URL_RE.match(data_uri)
            if match:
                mime = data_uri.split(";")[0].split(":")[1]
                b64_data = match.group(1).replace("\n", "").replace(" ", "")
                parts.append({"inlineData": {"mimeType": mime, "data": b64_data}})
            else:
                raw_b64 = data_uri.split(",", 1)[-1] if "," in data_uri else data_uri
                parts.append({"inlineData": {"mimeType": "image/jpeg", "data": raw_b64}})
        parts.append({"text": prompt})

        async with _IMAGE_SEMAPHORE:
            data = await self._proxy_gemini_request(
                parts=parts,
                model=model,
                response_modalities=["IMAGE", "TEXT"],
            )
            result = self._extract_gemini_image(data)
            usage = _extract_proxy_usage(data)
            _report_image_usage(usage, model, f"<multi-edit {len(result)} bytes>")
            if usage:
                _lf.update_current_span(
                    metadata={
                        "model": model,
                        "input_images": str(len(image_urls)),
                        "output_bytes": str(len(result)),
                    },
                )
            return result
