# KidItem

E-commerce operations automation for kids' products. Sourcing → AI processing → Listing → Operations.

## Essentials

- **npm workspaces monorepo** — PostgreSQL + Prisma + NestJS + Next.js + Python agents.
- **One domain per session** — no cross-domain modifications.
- **Verify before completing** — backend: `npm run dev:server` boots. Frontend: build succeeds. Schema: `db:push` + `prisma generate` + shared build.
- **No follow-up issues** — apply changes to ALL files in scope. Never defer to TODO.
- **Reference first** — research major OSS projects before introducing new patterns.

## Structure

```
apps/web/            — Next.js 14 frontend (see apps/web/CLAUDE.md)
apps/server/         — NestJS 11 backend API (see apps/server/CLAUDE.md)
agents/              — Python 3.11+ background workers (see agents/CLAUDE.md)
packages/shared/     — @kiditem/shared (Zod schemas + TypeScript types + error codes)
packages/templates/  — React detail page templates (see packages/templates/CLAUDE.md)
prisma/              — DB schema source of truth (see prisma/CLAUDE.md)
extensions/          — Chrome extensions (product-scraper: 1688/Alibaba, coupang-ads-scraper: 쿠팡 광고센터+Wing)
```

## Cross-Domain Rules

- **No direct DB access from frontend** — must go through NestJS API.
- **Workflows must never call LLMs directly** — delegate to agents via `agent_task.create`.
- **No silent model fallback** — `model = model or default` pattern prohibited.
- **No native PG enums** — `String` + app-level validation. Production cast error experience.

## Reference (read when relevant)

- [Architecture](.claude/docs/architecture.md) — data flow, agent runtimes, @kiditem/shared, workflow vs agent boundary
- [Commands & Environment](.claude/docs/commands.md) — quick start, dev commands, ports, env vars, tests
- [Workflow & Process](.claude/docs/workflow.md) — autonomy spectrum, verification, collaboration, branches, commits, PRs
- [Lessons Learned](.claude/docs/lessons.md) — team-shared patterns from past incidents

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke checkpoint
- Code quality, health check → invoke health
