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
`AGENTS.md` wins, then parent files. `CLAUDE.md` is only a compatibility shim
and should normally contain `@AGENTS.md`.

Read the nearest scoped guide before editing:

| Work area | Guide |
|---|---|
| `apps/server/src/{domain}/` | [`apps/server/AGENTS.md`](apps/server/AGENTS.md) plus domain guide |
| `apps/web/src/app/{route}/` | [`apps/web/AGENTS.md`](apps/web/AGENTS.md) plus route guide |
| `agents/` | [`agents/AGENTS.md`](agents/AGENTS.md) |
| `packages/shared/` | [`packages/shared/AGENTS.md`](packages/shared/AGENTS.md) |
| `packages/templates/` | [`packages/templates/AGENTS.md`](packages/templates/AGENTS.md) |
| `prisma/` | [`prisma/AGENTS.md`](prisma/AGENTS.md) |
| `scripts/` | [`scripts/AGENTS.md`](scripts/AGENTS.md) |
| `extensions/` | [`extensions/AGENTS.md`](extensions/AGENTS.md) |

## Session Boundaries

- Work in one business domain per session. Same-domain cross-layer changes are
  allowed; unrelated business domains are not.
- Boundary exceptions: organization guards, raw SQL policy, scanners, shared
  exports, dependency tooling, and instruction cleanup may cross domains.
- No follow-up issues: apply all in-scope changes now and do not leave
  deferred handoffs.
- Research major OSS projects before introducing new architectural patterns.
- Temporary plans, scratch specs, agent logs, and coordination notes stay out of
  git.

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
  `User.organizationId`.
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

- Root [`VERSION`](VERSION) is the deployable app release source of truth.
- Package-local `version` fields are package metadata, not release boundaries.
- Durable data migrations live under
  `scripts/data-migrations/v<VERSION>/<sequence>_<name>.ts`.
- Persisted schema/data behavior changes must bump `VERSION` or explain why the
  current version remains valid.
- Pulling code does not update the DB; see
  [`prisma/AGENTS.md`](prisma/AGENTS.md#pulling-code-does-not-update-db).

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

| Change type | Required gate |
|---|---|
| Backend | `npm run dev:server` |
| Frontend | `npm run build --workspace=apps/web` |
| Schema | `npm run db:push` + `npx prisma generate` + `cd packages/shared && npm run build` |
| NestJS module/service | `npm run dev:server` and confirm boot |

TDD specs are durable verification. Keep `*.spec.ts` / `*.test.ts` files when
they document behavior, regression risk, domain policy, or public contracts.

## Commit + PR

- Branch names: `feat/{issue}-{desc}` or `fix/{desc}`.
- Regular PRs target `develop`; staging promotion PRs target `main`.
- Commit prefixes: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`.
- PR bodies include `.github/PULL_REQUEST_TEMPLATE.md` and
  DB/backfill/dev-data notes.
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
