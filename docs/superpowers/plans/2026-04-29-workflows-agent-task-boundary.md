# Workflows / Agent-Task Boundary Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the Phase 3 backend tenant boundary for workflows and action-task without changing frontend, schema, shared exports, dependency cleanup, or executor public surface.

**Architecture:** Keep controllers as the only HTTP boundary and keep `companyId` sourced from `@CurrentCompany()`. Service reads and writes must bind tenant scope in the actual Prisma operation that observes or mutates tenant-owned rows. Workflow executor registry exports stay public and documented for now; this PR records the contract and leaves deletion/internalization to the Phase 5/workflow-contract lane.

**Tech Stack:** NestJS 11, Prisma 7, Vitest, real Postgres integration tests where present, repository RTK shell wrapper.

---

## Scope

Allowed implementation changes:

- `apps/server/src/workflows/**`
- `apps/server/src/action-task/**`
- `docs/superpowers/plans/2026-04-29-workflows-agent-task-boundary.md`

Allowed verification-gate repair:

- `apps/server/vitest.config.ts` and `apps/server/vitest.config.integration.ts` only if the required server Vitest commands cannot resolve existing `@kiditem/shared/*` subpath imports from the worktree-local source.

Read-only context:

- `apps/server/src/panel/**` only to confirm panel upsert call shape.
- `docs/superpowers/plans/2026-04-29-knip-dependency-purge.md` only for workflow executor contract context.

Out of scope:

- Phase 4 frontend companyId query/body cleanup.
- Phase 5 dependency purge and knip export cleanup.
- `SkipAuth` public API decisions.
- `apps/web`, `packages/shared`, `prisma`, dependency manifests, and DB snapshot changes.
- PR merge.

## Current Risk Map

| Surface | Current state | Risk | Required hardening |
| --- | --- | --- | --- |
| `WorkflowsController` | Uses `@CurrentCompany()` for all template/run endpoints. No `companyId` accepted via DTO/query. | Low. Existing frontend may still send company-ish query/body data elsewhere, but backend workflow DTOs do not trust it. | Keep controller shape; no frontend cleanup in this PR. |
| `WorkflowsService.findAll/findOne` | Reads bind `{ companyId }` or `{ id, companyId }`. | Low. | Keep as-is and rely on scanner/tests. |
| `WorkflowsService.update` | Pre-read uses `{ id, companyId }`, but final `workflowTemplate.update({ where: { id } })` writes by bare id. | Medium. A race or future refactor could turn the guarded pre-read into a confused-deputy write. Scanner also treats this as a Phase 3 violation. | Replace with scoped `updateMany({ where: { id, companyId } })`, throw on count 0, then return `findFirstOrThrow({ id, companyId })`. |
| `WorkflowsService.remove` | Pre-read uses `{ id, companyId }`, but final `workflowTemplate.delete({ where: { id } })` deletes by bare id. | Medium. Actual mutation lacks tenant predicate. | Fetch owned row for response compatibility, then `deleteMany({ where: { id, companyId } })`; throw if count is 0. |
| `WorkflowsService.triggerRun` | Template lookup is `{ id: templateId, companyId }`; run `companyId` comes from template; runner currently receives request `companyId`. | Low, but worth locking. | Test that run creation uses template-owned `companyId` and runner receives that same owned companyId, not an untrusted caller/body value. |
| `WorkflowsService.batchRun` | Owned templates are fetched with `{ id: { in }, companyId }`; run company comes from template map; runner batch receives request `companyId`. Because templates are already filtered to one company, values match today. | Low-to-medium future drift risk. | Test that each batch runner item uses the template ownership companyId. Implement from the existing `companyIdByTemplateId` map. |
| `findRuns/findRunDetail` | Template/run detail reads include companyId. | Low. | Keep existing IDOR tests. |
| `WorkflowRunnerService.runWorkflow` | Re-binds `{ templateId, companyId }` and `{ runId, companyId }`; all status/step writes use `updateMany({ id, companyId })`; executor config injects `template.companyId`. | Low. | Keep executor registry public; no deletion/internalization in this PR. |
| `ActionTaskController` | Uses `@CurrentCompany()` and `@CurrentUser()`; DTOs do not include `companyId`. | Low. | Keep controller shape. |
| `ActionTaskService.claim/unclaim/executeTask` | Actual writes use `updateMany({ id, companyId, ... })` or shared scoped helper. | Low. | Keep tests as boundary proof. |
| `ActionTaskService.updateTask` | Pre-read uses `{ id, companyId }`, but final `actionTask.update({ where: { id } })` writes by bare id. | Medium. Actual mutation lacks tenant predicate. | Route through `updateActionTaskOrThrow(id, companyId, data)`. |
| `ActionTaskService.addNote` | Pre-read uses `{ id, companyId }`, but final `actionTask.update({ where: { id } })` writes by bare id. | Medium. Actual mutation lacks tenant predicate. | Route through `updateActionTaskOrThrow(id, companyId, data)`. |
| Workflow executor registry exports | `getNodeDefinition`, `listNodeTypes`, `listNodeDefinitions`, and Standard* types are documented defer-contract symbols in the knip dependency purge plan. | Contract risk if removed as "unused." | Keep public surface unchanged; document that internalization/deletion belongs to a separate workflow contract / Phase 5 PR. |
| Server Vitest shared alias | `apps/server/vitest.config.ts` and `apps/server/vitest.config.integration.ts` alias `@kiditem/shared` to the root source file. Vite treats that as a prefix alias, so `@kiditem/shared/security` resolves to `index.ts/security` and the required action-task/workflow Vitest commands never start. | Medium verification risk. The gates cannot prove this PR unless existing shared subpath imports resolve. | Convert the aliases to exact root plus explicit subpath regexes. This is test configuration only, not a shared export or dependency cleanup. |

## Tasks

### Task 1: Write Failure-Mode Tests

**Files:**

- Modify: `apps/server/src/workflows/services/__tests__/workflow-flow.spec.ts`
- Modify: `apps/server/src/action-task/__tests__/action-task-flow.spec.ts`
- Modify: `apps/server/vitest.config.ts` and `apps/server/vitest.config.integration.ts` only if needed to make existing `@kiditem/shared/*` imports resolvable under Vitest.

- [ ] Add workflow tests proving template update uses `updateMany({ id, companyId })` and delete uses `deleteMany({ id, companyId })`.
- [ ] Add workflow trigger/batch assertions that runner companyId is derived from verified template ownership.
- [ ] Add action-task tests proving `updateTask` and `addNote` use the scoped `updateMany` helper and never call bare `update`.
- [ ] If Vitest cannot load existing shared subpath imports, repair the server test alias without touching `packages/shared`.
- [ ] Run `rtk proxy npx vitest run src/workflows src/action-task` from `apps/server` and confirm the new tests fail against the current implementation.

### Task 2: Harden Workflow Service Writes

**Files:**

- Modify: `apps/server/src/workflows/services/workflows.service.ts`

- [ ] Replace bare template update with scoped `updateMany` plus scoped reload.
- [ ] Replace bare template delete with scoped `deleteMany` after scoped row capture.
- [ ] Pass template-owned companyId into `runner.runWorkflow` and `runner.runBatch` items.
- [ ] Keep `triggerRun`, `batchRun`, `findRuns`, and `findRunDetail` cross-tenant behavior unchanged except for stronger ownership propagation.

### Task 3: Harden Action-Task Writes

**Files:**

- Modify: `apps/server/src/action-task/action-task.service.ts`

- [ ] Replace `updateTask` bare `actionTask.update({ id })` with `updateActionTaskOrThrow(id, companyId, data)`.
- [ ] Replace `addNote` bare `actionTask.update({ id })` with `updateActionTaskOrThrow(id, companyId, data)`.
- [ ] Keep `claim`, `unclaim`, and `executeTask` scoped-write behavior unchanged.

### Task 4: Verify and Publish

**Files:** no additional implementation edits unless checks expose an in-scope failure.

- [ ] Run `rtk npm run check:idor`.
- [ ] Run `rtk npm run check:tenant-scope`.
- [ ] Run `rtk npm run build --workspace=apps/server`.
- [ ] Run `rtk proxy npx vitest run src/workflows src/action-task` from `apps/server`.
- [ ] If real Postgres integration is available or touched, run DB setup and integration tests for `src/workflows src/action-task`.
- [ ] Run `rtk npm run dev:server` and confirm Nest boots without DI errors.
- [ ] Run `rtk git diff --check`.
- [ ] Commit docs first as `docs: plan workflows agent-task boundary rewrite`.
- [ ] Commit implementation as `refactor: harden workflows agent-task boundary`.
- [ ] Push the branch and open a PR titled `refactor: harden workflows agent-task boundary`; do not merge.

## PR Body Notes

Include:

- Change summary.
- Workflow/template/run/action-task tenant risk map.
- Reason executor contract stays public.
- Out-of-scope items including Phase 4 frontend companyId query cleanup, Phase 5 dependency purge, knip export cleanup, auth `SkipAuth`, and schema/shared/web changes.
- Verification commands and results.
- Explicit statement that DB/schema/init.sql.gz did not change.
