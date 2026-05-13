import os
from pathlib import Path

from dotenv import load_dotenv

# Load agent-local env first; root .env is only a fallback for shared local
# tooling values such as DATABASE_URL.
_agents_env = Path(__file__).resolve().parent.parent / '.env'
_root_env = Path(__file__).resolve().parent.parent.parent / '.env'
load_dotenv(_agents_env)
load_dotenv(_root_env)

# ── DB ──────────────────────────────────────────────────────────────────────
DATABASE_URL = os.environ["DATABASE_URL"]

# ── AI ──────────────────────────────────────────────────────────────────────
AI_MODE = os.getenv("AI_MODE", "proxy")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
VECTORENGINE_API_KEY = os.getenv("VECTORENGINE_API_KEY", "")
AI_BASE_URL = os.getenv("AI_BASE_URL", "")

AI_TEXT_MODEL = os.getenv("AI_TEXT_MODEL", "")
AI_IMAGE_ANALYSIS_MODEL = os.getenv("AI_IMAGE_ANALYSIS_MODEL", "")
DETAIL_PAGE_TEMPLATE = os.getenv("DETAIL_PAGE_TEMPLATE", "bold_vertical")

# ── 1688 matching (TMAPI) ──────────────────────────────────────────────────
TMAPI_TOKEN = os.getenv("TMAPI_TOKEN", "")
TMAPI_BASE_URL = os.getenv("TMAPI_BASE_URL", "https://api.tmapi.top")

# ── Langfuse ────────────────────────────────────────────────────────────────
# SDK v4 reads LANGFUSE_BASE_URL; map legacy LANGFUSE_HOST if present.
_langfuse_host = os.getenv("LANGFUSE_HOST", "")
if _langfuse_host and not os.getenv("LANGFUSE_BASE_URL"):
    os.environ["LANGFUSE_BASE_URL"] = _langfuse_host

LANGFUSE_ENABLED = bool(os.getenv("LANGFUSE_PUBLIC_KEY") and os.getenv("LANGFUSE_SECRET_KEY"))

# ── Logging ─────────────────────────────────────────────────────────────────
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
