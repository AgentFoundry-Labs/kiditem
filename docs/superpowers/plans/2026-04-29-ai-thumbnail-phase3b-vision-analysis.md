# Phase 3B Lane B — AI Thumbnail Vision/Analysis Refactor

> Child plan of [`2026-04-28-codebase-reconstruction.md`](./2026-04-28-codebase-reconstruction.md).
> Owner domain: `apps/server/src/ai/**`.
> Companion to [`2026-04-29-reconstruction-current-handoff.md`](./2026-04-29-reconstruction-current-handoff.md).

> **Status (2026-04-29):** transitional split landed; topology converged in `refactor/ai-thumbnail-contract-topology`. Lane B's new modules were created behind transitional `services/adapters/read-models/mappers/` labels and have now moved to the [`2026-04-29-backend-architecture-contract.md`](./2026-04-29-backend-architecture-contract.md) target topology:
>
> - `apps/server/src/ai/adapters/gemini-thumbnail-vision.adapter.ts` → [`apps/server/src/ai/adapter/out/gemini/gemini-thumbnail-vision.adapter.ts`](../../../apps/server/src/ai/adapter/out/gemini/gemini-thumbnail-vision.adapter.ts)
> - `apps/server/src/ai/read-models/thumbnail-analysis-read-model.ts` → [`apps/server/src/ai/adapter/out/prisma/thumbnail-analysis.query.ts`](../../../apps/server/src/ai/adapter/out/prisma/thumbnail-analysis.query.ts)
> - `apps/server/src/ai/mappers/thumbnail-analysis.mapper.ts` → [`apps/server/src/ai/mapper/thumbnail-analysis.mapper.ts`](../../../apps/server/src/ai/mapper/thumbnail-analysis.mapper.ts)
> - `apps/server/src/ai/domain/thumbnail-compliance-normalizer.ts` and `apps/server/src/ai/domain/thumbnail-image-spec.ts` (unchanged)
>
> The two facade services `thumbnail-vision-ai.service.ts` and `thumbnail-analysis.service.ts` remain in `services/` for now (transitional). The refactor's behavior split (Gemini I/O isolated to the adapter, parsing pure in `domain/`) is preserved — only the on-disk topology changed. Sections below describe the historical layout; treat the contract as the active rule.

## Goal

Split the two largest fat services in the AI bounded context so that Gemini I/O,
parsing, image-spec probing, list/summary read shapes, and DB-row → DTO mapping
each live in a focused module. Public controller routes and shared response
contracts are unchanged. No model selection or LLM call-policy changes.

## Target Files (current LOC)

| File | LOC | Role |
|---|---|---|
| `apps/server/src/ai/services/thumbnail-vision-ai.service.ts` | 1022 | mixed: Gemini I/O, JSON parse, sharp pixel mask, abort utils, compliance normalization |
| `apps/server/src/ai/services/thumbnail-analysis.service.ts` | 557 | mixed: Prisma orchestration, list/summary aggregation, row mapping |

LOC budget after refactor:

- `thumbnail-vision-ai.service.ts` < 500
- `thumbnail-analysis.service.ts` reduced to orchestration-only (target ~300)

## New Files (responsibility map)

| New file | Owns |
|---|---|
| `apps/server/src/ai/adapters/gemini-thumbnail-vision.adapter.ts` | Lazy GoogleGenAI client, vision/verify model `generateContent` calls, JSON envelope extraction with explicit `ServiceUnavailableException` codes, AbortSignal race, `fetchImageData` (delegates to `ThumbnailImageFetcherService`) |
| `apps/server/src/ai/domain/thumbnail-compliance-normalizer.ts` | `VIOLATION_KEYS` / `TEXT_RELATED_KEYS` constants, physical/digital regexes, `parseAiBoolean`, `clampNumber`, `normalizeConfidence`, `hasDigitalOverlayEvidence`, `normalizeTextRelatedViolations`, `parseComplianceResponse`, `calculateComplianceGrade`, `scoreToGrade`. Pure, no NestJS imports |
| `apps/server/src/ai/domain/thumbnail-image-spec.ts` | `analyzeWhiteBackgroundByPixels` (sharp + flood-fill), `parseImageDimensions`, `deriveImageSpecIssues`. Pure functions, sharp-only |
| `apps/server/src/ai/read-models/thumbnail-analysis-read-model.ts` | `MasterRow`, `AnalysisRow` types + `buildAnalysisListResponse`, `buildAnalysisSummary` aggregators. Pure |
| `apps/server/src/ai/mappers/thumbnail-analysis.mapper.ts` | `toAnalysisResult`, `unclassifiedAnalysisResult`, `hasActualAnalysis`. Pure |

## Modified Files

- `apps/server/src/ai/services/thumbnail-vision-ai.service.ts` — facade. Public methods (`analyzeQuality`, `checkCompliance`, `checkImageSpec`, `classifyImageJson`, `scoreToGrade`, `calculateComplianceGrade`) keep their signatures so `ThumbnailAnalysisService` and `ThumbnailRecomposeService` are unchanged. 2-pass orchestration stays here; pure helpers live in `domain/`.
- `apps/server/src/ai/services/thumbnail-analysis.service.ts` — orchestration only (Prisma upsert, batch abort, aggregation/mapping delegated).
- `apps/server/src/ai/ai.module.ts` — register `GeminiThumbnailVisionAdapter` provider.
- `apps/server/src/ai/__tests__/thumbnail-vision-ai.service.spec.ts` — cleanup pass: replace `(service as any)` calls into private helpers with direct calls into the new pure modules where they now live; keep risk-based behavior (pixel mask verdict, normalization, abort propagation, fetch routing).

## Preserved Behavior (regression budget = 0)

- `ThumbnailVisionAiService.analyzeQuality / checkCompliance / checkImageSpec / classifyImageJson` external observable behavior unchanged.
- Compliance 2-pass orchestration order preserved: text physical-vs-digital → white-background pixel mask + LLM fallback → bundle composition false-positive → `normalizeTextRelatedViolations` → `parseComplianceResponse`.
- Confidence clamping (`0..100`), violation key allowlist, missing-key tolerance preserved.
- SSRF/image-fetch guard preserved (`ThumbnailImageFetcherService.fetchTrustedStorageImage` is still the single entry point).
- Explicit Gemini config requirement preserved (`requireGeminiApiKey` / `requireGeminiVisionModel` / `requireGeminiVerifyModel`). No silent model fallback.
- `AbortError` semantics preserved (`Error('ABORTED')` thrown, `analyzeBatch` continues to detect via `isAbortError`).
- Public API of `ThumbnailAnalysisService` unchanged (controller routes intact).

## Test Cleanup Rationale

The current `thumbnail-vision-ai.service.spec.ts` reaches into private helpers via
`(service as any).<helper>`. After the split, those helpers are pure functions
exported from `domain/thumbnail-compliance-normalizer.ts` and
`domain/thumbnail-image-spec.ts`. The spec is updated to import them directly,
which removes the implementation-detail coupling without losing operational
coverage:

- pixel-mask verdict for white vs colored backgrounds (still asserted)
- physical-text-vs-digital-overlay normalization (still asserted)
- string-boolean / out-of-range confidence clamping (still asserted)
- missing-key tolerance (still asserted)
- abort propagation through `analyzeQuality` (still asserted on the facade)
- `ServiceUnavailableException` propagation when Gemini config missing (still asserted on the facade)
- trusted-storage fetch routing for `checkImageSpec` (still asserted on the facade)

No tests are deleted outright. Any spec that only checked private mechanics
(rather than observable behavior) is rewritten against the new public surface.

## Out of Scope

- No Prisma schema changes.
- No controller route or DTO changes.
- No change to `ThumbnailRecomposeService`, `ThumbnailGenerationService`, image-edit dual-path, or text-ai service.
- No conversion of the direct Gemini call into an agent task (Phase 3B is structural; the call-policy migration belongs to a later contract PR).
- No new shared package exports.

## Verification Gates

Per Phase 3B in the master plan:

```bash
npm run check:idor
npm run check:tenant-scope
cd apps/server && npx vitest run src/ai/__tests__/thumbnail-vision-ai.service.spec.ts src/ai/__tests__/thumbnail-analysis.service.spec.ts
cd apps/server && npx vitest run src/ai
npm run build --workspace=apps/server
npm run dev:server     # boot up to "Server running on http://localhost:4000", then stop
```

PR evidence will report each command's outcome and the measurable LOC delta on
the two target services.
