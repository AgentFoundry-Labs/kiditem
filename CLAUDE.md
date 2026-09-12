# KidItem

KidItem automates kids-product e-commerce operations from sourcing through AI
processing, listing, and operations.

## Instruction Use

- CLAUDE.md is the shared authority for Claude Code and Codex. The nearest guide
  adds to or overrides its parents.
- Before editing, discover CLAUDE.md files and read the root-to-target chain.
  Repeat when scope moves. Keep every active chain below Codex's default 32 KiB
  project-instruction limit and run `npm run check:agents-hygiene` after
  instruction changes. Treat 32 KiB as a truncation ceiling, not a target;
  review clarity and relevance separately from byte size.
- Write short, actionable guidance: name the required action, its trigger, and
  the safe path or verification. Reserve `never` and `do not` for destructive,
  security, or canonical-ownership invariants; keep inventories, history, and
  extended rationale in source or durable docs.
- CLAUDE.md contains durable repository invariants only. Per-task agent/model
  allocation, review order, temporary migration state, and one-off
  implementation instructions belong in the task or an approved plan.
- Keep one primary business responsibility per change. Cross-domain edits are
  allowed only when required by a named interface, migration, shared guard, or
  incident fix; identify the affected owners and exclude unrelated cleanup.
- Record a settled decision as an ADR in `docs/adr/`; keep in-flight design in
  its Linear spec issue and generated agent output out of git. An ADR wins
  over a spec on conflict. `docs/superpowers/` is a frozen archive: read it,
  never add to it. Research existing OSS before introducing architecture.
- Use the [AI collaboration runbook](docs/runbooks/ai-collaboration.md) for
  issue intake, external-agent coordination, PR handoff, merge, and checkout
  cleanup.

## Core Contracts

- Frontend code reaches data only through NestJS APIs. Keep Prisma, `pg`,
  Supabase DB clients, and other direct database clients on the backend.
- Route deterministic automation through deterministic capabilities. Start work
  requiring LLM judgment in Agent OS, which may invoke those capabilities.
- Require explicit model selection and return an error when it is missing.
- Prisma uses `String` plus DTO/Zod/domain validation instead of native
  PostgreSQL enums. Production raw SQL uses tagged templates and whitelisted
  dynamic identifiers.
- Organization scope is `Organization` / `organizationId` through
  `OrganizationMembership`. Keep `tenantId` and `User.organizationId` absent;
  mutations carry organization scope and
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
- Controllers derive organization scope from `@CurrentOrganization()` rather
  than client input.
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
  [prisma/CLAUDE.md](prisma/CLAUDE.md#schema-and-data-changes).
- Office releases use `npm run deploy:office:local -- --ref origin/<branch>`
  from the Windows host. The deployer fetches one named remote ref, builds API,
  web, and Gateway from its clean exact-SHA worktree, and preserves the live
  env/volumes while recreating application services. GitHub Office bundles,
  GHCR release digests, and `release/office` promotion PRs are not deployment
  inputs. Prisma/data diffs require the explicit cutover contract in
  [deployment-architecture.md](docs/runbooks/deployment-architecture.md).

## Verification

Claim completion only with evidence. A scoped guide adds a Verification
section only when it has a narrower or different gate.

| Change | Required gate |
|---|---|
| Backend/NestJS | Focused tests, then `npm run dev:server` and confirm boot |
| Frontend | `npm run build --workspace=apps/web` |
| Schema/data | Follow `prisma/CLAUDE.md` and the deployment cutover contract |

Keep tests that document behavior, regression risk, domain policy, or a public
contract.

## Git And Pull Requests

- `main`, `develop`, and `release/office` are protected. Regular work branches
  from and targets `develop`; promotions flow `develop` to `main`.
- Never delete, prune, or classify `release/office` as stale. Every checkout
  keeps a local branch tracking `origin/release/office`; the live checkout is
  an operational anchor, not the source or admission gate for local deployment.
- Use the repository branch/commit naming in the
  [AI collaboration runbook](docs/runbooks/ai-collaboration.md). Squash normal
  PRs; use merge commits for `develop`/`main` sync and promotion. Never
  rebase a shared branch.
- Before opening or merging, stop on an unexpected base, commit count,
  duplicated messages, or unrelated diff.
- Use [the PR template](.github/PULL_REQUEST_TEMPLATE.md), including DB and
  backfill decisions, and read the live body back after editing.
- Before waiting for checks, run the reconstruction and release-contract guards
  against the intended base.

## Agent skills

### Issue tracker

Linear (team `Kiditem`); GitHub Issues are not a task ledger.
See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles map to Linear statuses, not new labels.
See `docs/agents/triage-labels.md`.

### Domain docs

Multi-context: `CONTEXT-MAP.md` points at one `CONTEXT.md` per workspace.
See `docs/agents/domain.md`.

## Task Routing

| Topic | Durable source |
|---|---|
| Architecture and ownership | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Testing | [docs/TESTING.md](docs/TESTING.md) |
| Design system | [DESIGN.md](DESIGN.md) |
| Environment | [environment-variables.md](docs/runbooks/environment-variables.md) |
| Codex skill profiles | [codex-skill-profiles.md](docs/runbooks/codex-skill-profiles.md) |
| Prisma models | [prisma/models/](prisma/models/) |
