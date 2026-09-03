# KidItem

KidItem automates kids-product e-commerce operations from sourcing through AI
processing, listing, and operations.

## Instruction Use

- AGENTS.md is the shared authority. The nearest guide adds to or overrides its
  parents; a sibling CLAUDE.md contains only `@AGENTS.md`.
- Before editing, discover AGENTS.md files and read the root-to-target chain.
  Repeat when scope moves. Keep every active chain at or below 18 KiB and run
  `npm run check:agents-hygiene` after instruction changes.
- AGENTS.md contains durable repository invariants only. Per-task agent/model
  allocation, review order, temporary migration state, and one-off
  implementation instructions belong in the task or an approved plan.
- Keep one primary business responsibility per change. Cross-domain edits are
  allowed only when required by a named interface, migration, shared guard, or
  incident fix; identify the affected owners and exclude unrelated cleanup.
- Keep durable plans/specs in `docs/superpowers/` and generated agent output
  out of git. Research existing OSS before introducing architecture.
- Use the [AI collaboration runbook](docs/runbooks/ai-collaboration.md) for
  issue intake, external-agent coordination, PR handoff, merge, and checkout
  cleanup.

## Core Contracts

- Frontend code reaches data through NestJS APIs; it never imports Prisma,
  `pg`, Supabase DB clients, or another direct database client.
- Deterministic automation never creates Agent OS runs. Work requiring LLM
  judgment starts in Agent OS, which may invoke deterministic capabilities.
- Missing model selection is an explicit error; do not use a silent fallback.
- Prisma uses `String` plus DTO/Zod/domain validation instead of native
  PostgreSQL enums. Production raw SQL uses tagged templates and whitelisted
  dynamic identifiers.
- Organization scope is `Organization` / `organizationId` through
  `OrganizationMembership`; do not add `tenantId` or
  `User.organizationId`. Mutations carry organization scope and
  single-resource reads use `{ id, organizationId }`.
- `LegalEntity` is tax/settlement identity. `ChannelAccount` is
  marketplace/store identity.
- Each domain owner is the canonical mutation authority for its state. An
  orchestrator or consumer may call an owner interface but must not write the
  owner's canonical rows directly.
- A source owner owns its collection attempts, canonical facts, coverage
  manifests, current complete snapshot, and terminal source status.
- Browser extensions capture and transport source data; they never own
  canonical business state. Attempt chunks and terminal submissions are
  idempotent and fenced by the server-issued attempt identity; stale or
  post-terminal mutations are rejected.
- Completing source collection does not implicitly publish downstream
  calculations. Those calculations run only through their explicit owner
  entrypoints and read the latest complete source snapshots.
- Use focused `@kiditem/shared/*` subpaths rather than expanding the root
  barrel.

## Change Boundaries

- Reconstruction cleans a platform boundary; it does not authorize unrelated
  business rewrites. Add a contract, scanner, or regression gate before
  deleting legacy behavior.
- Controllers derive organization scope from `@CurrentOrganization()` and
  never trust client input.
- File size and diff size are review signals, not design rules. Do not add a
  new state authority, lifecycle, or business responsibility to a module that
  already owns unrelated responsibilities.
- Extract only a cohesive module that hides a meaningful policy, invariant, or
  integration boundary. Do not add pass-through wrappers merely to reduce line
  count.
- Treat changes to mutation authority, transaction ownership, lifecycle,
  source of truth, or a public contract as boundary changes that require an
  explicit plan and focused regression coverage.
- Update [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) when top-level backend or
  web ownership changes.
- Release and schema decisions follow
  [release-train-versioning.md](docs/runbooks/release-train-versioning.md) and
  [prisma/AGENTS.md](prisma/AGENTS.md#data--migration-flow).
- Final Office releases deploy exact `origin/release/office`; incident refs are
  provisional. Follow [office-deploy.md](docs/runbooks/office-deploy.md) for
  promotion, live alignment, local build, cutover, and reconciliation.

## Verification

Do not claim completion without evidence. A scoped guide adds a Verification
section only when it has a narrower or different gate.

| Change | Required gate |
|---|---|
| Backend/NestJS | Focused tests, then `npm run dev:server` and confirm boot |
| Frontend | `npm run build --workspace=apps/web` |
| Schema/data | Follow `prisma/AGENTS.md` and the deployment cutover contract |

Keep tests that document behavior, regression risk, domain policy, or a public
contract.

## Git And Pull Requests

- Treat `main`, `develop`, and `release/office` as protected shared branches.
  Office promotes `develop -> release/office`; incident hotfixes target release
  first, then move forward to `develop`. Never delete or prune `release/office`.
- Use the repository branch/commit naming in the
  [AI collaboration runbook](docs/runbooks/ai-collaboration.md). Squash normal
  PRs; use merge commits for `develop`/`main` sync and promotion. Never
  rebase a shared branch.
- Before opening or merging, stop on an unexpected base, commit count,
  duplicated messages, or unrelated diff.
- Use [the PR template](.github/PULL_REQUEST_TEMPLATE.md), including
  DB/backfill/dev-data decisions, and read the live body back after editing.
- Before waiting for checks, run the reconstruction and release-contract guards
  against the intended base. Share PRs that change AGENTS.md or CLAUDE.md.

## Task Routing

| Topic | Durable source |
|---|---|
| Architecture and ownership | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Testing | [docs/TESTING.md](docs/TESTING.md) |
| Design system | [DESIGN.md](DESIGN.md) |
| Environment | [environment-variables.md](docs/runbooks/environment-variables.md) |
| Codex skill profiles | [codex-skill-profiles.md](docs/runbooks/codex-skill-profiles.md) |
| Dev data | [docs/DEV_DATA_BUNDLES.md](docs/DEV_DATA_BUNDLES.md) |
| Prisma models | [prisma/models/](prisma/models/) |
