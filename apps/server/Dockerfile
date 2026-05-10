FROM node:22-slim AS deps

WORKDIR /app

# The runtime image installs system Chromium. Avoid Puppeteer downloading a
# second browser during npm install.
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

RUN apt-get -o Acquire::Retries=3 -o Acquire::http::Timeout=30 update -y \
    && apt-get -o Acquire::Retries=3 -o Acquire::http::Timeout=30 install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*

# Prisma generate runs during npm install; this placeholder is build-only.
ENV DATABASE_URL=postgresql://kiditem:kiditem@localhost:5432/kiditem

COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
COPY apps/server/package.json ./apps/server/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/templates/package.json ./packages/templates/package.json

RUN npm ci \
      --fetch-timeout=600000 \
      --fetch-retries=5 \
      --fetch-retry-mintimeout=20000 \
      --fetch-retry-maxtimeout=120000 \
      --no-audit \
      --no-fund

FROM deps AS builder

COPY packages/shared ./packages/shared
COPY packages/templates ./packages/templates
COPY apps/server ./apps/server

RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=apps/server

FROM node:22-slim AS runner

WORKDIR /app
ARG INSTALL_CHROMIUM=false

RUN apt-get -o Acquire::Retries=3 -o Acquire::http::Timeout=30 update -y \
    && apt-get -o Acquire::Retries=3 -o Acquire::http::Timeout=30 install -y --no-install-recommends \
        ca-certificates \
        openssl \
        $(if [ "$INSTALL_CHROMIUM" = "true" ]; then echo "chromium fonts-liberation fonts-noto-cjk"; fi) \
    && if [ "$INSTALL_CHROMIUM" = "true" ]; then test -x /usr/bin/chromium && /usr/bin/chromium --version; fi \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=4000
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
COPY apps/server/package.json ./apps/server/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/templates/package.json ./packages/templates/package.json

RUN npm ci \
      --omit=dev \
      --ignore-scripts \
      --workspace=apps/server \
      --workspace=packages/shared \
      --include-workspace-root=false \
      --fetch-timeout=600000 \
      --fetch-retries=5 \
      --fetch-retry-mintimeout=20000 \
      --fetch-retry-maxtimeout=120000 \
      --no-audit \
      --no-fund

COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/apps/server/dist ./apps/server/dist

WORKDIR /app/apps/server

EXPOSE 4000

CMD ["node", "dist/main.js"]
