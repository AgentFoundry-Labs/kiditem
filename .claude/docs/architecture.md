# Architecture

Canonical current-state architecture lives in [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md).
This file exists as Claude's short pointer so scoped architecture references do
not drift into a second architecture contract.

## High-Level Flow

```
Browser -> Next.js app -> NestJS /api -> PostgreSQL
                         -> provider APIs / Gemini / Claude CLI Agent OS / Python agents
```

## Source-Of-Truth Docs

- Workspace rules: [`AGENTS.md`](../../AGENTS.md)
- Backend architecture and domain guide index: [`apps/server/AGENTS.md`](../../apps/server/AGENTS.md)
- Frontend route groups and UI conventions: [`apps/web/AGENTS.md`](../../apps/web/AGENTS.md)
- Prisma / RLS / schema sync: [`prisma/AGENTS.md`](../../prisma/AGENTS.md)
- Shared package exports: [`packages/shared/AGENTS.md`](../../packages/shared/AGENTS.md)
- Python agents: [`agents/AGENTS.md`](../../agents/AGENTS.md)
