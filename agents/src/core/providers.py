"""Model provider registry.

Add new providers by appending a ``ModelProvider`` to ``_PROVIDERS`` or
calling ``register_provider()`` at runtime.  The rest of the codebase
resolves provider-specific behaviour through ``detect_provider(model)``.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ModelProvider:
    name: str  # internal key: "openai", "gemini"
    label: str  # user-facing: "OpenAI", "Gemini"
    prefixes: tuple[str, ...]  # model-name prefixes for detection
    prompt_key: str  # prompt registry suffix (e.g. "openai", "gemini")
    native_image_edit: bool = False  # True → use native SDK in direct mode
    compat_base_url: str = ""  # OpenAI-compat endpoint for direct mode
    api_key_setting: str = ""  # config attr name for the API key


# ---- built-in providers ----------------------------------------------------

OPENAI = ModelProvider(
    name="openai",
    label="OpenAI",
    prefixes=("gpt-", "o1-", "o3-", "o4-", "chatgpt-"),
    prompt_key="openai",
    api_key_setting="OPENAI_API_KEY",
)

GEMINI = ModelProvider(
    name="gemini",
    label="Gemini",
    prefixes=("gemini-",),
    prompt_key="gemini",
    native_image_edit=True,
    compat_base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
    api_key_setting="GEMINI_API_KEY",
)

_PROVIDERS: list[ModelProvider] = [OPENAI, GEMINI]
_DEFAULT = OPENAI


# ---- public API -------------------------------------------------------------


def detect_provider(model: str) -> ModelProvider:
    """Return the provider whose prefix matches *model*, or the default."""
    lower = model.lower()
    for provider in _PROVIDERS:
        if any(lower.startswith(p) for p in provider.prefixes):
            return provider
    return _DEFAULT


def register_provider(provider: ModelProvider) -> None:
    """Register a new provider."""
    _PROVIDERS.append(provider)
