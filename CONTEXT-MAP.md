# Context Map

This repo is multi-context. Each workspace below is a context with its own
`CLAUDE.md` (binding rules) and, once `/domain-modeling` has reason to create
one, its own `CONTEXT.md` (domain glossary).

Use the glossary for each affected context and its relevant ADRs. Glossaries
hold domain terminology; `CLAUDE.md` holds rules; ADRs hold settled decisions
and rationale. Surface conflicts with an ADR rather than silently overriding
it. In-flight design lives in the linked Linear spec issue. Missing glossaries
or scoped ADR directories do not block exploration.

| Context | Rules | Glossary | Scoped ADRs |
| --- | --- | --- | --- |
| API / NestJS backend | `apps/server/CLAUDE.md` | `apps/server/CONTEXT.md` | `apps/server/docs/adr/` |
| Web / Next.js | `apps/web/CLAUDE.md` | `apps/web/CONTEXT.md` | `apps/web/docs/adr/` |
| Agent Gateway | `apps/agent-gateway/CLAUDE.md` | `apps/agent-gateway/CONTEXT.md` | `apps/agent-gateway/docs/adr/` |
| Shared contracts | `packages/shared/CLAUDE.md` | `packages/shared/CONTEXT.md` | `packages/shared/docs/adr/` |
| Templates | `packages/templates/CLAUDE.md` | `packages/templates/CONTEXT.md` | — |
| Browser extension | `extensions/CLAUDE.md` | `extensions/CONTEXT.md` | `extensions/docs/adr/` |
| Agents (Python) | `agents/CLAUDE.md` | `agents/CONTEXT.md` | — |
| Data / Prisma | `prisma/CLAUDE.md` | `prisma/CONTEXT.md` | `prisma/docs/adr/` |
| Scripts | `scripts/CLAUDE.md` | — | — |

`apps/server` carries further per-domain guides under
`apps/server/src/<domain>/CLAUDE.md` (advertising, analytics, orders, products,
sourcing, …). Treat the nearest one as the context for work inside it.

System-wide decisions live in `docs/adr/`.

`CONTEXT.md` files are created **lazily**, one term at a time, when a domain
concept actually needs pinning down. Do not scaffold them empty. So far
`apps/server/CONTEXT.md` and `extensions/CONTEXT.md` exist.
