# AI Thumbnail Phase 3B Lane C — Wing / Recompose / Image Fetch Layer Refactor

> Phase 3B follow-up to [`2026-04-28-codebase-reconstruction.md`](./2026-04-28-codebase-reconstruction.md) and [`2026-04-29-reconstruction-current-handoff.md`](./2026-04-29-reconstruction-current-handoff.md). Lane C focuses on the AI thumbnail bounded context.

> **Status (2026-04-29):** transitional split landed; topology converged in `refactor/ai-thumbnail-contract-topology`. The Wing slice is now the most complete vertical alignment with [`2026-04-29-backend-architecture-contract.md`](./2026-04-29-backend-architecture-contract.md) — orchestration, Prisma adapter, provider adapter, and mapper all live in their target paths:
>
> - `apps/server/src/ai/services/thumbnail-wing.service.ts` → [`apps/server/src/ai/application/service/thumbnail-wing.service.ts`](../../../apps/server/src/ai/application/service/thumbnail-wing.service.ts)
> - `apps/server/src/ai/persistence/thumbnail-wing.persistence.ts` → [`apps/server/src/ai/adapter/out/prisma/thumbnail-wing.persistence.ts`](../../../apps/server/src/ai/adapter/out/prisma/thumbnail-wing.persistence.ts)
> - `apps/server/src/ai/adapters/wing-automation-runner.ts` → [`apps/server/src/ai/adapter/out/wing/wing-automation-runner.ts`](../../../apps/server/src/ai/adapter/out/wing/wing-automation-runner.ts)
> - `apps/server/src/ai/mappers/thumbnail-wing.mapper.ts` → [`apps/server/src/ai/mapper/thumbnail-wing.mapper.ts`](../../../apps/server/src/ai/mapper/thumbnail-wing.mapper.ts)
> - `apps/server/src/ai/domain/thumbnail-image-source.ts` and `apps/server/src/ai/domain/recompose-classification.ts` (unchanged)
>
> `thumbnail-recompose.service.ts` and `thumbnail-image-fetcher.service.ts` stay in `services/` for now (transitional) — they are still the public seams used by analysis/generation services. Sections below describe the historical layout; the contract topology is the active rule.

## Goal

Decompose three fat-by-concern services in `apps/server/src/ai/services/` so tenant-scoped persistence, Wing browser automation, image fetch/source guards, and recompose classification each live in a focused module. Public controllers and shared response contracts stay stable.

## Scope

`apps/server/src/ai/**` only. No frontend, shared package, prisma, or other backend domain edits. No public route, controller signature, or response shape change. Wing automation external behaviour (Playwriter spawn, Coupang Wing search URL, registration attempt lifecycle) is preserved.

## Target Files

### Already-owned services (will shrink)

| File | Lines (before) | Concern today | Slimmed to |
|---|---:|---|---|
| `apps/server/src/ai/services/thumbnail-wing.service.ts` | 374 | Tenant lookup, registration attempt lifecycle, image materialization, Coupang Wing automation, Playwriter spawn, status check | Orchestrator only — delegates to persistence + adapter + domain + mapper |
| `apps/server/src/ai/services/thumbnail-recompose.service.ts` | 127 | Master lookup + Vision API call + JSON parse + variant fallback selection | Orchestrator — delegates parse to pure classification helper |
| `apps/server/src/ai/services/thumbnail-image-fetcher.service.ts` | 174 | URL validation, private-IP guard, MIME allowlist, redirect-bounded fetch, MIME→ext | Injectable façade — pure URL/MIME guards live in `domain/thumbnail-image-source.ts` |
| `apps/server/src/ai/services/thumbnail-master-image-resolver.ts` | 58 | Pure helper used by 4 sibling services | **Untouched.** Already focused; renaming would force unrelated import churn. |

### New focused modules

| New file | Layer | Responsibility |
|---|---|---|
| `apps/server/src/ai/persistence/thumbnail-wing.persistence.ts` | persistence | Tenant-scoped Prisma reads + registration-attempt lifecycle writes (create / `updateMany`-or-throw / `deleteMany` of failed). Each method takes explicit `companyId`. |
| `apps/server/src/ai/adapters/wing-automation-runner.ts` | adapter | Playwriter `spawn`, Coupang Wing automation script construction, `runWingUpload` / `checkPlaywriterStatus`. Owns the `WING_BASE` URL. No Prisma, no DB. |
| `apps/server/src/ai/domain/thumbnail-image-source.ts` | domain (pure) | URL parsing (`assertHttpUrl`, `assertPublicHttpUrl` with private-IP / IPv6 guards, `parseDataImageUrl`), MIME allowlist (`assertSupportedMime`, `extForMime`), public byte/redirect/timeout constants. |
| `apps/server/src/ai/domain/recompose-classification.ts` | domain (pure) | Vision-classifier text → `RecomposeVariantClassification` (JSON cleanup, kind allowlist, with-box default fallback). |
| `apps/server/src/ai/mappers/thumbnail-wing.mapper.ts` | mapper | Response shape — `toRegistrationResult`, `toVerificationResult`, `pickWingProductName`, `pickRegistrationImageUrl`. Pure functions over already-fetched rows. |

`thumbnail-master-image-resolver.ts` is intentionally not moved or renamed — it is already a focused pure helper consumed by analysis, generation, recompose, and editor services. Forcing a rename here would create an unrelated import-churn diff.

## Moved Responsibilities

| From | To | Why |
|---|---|---|
| `ThumbnailWingService.materializeImage` data-URL parse | `domain/thumbnail-image-source.ts::parseDataImageUrl` | Pure. Used by both Wing materialization and the future image-source detector. Easier to reason about than inlined regex parsing. |
| `ThumbnailWingService.materializeImage` HTTP path | service orchestrator (still uses `ThumbnailImageFetcherService.fetchTrustedStorageImage`) | Cross-cutting; keep IO at the orchestrator seam. |
| `ThumbnailWingService.buildScript` + `runAutomation` + `checkPlaywriterStatus` + `WING_BASE` | `adapters/wing-automation-runner.ts` | Pure external automation — testable without Prisma, swappable per environment. |
| `ThumbnailWingService.updateRegistrationAttemptOrThrow`, `markAttemptFailed`, attempt create/delete | `persistence/thumbnail-wing.persistence.ts` | Tenant-scoped writes belong in persistence; service stays focused on attempt-lifecycle ordering. |
| `ThumbnailWingService` Coupang name + selectedUrl precedence | `mappers/thumbnail-wing.mapper.ts` | Pure mapping rules — easier to read at the call site. |
| `ThumbnailRecomposeService.parse` | `domain/recompose-classification.ts::parseRecomposeClassification` | Pure JSON-classification logic + variant fallback. Service then only orchestrates master lookup → Vision → parse. |
| `ThumbnailImageFetcherService` private-IPv4/IPv6 detection, MIME allowlist, URL kind guard | `domain/thumbnail-image-source.ts` | Same SSRF posture, but reusable from outside the service and trivially testable. The service keeps `assertSupportedMime` / `extForMime` / `fetchImage` / `fetchTrustedStorageImage` for DI compatibility — they delegate to the domain helpers. |

## Public Contract Compatibility

- All `ThumbnailAnalysisController` routes (`POST /api/thumbnail-analysis/wing-register/:id`, `POST .../wing-register-batch`, `DELETE .../registration-error/:id`, `POST .../verify-registration/:id`, `GET .../playwriter-status`) keep their signatures.
- `ThumbnailWingService` keeps `registerToWing`, `batchRegister`, `clearRegistrationError`, `verifyRegistration`, `checkPlaywriterStatus` exported with identical input/return types.
- `ThumbnailImageFetcherService` keeps `fetchImage(url, opts?)`, `fetchTrustedStorageImage(url)`, `assertSupportedMime`, `extForMime`. `MAX_FETCH_BYTES` and `MAX_REDIRECTS` are re-exported from the service file for the existing image-fetcher spec.
- `ThumbnailRecomposeService` keeps `classify(productId, companyId)` and `classifyByImage(imageUrl)`.
- `ThumbnailImageFetcherService` constructor signature (single `StorageService` dep) is unchanged.

## Test Cleanup Rationale

`docs/TESTING.md` admission rules drive what stays and what is added.

| Spec | Verdict | Reason |
|---|---|---|
| `thumbnail-wing.service.spec.ts` | **Keep, lightly retarget.** | Already covers public-behavior risks: tenant scoping in writes, attempt lifecycle, image-fetch failure path, no-op `updateMany` → `NotFoundException`, master tenancy filter on `registerToWing`. After the split, the service is still the public seam — tests retain meaning. |
| `thumbnail-image-fetcher.service.spec.ts` | **Keep as-is.** | Covers SSRF (loopback, private IPv4/IPv6, IPv4-mapped IPv6, link-local), non-http(s) protocols, MIME allowlist, redirect bound, max-byte cap, own-storage opt-in. These all remain real operating risks. The service still owns the IO pipeline; the pure helpers it now delegates to are exercised through the same public methods. |
| `thumbnail-recompose-prompts.spec.ts` | **Keep.** | Covers prompt-routing decisions for `getRecomposePromptOverride`. Unrelated to the parse split. |

No new implementation-detail mock specs are added — moving methods between modules is not by itself a tested risk per `docs/TESTING.md`. The new pure helpers (`parseRecomposeClassification`, `parseDataImageUrl`, `assertPublicHttpUrl`, `assertSupportedMime`) are exercised transitively through the service-level specs above.

If `parseRecomposeClassification` later gains operating-critical logic (e.g. driving variant choice in production paths that affect ad budget), add a focused unit spec then. Today its failure is masked by the same defaultSingleProduct fallback the service used to inline, so the existing seam is sufficient.

## Measurable LOC Improvement

Before:

```
thumbnail-wing.service.ts          374
thumbnail-recompose.service.ts     127
thumbnail-image-fetcher.service.ts 174
thumbnail-master-image-resolver.ts  58
                              total 733
```

Target after this refactor:

```
thumbnail-wing.service.ts          ≤ 200 (orchestrator only)
thumbnail-recompose.service.ts     ≤ 60
thumbnail-image-fetcher.service.ts ≤ 110
thumbnail-master-image-resolver.ts  58 (unchanged)
+ persistence/thumbnail-wing.persistence.ts
+ adapters/wing-automation-runner.ts
+ domain/thumbnail-image-source.ts
+ domain/recompose-classification.ts
+ mappers/thumbnail-wing.mapper.ts
```

The structural win is not raw line count — total lines may stay similar — but each module now has a single concern (Prisma vs Playwriter vs URL guard vs JSON parse vs response shape), which is what makes the next AI thumbnail change cheap.

## Verification Gates

Phase 3B per the master plan plus risk-based focused specs:

```bash
rtk npm run check:idor
rtk npm run check:tenant-scope
rtk proxy sh -lc 'cd apps/server && npx vitest run \
  src/ai/__tests__/thumbnail-wing.service.spec.ts \
  src/ai/__tests__/thumbnail-image-fetcher.service.spec.ts \
  src/ai/__tests__/thumbnail-recompose-prompts.spec.ts'
rtk proxy sh -lc 'cd apps/server && npx vitest run src/ai'
rtk npm run build --workspace=apps/server
rtk npm run dev:server   # boot to "Server running on http://localhost:4000" then stop
rtk git diff --check
```

## Non-Goals

- No prisma model edits, no shared package edits, no frontend edits.
- No change to `thumbnail-master-image-resolver.ts` filename or signature.
- No new tests for moved-only file boundaries.
- No introduction of a generic Prisma repository layer — persistence module is Wing-specific and tenant-scoped.
- No change to the Coupang Wing automation script semantics; it is moved verbatim into the adapter.
