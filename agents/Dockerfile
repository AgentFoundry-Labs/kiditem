FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 libsm6 libxrender1 libxext6 libgl1 \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir uv

COPY pyproject.toml .
RUN uv pip install --system --no-cache -p 3.11 \
    asyncpg python-dotenv httpx openai pydantic websockets \
    rebrowser-playwright fal-client structlog numpy Pillow \
    "langfuse>=4.0.0" \
    "paddlepaddle>=3.0.0,<3.3.0" "paddleocr>=2.9.0,<3.0"

RUN python -c "from paddleocr import PaddleOCR; PaddleOCR(lang='ch', use_angle_cls=True, show_log=False)" 2>/dev/null || true

RUN apt-get update && apt-get install -y --no-install-recommends \
    fonts-unifont libnss3 libnspr4 libatk1.0-0 \
    libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 \
    libxdamage1 libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2 libxfixes3 \
    && rm -rf /var/lib/apt/lists/* \
    && python -m rebrowser_playwright install chromium

COPY src/ src/

CMD ["python", "-m", "src.runner"]
