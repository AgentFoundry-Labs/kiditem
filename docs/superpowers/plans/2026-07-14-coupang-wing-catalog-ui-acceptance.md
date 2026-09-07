# Coupang Wing Catalog Registered-Products UI and Acceptance Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an operator start/resume a full Wing catalog import from the registered-products screen, see actionable progress, and see the newly published Coupang listings and external provider images immediately after finalize.

**Architecture:** The registered-products route keeps its existing `ChannelListing` read model. A route-local React Query hook coordinates the authenticated NestJS run APIs and the Chrome extension bridge, persists only opaque run/account IDs in local storage, and finalizes when the server reports a complete staged snapshot. On completion it invalidates listing/content queries. Only after a live replacement run passes are dead image-sync and Excel-download surfaces deleted.

**Tech Stack:** Next.js App Router, React, React Query, shared Zod/TypeScript contracts, Vitest, Testing Library, existing extension bridge, Chrome MV3.

**Parent plan:** [Coupang Wing full catalog snapshot](/Users/yhc125/workspace/kiditem/docs/superpowers/plans/2026-07-14-coupang-wing-full-catalog-snapshot.md)

**Prerequisites:**

- [Durable collection and extension adapter](/Users/yhc125/workspace/kiditem/docs/superpowers/plans/2026-07-14-coupang-wing-catalog-collection.md)
- [Atomic publication and media](/Users/yhc125/workspace/kiditem/docs/superpowers/plans/2026-07-14-coupang-wing-catalog-publication-media.md)

---

## Current-Code Baseline

- `registered-products/page.tsx` already reads `/api/channels/listings` and renders one card per `ChannelListing`. Do not introduce a legacy `/groups` read or a second registered-product projection.
- `channel-listings-api.ts` already exposes active channel accounts. Reuse it and filter `channel === 'coupang'` plus a nonblank external account identity.
- The account/listing API remains NestJS-only; the web app never reads Prisma/Supabase directly.
- The old `/api/coupang-image-sync/*` backend no longer exists. The remaining thumbnail-page hooks, query keys, shared row schemas, extension messages, and popup Excel action are dead replacement code.
- Browser payload chunks are not kept in web local storage. The web stores only account ID, `clientRunKey`, and server `runId`; raw product data remains extension/server-owned.

## Fixed UI State Machine

```text
idle
  -> checking_extension
  -> starting_server_run
  -> discovery
  -> hydration
  -> ready_to_finalize
  -> publishing
  -> completed

recoverable: login_required | browser_interrupted | network_interrupted
terminal: conflicting_chunk | unstable_manifest | invalid_snapshot | publication_failed
```

- Detect and capability-check the extension before creating a new server run.
- Local storage key per account: `kiditem:coupang-catalog-import:<channelAccountId>`.
- Stored value: `{ clientRunKey, runId }`; no scraped rows, auth tokens, cookies, or snapshot JSON.
- The server status response is canonical. Extension status supplies only finer browser navigation/upload progress.
- When server status reaches `ready_to_finalize`, it includes the server-computed `snapshotHash`; the hook submits it once.
- A page reload resumes the saved `runId`, fetches server status, reconnects to the extension if collection is incomplete, and never starts a second run implicitly.
- On completion invalidate `queryKeys.channelListings.all`, `queryKeys.productContent.all`, and `queryKeys.thumbnailAnalysis.all`, select the imported account's Coupang market filter, reset listing pagination to page 1, and show the publication summary.
- Managed-storage copying is not a UI blocker. Cards render the external provider URL immediately; the same asset URL changes to managed storage after materialization.

## Task 1: Add the route-local API and orchestration hook

**Files:**

- Create: `apps/web/src/app/(product-pipeline)/product-pipeline/registered-products/lib/coupang-catalog-import-api.ts`
- Create: `apps/web/src/app/(product-pipeline)/product-pipeline/registered-products/lib/coupang-catalog-import-api.spec.ts`
- Create: `apps/web/src/app/(product-pipeline)/product-pipeline/registered-products/hooks/useCoupangCatalogImport.ts`
- Create: `apps/web/src/app/(product-pipeline)/product-pipeline/registered-products/hooks/useCoupangCatalogImport.spec.tsx`
- Modify: `apps/web/src/lib/query-keys.ts`

- [ ] Add a focused query-key family:

```ts
coupangCatalogImports: {
  all: ['coupangCatalogImports'],
  run: (accountId: string, runId: string) =>
    ['coupangCatalogImports', accountId, runId],
}
```

- [ ] Write failing API tests proving exact authenticated calls and shared response parsing for:

```text
POST /api/channels/accounts/:accountId/catalog-imports/coupang-wing/runs
GET  /api/channels/accounts/:accountId/catalog-imports/coupang-wing/runs/:runId
POST /api/channels/accounts/:accountId/catalog-imports/coupang-wing/runs/:runId/finalize
```

`start` sends only `{ clientRunKey, collectorVersion: 'wing-inventory-v1' }`; `finalize` sends only `{ snapshotHash }`.

- [ ] Write failing hook tests proving:

  - no account disables start;
  - extension missing or missing `capabilities.coupangFullCatalog` fails before server-run creation;
  - one stable UUID `clientRunKey` is reused per account;
  - start saves `{ clientRunKey, runId }` and sends `{ action: 'startCoupangCatalogImport', channelAccountId, runId }`;
  - 1-second polling occurs only while the run is active;
  - extension status is polled during discovery/hydration but server status wins on disagreement;
  - `ready_to_finalize` invokes finalize once even across rerenders/refetches;
  - completed status clears stored run state and invalidates the three query families;
  - reload with a stored run resumes it without creating a new run;
  - cancel sends `cancelCoupangCatalogImport` but leaves server chunks/run resumable;
  - login-required and network interruptions expose a retry action using the same run ID;
  - terminal validation conflict does not auto-retry or auto-create a new run.

- [ ] Run and confirm failure:

```bash
rtk npm exec --workspace=apps/web vitest -- run 'src/app/(product-pipeline)/product-pipeline/registered-products/lib/coupang-catalog-import-api.spec.ts' 'src/app/(product-pipeline)/product-pipeline/registered-products/hooks/useCoupangCatalogImport.spec.tsx'
```

- [ ] Implement the API with `apiClient` and the shared `@kiditem/shared/coupang-catalog-snapshot` schemas. Implement the hook with `detectExtensionId`, `sendToExtension`, safe browser-storage helpers, React Query, and an internal finalize-in-flight ref keyed by `runId:snapshotHash`.

- [ ] Generate UUIDs with `crypto.randomUUID()`. If unavailable, throw an explicit unsupported-browser error; do not generate non-UUID timestamp fallbacks because the API contract requires UUID.

- [ ] Verify:

```bash
rtk npm exec --workspace=apps/web vitest -- run 'src/app/(product-pipeline)/product-pipeline/registered-products/lib/coupang-catalog-import-api.spec.ts' 'src/app/(product-pipeline)/product-pipeline/registered-products/hooks/useCoupangCatalogImport.spec.tsx'
```

Expected: API and orchestration tests pass.

- [ ] Commit:

```bash
rtk git add 'apps/web/src/app/(product-pipeline)/product-pipeline/registered-products/lib/coupang-catalog-import-api.ts' 'apps/web/src/app/(product-pipeline)/product-pipeline/registered-products/lib/coupang-catalog-import-api.spec.ts' 'apps/web/src/app/(product-pipeline)/product-pipeline/registered-products/hooks/useCoupangCatalogImport.ts' 'apps/web/src/app/(product-pipeline)/product-pipeline/registered-products/hooks/useCoupangCatalogImport.spec.tsx' apps/web/src/lib/query-keys.ts
rtk git commit -m "feat: orchestrate Wing catalog imports in web"
```

## Task 2: Add the account selector and progress panel to registered products

**Files:**

- Create: `apps/web/src/app/(product-pipeline)/product-pipeline/registered-products/components/CoupangCatalogImportPanel.tsx`
- Create: `apps/web/src/app/(product-pipeline)/product-pipeline/registered-products/components/CoupangCatalogImportPanel.spec.tsx`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/registered-products/page.tsx`
- Create: `apps/web/src/app/(product-pipeline)/product-pipeline/registered-products/page.spec.tsx`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/registered-products/lib/channel-listings-api.spec.ts`

- [ ] Write failing component tests for:

  - loading and no-Coupang-account states;
  - account selection using account name plus `externalAccountId`;
  - extension unavailable and Wing-login-required guidance;
  - start, retry/resume, and cancel controls;
  - discovery pages, hydrated parents, option count, stored chunks, and current phase;
  - publication change summary including created/updated/inactivated products/options and attached provider images;
  - an accessibility live region for progress/errors;
  - button disabling while starting/finalizing and prevention of duplicate submits.

- [ ] Write a failing page test proving:

  - the panel is present above the listing toolbar;
  - completion resets page to 1, selects the Coupang market, filters by the imported account ID, and refetches cards;
  - existing non-Coupang tabs, selection behavior, and listing navigation still work;
  - cards continue using `listing.id` and the existing `thumbnailUrl` field.

- [ ] Run and confirm failure:

```bash
rtk npm exec --workspace=apps/web vitest -- run 'src/app/(product-pipeline)/product-pipeline/registered-products/components/CoupangCatalogImportPanel.spec.tsx' 'src/app/(product-pipeline)/product-pipeline/registered-products/page.spec.tsx' 'src/app/(product-pipeline)/product-pipeline/registered-products/lib/channel-listings-api.spec.ts'
```

- [ ] Implement the panel with existing Tailwind/design-system patterns. It receives account/query/hook state through props and does not call `apiClient` itself.

- [ ] In the page:

  - fetch accounts with `queryKeys.channelAccounts.active()` and `channelListingsApi.listAccounts()`;
  - keep selected account ID in route state and safe local storage key `kiditem:coupang-catalog-account`;
  - add `channelAccountId` to the listing query when an imported account is selected;
  - retain existing `ChannelListing` list/card/detail contracts;
  - update the empty-state copy to say that Wing import can create registered products directly.

- [ ] Verify:

```bash
rtk npm exec --workspace=apps/web vitest -- run 'src/app/(product-pipeline)/product-pipeline/registered-products'
rtk npm run build --workspace=apps/web
```

Expected: route tests pass and the web production build succeeds.

- [ ] Commit:

```bash
rtk git add 'apps/web/src/app/(product-pipeline)/product-pipeline/registered-products/components/CoupangCatalogImportPanel.tsx' 'apps/web/src/app/(product-pipeline)/product-pipeline/registered-products/components/CoupangCatalogImportPanel.spec.tsx' 'apps/web/src/app/(product-pipeline)/product-pipeline/registered-products/page.tsx' 'apps/web/src/app/(product-pipeline)/product-pipeline/registered-products/page.spec.tsx' 'apps/web/src/app/(product-pipeline)/product-pipeline/registered-products/lib/channel-listings-api.spec.ts'
rtk git commit -m "feat: import Wing catalog from registered products"
```

## Task 3: Pass the live authenticated replacement acceptance gate

**Files:**

- No source changes until the acceptance assertions pass.

- [ ] Start the local server with the materializer enabled and the web app:

```bash
rtk npm run dev:server
rtk npm run dev --workspace=apps/web
```

Expected: API listens on `4000`, web listens on `3000`, and both finish initialization without errors.

- [ ] Reload the unpacked extension from `extensions/coupang-ads-scraper`, keep the authenticated Wing inventory tab open, and use `magic-scraper` to verify the collector still sees exact list rows and the current manifest before clicking import.

- [ ] In `/product-pipeline/registered-products`, select the local Coupang `ChannelAccount` and click `쿠팡 전체 상품 가져오기`.

- [ ] During the run verify:

  - actual current total and page count come from Wing; neither `1,227` nor `25` is hard-coded;
  - closing/reopening or reloading the registered-products page resumes the same server run;
  - a deliberate extension cancel leaves the server run resumable, and retry continues missing chunks;
  - progress reaches `ready_to_finalize`, then `publishing`, then `completed` exactly once;
  - no Excel dialog, `.xls/.xlsx` file, or snapshot `.json` file is created.

- [ ] After completion verify through the page and authenticated APIs:

  - imported parent count equals the completed discovery manifest;
  - every parent appears as one `ChannelListing` card for the selected account;
  - option counts match hydrated Wing data;
  - new listings have active listing-owned workspaces;
  - cards show the provider primary image immediately, including assets still `pending` or `failed` for managed copying;
  - a manual/generated thumbnail chosen before re-import remains selected;
  - rerunning the same unchanged snapshot returns duplicate/zero changes and preserves listing, option, workspace, and asset IDs;
  - only a complete snapshot can inactivate an unseen listing/option/provider asset.

- [ ] Capture the final acceptance counts in the PR body, not in a checked-in scratch file:

```text
accountId=<uuid>
manifestParents=<count>
manifestPages=<count>
publishedListings=<count>
publishedOptions=<count>
providerImages=<count>
materializationReady=<count>
materializationPending=<count>
materializationFailed=<count>
duplicateRunId=<uuid>
```

Expected: all identity, visibility, resume, duplicate, and preservation assertions pass. If the Wing fixture contract drifted, stop and update Task 4 fixtures/parser in the collection plan before deleting any legacy path.

## Task 4: Remove the dead image-sync and Excel-download replacement paths

**Files:**

- Delete: `apps/web/src/app/(product-pipeline)/product-pipeline/thumbnail-ai/hooks/useCoupangImageSync.ts`
- Delete: `apps/web/src/app/(product-pipeline)/product-pipeline/thumbnail-ai/hooks/useCoupangImageSync.test.ts`
- Delete: `apps/web/src/app/(product-pipeline)/product-pipeline/thumbnail-ai/hooks/useThumbnailSyncFeedback.ts`
- Delete: `apps/web/src/app/(product-pipeline)/product-pipeline/thumbnail-ai/components/UnmatchedImageRowsBanner.tsx`
- Delete: `apps/web/src/app/(product-pipeline)/product-pipeline/thumbnail-ai/components/__tests__/UnmatchedImageRowsBanner.spec.tsx`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/thumbnail-ai/page.tsx`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/thumbnail-ai/components/ThumbnailHeader.tsx`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/thumbnail-ai/__tests__/page.spec.tsx`
- Modify: `apps/web/src/lib/query-keys.ts`
- Modify: `packages/shared/src/schemas/thumbnails.ts`
- Modify: `packages/shared/src/schemas/thumbnails.spec.ts`
- Delete: `extensions/coupang-ads-scraper/content/wing-inventory-scraper.js`
- Modify: `extensions/coupang-ads-scraper/background/service-worker.js`
- Modify: `extensions/coupang-ads-scraper/manifest.json`
- Modify: `extensions/coupang-ads-scraper/popup/popup.html`
- Modify: `extensions/coupang-ads-scraper/popup/popup.js`
- Modify: `apps/server/src/agent-os/application/service/agent-run-worker.service.ts`

- [ ] Add/adjust replacement tests first so the registered-products import panel and new extension messages remain green when old symbols disappear.

- [ ] Remove thumbnail-page image sync imports, state, feedback/banner, header props, buttons, and mocks. Remove `queryKeys.coupangImageSync`.

- [ ] Remove unused shared `CoupangImageSync*` schemas/types and their tests. Keep unrelated thumbnail schemas unchanged.

- [ ] Remove extension messages/functions/constants/storage keys for:

```text
scrapeCoupangImageRows
getCoupangImageRowsStatus
cancelCoupangImageRows
scrapeInventoryImagePage
scrapeInventoryList
```

Remove the old inventory scraper content-script entries and the popup `상품목록 스크래핑 (엑셀)` control. Keep the new `wing-catalog-parser.js`, `wing-catalog-collector.js`, and `start/get/cancelCoupangCatalogImport` path.

- [ ] Update the stale Agent OS worker comment that cites `coupang-image-sync`; no behavior changes in Agent OS.

- [ ] Prove no live references remain:

```bash
rtk rg -n 'CoupangImageSync|coupang-image-sync|scrapeCoupangImageRows|getCoupangImageRowsStatus|cancelCoupangImageRows|scrapeInventoryImagePage|scrapeInventoryList' apps packages extensions
```

Expected: no matches except historical operation-key strings in isolated automation regression fixtures, which remain because persisted historical alerts may contain that key.

- [ ] Run replacement and regression tests:

```bash
rtk npm exec --workspace=packages/shared vitest -- run src/schemas/thumbnails.spec.ts src/schemas/coupang-catalog-snapshot.spec.ts
rtk node --test extensions/coupang-ads-scraper/tests/*.test.mjs
rtk npm exec --workspace=apps/web vitest -- run 'src/app/(product-pipeline)/product-pipeline/registered-products' 'src/app/(product-pipeline)/product-pipeline/thumbnail-ai'
rtk npm run build --workspace=apps/web
```

Expected: tests/build pass and no deleted-path import remains.

- [ ] Commit:

```bash
rtk git add -A apps/web/src/app/'(product-pipeline)'/product-pipeline/thumbnail-ai apps/web/src/lib/query-keys.ts packages/shared/src/schemas/thumbnails.ts packages/shared/src/schemas/thumbnails.spec.ts extensions/coupang-ads-scraper/content/wing-inventory-scraper.js extensions/coupang-ads-scraper/background/service-worker.js extensions/coupang-ads-scraper/manifest.json extensions/coupang-ads-scraper/popup/popup.html extensions/coupang-ads-scraper/popup/popup.js apps/server/src/agent-os/application/service/agent-run-worker.service.ts
rtk git commit -m "refactor: remove legacy Coupang image sync"
```

## Task 5: Update durable design and operator documentation

**Files:**

- Modify: `docs/superpowers/specs/2026-07-13-coupang-wing-full-catalog-snapshot-design.md`
- Create: `docs/runbooks/coupang-wing-catalog-import.md`
- Modify: `apps/server/src/channels/AGENTS.md`
- Modify: `apps/server/src/ai/AGENTS.md`
- Modify: `extensions/AGENTS.md`

- [ ] Reconcile the remaining stale body sections with the existing 2026-07-14 current-code amendment so they consistently replace:

  - `SourceImportChunk` with `ChannelScrapeChunk`;
  - `ContentWorkspaceAsset` with the existing `workspace_assets -> ContentAsset` path;
  - registered-products cutover wording with the already-complete `ChannelListing` baseline;
  - account-scoped publication sequence wording with organization/source sequence plus account-scoped advisory lock;
  - artifact filename wording with the fixed DB-only provenance label.

- [ ] Write the operator runbook with:

  - prerequisites: active organization/account, authenticated Wing tab, unpacked extension, API/web URLs;
  - safe actions: start, cancel, resume, duplicate retry;
  - environment variables for the media worker;
  - exact API and local-storage contracts;
  - explicit statement that no Excel or snapshot file is created;
  - verification counts and database ownership expectations;
  - blockers for selector drift, login expiry, chunk conflict, unstable manifest, and publication failure;
  - final report format from Task 3.

- [ ] Update scoped guides to record the new fixed endpoints, Channels/AI ownership boundary, and replacement extension messages. Because these are `AGENTS.md` changes, include them in the PR and call them out for team review.

- [ ] Confirm no top-level owner changed. Therefore `docs/ARCHITECTURE.md` does not need an ownership-map edit.

- [ ] Verify docs:

```bash
rtk rg -n 'SourceImportChunk|ContentWorkspaceAsset|wing-browser-snapshot-v1\.json' docs/superpowers/specs/2026-07-13-coupang-wing-full-catalog-snapshot-design.md docs/runbooks/coupang-wing-catalog-import.md
rtk git diff --check -- docs apps/server/src/channels/AGENTS.md apps/server/src/ai/AGENTS.md extensions/AGENTS.md
```

Expected: obsolete implementation names do not appear as active design authority; diff checking is clean.

- [ ] Commit:

```bash
rtk git add docs/superpowers/specs/2026-07-13-coupang-wing-full-catalog-snapshot-design.md docs/runbooks/coupang-wing-catalog-import.md apps/server/src/channels/AGENTS.md apps/server/src/ai/AGENTS.md extensions/AGENTS.md
rtk git commit -m "docs: document Wing catalog import operations"
```

## Task 6: Final release 0.1.8 verification

- [ ] Run the complete gate from the parent plan:

```bash
rtk npm run db:push
rtk npx prisma generate
rtk npm run build --workspace=packages/shared
rtk npm exec --workspace=apps/server vitest -- run src/channels src/ai
rtk npm run test:integration --workspace=apps/server -- src/channels/__tests__/channel-catalog-collection.repository.pg.integration.spec.ts src/channels/__tests__/channel-catalog-import.repository.pg.integration.spec.ts src/ai/__tests__/coupang-catalog-content.pg.integration.spec.ts src/ai/__tests__/content-asset-materialization.pg.integration.spec.ts
rtk node --test extensions/coupang-ads-scraper/tests/*.test.mjs
rtk npm exec --workspace=apps/web vitest -- run 'src/app/(product-pipeline)/product-pipeline/registered-products' 'src/app/(product-pipeline)/product-pipeline/thumbnail-ai'
rtk npm run build --workspace=apps/server
rtk npm run build --workspace=apps/web
rtk npm run check:idor
rtk npm run check:tenant-scope
rtk npm run check:conventions
rtk npm run db:erd
rtk npm run graphify:schema
rtk npm run check:schema-artifact-sync
rtk rg -n '^0\.1\.8$' VERSION
rtk git diff --check
```

Expected: every command exits `0`, `VERSION` reports `0.1.8`, schema artifacts are synchronized, and both production builds succeed.

- [ ] Boot the final server with normal media-worker settings:

```bash
rtk npm run dev:server
```

Expected: NestJS completes module initialization, then the worker logs its configured interval without duplicate-provider or circular-module errors. Stop after boot is confirmed.

- [ ] Reload the extension once more and repeat a same-hash import. Expected: it resumes/collects as needed, finalize returns the prior completed source run with zero changes, and registered-product IDs/thumbnails remain stable.
