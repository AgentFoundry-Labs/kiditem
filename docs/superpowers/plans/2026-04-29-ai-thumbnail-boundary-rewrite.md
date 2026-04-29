# AI Thumbnail Boundary Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the Phase 3 backend tenant boundary for AI thumbnail analysis, generation, recomposition, and Wing registration without touching frontend, shared contracts, Prisma schema, or other business domains.

**Architecture:** Keep this as an AI-domain service/query cleanup. Controllers continue to receive `companyId` from `@CurrentCompany()` and services enforce ownership before external image/AI work or database mutation. Tenant-owned relation data is loaded through company-scoped queries or tenant-filtered to-many includes instead of trusting bare relation includes.

**Tech Stack:** NestJS 11, Prisma 7, Vitest, Google GenAI adapter services, `rtk` command wrapper.

---

## Scope

- Modify only `apps/server/src/ai/**` and this child plan.
- Do not modify `apps/web`, `packages/shared`, `prisma`, dependency manifests, or non-AI backend domains.
- Do not change thumbnail frontend editor decomposition, dependency purge work, or PR merge state.

## Current Risk Map

| Area | Current risk | Failure mode | Target hardening |
|---|---|---|---|
| `ThumbnailGenerationService.saveEditorResult` | Creates `ThumbnailGeneration` with `{ companyId, masterId }` but does not prove `masterId` belongs to `companyId` inside the service. | A direct or future caller can persist a generation for another tenant's `MasterProduct` before any AI/editor result is recorded. | Add a service-level ownership check before create. Test that a missing scoped master throws and no generation row is created. |
| `ThumbnailGenerationService` list/read/apply/re-edit/job paths | `GENERATION_INCLUDE` loads `candidates`, `registrationAttempts`, and `master` without tenant filters. | If inconsistent child rows or a generation-to-master mismatch exists, API responses or background jobs can mix cross-tenant relation data after a scoped generation read. | Use company-filtered to-many includes for candidates/input images/registration attempts and load master summaries with a separate `{ id in ..., companyId }` query. Background edit jobs fetch the master through `masterProduct.findFirst({ id, companyId })`. |
| `ThumbnailAnalysisService.findAllWithAnalysis` | `thumbnailAnalysis.findMany({ where: { companyId }, include: { master } })` trusts the to-one master relation. | An inconsistent analysis row can render another company's master name/image into the caller's analysis list. | Load caller-owned masters separately and map analyses only through the scoped master map. |
| `ThumbnailAnalysisService.analyzeProduct` and `preInspect` | Product ownership is checked first, but `MasterProduct.images` relation presets are not company-filtered and the upsert response re-includes master. | Inconsistent `MasterProductImage` rows can influence AI input selection, or relation include can rehydrate unscoped master data after mutation. | Add a company-aware image select helper and return results using the already scoped master row. |
| `ThumbnailRecomposeService.classify` | Master is scoped, but image relation preset is not company-filtered. | Cross-company `MasterProductImage` rows attached to the master can be sent to vision classification. | Use the company-aware image select helper. |
| `ThumbnailWingService.registerToWing` | Generation is scoped, but candidate/master/listing relation data is loaded without tenant filters and registration attempt is created before scoped master/listing ownership is confirmed. | Wing automation can use another tenant's selected candidate/listing name in inconsistent data states, and can create an attempt before all tenant-owned resources are verified. | Filter generation candidates by company, load the master/listing via scoped queries before creating the registration attempt, and filter attempts by company on verification. |
| `ThumbnailVisionAiService` / `ThumbnailEditorAiService` | Existing thumbnail vision/editor services call Gemini directly. Models are required explicitly through thumbnail config; no silent image-model fallback was found. | Full workflow/agent boundary migration for image calls is larger than this AI service hardening lane. | Do not re-architect direct LLM calls in this PR. Record direct-call status in PR body; keep storage/image fetch guards and explicit model checks intact. |

## Implementation Tasks

### Task 1: Lock Tenant Failure Modes

**Files:**
- Modify: `apps/server/src/ai/__tests__/thumbnail-generation.service.spec.ts`
- Modify: `apps/server/src/ai/__tests__/thumbnail-analysis.service.spec.ts`
- Modify: `apps/server/src/ai/__tests__/thumbnail-wing.service.spec.ts`

- [ ] Add a `saveEditorResult` test proving an unowned `productId` throws and `thumbnailGeneration.create` is not called.
- [ ] Add a generation list/read mapping test proving tenant-scoped master loading is used instead of relation master data.
- [ ] Add an analysis list test proving analyses with no caller-owned master are not rendered with cross-tenant relation data.
- [ ] Add a Wing registration test proving no registration attempt is created when the scoped master/listing lookup fails.
- [ ] Run `rtk proxy npx vitest run src/ai/__tests__/thumbnail-generation.service.spec.ts src/ai/__tests__/thumbnail-analysis.service.spec.ts src/ai/__tests__/thumbnail-wing.service.spec.ts` from `apps/server` and confirm the new tests fail for the expected boundary reasons.

### Task 2: Harden Relation Loading And Mutations

**Files:**
- Modify: `apps/server/src/ai/services/thumbnail-master-image-resolver.ts`
- Modify: `apps/server/src/ai/services/thumbnail-generation.service.ts`
- Modify: `apps/server/src/ai/services/thumbnail-analysis.service.ts`
- Modify: `apps/server/src/ai/services/thumbnail-recompose.service.ts`
- Modify: `apps/server/src/ai/services/thumbnail-wing.service.ts`

- [ ] Add a company-aware thumbnail image relation helper and use it in scoped `masterProduct` reads.
- [ ] Replace unscoped generation relation includes with company-filtered to-many includes and separately scoped master summary loading.
- [ ] Check master ownership inside `saveEditorResult` before creating a generation.
- [ ] In edit-job processing, fetch the generation and master as separate company-scoped resources before resolving image inputs or calling Gemini.
- [ ] In Wing registration, fetch selected generation/candidate and the caller-owned master/listing before creating a registration attempt or materializing the image.
- [ ] Preserve current API response shape; missing scoped master data should render blank/fallback product fields instead of another tenant's data.

### Task 3: Verify And Ship

**Files:**
- Modify: `.github/PULL_REQUEST_TEMPLATE.md` only if the template itself requires generation-time content changes. Otherwise leave it untouched and use it as PR-body input.

- [ ] Run `rtk npm run check:idor`.
- [ ] Run `rtk npm run check:tenant-scope`.
- [ ] Run `rtk npm run build --workspace=apps/server`.
- [ ] Run `rtk proxy npx vitest run src/ai` from `apps/server`.
- [ ] Run real Postgres AI integration only if an AI integration test exists or is added.
- [ ] Run `rtk npm run dev:server`.
- [ ] Run `rtk git diff --check`.
- [ ] Commit this plan as `docs: plan ai thumbnail boundary rewrite`.
- [ ] Commit implementation as `refactor: harden ai thumbnail tenant boundary`.
- [ ] Push `refactor/phase3-ai-thumbnail-boundary` and open a PR titled `refactor: harden ai thumbnail tenant boundary`; do not merge it.
