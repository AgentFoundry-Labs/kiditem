# Coupang Wing Catalog Collection

## Purpose

Use the authenticated Chrome extension to collect one Coupang Wing account's
full product, sellable-option, and provider-media snapshot into KidItem
registered products. This is the browser collection path; there
is no server-side Playwriter fallback or separate catalog image-sync API.

The collection updates account-scoped `ChannelListing` and
`ChannelListingOption` metadata. Provider media is attached to the listing's
`ContentWorkspace` as URL-backed `ContentAsset` rows. It does not create or
change physical `SellpiaInventorySku` stock or direct
`ChannelListingOptionInventoryComponent` rules.

## Prerequisites

- Sign in to the intended KidItem organization.
- Select an active `ChannelAccount` whose stored `channel` is exactly
  `coupang`.
- Load `extensions/kiditem-os` in the same Chrome profile.
- Keep an authenticated Wing inventory tab open. A human completes login, OTP,
  and account selection; never record credentials, cookies, or session dumps.
- Start the KidItem API and web app for local use or open
  `http://kiditem-office` for Office use.
- Use the same loaded `extensions/kiditem-os` directory or universal
  release package for local and Office. The extension resolves the
  environment from the verified KidItem page origin and keeps auth/runs separate.

## Operator Flow

1. Open the readiness modal (dashboard, or the registered-products handoff
   link from a catalog Alert) in the same Chrome profile as the authenticated
   Wing tab.
2. Select the intended Coupang account and press **상품 받기**. The extension
   takes the browser's import turn, opens the basics attempt, and hands off to
   details inside the same import.
3. If another account's import runs in this browser, the start is refused and
   names that account; nothing opens. Start after it ends, or from another
   Chrome profile.
4. Keep the managed Wing collection window available. Basics publishes only after
   its complete listing manifest is validated. Details enriches each completely
   captured product while showing capture and publication counts separately;
   uncompleted products retain their existing detail. The rate/ETA estimates
   detail collection, not database transaction latency.
5. After a Wing rate limit, press **이어서 받기** once the wait passed; it resumes
   the same attempt. A restarted extension continues the same unexpired attempt
   while a KidItem tab is open. Otherwise press **수집 중단**, which works from
   any browser, and start again.
6. Treat absence only within a completed same-account stage manifest. Basic
   completion does not certify full-detail freshness; wait for the detail
   owner's COMPLETE receipt before calling the entire detail traversal complete.
7. Confirm registered products show one card per listing, its options, provider
   thumbnail, and content workspace.

## Runtime Contract

The page starts an import through the extension start contract, gated by
`collectionStartV1 = true`: it sends `startCollection` with producer
`channels.coupang_catalog` and scope `{ channelAccountId }`, and the extension
opens the basics attempt. The extension also advertises:

```text
coupangCatalogSnapshot = true
coupangCatalogSourceAttempts = true
coupangCatalogSnapshotSource = wing-inventory-v1
```

The resumable server endpoints are account-scoped:

```text
POST /api/channels/accounts/:channelAccountId/catalog-imports/coupang-wing/attempts
GET  /api/channels/accounts/:channelAccountId/catalog-imports/coupang-wing/attempts/:attemptId
PUT  /api/channels/accounts/:channelAccountId/catalog-imports/coupang-wing/attempts/:attemptId/chunks/:kind/:sequence
POST /api/channels/accounts/:channelAccountId/catalog-imports/coupang-wing/attempts/:attemptId/pause
POST /api/channels/accounts/:channelAccountId/catalog-imports/coupang-wing/attempts/:attemptId/fail
POST /api/channels/accounts/:channelAccountId/catalog-imports/coupang-wing/attempts/:attemptId/finalize
POST /api/channels/accounts/:channelAccountId/catalog-imports/coupang-wing/attempts/:attemptId/cancel
GET  /api/channels/accounts/:channelAccountId/catalog-imports/coupang-wing/source
```

`source` returns the account's latest root attempt, whose `overallState` is the
whole import's state, and its details child once admitted. `cancel` is the
operator stop without the attempt token: the shared control asks the extension
session first, then cancels by the root attempt id, which ends the whole import
with `USER_CANCELLED` and no Alert.

Begin sends a UUID `Idempotency-Key` and `{collectorVersion, stage}`, with
`stage: "basics"` or `stage: "details"` for the two-stage flow. Reuse that key
after an uncertain response to recover the original permit. One import runs per
account: a different key while the account's import (either stage, or a live
workbook import) runs returns `409 ATTEMPT_IN_PROGRESS` with that import's root
attempt ID.
Chunk, pause, fail and finalize requests carry `x-source-attempt-token`. Safe status
reads never return that token. The permit expires 24 hours after admission;
expiry is fixed and cannot be renewed. A terminal or expired attempt requires
a new explicit collection, not a restart of the failed generation.
Expired transport stops automatic retries but preserves an unconfirmed terminal
request for an explicit owner-status reconciliation. Local RUNNING residue can
be replaced only after the prior exact owner is confirmed terminal; an unknown
owner response remains blocked. Retired runId-only browser correlation does not
resume or block the new permit path.

`SourceImportRun` owns the attempt, publication receipt and same-transaction
Alert. Linked collection rows only hold private chunks. CollectionSession holds
local progress, attention and recoverable tabs, never canonical terminal state.
Cancellation records `USER_CANCELLED` without opening a new failure Alert.

Organization scope comes from authentication. Do not send or trust an
`organizationId` from extension payloads.
The frozen server account is rechecked before publication. The current Wing
extractor does not independently prove the logged-in provider vendor; operators
must select the intended account, and real-provider verification remains a
separate acceptance gate.

### Direct-registration detail image

The same extension owns the resource-sensitive detail-image step for **single
Wing registration**. It must advertise:

```text
detailPageClientRasterV1 = true
```

The extension manifest requires the `debugger` permission and local/Office
MinIO upload access (`http://localhost:9000/*` and
`http://kiditem-office:9000/*`). Reload the unpacked extension after updating
it and acknowledge Chrome's debugger warning. Do not replace these exact
origins with a wildcard.

```text
POST /api/ai/detail-page-image/candidate/:candidateId/client-render
POST /api/ai/detail-page-image/render-intents/:intentId/claim
GET  /api/ai/detail-page-image/render-intents/:intentId/document
GET  /api/ai/detail-page-image/render-intents/:intentId
POST /api/ai/detail-page-image/render-intents/:intentId/finalize
POST /api/ai/detail-page-image/render-intents/:intentId/fail
```

Expected UI phases are loading, capturing, uploading, and finalizing. The
extension opens one unfocused owned render window and uses its active tab for
one CDP screenshot, then closes the owned window and uploads one 780px JPEG
directly to the presigned storage URL. The unfocused window keeps Chrome from
suspending a long render document without taking focus from the operator. The
server keeps the immutable revision and final artifact authority. IndexedDB
retains at most three/20MiB of unfinished captures for upload retry; it is
cleared after finalization. There is no server Puppeteer, split-image, or
unrelated-image fallback.

## Publication And Preservation Rules

- Chunks are idempotent by attempt, kind, and sequence. A stale attempt cannot
  overwrite the current publication.
- Basics publishes observed listing/option fields and representative media only
  after validating its whole manifest. It preserves richer detail fields and
  detail/option media. An unknown stock value does not clear existing stock;
  an observed zero remains zero.
- Details pins the completed basics publication and traverses every product.
  Each complete product's chunk receipt, detail and provider media publish in
  one owner transaction; accepted-chunk retries are no-ops. A later failure
  retains those successful enrichments and leaves failed/unobserved products
  untouched. Full-detail COMPLETE still requires full traversal validation.
  A newer basics publication fences older detail writes. This follows the
  [approved staged-publication contract](../superpowers/specs/2026-09-08-extension-collection-deepening-design.md#approved-september-9-wing-catalog-and-product-screen-amendment).
- Preserve exact provider contents, notices, tags, attributes and every option
  media association in the bounded normalized payload. Render provider HTML
  only escaped or sanitized; never execute it.
- A lost final response is checked against the exact owner's durable receipt;
  local transport success alone never means publication succeeded.
- Existing manually selected or generated content is preserved. A provider
  primary image initializes selection only when no operator-authored selection
  exists.
- Provider image bytes stay at their external URL during catalog collection.
  Thumbnail or detail-page generation fetches bytes only when that operation
  needs them and persists only selected or derived managed output.
- KidItem-authored operating-product links and confirmed direct
  `ChannelListingOptionInventoryComponent` rules are never overwritten by
  collection.
- Do not restore `/api/coupang-image-sync`, `MasterProductImage`, Drive image
  replay, or a server Playwriter fallback.

## Failure Recovery

| Symptom | Safe recovery |
|---|---|
| Extension is not detected | Reload the unpacked extension and the KidItem page, then verify the origin allowlist. |
| Wing tab is missing or logged out | Open the Wing inventory tab and complete human authentication. Resume only a still-running attempt; a terminal login failure needs a new explicit attempt. |
| Collection is interrupted | Keep a KidItem tab open while the extension restarts; it continues the same unexpired attempt. Otherwise use **수집 중단** and start again. Do not edit attempt/chunk rows. |
| Start is refused by another account's import | Wait for that import or stop it; a browser imports one account at a time through its Wing login. No attempt was opened. |
| One page/detail fails | Inspect the owner error and correct browser state. Incomplete basics does not publish. Failed details retains already-published complete products and preserves old detail for failed/unobserved products. Terminal retries require a new attempt. |
| Provider returns HTTP 429 | Stop provider IO and honor owner attention and `notBefore` (including a valid Retry-After). The attempt remains RUNNING but rejects chunks/finalize while paused. Press **이어서 받기** only after the wait, which replays that attempt's own begin; do not increase request rate or bypass the pause. |
| Finalization reports inconsistent counts | Stop and report the attempt ID and counts; do not force publication or mark the attempt complete manually. |
| Provider image cannot be fetched later | Keep the URL-backed catalog asset unchanged and retry only the requested thumbnail/detail operation. |
| Latest detail renderer is not detected | Reload extension version 1.2.85 and the KidItem tab; confirm `detailPageClientRasterV1 = true`. |
| Chrome shows a debugger warning | Confirm the tab URL is the KidItem `/detail-page-client-render` route, then leave the extension attached until capture completes. |
| Detail upload fails | Retry Wing preparation. A still-valid bounded IndexedDB capture is reused without another screenshot. |
| Detail finalize fails | Do not open the Wing form. Record the intent ID and inspect object metadata/dimensions; never substitute another image. |

## Verification

Run focused automated checks from the repository root:

```bash
rtk proxy npm exec --workspace=packages/shared -- vitest run src/schemas/coupang-catalog-snapshot.spec.ts src/schemas/coupang-catalog-browser.spec.ts src/schemas/collection-start.spec.ts
rtk proxy npm exec --workspace=apps/server -- vitest run src/channels/application/service/__tests__/channel-catalog-collection.service.spec.ts src/channels/adapter/in/http/__tests__/channel-catalog-collection.controller.spec.ts src/channels/adapter/in/http/__tests__/channel-catalog-source.controller.spec.ts
rtk proxy npm run test:integration --workspace=apps/server -- src/channels/__tests__/channel-catalog-owner.pg.integration.spec.ts src/channels/__tests__/channel-catalog-staging.pg.integration.spec.ts
rtk proxy npm exec --workspace=apps/web -- vitest run 'src/app/(product-pipeline)/product-pipeline/registered-products' src/components/readiness
rtk proxy npm run build --workspace=apps/web
rtk proxy npm run build --workspace=apps/server
rtk proxy node --test extensions/tests/*.test.mjs extensions/tests/*/*.test.mjs
rtk proxy node --check extensions/kiditem-os/background/coupang/worker.js
rtk proxy git diff --check -- extensions/kiditem-os
```

The PostgreSQL suites use disposable Testcontainers fixtures. They do not
authorize operating-database access or replace real-provider browser acceptance.

Manual browser acceptance:

1. Confirm KidItem and Wing are signed in within the same Chrome profile.
2. Complete basics for the selected account and verify its exact manifest
   counts. Start details and observe complete-product capture/publication counts
   increasing together. Verify successful product enrichments become visible
   while uncompleted products retain old detail and the full stage stays RUNNING.
3. Restart the extension once with a KidItem tab open and confirm the same
   unexpired attempt continues. Start another account in the same browser and
   confirm the refusal names the running account without opening an attempt.
   Stop from another browser and confirm the import ends. For a lost final
   response, verify the existing receipt is reused without recollection or
   another publication.
4. Complete detail finalization and confirm exact full coverage, options,
   provider media associations, and listing detail navigation. Compare sampled
   names, prices, status, images and retained detail across registered products,
   product management and matching, including the 73-option association case.
5. Confirm existing manual content selection and SKU component recipes remain
   unchanged.
6. For one saved candidate, start Wing direct registration without submitting:
   confirm the four render phases, one 780px JPEG URL, completion within 30
   seconds, and a second preparation cache hit with no new capture.

## Blockers

Stop and report when:

- human Wing login, OTP, or account authorization is required;
- the extension does not advertise `collectionStartV1` and the catalog snapshot and source-attempt capabilities;
- direct registration lacks `detailPageClientRasterV1 = true` or exact storage
  host permission;
- the selected account is not an active `channel='coupang'` account;
- incomplete basics publishes canonical data, or an incomplete detail product
  changes its existing detail/media;
- partial detail success is presented as full-stage COMPLETE, or successful
  enrichment loses provider option-media associations;
- a collection changes Sellpia stock, component recipes, or operator-authored
  content;
- required automated or browser verification fails.

## Final Report Format

```text
Release: <VERSION>
Account: <channelAccountId>
Attempt: <attemptId>; stage=<basics|details>; state=<RUNNING|COMPLETE|FAILED>
Published: listings=<count>; SKUs=<count>; assets=<count>
Resume verified: <yes|no>
Preserved: manual content=<yes|no>; component recipes=<yes|no>
Automated gates: <commands and result>
Blockers: <none or exact blocker>
```
