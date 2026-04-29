# Phase 3B Lane A — AI Thumbnail Generation Lifecycle Layer

**Owner domain:** `apps/server/src/ai`
**Master plan:** [`2026-04-28-codebase-reconstruction.md`](2026-04-28-codebase-reconstruction.md) (Phase 3B priority 2)
**Handoff:** [`2026-04-29-reconstruction-current-handoff.md`](2026-04-29-reconstruction-current-handoff.md)
**Branch:** `refactor/ai-thumbnail-generation-layer`

> **Status (2026-04-29):** transitional split landed; topology converged in `refactor/ai-thumbnail-contract-topology`. The `persistence/`, `read-models/`, `mappers/` waypoints described below were placeholders — production paths now live under [`2026-04-29-backend-architecture-contract.md`](2026-04-29-backend-architecture-contract.md) target topology:
>
> - `apps/server/src/ai/persistence/thumbnail-generation.persistence.ts` → [`apps/server/src/ai/adapter/out/prisma/thumbnail-generation.persistence.ts`](../../../apps/server/src/ai/adapter/out/prisma/thumbnail-generation.persistence.ts)
> - `apps/server/src/ai/read-models/thumbnail-generation-read-model.ts` → [`apps/server/src/ai/adapter/out/prisma/thumbnail-generation.query.ts`](../../../apps/server/src/ai/adapter/out/prisma/thumbnail-generation.query.ts)
> - `apps/server/src/ai/mappers/thumbnail-generation.mapper.ts` → [`apps/server/src/ai/mapper/thumbnail-generation.mapper.ts`](../../../apps/server/src/ai/mapper/thumbnail-generation.mapper.ts)
> - `apps/server/src/ai/domain/thumbnail-generation-inputs.ts` (unchanged)
>
> The orchestrator service `apps/server/src/ai/services/thumbnail-generation.service.ts` stays in `services/` for now (transitional). A future PR moves it to `application/service/` once a related slice change makes the move cohesive. Sections below describe the historical split layout — read them as context, but the **contract topology is the active rule**.

## Goal

Reduce `apps/server/src/ai/services/thumbnail-generation.service.ts` from a fat service that mixes Prisma include presets, write transactions, mappers, and pure parsers into a use-case orchestrator that delegates each responsibility to focused modules. This is structural production-code improvement; tests and docs are evidence, not the deliverable.

## Scope

In scope (this PR):

- `apps/server/src/ai/services/thumbnail-generation.service.ts` (slim down)
- new `apps/server/src/ai/domain/thumbnail-generation-inputs.ts` (pure helpers)
- new `apps/server/src/ai/mappers/thumbnail-generation.mapper.ts` (`toItem` and registration mapping)
- new `apps/server/src/ai/read-models/thumbnail-generation-read-model.ts` (Prisma include presets, master lookup, list/findOne queries)
- new `apps/server/src/ai/persistence/thumbnail-generation.persistence.ts` (saveEditorResult write, applyGeneration tx, replaceGenerationResult tx, scoped lifecycle mutations)
- `apps/server/src/ai/__tests__/thumbnail-generation.service.spec.ts` (delete or slim where it only mock-asserted private wiring; keep tenant-relevant assertions)

Out of scope (forbidden in this lane):

- `thumbnail-vision-ai.service.ts`, `thumbnail-analysis.service.ts`, other large AI services
- Frontend, `packages/shared`, `prisma/`
- Public route or response contract changes (`/api/thumbnail-editor/*`, `/api/thumbnail-analysis/*`, `/api/thumbnail-auto/*`)
- New Nest providers (read-model and persistence are plain function modules taking `prisma` as a parameter — keeps `ai.module.ts` untouched)

## Public compatibility (must not change)

- `findAll(companyId, opts)` shape (`ThumbnailGenerationListResponse`)
- `findOne(id, companyId)` shape (`ThumbnailGenerationItem`)
- `saveEditorResult(input)` returning `string` (generation id) and persisting candidates+inputImages relation rows
- `selectCandidate / applyGeneration / skipGeneration / deleteGeneration / removeCandidate`
- `createEditJobs / reEditJob / createAutoBatch` external behavior, including the active-job dedupe, master tenant-ownership scoping, candidate/input-image relation filtering, and master summary loading
- `findProductForEditor(productId, companyId)` for `ThumbnailEditorController`

## Target file map and moved responsibility

| Responsibility | Source location (today) | New location |
|---|---|---|
| Pure recompose-kind probe (`findRecomposeKindIn`, `extractRecomposeKind`, `isRecomposeKind`) | `thumbnail-generation.service.ts` private methods | `ai/domain/thumbnail-generation-inputs.ts` |
| Pure edit-suggestion extractor (`extractEditSuggestions`) | private | `ai/domain/thumbnail-generation-inputs.ts` |
| Pure analysis-shape adapters (`toEditAnalysis`, `toAnalysisContextJson`) | private | `ai/domain/thumbnail-generation-inputs.ts` |
| Pure input-role / edit-case mapping (`toInputRole`, `inferEditCaseFromInputs`, `variantInstruction`) | private | `ai/domain/thumbnail-generation-inputs.ts` |
| Status / phase / registration-status normalization (`toRegistrationStatus`, `registrationCheckedAt`, allowed-status filter) | private + `ALLOWED_STATUSES`/`ALLOWED_PHASES` | `ai/mappers/thumbnail-generation.mapper.ts` |
| `toItem(...)` row → `ThumbnailGenerationItem` | private | `ai/mappers/thumbnail-generation.mapper.ts` |
| `generationInclude`, `INPUT_IMAGES_INCLUDE`, `CANDIDATES_INCLUDE`, `THUMBNAIL_ANALYSIS_SELECT`, `thumbnailAnalysesInclude` | top-level constants | `ai/read-models/thumbnail-generation-read-model.ts` |
| `findAll` query, `findOne` query, master summary loading (`findGenerationMaster`, `findGenerationMasters`), `findProductForEditor`, `loadJobMasterContext` | service methods | `ai/read-models/thumbnail-generation-read-model.ts` |
| `saveEditorResult` create-relation write | service method | `ai/persistence/thumbnail-generation.persistence.ts` |
| `selectCandidate` / `applyGeneration` / `skipGeneration` / `deleteGeneration` / `removeCandidate` lifecycle writes | service methods | `ai/persistence/thumbnail-generation.persistence.ts` |
| Background edit-job state machine: lock-running, replace-result, fail-running | service private methods | `ai/persistence/thumbnail-generation.persistence.ts` |
| `createEditJobs` create-pending insert + active-job dedupe | service method | persistence + read-model split, orchestrated by service |

The service keeps:

- DI on `PrismaService`, `ThumbnailEditorAiService`, `ThumbnailTrackingService`
- `Logger`, `assertProductOwned` orchestration
- All public method signatures listed above
- `scheduleEditJob` / `processEditJob` orchestration that wires read-model → editor AI → persistence
- `createAutoBatch` cooldown loop (uses read-model + service-level `createEditJobs`)
- Tracking side effect on `applyGeneration`

## Why function modules over Nest providers

`ai.module.ts` is already crowded (12 providers). Adding 4 new providers would force `ai.module.ts` to grow alongside any concurrent reconstruction lane. Plain function modules taking `prisma: PrismaService | Prisma.TransactionClient` mirror the advertising lane's `read-models/` and `persistence/` (e.g., `findScopedAdListings(prisma, companyId, ...)` and `approveAdActions(tx, ids, companyId)`), keep `ai.module.ts` unchanged in this PR, and avoid generic-repository drift. Tenant scope stays explicit in every signature.

## Test cleanup rationale

Today's spec is at `apps/server/src/ai/__tests__/thumbnail-generation.service.spec.ts` (~410 lines). Its assertions split into:

1. **Tenant scope on master lookup** (`saveEditorResult` rejects when `masterProduct.findFirst` returns `null`; `findAll` uses scoped master lookup, not include relation data) — keep. These are operating-critical IDOR checks per [`docs/TESTING.md`](../../TESTING.md).
2. **Persistence relation shape** (`saveEditorResult` writes candidates+inputImages as relation rows) — keep, but rewire to the persistence module so the assertion targets the new boundary directly.
3. **`processEditJob` prompt routing assertion** (recompose kind + edit suggestions reach `editorAi.generateEdit`) — keep. This is the pure-helper contract that `domain/thumbnail-generation-inputs.ts` now owns; the test doubles as a public-behavior gate that recompose+suggestions still flow through.
4. **`createEditJobs` returns pending without calling Gemini** — keep. Public-behavior contract.
5. **`createAutoBatch` keeps `method=auto`** — keep. Public-behavior contract on the auto cohort path.

Nothing in this spec is a pure file-move check, so the spec stays. Internal spies on `scheduleEditJob` survive because the service still owns the scheduling boundary; only the prisma access path moves.

No new mock specs are added for the helpers under `domain/`. Their behavior is observed through the existing `processEditJob` test plus build/typecheck. Following [`docs/TESTING.md`](../../TESTING.md), implementation-detail mock tests for file moves are explicitly avoided.

## Measurable LOC improvement (target)

`thumbnail-generation.service.ts` today is 959 lines. Target after refactor: under 600 lines (≥ 35% reduction), with the moved responsibilities living in:

- `domain/thumbnail-generation-inputs.ts` — small (target ≤ 150 lines)
- `mappers/thumbnail-generation.mapper.ts` — small (target ≤ 100 lines)
- `read-models/thumbnail-generation-read-model.ts` — moderate (target ≤ 200 lines)
- `persistence/thumbnail-generation.persistence.ts` — moderate (target ≤ 250 lines)

Final LOC numbers and the before/after line count are recorded in the PR body.

## Verification gates

Per [`2026-04-28-codebase-reconstruction.md`](2026-04-28-codebase-reconstruction.md) Phase 3B row:

```bash
rtk npm run check:idor
rtk npm run check:tenant-scope
rtk proxy sh -lc 'cd apps/server && npx vitest run src/ai/__tests__/thumbnail-generation.service.spec.ts'
rtk proxy sh -lc 'cd apps/server && npx vitest run src/ai'
rtk npm run build --workspace=apps/server
rtk npm run dev:server
rtk git diff --check
```

`dev:server` must reach `Server running on http://localhost:4000` to confirm the AI module DI graph still resolves after the file split.

## Non-goals

- No expansion of `@kiditem/shared/ai` exports.
- No Nest provider additions in `ai.module.ts`.
- No public route or response contract changes.
- No follow-up TODOs left in source — every responsibility called out in this plan moves in this PR.
