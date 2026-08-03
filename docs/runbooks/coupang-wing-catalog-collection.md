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
- Start the KidItem API and web app for local use, open
  `http://kiditem-office` for office use, or open
  `https://staging.merchon.org` for staging use.
- Use the same loaded `extensions/kiditem-os` directory or universal
  release package for local, office, and staging. The extension resolves the
  environment from the verified KidItem page origin and keeps auth/runs separate.

## Operator Flow

1. Open `/product-pipeline/registered-products` in the same Chrome profile as
   the authenticated Wing tab.
2. Select the intended Coupang account.
3. Confirm the panel does not report an extension or Wing-tab connection
   error.
4. Click **Wing에서 가져오기**.
5. Keep both tabs available while the UI reports discovery, detail storage,
   publication, processing rate, and ETA.
6. If the browser or page was interrupted, return to the same account and click
   **수집 재개**. The extension resumes the accepted server run instead of
   silently starting a competing publication.
7. Wait for completed finalization before treating absent Wing products or
   options as inactive.
8. Confirm registered products show one card per listing, its options, provider
   thumbnail, and content workspace.

## Runtime Contract

The page first verifies the extension capability:

```text
coupangCatalogSnapshot = true
coupangCatalogSnapshotSource = wing-inventory-v1
```

The resumable server endpoints are account-scoped:

```text
POST /api/channels/accounts/:channelAccountId/catalog-imports/coupang-wing/runs
GET  /api/channels/accounts/:channelAccountId/catalog-imports/coupang-wing/runs/:runId
PUT  /api/channels/accounts/:channelAccountId/catalog-imports/coupang-wing/runs/:runId/chunks/:kind/:sequence
POST /api/channels/accounts/:channelAccountId/catalog-imports/coupang-wing/runs/:runId/errors
POST /api/channels/accounts/:channelAccountId/catalog-imports/coupang-wing/runs/:runId/finalize
```

Organization scope comes from authentication. Do not send or trust an
`organizationId` from extension payloads.

### Direct-registration detail image

The same extension owns the resource-sensitive detail-image step for **single
Wing registration**. It must advertise:

```text
detailPageClientRasterV1 = true
```

The extension manifest requires the `debugger` permission, local and office
MinIO upload access (`http://localhost:9000/*` and
`http://kiditem-office:9000/*`), and the exact staging S3 upload origin
(`https://gheoobctiarluauprvro.storage.supabase.co/*`). Reload the unpacked
extension after updating it and acknowledge Chrome's debugger warning. Do not
replace the exact staging origin with a wildcard.

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

- Chunks are idempotent by run, kind, and sequence. A stale attempt cannot
  overwrite the current run.
- Detail chunks publish observed listings incrementally. An accepted complete
  detail chunk replaces that listing's provider-media set and may soft-delete
  provider assets absent from the chunk before finalization. Only a complete,
  internally consistent finalization may deactivate listings or options that
  were not observed anywhere in the new snapshot.
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
| Wing tab is missing or logged out | Open the Wing inventory tab, complete human authentication, then resume. |
| Collection is interrupted | Return to the same account and use **수집 재개**. Do not edit run/chunk rows. |
| One page/detail fails | Inspect the recorded run error, correct browser state, and resume. An incomplete run does not deactivate unobserved listings/options, but accepted complete detail chunks may already have replaced provider media for their listing. |
| Finalization reports inconsistent counts | Stop and report the run ID and counts; do not force publication or mark the run complete manually. |
| Provider image cannot be fetched later | Keep the URL-backed catalog asset unchanged and retry only the requested thumbnail/detail operation. |
| Latest detail renderer is not detected | Reload extension version 1.2.85 and the KidItem tab; confirm `detailPageClientRasterV1 = true`. |
| Chrome shows a debugger warning | Confirm the tab URL is the KidItem `/detail-page-client-render` route, then leave the extension attached until capture completes. |
| Detail upload fails | Retry Wing preparation. A still-valid bounded IndexedDB capture is reused without another screenshot. |
| Detail finalize fails | Do not open the Wing form. Record the intent ID and inspect object metadata/dimensions; never substitute another image. |

## Verification

Run focused automated checks from the repository root:

```bash
rtk npm exec --workspace=packages/shared vitest -- run src/schemas/coupang-catalog-snapshot.spec.ts
rtk npm exec --workspace=apps/server vitest -- run src/channels/application/service/__tests__/channel-catalog-collection.service.spec.ts src/channels/adapter/in/http/__tests__/channel-catalog-collection.controller.spec.ts
rtk npm exec --workspace=apps/web vitest -- run 'src/app/(product-pipeline)/product-pipeline/registered-products'
rtk npm run build --workspace=apps/web
rtk npm run build --workspace=apps/server
rtk node --test extensions/tests/*.test.mjs
rtk node --check extensions/kiditem-os/background/coupang/worker.js
rtk git diff --check -- extensions/kiditem-os
```

Manual browser acceptance:

1. Confirm KidItem and Wing are signed in within the same Chrome profile.
2. Start collection for the selected account and observe published-product
   counts increasing.
3. Interrupt once, reload, and confirm **수집 재개** continues the same run.
4. Complete finalization and confirm active/inactive tabs, options, provider
   media, and listing detail navigation.
5. Confirm existing manual content selection and SKU component recipes remain
   unchanged.
6. For one saved candidate, start Wing direct registration without submitting:
   confirm the four render phases, one 780px JPEG URL, completion within 30
   seconds, and a second preparation cache hit with no new capture.

## Blockers

Stop and report when:

- human Wing login, OTP, or account authorization is required;
- the extension does not advertise `coupangCatalogSnapshot = true`;
- direct registration lacks `detailPageClientRasterV1 = true` or exact storage
  host permission;
- the selected account is not an active `channel='coupang'` account;
- an incomplete run changes absent-listing activation state;
- a collection changes Sellpia stock, component recipes, or operator-authored
  content;
- required automated or browser verification fails.

## Final Report Format

```text
Release: <VERSION>
Account: <channelAccountId>
Run: <runId>; status=<completed|blocked>
Published: listings=<count>; SKUs=<count>; assets=<count>
Resume verified: <yes|no>
Preserved: manual content=<yes|no>; component recipes=<yes|no>
Automated gates: <commands and result>
Blockers: <none or exact blocker>
```
