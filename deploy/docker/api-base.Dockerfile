FROM node:22-slim

LABEL org.opencontainers.image.title="KidItem API Runtime Base"
LABEL org.opencontainers.image.description="Node runtime with system Chromium for server-side detail page rasterization"

ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

RUN apt-get -o Acquire::Retries=3 -o Acquire::http::Timeout=30 update -y \
    && apt-get -o Acquire::Retries=3 -o Acquire::http::Timeout=30 install -y --no-install-recommends \
        ca-certificates \
        chromium \
        fontconfig \
        fonts-liberation \
        fonts-noto-cjk \
        openssl \
    && test -x "$PUPPETEER_EXECUTABLE_PATH" \
    && "$PUPPETEER_EXECUTABLE_PATH" --version \
    && rm -rf /var/lib/apt/lists/*
