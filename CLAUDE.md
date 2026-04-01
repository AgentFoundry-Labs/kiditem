# KidItem

E-commerce operations automation for kids' products. Sourcing → AI processing → Listing → Operations.

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

# Run all at once
npm run dev:all                                # Next.js + NestJS + Python Agents (concurrently)
```

### Detail Page Generation Test

1. Set AI keys in `agents/.env`: `OPENAI_API_KEY`, `GEMINI_API_KEY`, `FAL_KEY`
2. `npm run dev:all`
3. `localhost:3000/sourcing` → select product → editor → AI generate button

## Structure

npm workspaces monorepo. PostgreSQL + Prisma + NestJS + Next.js + Python agents.

```
apps/web/            — Next.js 14 frontend (see apps/web/CLAUDE.md)
apps/server/         — NestJS 11 backend API (see apps/server/CLAUDE.md)
agents/              — Python 3.11+ background workers (see agents/CLAUDE.md)
packages/shared/     — @kiditem/shared (Zod schemas + TypeScript types + error codes)
packages/templates/  — React detail page templates (see packages/templates/CLAUDE.md)
prisma/              — DB schema source of truth (see prisma/CLAUDE.md)
extensions/          — Chrome extension (1688/Alibaba scraper)
```

## Commands

```bash
docker compose up -d                 # PostgreSQL (Docker)
npm run dev:all                      # Next.js + NestJS + Python Agents (all at once)
npm run dev                          # Next.js frontend only (localhost:3000)
npm run dev:server                   # NestJS backend only (localhost:4000)
npm run dev:agents                   # Python Agents only
npm run db:push                      # Apply schema
npm run db:studio                    # Prisma Studio (DB GUI)
```

| Service | Port | Runtime |
|---|---|---|
| Next.js | 3000 | Local (`npm run dev`) |
| NestJS | 4000 | Local (`npm run dev:server`) |
| Python Agents | — (worker) | Local (`npm run dev:agents`) |
| PostgreSQL | 5433 | Docker |

## Architecture

```
[Frontend] Next.js — UI, user input
     ↓ apiClient (TanStack Query)
[Backend] NestJS — ValidationPipe + DTO → business logic → GlobalExceptionFilter
     ↓ Prisma         ↓ spawn('claude', ...)       ↓ agent_tasks INSERT
[DB] PostgreSQL    [Claude CLI Agents]          [Python Agents]
                    judgment/analysis             generation/processing
```

Two agent runtimes:
- **Claude CLI agents**: NestJS spawns `claude -p`. Natural language judgment tasks. → `apps/server/src/agent-registry/`
- **Python agents**: DB-polling background workers. Image APIs, scraping. → `agents/`

### @kiditem/shared

Shared Zod schemas between frontend and backend. `z.infer<>` for type inference.

- Subpath exports: `@kiditem/shared`, `@kiditem/shared/schemas`, `@kiditem/shared/errors`
- Dual format: ESM (frontend) + CJS (backend)
- `satisfies z.infer<typeof Schema>` pattern in services to detect Prisma-Zod drift
- Adding types: define Zod schema in `packages/shared/src/schemas/` → export in `index.ts` → `npm run build`

### Workflow vs Agent Boundary

| | Workflow | Agent |
|---|---|---|
| Role | Data pipeline (fetch→transform→filter→notify) | AI judgment/analysis (rule interpretation, strategy) |
| Execution | Fixed DAG, deterministic | Natural language prompt, non-deterministic |
| AI usage | Prohibited — delegate via `agent_task.create` node | Core role |

**Principle: Workflows must never call LLMs directly.** Delegate to agents via `agent_task.create` when AI judgment is needed.

## Collaboration

### Branches

- `main` — stable. No direct push.
- `feat/{issue-number}-{description}`, `fix/{description}`
- PR → review → squash merge preferred.

### Commits

`feat:`, `fix:`, `refactor:`, `docs:`, `test:`

### PRs

- Link issue: `Closes #1`
- Split PRs by domain if too many files changed
- Share with team when modifying CLAUDE.md

### Scope (AI coding agents)

- One domain per session. No cross-domain modifications.
- Pull before modifying files others are working on.
- After modifying `prisma/schema.prisma`, run `npm run db:push` before committing.

## Overrides (Decision Records)

- **No native PG enums** → `String` + app-level validation. Production cast error experience.
- **No Server Components** → all pages `'use client'`.
- **No direct imports between Python agents** → communicate via DB state only.
- **No silent model fallback** → `model = model or default` pattern prohibited.
- **No direct DB access from frontend** → must go through NestJS API.
- **No `/v1/` in API paths** → `/api/{domain}` direct mapping.
- **Self-contained domain modules** → Controller + Service + DTO in one folder.
- **Workflow AI analysis once per run only** → no `ai.analyze` in individual nodes.
- **No raw fetch** → use `apiClient.get/post/patch/delete`. For blobs: `apiClient.fetchRaw`.
- **No useState+useEffect fetch** → use `useQuery` / `useMutation`.
- **No alert()** → use `toast.error/success` from `sonner` (prompt/confirm excluded).
- **No `ok: false` in 200 responses** → throw HttpException on failure.

## Tests

```bash
cd apps/server && npx vitest run    # Backend
cd apps/web && npx vitest run       # Frontend
```

Vitest. Keep only infrastructure-critical tests — no implementation detail (wiring) tests (TkDodo recommendation).

## Environment Variables

### apps/server/.env

```
DATABASE_URL=postgresql://kiditem:kiditem@localhost:5433/kiditem
COUPANG_ACCESS_KEY=         # Coupang Wing API
COUPANG_SECRET_KEY=
COUPANG_VENDOR_ID=
GEMINI_API_KEY=             # Text AI (workflow analysis)
AI_TEXT_MODEL=gemini-2.5-flash
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
AI_IMAGE_MODEL=gemini-3.1-flash-image-preview     # Hero/banner image generation
AI_IMAGE_EDIT_MODEL=fal-ai/flux-2-pro/edit        # Image editing (fal)
AI_IMAGE_DETAIL_MODEL=fal-ai/flux-pro/kontext/max # Detail image editing (fal)
AI_IMAGE_EDIT_SIZE_MODEL=gemini-3.1-flash-image-preview  # Size chart editing

# Langfuse Cloud
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_BASE_URL=https://cloud.langfuse.com

# Runner
POLL_INTERVAL_SECONDS=5
```
