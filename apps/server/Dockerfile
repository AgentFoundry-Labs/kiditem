ARG NODE_IMAGE=node:22-slim
ARG API_RUNTIME_BASE_IMAGE=ghcr.io/agentfoundry-labs/kiditem-api-base:node22-chromium-b6503cb2512e

FROM ${NODE_IMAGE} AS deps

WORKDIR /app

# The runtime base image owns system Chromium. Avoid Puppeteer downloading a
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
RUN npm run build --workspace=packages/templates
RUN npm run build --workspace=apps/server

FROM ${API_RUNTIME_BASE_IMAGE} AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PYTHON_BIN=/opt/kiditem-python/bin/python

RUN test -x "$PUPPETEER_EXECUTABLE_PATH" && "$PUPPETEER_EXECUTABLE_PATH" --version

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
      --workspace=packages/templates \
      --include-workspace-root=false \
      --fetch-timeout=600000 \
      --fetch-retries=5 \
      --fetch-retry-mintimeout=20000 \
      --fetch-retry-maxtimeout=120000 \
      --no-audit \
      --no-fund \
    && npm cache clean --force \
    && rm -rf /root/.npm

COPY apps/server/src/orders/coupang-directship/requirements.txt ./apps/server/coupang-directship-requirements.txt

RUN apt-get -o Acquire::Retries=3 -o Acquire::http::Timeout=30 update -y \
    && apt-get -o Acquire::Retries=3 -o Acquire::http::Timeout=30 install -y --no-install-recommends \
        python3 \
        python3-venv \
    && python3 -m venv /opt/kiditem-python \
    && "$PYTHON_BIN" -m pip install --no-cache-dir --upgrade pip \
    && "$PYTHON_BIN" -m pip install --no-cache-dir -r ./apps/server/coupang-directship-requirements.txt \
    && "$PYTHON_BIN" -c "import xlrd, xlutils, xlwt" \
    && rm -rf /var/lib/apt/lists/*

# npm workspaces can hoist runtime packages to /app/node_modules while leaving
# peers/transitives under the server workspace. Fail the image build if the
# production resolver cannot load representative server runtime dependencies.
ENV NODE_PATH=/app/apps/server/node_modules:/app/node_modules
RUN node -e "require('@nestjs/common'); require('rxjs/operators'); require('@ag-ui/mcp-apps-middleware'); require('@copilotkit/runtime')"

COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/templates/dist ./packages/templates/dist
COPY --from=builder /app/apps/server/dist ./apps/server/dist

RUN node -e "const fs=require('fs'); const css=fs.readFileSync(require.resolve('@kiditem/templates/styles.css'),'utf8'); if(!/tailwindcss\\s+v\\d/i.test(css)) process.exit(1)"

RUN tmpdir="$(mktemp -d)" \
    && printf '{"pos":[],"centers":{}}' > "$tmpdir/input.json" \
    && "$PYTHON_BIN" \
        ./apps/server/dist/orders/coupang-directship/generate.py \
        ./apps/server/dist/orders/coupang-directship/template.xls \
        "$tmpdir/input.json" \
        "$tmpdir/output.xls" \
        SHIPMENT \
    && test -s "$tmpdir/output.xls" \
    && rm -rf "$tmpdir"

RUN node -e "require('./apps/server/dist/app.module.js')"

WORKDIR /app/apps/server

EXPOSE 4000

CMD ["node", "dist/main.js"]
