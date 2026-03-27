import os

from dotenv import load_dotenv

load_dotenv()

# ── DB & Runner ─────────────────────────────────────────────────────────────
DATABASE_URL = os.environ["DATABASE_URL"]
POLL_INTERVAL_SECONDS = int(os.getenv("POLL_INTERVAL_SECONDS", "5"))

# ── AI ──────────────────────────────────────────────────────────────────────
AI_MODE = os.getenv("AI_MODE", "proxy")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
VECTORENGINE_API_KEY = os.getenv("VECTORENGINE_API_KEY", "")
AI_BASE_URL = os.getenv("AI_BASE_URL", "")

AI_TEXT_MODEL = os.getenv("AI_TEXT_MODEL", "")
AI_IMAGE_MODEL = os.getenv("AI_IMAGE_MODEL", "")
AI_IMAGE_ANALYSIS_MODEL = os.getenv("AI_IMAGE_ANALYSIS_MODEL", "")
AI_IMAGE_EDIT_MODEL = os.getenv("AI_IMAGE_EDIT_MODEL", "")
AI_IMAGE_DETAIL_MODEL = os.getenv("AI_IMAGE_DETAIL_MODEL", "")
AI_IMAGE_EDIT_SIZE_MODEL = os.getenv("AI_IMAGE_EDIT_SIZE_MODEL", "")
FAL_KEY = os.getenv("FAL_KEY", "")
DETAIL_PAGE_TEMPLATE = os.getenv("DETAIL_PAGE_TEMPLATE", "bold_vertical")

# ── 1688 matching (TMAPI) ──────────────────────────────────────────────────
TMAPI_TOKEN = os.getenv("TMAPI_TOKEN", "")
TMAPI_BASE_URL = os.getenv("TMAPI_BASE_URL", "https://api.tmapi.top")

# ── Douyin live monitoring ──────────────────────────────────────────────────
DOUYIN_WS_URL = os.getenv(
    "DOUYIN_WS_URL", "wss://webcast5-ws-web-lf.douyin.com/webcast/im/push/v2/"
)
DOUYIN_HEARTBEAT_INTERVAL = int(os.getenv("DOUYIN_HEARTBEAT_INTERVAL", "5"))
DOUYIN_RECONNECT_DELAY = float(os.getenv("DOUYIN_RECONNECT_DELAY", "3.0"))
DOUYIN_MAX_ROOMS = int(os.getenv("DOUYIN_MAX_ROOMS", "100"))

# ── Langfuse ────────────────────────────────────────────────────────────────
# SDK v4 reads LANGFUSE_BASE_URL; map legacy LANGFUSE_HOST if present.
_langfuse_host = os.getenv("LANGFUSE_HOST", "")
if _langfuse_host and not os.getenv("LANGFUSE_BASE_URL"):
    os.environ["LANGFUSE_BASE_URL"] = _langfuse_host

LANGFUSE_ENABLED = bool(os.getenv("LANGFUSE_PUBLIC_KEY") and os.getenv("LANGFUSE_SECRET_KEY"))

# ── Logging ─────────────────────────────────────────────────────────────────
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
