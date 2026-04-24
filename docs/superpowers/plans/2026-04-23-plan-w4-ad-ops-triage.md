# Plan W4 — Ad Ops Triage

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `apps/web/src/app/ad-ops/` from an undifferentiated build blocker into a categorized, execution-ready rewire backlog, lock which backend/shared contracts are canonical, and produce the file ownership and acceptance criteria that `W5` will implement.

**Architecture:** This is a docs-first exploration/triage plan. No application code changes land here. `@kiditem/shared/schemas/ads` and the current Nest advertising controllers/services are the canonical contracts; `ad-ops` web consumers are the stale side that must adapt. The output of this plan is a concrete category map, endpoint/schema matrix, and `W5` implementation slicing. Repo-wide frontend verification still uses `npm run build --workspace=apps/web`; standalone `tsc` is diagnostic-only because `.next/dev/types/validator.ts` adds unrelated noise.

**Tech Stack:** Next.js 16 + React Query + `@kiditem/shared` ad schemas + NestJS advertising endpoints + markdown planning docs under `docs/superpowers/`.

**Predecessors:** Plan R0 (`2026-04-23-plan-r0-post-f1-successor-roadmap.md`), Plan B4 (`2026-04-23-plan-b4-ad-strategy-profit-basis.md`)

**Successor:** `W5 ad-ops-rewire`

---

## Locked decisions

### D1. Shared ads schemas and current advertising services are canonical

`W4` does **not** reopen the advertising backend or shared ads schema by default. The current source of truth is:

- `packages/shared/src/schemas/ads.ts`
- `apps/server/src/advertising/controllers/advertising.controller.ts`
- `apps/server/src/advertising/services/ad-strategy.service.ts`
- `apps/server/src/advertising/services/ad-campaigns.service.ts`

Any proposed shared/backend change in `W5` must point to a concrete missing business requirement, not just to a stale web consumer field.

### D2. Triage must separate compile blockers from runtime drift

There are two different problems:

- compile-time schema drift in `ad-ops` consumers
- runtime semantic drift that TypeScript does not fully catch

The clearest runtime example already exists:

- `CampaignContent.tsx` uses `7d | 30d`
- `AdCampaignsService.getCampaigns()` is typed as `7d | 14d | month`

`W4` must record both kinds of drift.

### D3. `npm run build --workspace=apps/web` remains the canonical frontend gate

Use:

```bash
npm run build --workspace=apps/web
```

for the real repo-wide blocker.

Use:

```bash
cd apps/web && npx tsc --noEmit --pretty false || true
```

only to inventory the ad-ops error surface. Ignore `.next/dev/types/validator.ts` missing-page noise in the triage artifact; it is not part of the `ad-ops` owner scope.

### D4. The current ad-ops drift falls into five canonical categories

- `C1 weekly-plan action drift`
  `AdWeeklyPlan.actions` and `AdRulesData.recommendations` are canonical `AdStrategyAction[]`, but web consumers still assume the old enriched local action model (`name`, `productId`, `actionPriority`, `recommendedAction`, `keywords`, `suggestedKeywords`, `currentRoas`, `maxBidPrice`, `targetRoas`, `isExisting`, etc.).
- `C2 campaign snapshot flattening drift`
  Campaign/status/drilldown consumers still read flat fields (`adSpend`, `adRevenue`, `roas`, `clicks`, `conversions`, `productName`, `vendorItemId`, `onOff`) even though canonical responses are nested `listing` + `metrics`.
- `C3 exposure analysis drift`
  Web code expects legacy `factorSummary`, flattened factor scores, urgency labels, and `products[]`, while canonical `ExposureAnalysisData` is `scores[] + urgentActions[]`.
- `C4 local adapter / alias drift`
  `RuleItem`, `DailyPoint`, and other local aliases no longer match the canonical shared/server shapes and need either removal or explicit adapters.
- `C5 typed-boundary debt`
  `useAdOpsData.ts` and neighboring consumers still use `apiClient.get<T>` shadow typing rather than `getParsed()` + shared schemas.

### D5. `W4` is allowed to recommend multiple `W5` execution slices

If triage shows `W5` is too large for one safe implementation pass, `W4` may recommend `W5a/W5b`-style sub-slicing inside the plan body, but the canonical owner remains `W5 ad-ops-rewire`.

## Evidence baseline

Current diagnostic baseline from `cd apps/web && npx tsc --noEmit --pretty false || true`:

- `147` ad-ops-specific TypeScript errors
- file concentration:
  - `StrategyContent.tsx`: `65`
  - `ExposureAnalysis.tsx`: `23`
  - `xlsx-export.ts`: `17`
  - `CampaignTable.tsx`: `13`
  - `ProductDrilldown.tsx`: `12`
  - `AdSidePanel.tsx`: `7`
  - `StatusContent.tsx`: `7`
  - `page.tsx`: `3`

Current repo-wide frontend build blocker from `npm run build --workspace=apps/web`:

- first failing site: `apps/web/src/app/ad-ops/components/AdSidePanel.tsx:19`
- first error family: `strategy.adIssues` / `actionPriority` / `recommendedAction` assumptions against canonical `AdWeeklyPlan`

Canonical contract evidence already available:

- `/api/ads/strategy/plan` returns `AdWeeklyPlan` in `ad-strategy.service.ts`
- `/api/ads/strategy/rules` returns `AdRulesData`
- `/api/ads/campaigns` returns `AdCampaignSnapshot[]` from `ad-campaigns.service.ts`, even when `campaignName` is provided
- `/api/ads/campaigns/trends` returns `AdTrendsData` with `daily[].metrics`
- `/api/ads/exposure-analysis` returns `ExposureAnalysisData`

## File map

| Action | File | Responsibility in W4 |
|---|---|---|
| Read-only | `packages/shared/src/schemas/ads.ts` | canonical ad schema reference |
| Read-only | `apps/server/src/advertising/controllers/advertising.controller.ts` | endpoint inventory |
| Read-only | `apps/server/src/advertising/services/ad-strategy.service.ts` | canonical weekly-plan/rules/exposure shapes |
| Read-only | `apps/server/src/advertising/services/ad-campaigns.service.ts` | canonical campaigns/trends shapes |
| Read-only | `apps/web/src/app/ad-ops/hooks/useAdOpsData.ts` | typed-boundary inventory |
| Read-only | `apps/web/src/app/ad-ops/page.tsx` | top-level local alias and trend wiring drift |
| Read-only | `apps/web/src/app/ad-ops/components/{AdSidePanel,StatusContent,StrategyContent,CampaignContent,CampaignTable,ProductDrilldown,ExposureAnalysis}.tsx` | consumer drift inventory |
| Read-only | `apps/web/src/app/ad-ops/lib/xlsx-export.ts` | export-side stale action model inventory |
| Create | `docs/superpowers/plans/2026-04-23-plan-w4-ad-ops-triage.md` | this triage plan |

## Review cadence

| Task | Scope | Review |
|---|---|---|
| T1 | baseline capture | 1 combined |
| T2 | endpoint/schema matrix | 1 combined |
| T3 | category inventory by file | 2-stage |
| T4 | `W5` execution slicing | 2-stage |
| T5 | acceptance + verification matrix | no review |

---

## Task 1 — Capture the baseline and freeze the canonical blocker description

**Files:**
- Create: `docs/superpowers/plans/2026-04-23-plan-w4-ad-ops-triage.md`

- [ ] **Step 1.1: Record the repo-wide frontend build blocker**

Run:

```bash
npm run build --workspace=apps/web
```

Record:

- first failing file/line
- first failing field family
- whether the blocker is ad-ops-local or cross-domain

- [ ] **Step 1.2: Record the diagnostic ad-ops error inventory**

Run:

```bash
cd apps/web && npx tsc --noEmit --pretty false || true
```

Extract:

- total ad-ops error count
- per-file concentration
- `.next/dev/types/validator.ts` noise count, separately

- [ ] **Step 1.3: Lock the baseline statement in the plan body**

The plan must explicitly say:

- ad-ops is the current repo-wide frontend build blocker
- the canonical blocker is not `products`, `inventory`, or `orders`
- standalone `tsc` is exploratory, not the release gate

## Task 2 — Build the endpoint → shared schema → consumer matrix

**Files:**
- Read-only: `packages/shared/src/schemas/ads.ts`
- Read-only: `apps/server/src/advertising/controllers/advertising.controller.ts`
- Read-only: `apps/server/src/advertising/services/{ad-strategy,ad-campaigns}.service.ts`

- [ ] **Step 2.1: Inventory each ad-ops endpoint consumed by the page**

The matrix must include at least:

- `/api/ads/campaigns`
- `/api/ads/campaigns/trends`
- `/api/ads/strategy/rules`
- `/api/ads/strategy/plan`
- `/api/ads/strategy/recommend`
- `/api/ads/exposure-analysis`
- `/api/ads/benchmark`
- `/api/ads/config`
- `/api/ads/extension/status`
- `/api/dashboard/ad`

- [ ] **Step 2.2: Map each endpoint to its canonical shared/server type**

Example rows that must be spelled out:

- `/api/ads/strategy/plan` → `AdWeeklyPlan`
- `/api/ads/strategy/rules` → `AdRulesData`
- `/api/ads/campaigns` → `AdCampaignSnapshot[]`
- `/api/ads/campaigns/trends` → `AdTrendsData`
- `/api/ads/exposure-analysis` → `ExposureAnalysisData`

- [ ] **Step 2.3: Mark consumers that still use shadow local types or assumptions**

At minimum call out:

- `RuleItem`
- `DailyPoint`
- `CampaignProductData`
- `CampaignsResponse`
- `RegisterCampaignPayload.products`

## Task 3 — Categorize every failing file into the canonical drift taxonomy

**Files:**
- Read-only: `apps/web/src/app/ad-ops/**/*`

- [ ] **Step 3.1: Assign each failing file to one or more categories**

Minimum mapping expected:

- `AdSidePanel.tsx` → `C1`, `C4`
- `StrategyContent.tsx` → `C1`, `C4`
- `xlsx-export.ts` → `C1`
- `CampaignTable.tsx` → `C2`
- `StatusContent.tsx` → `C2`, `C4`
- `ProductDrilldown.tsx` → `C2`
- `ExposureAnalysis.tsx` → `C3`
- `page.tsx` → `C2`, `C4`

- [ ] **Step 3.2: Flag non-error runtime drift that still belongs in `W5`**

The plan must explicitly record:

- period dialect drift (`7d/14d/month` vs `7d/30d`)
- campaign drilldown mismatch (`/api/ads/campaigns?campaign=...` still returns `AdCampaignSnapshot[]`, not a `products[]` payload)
- `useAdOpsData.ts` typed-boundary debt even where compile errors are not yet triggered

- [ ] **Step 3.3: Mark files that are currently compile-clean but still in `W5` scope**

At minimum:

- `useAdOpsData.ts`
- `CampaignContent.tsx`
- `RegisterCampaignModal.tsx`

## Task 4 — Define the `W5` execution slices and file ownership

**Files:**
- Create/modify only this plan

- [ ] **Step 4.1: Split the future implementation into execution slices**

`W4` must recommend an owner map like:

- Slice A: typed boundaries + fetchers (`useAdOpsData.ts`, `page.tsx`)
- Slice B: status/campaign nested metrics rewrite (`StatusContent.tsx`, `CampaignContent.tsx`, `CampaignTable.tsx`)
- Slice C: strategy/action model rewrite (`AdSidePanel.tsx`, `StrategyContent.tsx`, `xlsx-export.ts`, `RegisterCampaignModal.tsx`)
- Slice D: exposure rewrite (`ExposureAnalysis.tsx`)
- Slice E: drilldown contract correction (`ProductDrilldown.tsx`, possibly endpoint-call strategy if consumer path changes)

- [ ] **Step 4.2: State whether `W5` should be one implementation plan or two**

Use the triage evidence to recommend either:

- one `W5` with ordered tasks, or
- two sequential passes inside `W5` (`typed-boundary + campaign/status`, then `strategy + exposure`)

Either choice must be justified from the actual error concentration.

## Task 5 — Lock `W5` acceptance criteria and verification strategy

**Files:**
- Create/modify only this plan

- [ ] **Step 5.1: Define `W5` acceptance criteria**

At minimum:

- no remaining ad-ops TypeScript errors
- ad-ops no longer blocks `npm run build --workspace=apps/web`
- `apiClient.getParsed()` is used wherever ad-ops is rewired to shared schemas
- no stale local action/campaign/exposure shape aliases remain in active paths

- [ ] **Step 5.2: Define verification commands for `W5`**

Must include:

```bash
cd apps/web && npx vitest run src/app/ad-ops
npm run build --workspace=apps/web
```

And if `W5` changes any shared ads schema boundary:

```bash
cd packages/shared && npm run build
```

## Deliverables

When `W4` is done, the repository should have:

- this child plan committed as the canonical ad-ops triage artifact
- a locked category taxonomy for the current ad-ops drift
- an endpoint/schema/consumer matrix
- an explicit recommendation for `W5` slicing and ownership

## Out of scope

- Fixing any `ad-ops` code
- Changing advertising backend/service behavior
- Expanding shared ads schemas to preserve stale web fields
- Fixing `products`, `inventory`, `orders`, `image-hub`, or `thumbnail-editor`

## Recommended next move

Write `W5` immediately after this triage if the active goal is repo-wide frontend build green. If the user instead chooses smaller commerce slices first, keep this triage doc as the blocker reference and proceed to `W1/W2/W3` with the explicit note that global frontend build will stay red until `W5` lands.
