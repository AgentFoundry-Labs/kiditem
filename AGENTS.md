# KidItem

KidItem is an e-commerce operations automation monorepo for kids' products:
sourcing -> AI processing -> listing -> operations.

## Workspace Map

```text
kiditem/
├── apps/
│   ├── server/              # NestJS backend API
│   └── web/                 # Next.js frontend
├── agents/                  # Python sourcing/scraping agent server
├── packages/
│   ├── shared/              # Zod schemas, TS types, error contracts
│   └── templates/           # detail-page React templates
├── prisma/                  # Prisma v7 multi-file schema
├── scripts/                 # durable repo automation
├── extensions/              # Chrome extensions
├── docs/                    # durable architecture, testing, runbooks
└── VERSION                  # deployable app release source of truth
```

## Instruction Map

`AGENTS.md` is the shared instruction authority; the most-specific file wins,
then its parents. A sibling `CLAUDE.md` contains only `@AGENTS.md`.

Before editing, use `rg --files -g AGENTS.md` to read root-to-target guides;
rerun when scope moves or nests. Keep `Folder Map` only for structural
contracts, exceptions, or ownership; use `rg --files` for ordinary exploration.

Keep active AGENTS chains below 28 KiB. Run
`npm run check:agents-hygiene` after changing `AGENTS.md` or `CLAUDE.md`.

## Session Boundaries

- Keep one business domain per session; cross-layer work within it is allowed.
- Cross-domain work is limited to organization/raw SQL guards, scanners, shared
  exports, dependencies, instruction cleanup, or a declared incident hotfix for
  one operator workflow. State the exception and exclude unrelated cleanup.
- Apply all in-scope changes now; do not defer follow-ups.
- Research OSS before new architecture.
- Maintain plans/specs in `docs/superpowers/`; keep scratch and agent logs out
  of git.

## Collaboration

Before repository changes, follow
[`docs/runbooks/ai-collaboration.md`](docs/runbooks/ai-collaboration.md), the
shared Codex, Claude, Hermes, Linear, GitHub, and Slack contract.

## Platform Ownership

| `operations` | operation catalog, schedules, run envelope, engine dispatch |

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

- Root [`VERSION`](VERSION) identifies the active deployable release train, not
  an individual feature or schema diff. Open a higher SemVer once after the
  prior train is promoted; all PRs in the open train keep that version.
- Package-local `version` fields are package metadata, not release boundaries.
- Compatible schema-only changes keep the open train version and record the
  exact `db:push` / backfill decision in the PR `Release decision:` field.
- Durable data migrations live under
  `scripts/data-migrations/v<VERSION>/<sequence>_<name>.ts`. Once a train has
  reached `main`, its migration set is immutable; corrections use a later
  train.
- Pulling code does not update the DB; see
  [`prisma/AGENTS.md`](prisma/AGENTS.md#data--migration-flow). Follow
  [`docs/runbooks/release-train-versioning.md`](docs/runbooks/release-train-versioning.md)
  to start, build, and promote a train.

## CI/CD + Infrastructure

- GitHub Actions is the only supported Office release entrypoint. Do not add
  hosted staging/production workflows, local image builds, `docker save` /
  `docker load` SSH streaming, or manual EC2 bootstrap scripts as alternate
  paths.
- Runtime images are built by GitHub Actions, pushed to GHCR, and deployed by
  immutable digest refs. The mutable `office-candidate` tag is a human pointer
  only.
- The GitHub `office` Environment owns release identity/approval. Protected
  Office runtime env files remain on the operator-managed host and must not be
  copied into workflow artifacts or committed under `.secrets/`.
- There is no Terraform-owned host. Introduce reproducible home-server
  provisioning only through a separately reviewed Office infrastructure
  design; do not revive the retired EC2 topology.
- Changes under `.github/workflows/`, `deploy/`, `docker-compose*.yml`, or
  deployment runbooks must keep
  [`docs/runbooks/deployment-architecture.md`](docs/runbooks/deployment-architecture.md)
  and the PR checks aligned.
- Add or keep a regression gate before deleting a legacy deploy path. Once the
  replacement path exists, remove the legacy entrypoint instead of leaving it as
  a fallback.

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

- `main` and `develop` are protected collaboration branches. Do not push to
  them directly; use PRs.
- `release/office` is a long-lived protected operational branch. Never delete
  it locally or remotely, classify it as stale or merged cleanup, or include it
  in branch, worktree, or prune cleanup. Every KidItem development and office
  checkout keeps a local `release/office` branch tracking
  `origin/release/office`; if it is missing, restore it before continuing.
- Branch names: `feat/{issue}-{desc}`, `fix/{desc}`, `chore/{desc}`, or
  `release/{desc}`.
- Regular feature/fix/chore PRs branch from `develop` and target `develop`.
  Promotion PRs flow from `develop` to `main`.
- Use squash merge for normal feature/fix/chore PRs. Use a merge commit for
  `develop` <-> `main` sync or promotion PRs so ancestry stays clear. Do not
  use rebase-and-merge for shared branches.
- Do not rebase a branch that another person or agent may be using. For a
  private branch, rebase is allowed only with `--force-with-lease`.
- Before opening or merging a PR, stop if the PR shows unexpected commit count,
  duplicated commit messages, unrelated merged work, or a base branch that does
  not match the intent.
- Commit prefixes: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`.
- PR bodies include `.github/PULL_REQUEST_TEMPLATE.md` and
  DB/backfill/dev-data notes.
- After creating or editing a PR, do not rely on the create/edit command
  succeeding as proof that the body was saved. Immediately read the live body
  with `gh pr view <number> --json body --jq .body`; if it is blank or missing
  required template sections, fix the PR body before waiting for CI.
- Before waiting on PR checks, run the same local PR body guards that CI uses
  for the target base branch when applicable:
  `npm run check:pr-reconstruction -- --base origin/<base> --head HEAD` and
  `npm run check:pr-release-contract -- --base origin/<base> --head HEAD`.
- PRs that change `AGENTS.md` or `CLAUDE.md` must be shared with the team.

## References

| Topic | Source |
|---|---|
| Design system | [`DESIGN.md`](DESIGN.md) |
| Architecture map | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| Testing strategy | [`docs/TESTING.md`](docs/TESTING.md) |
| Environment variables | [`docs/runbooks/environment-variables.md`](docs/runbooks/environment-variables.md) |
| Dev data bundles | [`docs/DEV_DATA_BUNDLES.md`](docs/DEV_DATA_BUNDLES.md) |
| Prisma models | [`prisma/models/`](prisma/models/) |
