# Phase 5 Knip Dependency Purge — Foundation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to execute the follow-up purge PRs task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **This foundation PR itself does not delete dependencies or code.**

**Goal:** Stabilize the `knip` report so every remaining finding is actionable, classify the residual export and dependency surface against the [Knip Export Risk Map](2026-04-29-knip-export-risk-map.md) and the [Codebase Reconstruction Master Plan](2026-04-28-codebase-reconstruction.md), and define an ordered, evidence-driven sequence of follow-up purge PRs.

**Architecture:** The foundation PR adds explicit `ignoreBinaries` / `ignoreDependencies` lists to `knip.jsonc` for known false positives (npm-workspace-hoisted script binaries and required upstream peer dependencies), records the verified contract surface that must not be deleted, and lists the genuine removal candidates plus the procedure to confirm each one before any future purge PR removes a `package.json` entry.

**Tech Stack:** `knip@^6`, npm workspaces, `@kiditem/shared`, NestJS 11, Next.js 16, `@copilotkit/runtime`, `recharts`, `@testing-library/react`, `@nestjs/cli`, `tsup`, `tsx`, `tailwindcss`.

---

## Context

### Master Plan Position

This plan owns **Phase 5 — Dead Code / Dependency Purge** of the [Codebase Reconstruction Master Plan](2026-04-28-codebase-reconstruction.md#phase-5-dead-code--dependency-purge). The master plan explicitly forbids removing dependencies until gates are trustworthy enough to distinguish unused code from generated artifacts. It also forbids touching `prisma/**` or `init.sql.gz` from a Phase 5 PR.

### Earlier Plans

- [`2026-04-29-knip-baseline.md`](2026-04-29-knip-baseline.md) — original baseline at 33 unused files, 80 export values, 97 types, 12 unused dependency packages. Stale snapshot — many findings have since been resolved by PR #95 (unused files), PR #96 (web exports), PR #98 (server exports).
- [`2026-04-29-knip-export-risk-map.md`](2026-04-29-knip-export-risk-map.md) — current classification of the **export** surface. Documents 11 `defer-contract` symbols (auth `SkipAuth`, workflow executor registry accessors, workflow standard entity types). Broad export cleanup is **complete** at the current baseline.

### Current Baseline (origin/main `b94317b`)

Command: `npm run knip:report` (which runs `knip --no-exit-code --no-progress --reporter compact`).

**Before this PR's config additions** the report shows 11 distinct false-positive lines and 3 actionable lines mixed together:

```
Unused dependencies (2)
apps/server/package.json: @langchain/core
apps/web/package.json: react-is
Unused devDependencies (4)
apps/server/package.json: @nestjs/cli, eslint, prisma
apps/web/package.json: @testing-library/dom, eslint, tsx
package.json: @types/better-sqlite3, better-sqlite3, concurrently, react, tsx
packages/templates/package.json: @tailwindcss/cli, tsx
Unlisted binaries (5)
apps/server/package.json: nest, eslint, vitest
apps/web/package.json: next, eslint, vitest
package.json: prisma, concurrently, knip, tsx
packages/shared/package.json: tsup, tsc
packages/templates/package.json: tsup, tailwindcss, tsc, tsx
Unused exports (2)
apps/server/src/auth/decorators/skip-auth.decorator.ts: SkipAuth
apps/server/src/workflows/executors/index.ts: getNodeDefinition, listNodeTypes, listNodeDefinitions
Unused exported types (1)
apps/server/src/workflows/executors/types.ts: StandardOrder, StandardProduct, StandardInventory, StandardAd, StandardProfitLoss, StandardReview, StandardThumbnail
```

**After this PR's config additions** the report collapses to the three contract surfaces from the export risk map plus a single dependency line:

```
Unused devDependencies (1)
package.json: react
Unused exports (2)
apps/server/src/auth/decorators/skip-auth.decorator.ts: SkipAuth
apps/server/src/workflows/executors/index.ts: getNodeDefinition, listNodeTypes, listNodeDefinitions
Unused exported types (1)
apps/server/src/workflows/executors/types.ts: StandardOrder, StandardProduct, StandardInventory, StandardAd, StandardProfitLoss, StandardReview, StandardThumbnail
```

Every remaining line is either a documented `defer-contract` symbol (export risk map) or a verified removal candidate (`react` in the root devDependencies — see [Removal Candidates](#removal-candidates)).

## False-Positive Classification

Every false positive falls into one of two patterns. Both are direct consequences of how knip 6 sees an npm-workspaces monorepo, and neither is a code defect.

### A. Workspace-hoisted script binaries

`package.json` `scripts` invoke a binary by name (`nest build`, `next dev`, `eslint src/`). With npm workspaces the binary lives in the root `node_modules/.bin/` even when the providing package is declared in a child workspace. Knip cannot resolve the binary back through the hoist boundary and reports two findings simultaneously:

- `Unlisted binaries: <binary>`
- `Unused devDependencies: <providing package>`

Suppression strategy in `knip.jsonc`:

| Workspace | `ignoreBinaries` | `ignoreDependencies` |
| --- | --- | --- |
| `.` | `uv`, `prisma`, `concurrently`, `knip`, `tsx` | `concurrently`, `tsx` |
| `apps/server` | `nest`, `eslint`, `vitest` | `@nestjs/cli`, `eslint`, `prisma` |
| `apps/web` | `next`, `eslint`, `vitest` | `eslint` |
| `packages/shared` | `tsup`, `tsc` | — |
| `packages/templates` | `tsup`, `tsc`, `tailwindcss`, `tsx` | `@tailwindcss/cli`, `tsx` |

Each entry is justified by a script in the same `package.json` that invokes the binary. The `uv` ignore is the existing entry — the npm package `uv` is unrelated to the Python `uv` CLI used by `agents/`.

### B. Required peer dependencies that are not directly imported

A consumer must declare an upstream package's non-optional peer dependency, even when no source file in the consumer imports from it. Knip then reports the package as unused. Suppression with `ignoreDependencies`:

| Workspace | Package | Required by |
| --- | --- | --- |
| `apps/server` | `@langchain/core` | `@copilotkit/runtime` (non-optional peer, `>=0.3.66`) |
| `apps/web` | `react-is` | `recharts` (non-optional peer, `^16.8.0 \|\| ^17.0.0 \|\| ^18.0.0 \|\| ^19.0.0`) |
| `apps/web` | `@testing-library/dom` | `@testing-library/react` (non-optional peer, `^10.0.0`) |

These are verified by reading each upstream package's `peerDependencies` and `peerDependenciesMeta` blocks. None of these packages appear in `peerDependenciesMeta` as `optional`, so they are required.

## Contract Symbols (do not delete)

These come from [`2026-04-29-knip-export-risk-map.md`](2026-04-29-knip-export-risk-map.md). Treat each as a documented public/contract surface and leave them visible in the knip report — do **not** add them to any `ignoreExportsUsedInFile` or other suppression. Removal must come from a domain owner, not a generic dependency cleanup.

| Path | Symbols | Bucket | Reason |
| --- | --- | --- | --- |
| `apps/server/src/auth/decorators/skip-auth.decorator.ts` | `SkipAuth` | `defer-contract` | Documented public auth decorator. `apps/server/src/auth/CLAUDE.md` describes `@SkipAuth()` as the route-level public-API helper even though the runtime guard imports only `SKIP_AUTH_KEY`. Removing it is an auth API decision, not a dead-code sweep. |
| `apps/server/src/workflows/executors/index.ts` | `getNodeDefinition`, `listNodeTypes`, `listNodeDefinitions` | `defer-contract` | Workflow executor registry introspection accessors. Currently unused by code but form the documented dynamic-catalog surface. Removal belongs to the workflow executor/schema redesign. |
| `apps/server/src/workflows/executors/types.ts` | `StandardOrder`, `StandardProduct`, `StandardInventory`, `StandardAd`, `StandardProfitLoss`, `StandardReview`, `StandardThumbnail` | `defer-contract` | Workflow standard data shapes that document executor output entities. Removal belongs to the workflow executor/schema redesign. |

Out of scope for this lane: any change to `apps/server/src/auth/`, `apps/server/src/workflows/executors/`, or `apps/server/src/workflows/services/`. A workflow contract child plan must precede those edits.

## Removal Candidates

The following entries remain real removal candidates after the false-positive sweep. They are tracked here, not removed in this PR.

### Root `package.json`

| Candidate | Type | Evidence to verify before removal |
| --- | --- | --- |
| `react` | `devDependencies` | Knip reports it as unused at root; no `scripts/**` or `prisma/**` source file imports `react`. Confirm via `rg -n "from ['\"]react['\"]" scripts prisma extensions` returning no hit. The `apps/web` and `packages/templates` workspaces declare their own React. |
| `@types/better-sqlite3` | `devDependencies` | No `import` of `better-sqlite3` anywhere in `apps/`, `packages/`, `scripts/`, or `agents/`. Knip currently treats it as resolved through the installed `node_modules/`, but the package.json declaration is unused. |
| `better-sqlite3` | `devDependencies` | Same evidence trail as `@types/better-sqlite3`. Removing the runtime package and the type package together avoids type-only orphan declarations. |

### `apps/web/package.json`

| Candidate | Type | Evidence to verify before removal |
| --- | --- | --- |
| `tsx` | `devDependencies` | `apps/web/package.json` declares `tsx` but no `apps/web` script invokes it. Root `tsx` covers the `data:dev:*` and `import:product-baseline` scripts. Confirm with `rg -n "tsx " apps/web/package.json` showing only the dependency line. The package can be removed once the `apps/web` build is re-confirmed without it. |

### Frontend Prisma footprint

The master plan flags frontend Prisma dependency removal as a future PR. **Investigation result for this baseline:**

- `apps/web/package.json` does **not** declare `@prisma/client`, `@prisma/adapter-pg`, `prisma`, or `pg`. The frontend package boundary is already clean.
- `packages/shared/package.json` does **not** declare `@prisma/client` or any other Prisma/Postgres package.
- `rg -n "@prisma" apps/web` and `rg -n "from ['\"]pg['\"]" apps/web` both return no source imports.
- `rg -n "@prisma/client" packages/shared/src` returns no source imports.

The remaining Prisma surface is:

- Root `devDependencies`: `@prisma/adapter-pg`, `@prisma/client`, `prisma` — required by `prisma generate`, `prisma/**` model files, `prisma.config.ts`, and `scripts/dev-data.ts`.
- `apps/server/dependencies`: `@prisma/adapter-pg`, `@prisma/client` — required by `apps/server/src/prisma/prisma.service.ts` and the entire backend domain layer.
- `apps/server/devDependencies`: `prisma` — provides the `prisma` CLI used during postinstall and migrations.

**Conclusion:** the "frontend must not depend on Prisma" rule is satisfied at the manifest level. There is no frontend Prisma dependency to remove. Leave a note in this plan and move on; do not invent a Prisma-removal task on the web side.

### Frontend Prisma re-investigation procedure (for the next agent)

If a future change reintroduces a frontend Prisma dependency, run the same procedure to confirm before any removal:

```bash
# 1. Manifest-level check: declared deps
rg -n "@prisma|^\s*\"pg\"" apps/web/package.json packages/shared/package.json packages/templates/package.json

# 2. Source-level check: any direct import
rg -n "@prisma/client|@prisma/adapter|from ['\"]pg['\"]|new PrismaClient|require\\(['\"]@prisma/client['\"]\\)" apps/web/src apps/web/test packages/shared/src packages/templates/src

# 3. Build-level check: production bundle does not link Prisma
DATABASE_URL=postgresql://kiditem:kiditem@localhost:5433/kiditem npm run build --workspace=apps/web

# 4. After build, grep the Next.js output for accidental linkage
rg -n "PrismaClient|@prisma/client" apps/web/.next 2>/dev/null | head
```

Steps 1–2 must return no hits; step 4 should return only generator/tooling artifacts, never an actual `PrismaClient` constructor call.

## Suggested Purge PR Order

The foundation PR (this one) is PR-0. Subsequent purge PRs should land in this order, each with the gates listed below.

1. **PR-0 (this PR) — `refactor/knip-dependency-foundation`** — write this plan, configure `knip.jsonc` with the false-positive ignore lists, verify builds. No package removal, no source code change outside `knip.jsonc` and this plan.
2. **PR-1 — Root devDependency purge.** Remove `react` from root `devDependencies`. Optionally remove `@types/better-sqlite3` + `better-sqlite3` together if step-by-step verification (below) confirms no consumer. Run all three workspace builds plus `npm run knip:report`.
3. **PR-2 — `apps/web` `tsx` removal.** Drop `tsx` from `apps/web/package.json` `devDependencies`. Re-run `npm run build --workspace=apps/web` and `apps/web` Vitest.
4. **PR-3 — Workflow executor contract decision (out of this Phase 5 lane).** Decide whether `getNodeDefinition`, `listNodeTypes`, `listNodeDefinitions`, and `Standard*` types remain part of the workflow public surface or move to internal. Owned by the workflows domain plan, not by Phase 5.
5. **PR-4 — Auth `SkipAuth` decision (out of this Phase 5 lane).** Either keep `SkipAuth` as the documented route decorator and update call sites, or replace docs and the test usage with the narrower metadata helper. Owned by the auth domain plan.

PR-1 and PR-2 can run in parallel. PR-3 and PR-4 must come from their respective domain owners with their own child plans; this Phase 5 lane does not touch them.

## Master Task List

Each task below is a step that lands as part of **PR-0 (this PR)**. PR-1 onward live in their own child plans.

### Task 1: Capture pre-config knip baseline

**Files:** read-only.

- [ ] Confirm the worktree is at `origin/main` baseline `b94317b` or descendant:

```bash
git rev-parse HEAD
git rev-parse origin/main
git log -1 --oneline
```

- [ ] Run knip without local node_modules to capture the raw 14-line baseline (use `npm exec --package=knip@<version>` if `node_modules/.bin/knip` is missing):

```bash
DATABASE_URL=postgresql://kiditem:kiditem@localhost:5433/kiditem npm run knip:report
```

Expected: 14 findings (`Unused dependencies (2)`, `Unused devDependencies (4)`, `Unlisted binaries (5)`, `Unused exports (2)`, `Unused exported types (1)`).

- [ ] Save the output to `/tmp/knip-baseline.txt` for diffing in Task 4.

### Task 2: Source-grep verification

**Files:** read-only.

- [ ] Confirm peer dependency claims:

```bash
rg -n "react-is" /Users/yhc125/workspace/kiditem/node_modules/recharts/package.json
rg -n "@testing-library/dom" /Users/yhc125/workspace/kiditem/node_modules/@testing-library/react/package.json
rg -n "@langchain/core" /Users/yhc125/workspace/kiditem/node_modules/@copilotkit/runtime/package.json
```

Expected: each upstream package lists the candidate in `peerDependencies` without an `optional: true` entry in `peerDependenciesMeta`.

- [ ] Confirm no production source imports the contract symbols outside their declaring file:

```bash
rg -n "SkipAuth" apps/server/src
rg -n "getNodeDefinition|listNodeTypes|listNodeDefinitions" apps/server/src
rg -n "Standard(Order|Product|Inventory|Ad|ProfitLoss|Review|Thumbnail)" apps/server/src
```

Expected: each grep returns only the declaration file plus documentation/tests, never an actual application import.

- [ ] Confirm the frontend Prisma boundary is clean (matches the [Frontend Prisma footprint](#frontend-prisma-footprint) section):

```bash
rg -n "@prisma|from ['\"]pg['\"]" apps/web packages/shared/src packages/templates/src
```

Expected: no hit anywhere in the listed paths.

### Task 3: Add knip false-positive ignores to `knip.jsonc`

**Files:**

- Modify: `knip.jsonc`

- [ ] For each workspace, append `ignoreBinaries` for hoisted script binaries and `ignoreDependencies` for the verified peer + script-bin packages exactly as listed in the [False-Positive Classification](#false-positive-classification) tables.

- [ ] Add a comment block above each `ignoreBinaries`/`ignoreDependencies` entry that records:
  - Which script invokes the binary, OR
  - Which upstream package requires the peer.

- [ ] Do **not** add any `ignoreDependencies` entry for `react`, `@types/better-sqlite3`, `better-sqlite3`, or `apps/web` `tsx`. They must remain visible to drive PR-1 and PR-2.

- [ ] Do **not** add any export/type ignores. The export risk map is the authoritative classification for those symbols and the report should keep showing them until their owner-domain decisions land.

### Task 4: Verify the post-config knip output

**Files:** read-only.

- [ ] Re-run the report:

```bash
DATABASE_URL=postgresql://kiditem:kiditem@localhost:5433/kiditem npm run knip:report
```

Expected output:

```
Unused devDependencies (1)
package.json: react
Unused exports (2)
apps/server/src/auth/decorators/skip-auth.decorator.ts: SkipAuth
apps/server/src/workflows/executors/index.ts: getNodeDefinition, listNodeTypes, listNodeDefinitions
Unused exported types (1)
apps/server/src/workflows/executors/types.ts: StandardOrder, StandardProduct, StandardInventory, StandardAd, StandardProfitLoss, StandardReview, StandardThumbnail
```

If `@types/better-sqlite3` or `better-sqlite3` reappear when running without local `node_modules`, that is acceptable for this PR — the row is exposed by the npm-workspace hoisting view and remains a valid PR-1 candidate. Do not add them to ignore lists.

- [ ] If anything else reappears (a new "Unused dependencies" line, or any "Unlisted binaries" line), stop and reclassify before merging. The expected post-config report is the merge gate, not just a sanity check.

### Task 5: Verify the workspace builds

**Files:** read-only.

- [ ] Run all three workspace builds in sequence (each with the `DATABASE_URL` shim where required by `prisma.config.ts`):

```bash
cd packages/shared && npm run build && cd -
DATABASE_URL=postgresql://kiditem:kiditem@localhost:5433/kiditem npm run build --workspace=apps/server
DATABASE_URL=postgresql://kiditem:kiditem@localhost:5433/kiditem npm run build --workspace=apps/web
```

Expected: each build prints success output. `apps/server` ends in `nest build` succeeding (no missing module errors). `apps/web` ends in the Next.js production page table without errors. The `Detected additional lockfiles` warning from Next.js is a worktree artifact and is acceptable.

- [ ] Verify diff hygiene:

```bash
git diff --check
```

Expected: clean exit.

### Task 6: Commit and open PR

**Files:**

- Modify: `knip.jsonc`
- Create: `docs/superpowers/plans/2026-04-29-knip-dependency-purge.md`

- [ ] Stage the two files explicitly (no `git add .`):

```bash
git add docs/superpowers/plans/2026-04-29-knip-dependency-purge.md
git commit -m "docs: plan knip dependency purge"
git add knip.jsonc
git commit -m "build: configure knip baseline"
```

- [ ] Push the `refactor/knip-dependency-foundation` branch and open the PR against `main` using a heredoc body:

```bash
git push -u origin refactor/knip-dependency-foundation
gh pr create --base main --title "build: stabilize knip baseline + plan Phase 5 dependency purge foundation" --body "$(cat <<'EOF'
## Summary
- Add `ignoreBinaries` / `ignoreDependencies` to `knip.jsonc` for npm-workspace-hoisted script binaries (nest, next, eslint, vitest, tsup, tsc, tailwindcss, tsx, prisma, concurrently, knip) and verified non-optional peer dependencies (`@langchain/core`, `react-is`, `@testing-library/dom`).
- Plan Phase 5 dependency purge in `docs/superpowers/plans/2026-04-29-knip-dependency-purge.md`, anchoring the next purge PR order against the export risk map and the codebase reconstruction master plan.

## Out of scope (intentionally not in this PR)
- No dependency removal from any `package.json`.
- No production code deletion.
- No `SkipAuth`, workflow executor, or workflow standard-entity edits — those are owner-domain decisions tracked in the export risk map.
- No `prisma/**` change, no `init.sql.gz` change, no schema/migration change.

## Verification
- `npm run knip:report`: PASS, output collapses to one residual `Unused devDependencies` line plus the three documented `defer-contract` exports.
- `cd packages/shared && npm run build`: PASS.
- `npm run build --workspace=apps/server`: PASS.
- `npm run build --workspace=apps/web`: PASS.
- `git diff --check`: PASS.

## DB / schema / init.sql.gz
- No schema changes.
- No `init.sql.gz` changes.
EOF
)"
```

- [ ] Report only the PR URL plus the four verification command outcomes back to the requester. Do not merge.

## Verification Gates (PR-level)

These are the merge gates for **PR-0 (this PR)**. Match the [master plan's Phase 5 gates](2026-04-28-codebase-reconstruction.md#per-phase-merge-gates) plus the change-type evidence rule.

- `npm run knip:report` returns the exact 4-line post-config report shown in [Task 4](#task-4-verify-the-post-config-knip-output).
- `cd packages/shared && npm run build` exits 0.
- `npm run build --workspace=apps/server` exits 0.
- `npm run build --workspace=apps/web` exits 0.
- `git diff --check` exits 0.
- `git status` reports only the two intentionally modified paths: `docs/superpowers/plans/2026-04-29-knip-dependency-purge.md` (new) and `knip.jsonc` (modified).

`prisma/**`, `init.sql.gz`, schema generation, and dev-data bundles are explicitly **not** part of this PR's gate set.

## Non-Goals

- No dependency removal. Even verified candidates wait for PR-1 and PR-2.
- No source code deletion (no `SkipAuth`, no workflow executor index/types changes, no service/controller edits).
- No expansion of `@kiditem/shared` exports.
- No `prisma/**` edits.
- No `init.sql.gz` regeneration.
- No new dependencies added.
- No `knip --fix` invocation. Knip's autofix can drop documented contract symbols silently and is banned by the master plan.

## Remaining Risks

- Knip's view of "unused" depends on whether local `node_modules` is present at run time. The `npm exec --package=knip@<version>` execution path may surface entries that the local-node_modules path resolves transitively (notably `@types/better-sqlite3` and `better-sqlite3`). The follow-up PR-1 must source-grep before removing these, not rely on knip alone.
- The `prisma` script binary is provided by both root and `apps/server` devDependencies. PR-1 may consider de-duplicating to root-only, but only after confirming `apps/server` postinstall and `nest build` still resolve `prisma` through workspace hoisting.
- `@nestjs/schematics` is referenced from `apps/server/nest-cli.json` rather than imported. Knip currently treats it as resolved because `nest-cli.json` is listed as an entry. If a future knip upgrade stops parsing JSON references, add `@nestjs/schematics` to `apps/server` `ignoreDependencies` with the same justification pattern used for `@nestjs/cli`.
- The `Detected additional lockfiles` warning from `apps/web` Next.js build appears because the worktree carries its own `package-lock.json`. It is informational and does not affect correctness.
