"""AI cost calculation helpers (standalone, no Langfuse dependency)."""

from __future__ import annotations

import logging
from types import SimpleNamespace

logger = logging.getLogger(__name__)

_TEXT_MODEL_PRICING: dict[str, dict[str, float]] = {
    "gemini-2.5-flash": {"input": 0.15 / 1_000_000, "output": 0.60 / 1_000_000},
    "gemini-3-pro": {"input": 1.25 / 1_000_000, "output": 10.00 / 1_000_000},
    "gemini-3.1-pro-preview": {"input": 1.25 / 1_000_000, "output": 10.00 / 1_000_000},
    "gemini-3.1-flash": {"input": 0.15 / 1_000_000, "output": 0.60 / 1_000_000},
    "gemini-3.1-flash-image-preview": {"input": 0.15 / 1_000_000, "output": 3.50 / 1_000_000},
    "gemini-3-flash-preview": {"input": 0.50 / 1_000_000, "output": 3.00 / 1_000_000},
}

_IMAGE_MODEL_PRICING: dict[str, dict[str, float]] = {
    "gpt-image-1.5": {
        "text_input": 5.00 / 1_000_000,
        "text_output": 10.00 / 1_000_000,
        "image_input": 8.00 / 1_000_000,
        "image_output": 32.00 / 1_000_000,
    },
    "gemini-3.1-flash-image-preview": {
        "text_input": 0.15 / 1_000_000,
        "text_output": 3.50 / 1_000_000,
        "image_input": 0.15 / 1_000_000,
        "image_output": 60.00 / 1_000_000,
    },
}


def _match_pricing(table: dict[str, dict[str, float]], model: str) -> dict[str, float] | None:
    for key in sorted(table, key=len, reverse=True):
        if model.startswith(key):
            return table[key]
    return None


def _calc_text_cost(usage: object | None, model: str) -> dict[str, float] | None:
    if usage is None:
        return None
    pricing = _match_pricing(_TEXT_MODEL_PRICING, model)
    if pricing is None:
        return None
    input_tokens = getattr(usage, "prompt_tokens", 0) or getattr(usage, "input_tokens", 0)
    output_tokens = getattr(usage, "completion_tokens", 0) or getattr(usage, "output_tokens", 0)
    input_cost = input_tokens * pricing["input"]
    output_cost = output_tokens * pricing["output"]
    return {"input": input_cost, "output": output_cost, "total": input_cost + output_cost}


def _calc_image_cost(usage: object | None, model: str) -> dict[str, float] | None:
    if usage is None:
        return None
    pricing = _match_pricing(_IMAGE_MODEL_PRICING, model)
    if pricing is None:
        return None

    input_details = getattr(usage, "input_tokens_details", None)
    output_details = getattr(usage, "output_tokens_details", None)

    if input_details:
        input_cost = (
            getattr(input_details, "text_tokens", 0) * pricing["text_input"]
            + getattr(input_details, "image_tokens", 0) * pricing["image_input"]
        )
    else:
        input_cost = getattr(usage, "input_tokens", 0) * pricing["image_input"]

    if output_details:
        output_cost = (
            getattr(output_details, "text_tokens", 0) * pricing["text_output"]
            + getattr(output_details, "image_tokens", 0) * pricing["image_output"]
        )
    else:
        output_cost = getattr(usage, "output_tokens", 0) * pricing["image_output"]

    return {"input": input_cost, "output": output_cost, "total": input_cost + output_cost}


def _extract_proxy_usage(data: dict) -> SimpleNamespace | None:
    meta = data.get("usageMetadata")
    if not meta:
        return None
    return SimpleNamespace(
        input_tokens=meta.get("promptTokenCount", 0),
        output_tokens=meta.get("candidatesTokenCount", 0),
        total_tokens=meta.get("totalTokenCount", 0),
    )


def _extract_native_gemini_usage(response: object) -> SimpleNamespace | None:
    meta = getattr(response, "usage_metadata", None)
    if not meta:
        return None
    return SimpleNamespace(
        input_tokens=getattr(meta, "prompt_token_count", 0),
        output_tokens=getattr(meta, "candidates_token_count", 0),
        total_tokens=getattr(meta, "total_token_count", 0),
    )


def _report_image_usage(usage: object | None, model: str, output_text: str) -> None:
    if usage is None:
        return
    cost = _calc_image_cost(usage, model)
    total_cost = cost["total"] if cost else 0.0
    logger.info(
        "Image usage: model=%s input=%d output=%d cost=$%.6f %s",
        model,
        getattr(usage, "input_tokens", 0),
        getattr(usage, "output_tokens", 0),
        total_cost,
        output_text,
    )
