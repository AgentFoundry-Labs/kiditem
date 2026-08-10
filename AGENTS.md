# KidItem

KidItem is an e-commerce operations automation monorepo for kids' products:
sourcing -> AI processing -> listing -> operations.

Primary owners are `apps/server` (NestJS), `apps/web` (Next.js), `agents`
(Python runtime), `packages`, `prisma`, `extensions`, `scripts`, and `docs`.
Use `rg --files` and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for detail.

## Instruction Map

`AGENTS.md` is the shared instruction authority; the most-specific file wins,
then its parents. A sibling `CLAUDE.md` contains only `@AGENTS.md`.

Before editing, use `rg --files -g AGENTS.md` to read root-to-target guides;
rerun when scope moves or nests. Keep `Folder Map` only for structural
contracts, exceptions, or ownership; use `rg --files` for ordinary exploration.

Target active instruction chains below 22 KiB; 24 KiB is the hard limit. Child
guides add only local deltas. Run `npm run check:agents-hygiene` after changing
`AGENTS.md` or `CLAUDE.md`.

## Session Boundaries

- Keep one business domain per session; cross-layer work within it is allowed.
- Cross-domain work is limited to organization/raw SQL guards, scanners, shared
  exports, dependencies, instruction cleanup, or a declared incident hotfix for
  one operator workflow. State the exception and exclude unrelated cleanup.
- Apply all in-scope changes now; do not defer follow-ups.
- Research OSS before new architecture.
- Maintain plans/specs in `docs/superpowers/`; keep scratch and agent logs out
  of git.

## Core Contracts

- Frontend code uses NestJS APIs; no Prisma, `pg`, Supabase client, or direct DB
  clients.
- Automation workflows are deterministic and must not create Agent OS runs. If
  LLM judgment is required, the entrypoint starts in Agent OS; Agent OS may call
  deterministic workflow capabilities.
- Missing model selection is an explicit error; do not use silent
  `model || default` fallback.
- Prisma uses `String` plus DTO/Zod/domain validation instead of native
  PostgreSQL enums.
- Production raw SQL uses Prisma tagged templates; whitelist dynamic
  identifiers before interpolation.
- Organization/customer boundary is `Organization` / `organizationId`.
  `OrganizationMembership` owns active organization and role; do not add
  `tenantId` or `User.organizationId`.
- `LegalEntity` is tax/settlement identity. `ChannelAccount` is
  marketplace/store identity.
- Mutating services include `organizationId`; single-resource reads use
  `{ id, organizationId }`.
- `operations` owns the operation catalog, schedules, run envelope, and engine
  dispatch.

## Reconstruction Rules

Reconstruction is platform-boundary cleanup, not permission to mix unrelated
business rewrites.

- Add the contract, scanner, or regression gate before deleting legacy
  implementation.
- Services receive `organizationId` from `@CurrentOrganization()` and never
  trust client input.
- Use focused `@kiditem/shared/*` subpaths; do not expand the root barrel for
  new domains.
- Do not add substantial behavior to 700+ line services/components.
- Changes across 10+ files, 500+ line services/components, cross-layer
  controls, or platform boundaries need explicit classification.
- Update [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) when top-level backend
  or web ownership changes.

## Release + Data

- Root [`VERSION`](VERSION) is the deployable release train; package versions
  are metadata. Compatible schema changes keep the open train version and state
  the exact `db:push`/backfill decision in the PR.
- Durable migrations live under `scripts/data-migrations/v<VERSION>/`; a train
  already on `main` is immutable. Follow the
  [release-train runbook](docs/runbooks/release-train-versioning.md).

## CI/CD + Infrastructure

- GitHub Actions is the only Office release entrypoint. Images use immutable
  GHCR digests; host env files never enter artifacts or `.secrets/`.
- Do not add hosted production alternatives, local image shipping, retired
  EC2/Terraform paths, or legacy fallbacks. Workflow/deploy changes keep the
  [deployment runbook](docs/runbooks/deployment-architecture.md) and PR checks
  aligned.

## Documentation

- Keep durable guidance in `docs/`, scoped `AGENTS.md`, or inseparable source
  comments.
- Consolidate nearby rules when adding guidance; do not append stale history.
- Put environment/collaboration setup in AI-executable [`docs/runbooks/`](docs/runbooks/)
  covering prerequisites, safe actions, env vars, paths, verification, blockers,
  and final report format.

## Verification

Do not claim completion without evidence.

Scoped `AGENTS.md` files include local `Verification` only when they add a
different or narrower gate; otherwise inherit the nearest parent verification
section.

| Change type | Required gate |
|---|---|
| Backend | `npm run dev:server` |
| Frontend | `npm run build --workspace=apps/web` |
| Schema | `npm run db:push` + `npx prisma generate` + `cd packages/shared && npm run build` |
| NestJS module/service | `npm run dev:server` and confirm boot |

TDD specs are durable verification. Keep `*.spec.ts` / `*.test.ts` files when
they document behavior, regression risk, domain policy, or public contracts.

## Commit + PR

- `main`, `develop`, and `release/office` are protected. Never push directly or
  delete/prune `release/office`; normal PRs branch from and target `develop`.
- Branches use `feat/{issue}-{desc}`, `fix/{desc}`, `chore/{desc}`, or
  `release/{desc}`; commits use the standard `feat|fix|chore|refactor|docs|test`
  prefixes.
- Squash normal PRs; use merge commits for `develop`/`main` sync and promotion.
  Never rebase a shared branch.
- Use the PR template, include DB/backfill/dev-data notes, read the live body
  back after writes, and run applicable reconstruction/release guards. Stop on
  an unexpected base, commit set, or unrelated history.
- PRs that change `AGENTS.md` or `CLAUDE.md` must be shared with the team.

## References

See [`DESIGN.md`](DESIGN.md), [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md),
[`docs/TESTING.md`](docs/TESTING.md), the
[environment runbook](docs/runbooks/environment-variables.md), and
[`prisma/models/`](prisma/models/).
