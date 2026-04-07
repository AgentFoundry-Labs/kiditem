# Workflow & Process

## Autonomy Spectrum

| Condition | Behavior |
|---|---|
| Single-file bug fix | Fix autonomously. No check-in needed. |
| 2~5 files modified | Explain scope first, then proceed. |
| 5+ files or new feature | Enter Plan mode. Get sign-off before coding. |
| Schema change (Prisma/Zod) | Always Plan mode + impact analysis across layers. |
| Cross-domain change | Prohibited. If unavoidable, separate session. |

## Verification

Never mark a task complete without proving it works:
- **Backend change**: `npm run dev:server` boots without error
- **Frontend change**: `npm run build --workspace=apps/web` succeeds
- **Schema change**: `npm run db:push` + `npx prisma generate` + `cd packages/shared && npm run build`
- **NestJS module/service add**: `npm run dev:server` (tsc + vitest miss DI errors)

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

## Principles

- **No follow-up issues**: Apply changes to ALL files in scope. Never defer to TODO/follow-up.
- **Reference first**: Research how major open-source projects solve it before implementing new patterns.
- **PGE for complex tasks**: 3+ tasks with uncertain scope → Planner/Generator/Evaluator team cycle.
