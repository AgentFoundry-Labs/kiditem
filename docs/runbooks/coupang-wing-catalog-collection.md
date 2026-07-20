# Coupang Wing Catalog Collection

## Purpose

Use the authenticated Chrome extension to collect one Coupang Wing account's
full product, sellable-option, and provider-media snapshot into KidItem
registered products. This is the current `0.1.8` browser collection path; there
is no server-side Playwriter fallback or separate catalog image-sync API.

The collection updates account-scoped `ChannelListing` and
`ChannelListingOption` metadata. Provider media is attached to the listing's
`ContentWorkspace` as URL-backed `ContentAsset` rows. It does not create or
change physical `SellpiaInventorySku` stock or central
`ProductVariantComponent` recipes.

## Prerequisites

- Sign in to the intended KidItem organization.
- Select an active `ChannelAccount` whose stored `channel` is exactly
  `coupang`.
- Load `extensions/coupang-ads-scraper` in the same Chrome profile.
- Keep an authenticated Wing inventory tab open. A human completes login, OTP,
  and account selection; never record credentials, cookies, or session dumps.
- Start the KidItem API and web app for local use.

For staging, generate a local-only extension copy with the committed helper:

```bash
STAGING_URL="$(gh variable get STAGING_URL --env staging)" \
  node scripts/prepare-coupang-extension.mjs
```

Load `.secrets/extensions/coupang-ads-scraper-staging` from
`chrome://extensions`. Do not commit the real staging origin or the generated
copy.

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
- KidItem-authored operating-product links and confirmed
  `ProductVariantComponent` recipes are never overwritten by collection.
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

## Verification

Run focused automated checks from the repository root:

```bash
rtk npm exec --workspace=packages/shared vitest -- run src/schemas/coupang-catalog-snapshot.spec.ts
rtk npm exec --workspace=apps/server vitest -- run src/channels/application/service/__tests__/channel-catalog-collection.service.spec.ts src/channels/adapter/in/http/__tests__/channel-catalog-collection.controller.spec.ts
rtk npm exec --workspace=apps/web vitest -- run 'src/app/(product-pipeline)/product-pipeline/registered-products'
rtk npm run build --workspace=apps/web
rtk npm run build --workspace=apps/server
rtk node --test extensions/tests/*.test.mjs
rtk node --check extensions/coupang-ads-scraper/background/service-worker.js
rtk git diff --check -- extensions/coupang-ads-scraper
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

## Blockers

Stop and report when:

- human Wing login, OTP, or account authorization is required;
- the extension does not advertise `coupangCatalogSnapshot = true`;
- the selected account is not an active `channel='coupang'` account;
- an incomplete run changes absent-listing activation state;
- a collection changes Sellpia stock, component recipes, or operator-authored
  content;
- required automated or browser verification fails.

## Final Report Format

```text
Release: 0.1.8
Account: <channelAccountId>
Run: <runId>; status=<completed|blocked>
Published: listings=<count>; SKUs=<count>; assets=<count>
Resume verified: <yes|no>
Preserved: manual content=<yes|no>; component recipes=<yes|no>
Automated gates: <commands and result>
Blockers: <none or exact blocker>
```
