# Codebase Reconstruction Master Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement the child plans task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This master plan is a program contract; each phase below must produce a focused child plan before code deletion or domain rewrite begins.

**Goal:** Rebuild KidItem around enforceable platform rules instead of continuing partial refactors: tenant scope, raw SQL safety, shared package boundaries, backend service/query shape, frontend component boundaries, and dependency cleanup.

**Architecture:** Treat this as a staged reconstruction. Phase 0 defines the constitution and gates; Phase 1 makes platform safety green; later phases delete and reimplement one domain surface at a time behind contract tests. Cross-business-domain edits are allowed only for explicitly named platform-boundary work such as tenant guards, raw SQL policy, scanner gates, and shared export contracts.

**Backend architecture contract:** Phase 3B and later backend reconstruction are governed by [`2026-04-29-backend-architecture-contract.md`](2026-04-29-backend-architecture-contract.md): Domain-first modular architecture with Application orchestration and selective Hexagonal Ports. Existing flat services and `services`/`persistence`/`read-models`/`ingest` labels are transitional, not the target naming standard.

**Tech Stack:** npm workspaces, NestJS 11, Prisma 7, PostgreSQL, Next.js 16, React Query, Zod, `@kiditem/shared`, Vitest, shell safety scanners, `knip`.

---

## Current Baseline

- Current reconstruction main is `e4df2f0` (PR #116 merged on 2026-04-29). New reconstruction branches start from current `origin/main`.
- Phase 2 shared-root migration/root-barrel closeout and the Phase 3A tenant-boundary hardening wave are landed through PR #116. The next backend phase is Phase 3B: large-domain architecture refactoring, not another document/test-only audit wave.
- Phase 0 (constitution) and Phase 1 (platform safety) are landed in `main`. Subsequent platform-safety follow-ups also merged in the same wave:
  - **Phase 1 (PR #73)** — ontology hard delete (`apps/server/src/ontology/**` removed); `scripts/check-queryraw-tenancy.sh` portability fix (`mapfile`/`readarray` replaced with bash 3.2 `while IFS= read -r` loops); production unsafe raw SQL removal in `agent-registry.service.ts` (cost-analytics rewritten to tenant-scoped `$queryRaw + Prisma.sql`) and `rules.service.ts` (healthScore update rewritten to `prisma.$transaction(masterProduct.updateMany({ where: { id, companyId } }))`).
  - **Tenant-scope and dead-code follow-ups (PR #74–#76)** — `warehouses`, `categories`, `suppliers` controllers receive `@CurrentCompany()` and pass `companyId` into services as an explicit argument; single-resource reads use `findFirst({ id, companyId })`. The `ProductMemo` Prisma model and the web UI surfaces that depended on it were hard-deleted (no UI consumer remained).
- `npm run check:idor` is **PASS** at `3692977`. The portable scanner is the canonical raw-SQL tenancy gate. If the scanner ever breaks again, repair the scanner before treating its silence as evidence.
- Post-Phase-1 unsafe raw SQL grep over `apps/server/src` (excluding tests/test-helpers) returns zero production call sites; the only remaining hit is a doc comment in `agent-registry/trace/agent-trace.service.ts` describing the ban itself.
- A second tenant-scope scanner — `scripts/check-tenant-scope.sh` (run via `npm run check:tenant-scope`) — now covers ORM-level risks that complement the raw-SQL `check:idor` gate: bare-id `findUnique`/`findUniqueOrThrow`, bare-id Prisma `update`/`delete` without nearby tenant scope, controller `@Body`/`@Query`/`@Param('companyId')`, and DTO `companyId` fields. The scanner is Bash 3.2 compatible and allowlist-driven via `scripts/.tenant-scope-allowlist.txt`.
- `npm run check:tenant-scope` is now a required green gate for tenant-owned service/controller changes. Existing cleanup made the scanner pass; future PRs must not add new bare-id tenant access.
- Knip `Unused files` is no longer part of the baseline after PR #95. Web and server export-surface cleanup landed in PR #96 and PR #98. The remaining export/type cleanup surface is classified in [`2026-04-29-knip-export-risk-map.md`](./2026-04-29-knip-export-risk-map.md); use that map before deleting or internalizing public-looking exports.
- Local working trees may contain unrelated untracked Excel files (`kiditem_list (1) 2.xlsx`, `wing-inventory-matched 2.xlsx`). Leave these untouched in reconstruction branches.
- Large rewrite surfaces confirmed by line count (subject to drift after future PRs; re-measure before relying on the numbers):
  - `apps/server/src/advertising/services/ad-sync.service.ts` — ~1700 lines.
  - `apps/server/src/ai/services/thumbnail-vision-ai.service.ts` — ~1000 lines.
  - `apps/web/src/app/sourcing/[id]/editor/components/DetailPageEditor.tsx` — ~1700 lines.
  - `apps/server/src/ai/services/thumbnail-generation.service.ts` — ~900 lines.
  - `packages/shared/src/index.ts` — ~450 lines.
  - `packages/shared/src/schemas/index.ts` — ~370 lines.

## Operating Constitution

These rules are the target state. Phase 0 records them in the relevant instruction files before broad cleanup begins.

1. Tenant-owned HTTP routes must receive company scope from `@CurrentCompany()` and pass `companyId` as an explicit service argument.
2. Services must not trust `companyId` from `@Body()` or `@Query()`.
3. Tenant resource GET/PATCH/DELETE must use `findFirst({ where: { id, companyId } })`, not `findUnique({ where: { id } })`.
4. Tenant-owned mutation paths must include `companyId` in the `WHERE`/`INSERT` path that actually changes data.
5. Raw SQL must use Prisma tagged templates (`$queryRaw` / `$executeRaw`) with bound parameters. `$queryRawUnsafe` and `$executeRawUnsafe` are banned in production code.
6. Every production `$queryRaw` over tenant-owned tables must bind `company_id = ${companyId}::uuid` or equivalent table-specific tenant predicate.
7. Frontend code must not depend on Prisma, `pg`, or direct database packages. All frontend data access goes through NestJS APIs and `apiClient`.
8. `packages/shared` root barrel must stop growing. New domain contracts use subpath exports such as `@kiditem/shared/product`, `@kiditem/shared/order`, `@kiditem/shared/inventory`, `@kiditem/shared/ai`, `@kiditem/shared/advertising`, `@kiditem/shared/errors`, and `@kiditem/shared/security`.
9. Backend-only concepts such as Nest `AppException` must not be exported from the shared root surface used by web.
10. New or materially rewritten services/components should stay under 700 lines. Existing 700+ line files must not receive large feature additions; split first or write a replacement plan.
11. Controllers must not cast DTOs with `as any`. Service method parameters must match DTO shapes directly.
12. Service DTO parameters must not use `Record<string, unknown>` as a substitute for explicit DTO or internal interfaces.
13. No legacy aliases are added during migration. Move consumers to the new canonical import/path instead.
14. Workflows and agents must not call LLMs directly from workflow code; use the existing agent task boundary.
15. Model selection must be explicit. Do not use `model = model || default` or similar silent fallback.

## Boundary Exception

The reconstruction starts with platform-boundary work that necessarily crosses domains. This exception covers only:

- instruction files and scanner scripts;
- auth/current-company decorators and guards;
- tenant/raw SQL enforcement and tests;
- `packages/shared` export topology;
- dependency/dead-code tooling.

It does not permit mixing unrelated business rewrites. After Phase 1, each backend or frontend business area must use a child plan and one owner domain per PR.

## Phase Order

### Phase 0: Codebase Constitution

**Purpose:** Make the new rules visible to humans and agents before deleting or rewriting implementation code.

**Primary PR:** `codex/codebase-reconstruction-plan` or successor branch.

**Files to modify in the Phase 0 child plan:**

- `AGENTS.md` — add reconstruction constitution and platform-boundary exception wording.
- `apps/server/AGENTS.md` — add service/query conventions, raw SQL hard bans, 700+ line rewrite rule.
- `apps/web/AGENTS.md` — add frontend DB dependency ban, `apiClient`/React Query boundary, large component split rule.
- `packages/shared/AGENTS.md` — add root barrel freeze and domain subpath export policy.
- `apps/server/src/rules/CLAUDE.md` — remove unsafe raw SQL allowance and replace it with a tagged-template bulk update pattern.
- `docs/superpowers/plans/2026-04-28-codebase-reconstruction.md` — this master plan.

**Completion evidence:**

- `git diff -- AGENTS.md apps/server/AGENTS.md apps/web/AGENTS.md packages/shared/AGENTS.md apps/server/src/rules/CLAUDE.md docs/superpowers/plans/2026-04-28-codebase-reconstruction.md`
- Confirm no production code behavior changed in Phase 0.

### Phase 1: Platform Safety Rebuild

**Purpose:** Make the hard safety gates truthful and green before broad domain rewrites.

**Files to investigate first:**

- `scripts/check-queryraw-tenancy.sh`
- `package.json`
- `apps/server/src/auth/decorators/current-company.decorator.ts`
- `apps/server/src/auth/guards/company-scope.guard.ts`
- `apps/server/src/agent-registry/agent-registry.service.ts`
- `apps/server/src/rules/services/rules.service.ts`
- `apps/server/src/rules/__tests__/rules.service.spec.ts`
- `apps/server/src/rules/__tests__/rules-flow.spec.ts`

**Required child-plan decisions:**

- Make `scripts/check-queryraw-tenancy.sh` portable on macOS Bash 3.2 by replacing `mapfile` usage with POSIX-compatible loops or requiring a repo-local Bash 5 entrypoint.
- Extend the scanner to report unsafe raw SQL separately from tenantless tagged raw SQL.
- Ontology is **already hard-deleted from the server surface** (2026-04-28). No tenant patch is required; the scanner must instead confirm no resurrected `apps/server/src/ontology/**` files reappear.
- Replace agent-registry dynamic filters with `Prisma.sql` fragments instead of `$queryRawUnsafe`.
- Replace rules bulk update with a tagged `Prisma.sql` CASE update or a bounded transaction update loop. Prefer tagged SQL if it stays readable and testable.
- Update rules tests to assert tagged raw execution through `$executeRaw` or transaction calls, not `$executeRawUnsafe`.

**Completion gates:**

```bash
npm run check:idor
rg -n '\$queryRawUnsafe|\$executeRawUnsafe' apps/server/src --type ts --glob '!**/__tests__/**'
npm run dev:server
```

Expected after Phase 1:

- `npm run check:idor` passes.
- Unsafe raw SQL search returns no production hits.
- Nest server boots on port 4000 without dependency injection errors.

### Phase 2: `packages/shared` Rebuild

**Purpose:** Stop treating `@kiditem/shared` as one large catch-all API. Introduce domain subpaths and split backend-only concepts away from frontend surfaces.

**Files to investigate first:**

- `packages/shared/package.json`
- `packages/shared/src/index.ts`
- `packages/shared/src/schemas/index.ts`
- `packages/shared/src/errors/index.ts`
- `packages/shared/src/schemas/*.ts`
- root imports in `apps/server/src/**` and `apps/web/src/**`

**Target subpath exports:**

```json
{
  "./product": "./dist/product/index.js",
  "./order": "./dist/order/index.js",
  "./inventory": "./dist/inventory/index.js",
  "./ai": "./dist/ai/index.js",
  "./advertising": "./dist/advertising/index.js",
  "./errors": "./dist/errors/index.js",
  "./security": "./dist/security/index.js"
}
```

**Migration rule:**

- Do not break all consumers in one PR.
- First add subpaths and freeze root expansion.
- Then migrate one owner domain at a time from root imports to subpath imports.
- Remove root exports only after all direct consumers are gone and builds prove it.

**Non-regression gate:**

`scripts/check-shared-root-imports.sh` (run via `npm run check:shared-root-imports`) freezes the per-file count of `from '@kiditem/shared'` ROOT imports under `apps/server/src` and `apps/web/src`. The current set is captured in `scripts/.shared-root-imports-baseline.txt` and treated as an upper bound:

- New files adding root imports → FAIL.
- Existing files growing their root import count → FAIL.
- Existing files dropping root imports (or removed entirely) → PASS without baseline regeneration. Migration PRs that move imports to subpaths can land in parallel without coordinating baseline edits.
- Subpath imports such as `from '@kiditem/shared/product'` are excluded from the count and are the migration target.

After a legitimate ratchet (a migration PR that lowers per-file root import counts), regenerate to lock in the new lower ceiling:

```bash
bash scripts/check-shared-root-imports.sh --regenerate
```

Commit the updated baseline alongside the migration. The scanner is Bash 3.2 compatible and uses ripgrep.

**Completion gates:**

```bash
npm run check:shared-root-imports
cd packages/shared && npm run build
npm run build --workspace=apps/server
npm run build --workspace=apps/web
```

### Phase 3A: Backend Tenant-Boundary Rewrite

**Purpose:** Make backend domain boundaries tenant-safe after the platform gates exist.

**Status:** Complete for the planned reconstruction wave through PR #116:

1. ~~`ontology` tenant safety~~ — superseded: ontology was hard-deleted from the server surface on 2026-04-28 instead of tenant-patched.
2. `suppliers`, `warehouses`, `categories` — controllers/services scoped in the Phase 1 follow-up wave.
3. `manual-ledger`, `processing-costs`, `supplier-payments` — finance tenant-boundary PR #108.
4. `products` / `masterProduct` query boundary — PR #110 and follow-up PR #113.
5. `channels` / `channelListing` — PR #112.
6. `advertising` — PR #116.
7. `ai` / thumbnails — PR #114.
8. `workflows` / agent task boundary — PR #115.

**Tenant-boundary rule for future backend PRs:**

- Before changing behavior, add a regression test or integration test that demonstrates the existing expected behavior and the target tenant failure mode.
- Replace `findUnique({ where: { id } })` with company-scoped reads, then update mutations.
- Keep one business owner domain per PR unless the child plan records a platform-boundary exception.

**Completion gate per backend tenant-boundary PR:**

```bash
npm run dev:server
```

Add domain-specific Vitest or integration commands in each child plan.

### Phase 3B: Large Domain Architecture Refactor

**Purpose:** Improve the actual code structure of large bounded contexts after
tenant safety is in place. This phase should reduce fat services, separate
query/persistence/mapping/business-rule responsibilities, and make future
changes smaller. It is not successful if it only adds tests or documentation.

**Architecture posture:** Phase 3B follows
[`2026-04-29-backend-architecture-contract.md`](2026-04-29-backend-architecture-contract.md).
The target is Domain-first modular architecture with Application orchestration
and selective Hexagonal Ports, not full Clean Architecture everywhere and not a
global repository layer. Top-level backend folders represent owner domains or
platforms, not DB tables or frontend pages.

Target reconstructed domains converge toward:

- `adapter/in/*` — HTTP, workflow, cron, or agent entrypoints.
- `adapter/out/prisma/*` — Prisma persistence/query adapters, raw SQL builders,
  tenant predicates, row locks, transactions, and hydration.
- `adapter/out/{provider}/*` — external APIs, LLM/model providers, filesystem,
  panel events, and other runtime infrastructure.
- `application/service/*` — use-case orchestration, transactions, tenant
  context, and calls to out ports.
- `application/port/in|out/*` — ports only where they remove boundary coupling:
  Agent OS/runtime, workflow/cron/agent entrypoints, external providers, panel
  events, raw SQL/complex persistence, core aggregate mutations, or
  cross-entrypoint use cases.
- `domain/*` — pure business rules, calculators, policies, thresholds, state
  transitions, and domain models with no NestJS/Prisma/runtime dependency.
- `mapper/*` — Prisma row/query row/API DTO/domain mapping.

Existing `services/`, `persistence`, `read-models`, `queries`, and `ingest`
files may be used as migration waypoints. Do not copy those names as the new
standard when creating or materially rewriting a domain. Repository naming is
reserved for true domain collection abstractions; do not create 1:1 Prisma
wrappers.

**Priority order:**

1. `advertising` — decompose fat services such as `ad-sync.service.ts`;
   converge the transitional `services`/`ingest`/`read-models`/`persistence`
   shape toward `adapter/application/domain`; isolate mappers and pure
   ad-rule/domain helpers.
2. `ai` / thumbnails — split generation, analysis, recomposition, Wing
   registration, image resolution, and AI adapter orchestration.
3. `products` — selectively extract tenant-safe product persistence and shared
   hydrated read shapes where product/master/option access repeats. Do not wrap
   Prisma CRUD 1:1.
4. `workflows` — clarify application service / runner / executor /
   agent-task boundary while keeping the existing executor public contract
   stable unless a separate contract PR changes it.
5. `dashboard` / `statistics` read models — isolate raw SQL and reporting query
   builders from controller-facing application services.

**Refactor rules:**

- One bounded context per PR. Do not mix unrelated business domains.
- Each child plan must name the target fat service(s), new internal files, and
  which responsibility moves where.
- Prefer moving production code into focused modules over creating generic
  wrappers. A repository/persistence module is justified only when it enforces
  tenant scope, row-lock/transaction semantics, soft-delete, standard includes,
  or repeated hydrated shapes.
- Preserve controller routes and shared API contracts unless the child plan
  explicitly includes a contract migration.
- Keep tests risk-based and sparse. Add tests for operating-critical behavior:
  tenant isolation / IDOR, raw SQL predicates, transaction or row-lock semantics,
  external side effects, money/inventory/ad-budget calculations, public API
  contract compatibility, and pure business rules extracted into `domain/`.
  Do not add implementation-detail mock tests just because code moved between
  files; rely on existing tests when they already protect the behavior. Follow
  [`docs/TESTING.md`](../TESTING.md) for the repo-wide admission criteria and
  mock/test-double policy.
- Include a test cleanup pass in each large-domain child plan. Existing tests
  may be deleted, collapsed, or rewritten when they are implementation-detail
  mock tests, duplicate a higher-value integration/public-behavior test, or are
  now better covered by build/scanner gates. Do not remove tenant, money,
  inventory, ad-budget, transaction, row-lock, public contract, or incident
  regression tests unless a stronger replacement is in the same PR.
- The primary output must be structural production-code improvement: lower
  service LOC, extracted read-model/query modules, extracted mappers, or pure
  domain helper coverage.

**Completion gate per Phase 3B PR:**

```bash
npm run check:idor
npm run check:tenant-scope
npm run build --workspace=apps/server
npm run dev:server
```

Add focused unit/integration commands for the touched bounded context. If raw
SQL or transaction/row-lock behavior moves, include the relevant real-Postgres
integration test.

### Phase 4: Frontend Rebuild

**Purpose:** Replace large UI surfaces with smaller, API-contract-backed components without changing domain semantics by accident.

**Order:**

1. API client/fetch convention.
2. Layout/navigation.
3. Thumbnail editor.
4. Sourcing editor.
5. Dashboard/action-board.
6. Remaining domain pages.

**First large component target:**

- `apps/web/src/app/sourcing/[id]/editor/components/DetailPageEditor.tsx`

**Rewrite rule:**

- Do not add new behavior to 700+ line components.
- First extract read-only pure helpers and presentational components with tests.
- Then replace stateful editor orchestration behind stable props.
- Keep `apiClient`, React Query, query keys, and scoped `CLAUDE.md` route guidance intact.

**Completion gate per frontend PR:**

```bash
npm run build --workspace=apps/web
```

Use browser QA only after a frontend route is runnable and visually affected.

### Phase 5: Dead Code / Dependency Purge

**Purpose:** Remove stale code and dependencies only after gates are trustworthy enough to distinguish unused code from generated artifacts.

**Files to create or modify in the child plan:**

- `knip.json` or `knip.config.ts`
- root `package.json`
- workspace package manifests under `apps/*/package.json` and `packages/*/package.json`
- generated-file ignore lists for `graphify-out/**`, Prisma output, local worktrees, `.data/**`, and build artifacts.

**Rules:**

- No new dependencies without explicit approval.
- Do not remove dependencies from web/server until direct and transitive usage is checked.
- Frontend Prisma dependencies are removal candidates, but remove only after source grep and builds prove no frontend runtime usage remains.

**Completion gates:**

```bash
npm run build --workspace=apps/server
npm run build --workspace=apps/web
cd packages/shared && npm run build
```

Add the final `knip` command once its config is created and stable.

## Master Task List

### T0: Baseline Snapshot

**Files:** no edits.

- [x] Fetch latest main:

```bash
git fetch origin main --prune
git rev-parse HEAD origin/main
git log -1 --oneline --decorate
```

Initial plan snapshot observed `HEAD` and `origin/main` at `35405b223d240e5f66e872302ada7ac8cd7971db`; current reconstruction baseline is recorded in the Current Baseline section above and should be re-fetched before each child PR.

- [x] Read root and scope instruction files:

```bash
sed -n '1,260p' AGENTS.md
sed -n '1,260p' apps/server/AGENTS.md
sed -n '1,260p' apps/web/AGENTS.md
sed -n '1,260p' packages/shared/AGENTS.md
sed -n '1,260p' prisma/AGENTS.md
```

- [x] Capture current scanner portability issue:

```bash
bash --version | head -1
npm run check:idor
```

Observed: macOS Bash 3.2 cannot run the scanner because the script uses `mapfile`.

### T1: Create Phase 0 Constitution PR

**Files:**

- Modify: `AGENTS.md`
- Modify: `apps/server/AGENTS.md`
- Modify: `apps/web/AGENTS.md`
- Modify: `packages/shared/AGENTS.md`
- Modify: `apps/server/src/rules/CLAUDE.md`
- Modify: `docs/superpowers/plans/2026-04-28-codebase-reconstruction.md`

- [ ] Add the Operating Constitution rules from this plan to the instruction files.
- [ ] In `apps/server/src/rules/CLAUDE.md`, replace the `$executeRawUnsafe` allowance with a tagged SQL requirement and explicit test update requirement.
- [ ] Run:

```bash
git diff --check
git diff -- AGENTS.md apps/server/AGENTS.md apps/web/AGENTS.md packages/shared/AGENTS.md apps/server/src/rules/CLAUDE.md docs/superpowers/plans/2026-04-28-codebase-reconstruction.md
```

- [ ] Commit using the Lore protocol:

```bash
git add AGENTS.md apps/server/AGENTS.md apps/web/AGENTS.md packages/shared/AGENTS.md apps/server/src/rules/CLAUDE.md docs/superpowers/plans/2026-04-28-codebase-reconstruction.md
git commit -m "Establish reconstruction rules before cleanup"
```

### T2: Create Phase 1 Safety-Gate Child Plan

**Files:**

- Create: `docs/superpowers/plans/2026-04-28-platform-safety-rebuild.md`

- [ ] Write a child plan for scanner portability, unsafe raw SQL removal, and backend boot verification. (Ontology tenant scope is no longer in scope — the domain was hard-deleted on 2026-04-28.)
- [ ] Include exact tests for:
  - scanner catches tenantless `$queryRaw`;
  - scanner catches `$queryRawUnsafe` and `$executeRawUnsafe`;
  - `apps/server/src/ontology/**` does not reappear (deletion-stays gate);
  - rules bulk update updates only the event company;
  - agent-registry cost analytics does not use unsafe raw SQL.
- [ ] Do not edit production safety code before the child plan exists.

### T3: Execute Phase 1 Safety-Gate PR

**Files:** defined by `docs/superpowers/plans/2026-04-28-platform-safety-rebuild.md`.

- [ ] Fix the scanner portability issue first.
- [ ] ~~Fix ontology tenant scope~~ — done via hard-delete on 2026-04-28. Verify the directory is still absent rather than patching.
- [ ] Remove unsafe raw SQL from agent-registry and rules.
- [ ] Update tests.
- [ ] Verify:

```bash
npm run check:idor
rg -n '\$queryRawUnsafe|\$executeRawUnsafe' apps/server/src --type ts --glob '!**/__tests__/**'
npm run dev:server
```

### T4: Create Phase 2 Shared Rebuild Child Plan

**Files:**

- Create: `docs/superpowers/plans/2026-04-28-shared-subpath-rebuild.md`

- [ ] Inventory root imports:

```bash
rg -n "from '@kiditem/shared'" apps/server/src apps/web/src packages/shared/src --glob '*.ts' --glob '*.tsx'
```

- [ ] Define the subpath export tree and migration batches.
- [ ] Keep root exports compatible until every consumer has moved.
- [ ] Include shared/server/web build gates.

### T5: Create Phase 3B Architecture Refactor Child Plans

**Files:** one plan per owner domain under `docs/superpowers/plans/`.

- [ ] `ontology` is **hard-deleted from the server surface** (2026-04-28). No rewrite plan is owed; future reintroduction requires a product contract + tenant isolation test.
- [x] Write the advertising architecture refactor child plan first:
  [`2026-04-29-advertising-phase3b-architecture-refactor.md`](2026-04-29-advertising-phase3b-architecture-refactor.md). Before execution, align its file layout with [`2026-04-29-backend-architecture-contract.md`](2026-04-29-backend-architecture-contract.md): `services`/`read-models`/`persistence`/`ingest` are transitional labels, while the target is `adapter/application/domain`.
- [ ] Write separate child plans for AI thumbnails, products, workflows, and dashboard/statistics read models.
- [ ] Do not write Phase 3B child plans for small CRUD domains unless a concrete fat-service or repeated-invariant problem is identified.
- [ ] Each child plan must primarily move/simplify production code. Tests and docs are required evidence, not the main deliverable.
- [ ] Each child plan must state the minimal test policy for the slice: which existing tests remain sufficient, which operating-critical behavior needs a new test, and which implementation-detail tests should not be added.
- [ ] Each child plan must include a test cleanup inventory: redundant mock specs
  to delete/collapse, protected tests that must stay, and the command proving the
  remaining suite still covers the operating risk.

### T6: Create Frontend Rewrite Child Plans

**Files:** one plan per route or shared frontend boundary.

- [ ] Write the API client/fetch convention plan before route rewrites.
- [ ] Write the sourcing editor decomposition plan before editing `DetailPageEditor.tsx`.
- [ ] Include `npm run build --workspace=apps/web` and browser QA when UI behavior changes.

### T7: Create Dependency Purge Child Plan

**Files:**

- Create or modify: `knip.json` or `knip.config.ts`
- Modify: package manifests only after evidence.

- [ ] Configure generated/local false positives before removing anything.
- [ ] Run source grep for frontend Prisma usage before removing web Prisma deps.
- [ ] Remove dependencies in small commits with build evidence.

## Verification Gates

Each phase has a fixed set of gates that must pass before merge. The phase table below is the canonical pre-merge checklist for any reconstruction PR; the change-type matrix later in this section is supplementary, for work that crosses phase boundaries.

### Per-Phase Merge Gates

| Phase | Required pre-merge gates | Notes |
|---|---|---|
| Phase 0 — Constitution / instruction-only | `git diff --check`; scoped diff review | No code/runtime gate. Confirm no production code behavior changed. |
| Phase 1 — Platform safety | `npm run check:idor`; `npm run check:tenant-scope`; `npm run build --workspace=apps/server`; `npm run dev:server` | Plus `rg -n '\$queryRawUnsafe\|\$executeRawUnsafe' apps/server/src --type ts --glob '!**/__tests__/**'` returns no production hit. Both scanners are required green gates after the Phase 3A cleanup wave. |
| Phase 2 — `packages/shared` rebuild | `npm run check:shared-root-imports`; `cd packages/shared && npm run build`; `npm run build --workspace=apps/server`; `npm run build --workspace=apps/web` | `check:shared-root-imports` is the per-file root-import non-regression gate (baseline at `scripts/.shared-root-imports-baseline.txt`). Removal-tolerant — migration PRs do not need to coordinate baseline edits. Regenerate the baseline only when ratcheting the ceiling down: `bash scripts/check-shared-root-imports.sh --regenerate`. |
| Phase 3A — Backend tenant-boundary rewrite | `npm run check:idor`; `npm run check:tenant-scope`; domain-specific Vitest/integration specs; `npm run build --workspace=apps/server`; `npm run dev:server` | Landed through PR #116 for the planned wave. Future tenant-boundary PRs must keep both scanners green. |
| Phase 3B — Large domain architecture refactor | `npm run check:idor`; `npm run check:tenant-scope`; focused domain-specific Vitest/integration specs only where risk justifies them; `npm run build --workspace=apps/server`; `npm run dev:server` | PR evidence must show structural production-code improvement, not only added tests/docs. Include test cleanup rationale when deleting/collapsing redundant specs. Do not add implementation-detail mock tests for file moves. Include real-Postgres integration when raw SQL, row locks, transactions, or DB invariants move. |
| Phase 4 — Frontend rebuild | `npm run build --workspace=apps/web`; focused Vitest under the touched route's `__tests__/` (or shared frontend tests it depends on) | Add browser QA when a route's visual or interactive behavior changes. |
| Phase 5 — Dead code / dependency purge | `knip` (after `knip.json` exists and is stable); `cd packages/shared && npm run build`; `npm run build --workspace=apps/server`; `npm run build --workspace=apps/web` | Source grep and workspace builds before any dependency removal. |

`npm run check:tenant-scope` is now a required green gate. Do not merge a
tenant-scope regression behind a broad allowlist; narrow scanner false positives
must be justified in `scripts/.tenant-scope-allowlist.txt`.

### Schema Change Trigger

Most reconstruction PRs do **not** touch `prisma/models/**`. The schema-side gates run **only when a PR modifies `prisma/models/**`, `prisma/schema.prisma`, or generated Prisma artifacts**:

| Schema change in PR | Required additional gates |
|---|---|
| No schema change | None — skip `db:push`, `prisma generate`, `db:3layer-setup`. |
| Schema change present | `npm run db:push`; `npx prisma generate`; `cd packages/shared && npm run build`; rerun the affected phase gates above. |
| Schema change touches the 3-layer products contract (`MasterProduct` / `ProductOption` / `Bundle*`) | Add `npm run db:3layer-setup` to refresh the SQL views/indices the 3-layer ledger depends on. |

`db:3layer-setup` runs `prisma/3layer-setup.sql` against the local Docker Postgres. It is only needed when the SQL it executes is affected by the change. A pure tenancy or service-shape PR with no model edits does not need it.

### `init.sql.gz` (fresh-volume snapshot) handling

`prisma/init.sql.gz` is **not** the default dev-data path. Default local dev data flows through Drive bundles:

```bash
npm run data:dev:sync -- --profile workspace-demo --yes
```

`init.sql.gz` is reserved for the rare fresh-volume Postgres bootstrap path used by `docker-compose` first-boot or for explicit fresh-snapshot regeneration. A normal reconstruction PR — including Phase 1–5 work — does **not** modify `init.sql.gz` and does **not** need a fresh-volume gate. The PR-template checkbox under `prisma/init.sql.gz` should stay unchecked unless the PR is explicitly producing a new fresh-volume snapshot.

### Change-type Evidence (supplementary)

The phase-level gates above are mandatory. The table below is a supplementary view of which evidence applies when work crosses phase boundaries (e.g. a Phase 3 backend domain PR that also adjusts a shared subpath export).

| Change type | Required evidence |
|---|---|
| Instruction-only Phase 0 | `git diff --check` + scoped diff review |
| Backend safety or service code | `npm run check:idor` + `npm run check:tenant-scope` + unsafe raw grep + `npm run dev:server` |
| Shared schema/export work | `npm run check:shared-root-imports` + `cd packages/shared && npm run build` + server/web builds |
| Prisma schema work | `npm run db:push` + `npx prisma generate` + `npm run db:3layer-setup` (when applicable) + shared build |
| Frontend route/component work | `npm run build --workspace=apps/web`; focused Vitest; browser QA for visual behavior |
| Dependency purge | `knip` after config + all affected workspace builds |

## Non-Goals

- No direct large-domain rewrite without a Phase 3B child plan that names the
  target files, internal layer layout, compatibility boundary, and verification
  commands.
- No schema changes in the constitution PR.
- No Drive bundle or dev data profile changes in the constitution PR.
- No broad import churn without a child plan and build gate.
- No direct pushes to `main`.

## Remaining Risks

- The existing scanner is a shell heuristic. It should block obvious raw SQL regressions, but it does not replace integration tests for tenant isolation.
- Some plans under `docs/superpowers/plans/` and specs under `docs/superpowers/specs/` predate the reconstruction constitution and may describe surfaces that have since been removed. **`ProductMemo` (Prisma model + web UI surfaces, hard-deleted in the PR #74–#76 wave on 2026-04-28) and `apps/server/src/ontology/**` (hard-deleted in PR #73 / Phase 1) are superseded** — historical plans and specs that mention them as active surfaces are kept for archive only and must not be used to re-introduce those surfaces. Treat this master plan plus the current `AGENTS.md` files (root and per-scope) as higher priority for new work.
- `packages/shared` subpath migration can create noisy diffs. Keep compatibility exports until each domain build proves migration.
- Removing frontend Prisma dependencies may expose hidden tooling usage in scripts or tests. Source grep and workspace builds must precede package removal.
