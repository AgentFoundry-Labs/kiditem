# KidItem

KidItem automates kids-product e-commerce operations from sourcing through AI
processing, listing, and operations.

## Start Here

- `AGENTS.md` is the shared instruction authority. The nearest guide adds to or
  overrides its parents; a sibling `CLAUDE.md` contains only `@AGENTS.md`.
- Before editing, run `rg --files -g AGENTS.md` and read the root-to-target
  chain. Repeat discovery when the scope moves. Keep active chains below 28 KiB
  and run `npm run check:agents-hygiene` after instruction changes.
- Keep one business domain per session. Cross-domain work is limited to shared
  guards/exports/dependencies, instruction cleanup, or one declared incident
  hotfix; state the exception and exclude unrelated cleanup.
- Keep durable plans/specs in `docs/superpowers/` and local tool output out of
  git. Research existing OSS before introducing architecture.
- For issue intake, external-agent coordination, PR handoff, merge, or checkout
  cleanup, read
  [`docs/runbooks/ai-collaboration.md`](docs/runbooks/ai-collaboration.md).

## Core Contracts

- Frontend code uses NestJS APIs; no Prisma, `pg`, Supabase client, or direct DB
  clients.
- Automation workflows are deterministic and never create Agent OS runs. Work
  requiring LLM judgment starts in Agent OS, which may call deterministic
  workflow capabilities.
- Missing model selection is an explicit error; never use a silent default.
- Prisma uses `String` with DTO/Zod/domain validation instead of PostgreSQL
  enums. Production raw SQL uses Prisma tagged templates and whitelisted dynamic
  identifiers.
- Organization scope is `Organization` / `organizationId` through
  `OrganizationMembership`; do not add `tenantId` or `User.organizationId`.
  Mutations include `organizationId`, and single-resource reads use
  `{ id, organizationId }`.
- `LegalEntity` is tax/settlement identity; `ChannelAccount` is marketplace/store
  identity.
- `operations` owns the operation catalog, schedules, run envelope, and engine
  dispatch.

## Change Shape

- Reconstruction cleans platform boundaries; it does not authorize unrelated
  business rewrites. Add the contract, scanner, or regression gate before
  deleting legacy behavior.
- Controllers derive organization scope from `@CurrentOrganization()` and never
  trust client input.
- Use focused `@kiditem/shared/*` subpaths rather than expanding the root barrel.
- Do not add substantial behavior to 700+ line services/components. Classify
  changes spanning 10+ files, a 500+ line surface, cross-layer controls, or a
  platform boundary.
- Update [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) when top-level backend or
  web ownership changes.

## Release, Data, And Deployment

- Root [`VERSION`](VERSION) identifies the open deployable release train, not an
  individual feature. Package versions are metadata. Follow
  [`release-train-versioning.md`](docs/runbooks/release-train-versioning.md).
- Compatible schema-only changes keep the train version and record the exact
  `db:push` / backfill decision in the PR. Durable migrations live under
  `scripts/data-migrations/v<VERSION>/`; a train's migrations become immutable
  after reaching `main`.
- Pulling code does not update the database. Schema work also follows
  [`prisma/AGENTS.md`](prisma/AGENTS.md#data--migration-flow).
- GitHub Actions is the only Office release entrypoint. Images are built there,
  stored in GHCR, and deployed by immutable digest; `office-candidate` is only a
  human pointer.
- The GitHub `office` Environment owns approval/release identity. Protected
  runtime env files stay on the operator-managed host and never enter artifacts
  or `.secrets/`.
- Do not add hosted staging/production alternatives, local image streaming,
  manual EC2 bootstrap, or Terraform-owned hosts. Deployment-surface changes
  must keep
  [`deployment-architecture.md`](docs/runbooks/deployment-architecture.md) and
  its regression checks aligned.

## Verification

Do not claim completion without evidence. A scoped guide adds a local
`Verification` section only for a narrower or different gate.

| Change | Required gate |
|---|---|
| Backend | `npm run dev:server` |
| Frontend | `npm run build --workspace=apps/web` |
| Schema | `npm run db:push` + `npx prisma generate` + `cd packages/shared && npm run build` |
| NestJS module/service | `npm run dev:server` and confirm boot |

Keep tests that document behavior, regression risk, domain policy, or a public
contract.

## Git And Pull Requests

- `main`, `develop`, and `release/office` are protected; never push to them
  directly. Regular branches start from and target `develop`; promotions flow
  `develop` to `main`.
- Never delete, prune, or classify `release/office` as stale. Every development
  and Office checkout keeps a local branch tracking `origin/release/office`.
- Use `feat/{issue}-{desc}`, `fix/{desc}`, `chore/{desc}`, or `release/{desc}`
  and the commit prefixes `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, or
  `test:`.
- Squash normal feature/fix/chore PRs. Use merge commits for `develop`/`main`
  sync and promotion. Never rebase a shared branch; private rebases require
  `--force-with-lease`.
- Stop before opening or merging a PR if its base, commit count, messages, or
  diff contain unrelated or duplicated work.
- Use [the PR template](.github/PULL_REQUEST_TEMPLATE.md), including
  DB/backfill/dev-data decisions. After editing a PR, read the live body back.
- Before waiting for checks, run `npm run check:pr-reconstruction -- --base
  origin/<base> --head HEAD` and `npm run check:pr-release-contract -- --base
  origin/<base> --head HEAD` when applicable.
- Share PRs that change `AGENTS.md` or `CLAUDE.md` with the team.

## Task Routing

| Topic | Read when relevant |
|---|---|
| Architecture/ownership | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| Testing | [`docs/TESTING.md`](docs/TESTING.md) |
| Design system | [`DESIGN.md`](DESIGN.md) |
| Environment | [`environment-variables.md`](docs/runbooks/environment-variables.md) |
| Codex skill profiles | [`codex-skill-profiles.md`](docs/runbooks/codex-skill-profiles.md) |
| Dev data | [`docs/DEV_DATA_BUNDLES.md`](docs/DEV_DATA_BUNDLES.md) |
| Prisma models | [`prisma/models/`](prisma/models/) |
