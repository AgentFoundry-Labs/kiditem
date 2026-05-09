# Commands & Environment

## Quick Start

```bash
git clone https://github.com/AgentFoundry-Labs/kiditem.git
cd kiditem
npm install

# Environment variables
cp apps/server/.env.example apps/server/.env   # NestJS — DB, Coupang, Gemini keys
cp agents/.env.example agents/.env             # Python agents — AI model keys (OpenAI, Gemini, fal, Langfuse)

# Python venv (required for agents)
cd agents && python -m venv .venv && .venv/bin/pip install -r requirements.txt && cd ..

# DB + schema
docker compose up -d                           # PostgreSQL only (Docker)
npm run db:push                                # Apply schema
npm run db:3layer-setup                        # Reapply partial indexes / CHECK / RLS policies

# Run all at once
npm run dev:all                                # Next.js + NestJS + Python Agents (concurrently)
```

### Detail Page Generation Test

1. Set AI keys in `agents/.env`: `OPENAI_API_KEY`, `GEMINI_API_KEY`, `FAL_KEY`
2. `npm run dev:all`
3. `localhost:3000/sourcing` → select product → editor → AI generate button

## Commands

```bash
docker compose up -d                 # PostgreSQL (Docker)
npm run dev:all                      # Next.js + NestJS + Python Agents (all at once)
npm run dev                          # Next.js frontend only (localhost:3000)
npm run dev:server                   # NestJS backend only (localhost:4000)
npm run dev:agents                   # Python Agents only
npm run db:push                      # Apply schema
npm run db:3layer-setup              # Reapply constraints not represented in Prisma schema
npm run db:studio                    # Prisma Studio (DB GUI)
```

| Service | Port | Runtime |
|---|---|---|
| Next.js | 3000 | Local (`npm run dev`) |
| NestJS | 4000 | Local (`npm run dev:server`) |
| Python Agents | 8001 | Local (`npm run dev:agents`) |
| PostgreSQL | 5433 | Docker |

## Tests

```bash
npm exec --workspace=apps/server -- vitest run   # Backend
npm exec --workspace=apps/web -- vitest run      # Frontend
npm run check:idor
npm run check:tenant-scope
```

Vitest. Keep only infrastructure-critical tests — no implementation detail (wiring) tests (TkDodo recommendation).

## Environment Variables

### apps/server/.env

```
DATABASE_URL=postgresql://kiditem:kiditem@localhost:5433/kiditem
CHANNEL_CREDENTIALS_ENCRYPTION_KEY=  # 32-byte key for encrypted ChannelAccount credentials
GEMINI_API_KEY=             # Text AI (workflow analysis)
AI_TEXT_MODEL=gemini-2.5-flash
AI_IMAGE_ANALYSIS_MODEL=gemini-3.1-flash-lite-preview
AI_IMAGE_ANALYSIS_VERIFY_MODEL=gemini-3.1-flash-lite-preview
AI_IMAGE_MODEL=gemini-3.1-flash-image-preview
CHATBOT_DATABASE_URL=postgresql://chatbot_readonly:chatbot_readonly@localhost:5433/kiditem?options=-c%20app.organization_id%3D{company_uuid}
```

### agents/.env

```
DATABASE_URL=postgresql://kiditem:kiditem@localhost:5433/kiditem

# AI API keys
AI_MODE=proxy                        # proxy (VectorEngine) or direct
AI_BASE_URL=https://api.vectorengine.ai/v1
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=AI...
VECTORENGINE_API_KEY=sk-...
FAL_KEY=...

# AI models
AI_TEXT_MODEL=gemini-2.5-flash                    # Copy generation
AI_IMAGE_ANALYSIS_MODEL=gemini-3.1-flash-lite-preview  # Product image analysis
AI_IMAGE_ANALYSIS_VERIFY_MODEL=gemini-3.1-flash-lite-preview  # Thumbnail compliance verification
AI_IMAGE_MODEL=gemini-3.1-flash-image-preview     # Hero/banner image generation
AI_IMAGE_EDIT_MODEL=fal-ai/flux-2-pro/edit        # Image editing (fal)
AI_IMAGE_DETAIL_MODEL=fal-ai/flux-pro/kontext/max # Detail image editing (fal)
AI_IMAGE_EDIT_SIZE_MODEL=gemini-3.1-flash-image-preview  # Size chart editing

# Langfuse Cloud
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_BASE_URL=https://cloud.langfuse.com
```
