Consult this document first instead of relying on memorized knowledge.

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

`AGENTS.md` is the shared instruction authority. The most-specific
`AGENTS.md` wins, then parent files. Every directory that contains `AGENTS.md`
also contains a `CLAUDE.md` compatibility shim whose only content is
`@AGENTS.md`.

Before editing, do not rely on memorized rules or a remembered path map. Use
`rg --files -g AGENTS.md` to discover scoped guides for the target path, then
read every applicable `AGENTS.md` from the repo root down to the nearest one
under the target directory. If the work moves to another directory or creates a
new nested surface, rerun discovery and read the newly applicable guide before
editing there.

Keep `Folder Map` sections only when the structure itself is a contract,
exception, or ownership boundary. Do not add maps that only repeat discoverable
file lists; use `rg --files` for exploration instead.

Keep every active root-to-leaf instruction chain below 28 KiB. Run
`npm run check:agents-hygiene` after changing `AGENTS.md` or `CLAUDE.md`.

## Session Boundaries

- Work in one business domain per session. Same-domain cross-layer changes are
  allowed; unrelated business domains are not.
- Boundary exceptions: organization guards, raw SQL policy, scanners, shared
  exports, dependency tooling, and instruction cleanup may cross domains.
- No follow-up issues: apply all in-scope changes now and do not leave
  deferred handoffs.
- Research major OSS projects before introducing new architectural patterns.
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

- GitHub Actions is the only supported release entrypoint. Do not add local
  deploy scripts, `docker save` / `docker load` SSH streaming, or manual EC2
  bootstrap scripts as an alternate production/staging path.
- Runtime images are built by GitHub Actions, pushed to GHCR, and deployed by
  immutable digest refs. Mutable tags such as `staging` or
  `production-candidate` are human pointers only.
- GitHub Environment variables/secrets are the release-time configuration
  source of truth. Local `.secrets/` files are operator conveniences and must
  not become durable deploy inputs.
- Terraform owns long-lived host shape: EC2 bootstrap, security group rules,
  Docker/nginx installation, root volume size, and Elastic IP allocation.
  Manual console changes must be backfilled into Terraform or documented as
  temporary drift in the relevant runbook.
- Changes under `.github/workflows/`, `deploy/`, `docker-compose*.yml`,
  `infra/terraform/`, or deployment runbooks must keep
  [`docs/runbooks/deployment-architecture.md`](docs/runbooks/deployment-architecture.md)
  and the PR checks aligned.
- Add or keep a regression gate before deleting a legacy deploy path. Once the
  replacement path exists, remove the legacy entrypoint instead of leaving it as
  a fallback.

## Documentation

- Keep durable guidance in `docs/`, scoped `AGENTS.md`, or source comments that
  are inseparable from implementation.
- Consolidate nearby rules when adding guidance; do not append stale history.
- Environment/collaboration setup belongs in AI-executable runbooks under
  [`docs/runbooks/`](docs/runbooks/).
- Runbooks list prerequisites, safe agent actions, env vars, paths,
  verification, blockers, and final report format.

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
| Graphify | [`docs/GRAPHIFY.md`](docs/GRAPHIFY.md), [`docs/ERD.md`](docs/ERD.md), [`graphify-out/schema/`](graphify-out/schema/) |
