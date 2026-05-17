# KidItem

E-commerce operations automation for kids' products. Sourcing -> AI processing -> Listing -> Operations.

## Essentials

- **Stack** — npm workspaces monorepo with PostgreSQL, Prisma, NestJS, Next.js, and Python agents.
- **One business domain per session** — same-domain cross-layer changes are allowed; unrelated domains are not.
- **No follow-up issues** — apply all in-scope changes now; do not leave TODO handoffs.
- **Reference first** — research major OSS projects before introducing new patterns.

## Instruction Map

`AGENTS.md` is the shared instruction authority. The most-specific `AGENTS.md`
wins, then parent files. `CLAUDE.md` is only a compatibility shim and should
normally contain `@AGENTS.md`.

Repo rules, architecture policy, domain contracts, and workflow decisions live
in `AGENTS.md`; `CLAUDE.md` is not a second source of truth.

Before editing, read the nearest scoped instruction file:

| Work area | Read first |
|---|---|
| `apps/server/src/{domain}/` | [apps/server/AGENTS.md](apps/server/AGENTS.md) domain guide |
| `apps/web/src/app/{domain}/` | [apps/web/AGENTS.md](apps/web/AGENTS.md) route guide |
| `agents/` | [agents/AGENTS.md](agents/AGENTS.md) |
| `packages/shared/` | [packages/shared/AGENTS.md](packages/shared/AGENTS.md) |
| `packages/templates/` | [packages/templates/AGENTS.md](packages/templates/AGENTS.md) |
| `prisma/` | [prisma/AGENTS.md](prisma/AGENTS.md) |
| `scripts/` | [scripts/AGENTS.md](scripts/AGENTS.md) |
| `extensions/` | [extensions/AGENTS.md](extensions/AGENTS.md) |

## Documentation

- Keep durable documentation in `docs/`, scoped `AGENTS.md`, or source comments inseparable from implementation.
- Consolidate nearby rules when adding durable guidance; do not append stale history.
- Do not commit session plans, scratch specs, agent logs, or temporary coordination notes.
- Promote only enduring rules or release evidence into git.
- Environment and collaboration setup belong in AI-executable runbooks under [docs/runbooks/](docs/runbooks/).
- Runbooks must list prerequisites, safe agent actions, env vars, paths, verification, blockers, and final report format.
- Agents should execute safe local runbook steps directly and ask only for credentials, permissions, files, or external actions.

## Workflow

### Branches

- `feature/*`, `fix/*` — normal work branches.
- `develop` — regular PR target; merging here does not deploy staging.
- `main` — staging deployment branch; never push directly.
- Promote `develop` to `main` only when collected changes are ready for staging verification.

### Release Version

- Root [VERSION](VERSION) is the deployable app release source of truth.
- Package-local `version` fields are package metadata, not release boundaries.
- Durable data migrations live under `scripts/data-migrations/v<VERSION>/<sequence>_<name>.ts`.
- Persisted schema/data behavior changes must bump `VERSION` or explain why the current version remains valid.

### Bootstrap

Run setup for a new worktree, machine, or expired preview auth token:

```bash
./bin/dev-bootstrap.sh
```

Read [dev-preview-with-auth](docs/runbooks/dev-preview-with-auth.md). For first
setup, read [auth-supabase](docs/runbooks/auth-supabase.md) first.

### Autonomy

| Condition | Action |
|---|---|
| Single-file bug fix | Autonomous fix; no check-in required |
| 2-5 files | Explain scope first, then proceed |
| 5+ files or new feature | Plan mode; code after sign-off |
| Prisma/Zod schema change | Plan mode plus layer impact analysis |
| Cross-business-domain change | Prohibited unless a boundary plan is approved |

### Verification

| Change type | Required command |
|---|---|
| Backend | `npm run dev:server` |
| Frontend | `npm run build --workspace=apps/web` |
| Schema | `npm run db:push` + `npx prisma generate` + `cd packages/shared && npm run build` |
| NestJS module/service | `npm run dev:server` and confirm boot |

Do not claim completion without evidence.

- **TDD specs are durable verification** — keep test-first `*.spec.ts` /
  `*.test.ts` files when they document behavior, regression risk, domain
  policy, or public contracts. Delete or merge them only when
  [docs/TESTING.md](docs/TESTING.md) says an equal or stronger gate protects the
  same risk.

### Commit And PR

- Branch names: `feat/{issue}-{desc}` or `fix/{desc}`.
- Regular PRs target `develop`; staging promotion PRs target `main`.
- Commit prefixes: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`.
- PR bodies include `.github/PULL_REQUEST_TEMPLATE.md` and DB/backfill/dev-data notes.
- `gh pr create` runs the local convention and documentation checklist pre-hook.
- PR checks are reviewer guardrails; still report the exact verification commands you ran.
- Reviews compare the PR body with scoped `AGENTS.md` before judging diff correctness.
- PRs that change `AGENTS.md` or `CLAUDE.md` must be shared with the team.

## Cross-Domain Rules

- **Frontend DB boundary** — frontend code must use NestJS APIs; no Prisma, `pg`, or direct DB clients.
- **Session boundary** — one session may touch server, shared, web, and root consumers only inside one business domain.
- **Boundary exceptions** — organization guards, raw SQL policy, scanners, shared exports, and dependency tooling may cross domains.
- **Workflow LLM boundary** — workflows must delegate through `agent_task.create`; they must not call LLMs directly.
- **No silent model fallback** — missing model selection is an explicit error, not `model || default`.
- **No native PG enums** — use `String` plus DTO, Zod, or domain validation.
- **No unsafe raw SQL** — use Prisma tagged templates; whitelist dynamic identifiers before interpolation.
- **Organization boundary** — use `Organization` and `organizationId`; reserve `tenant` for architecture prose only.
- **Business identities** — `LegalEntity` is tax/settlement; `ChannelAccount` is marketplace/store identity.
- **Multi-tenant scope** — mutating services include `organizationId`; single-resource reads use `{ id, organizationId }`.
- **Membership truth** — `OrganizationMembership` owns active org and role; do not add `User.organizationId`.
- **DB sync** — `git pull` does not update DB; see [prisma DB sync](prisma/AGENTS.md#pulling-code-does-not-update-db).
- **New durable rules** — add incident-driven or cross-domain rules to the nearest scoped `AGENTS.md`.

## Reconstruction Rules

Reconstruction is platform-boundary cleanup, not permission to mix unrelated
business rewrites. Temporary plans stay out of git.

- **Review triggers** — 10+ files, 500+ line services/components, cross-layer controls, or platform boundary changes need explicit classification.
- **Rules before deletion** — add the contract, scanner, or regression gate before deleting legacy implementation.
- **Organization contract** — services receive `organizationId` from `@CurrentOrganization()`; never trust client input.
- **Raw SQL contract** — production raw SQL uses Prisma tagged templates only.
- **Shared contract** — use focused `@kiditem/shared/*` subpaths; do not expand the root barrel for new domains.
- **Large-file contract** — do not add substantial behavior to 700+ line services/components.
- **Verification contract** — every reconstruction PR reports the exact gate it made green.
- **Backend contract** — follow [apps/server/AGENTS.md](apps/server/AGENTS.md) for domain-first architecture and ports.
- **Frontend contract** — follow [apps/web/AGENTS.md](apps/web/AGENTS.md) for route structure, API state, and component splits.
- **Directory map** — update [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) when top-level backend or web ownership changes.

## Structure

| Path | Purpose | Instructions |
|---|---|---|
| [VERSION](VERSION) | Deployable app release source | This file |
| [apps/web/](apps/web/) | Next.js frontend | [apps/web/AGENTS.md](apps/web/AGENTS.md) |
| [apps/server/](apps/server/) | NestJS backend API | [apps/server/AGENTS.md](apps/server/AGENTS.md) |
| [agents/](agents/) | Python workers | [agents/AGENTS.md](agents/AGENTS.md) |
| [packages/shared/](packages/shared/) | `@kiditem/shared` | [packages/shared/AGENTS.md](packages/shared/AGENTS.md) |
| [packages/templates/](packages/templates/) | React detail templates | [packages/templates/AGENTS.md](packages/templates/AGENTS.md) |
| [prisma/](prisma/) | DB schema source | [prisma/AGENTS.md](prisma/AGENTS.md) |
| [scripts/](scripts/) | Repo automation | [scripts/AGENTS.md](scripts/AGENTS.md) |
| [extensions/](extensions/) | Chrome extensions | [extensions/AGENTS.md](extensions/AGENTS.md) |

Subdomain and route indexes live in the top-level instruction files above.

## Reference

| Topic | Source |
|---|---|
| Design system | [DESIGN.md](DESIGN.md) |
| Architecture map | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Testing strategy | [docs/TESTING.md](docs/TESTING.md) |
| Environment variables | [docs/runbooks/environment-variables.md](docs/runbooks/environment-variables.md) |
| Runbooks | [docs/runbooks/](docs/runbooks/) |
| Dev data bundles | [docs/DEV_DATA_BUNDLES.md](docs/DEV_DATA_BUNDLES.md) |
| Prisma models | [prisma/models/](prisma/models/) |
| Graphify | [docs/GRAPHIFY.md](docs/GRAPHIFY.md), [docs/ERD.md](docs/ERD.md), [docs/erd/](docs/erd/) |
| Generated schema navigation | [graphify-out/schema/](graphify-out/schema/), [graphify-out/schema-consumers/](graphify-out/schema-consumers/) |
