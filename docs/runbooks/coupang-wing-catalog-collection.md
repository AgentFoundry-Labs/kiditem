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

1. Open the readiness modal (dashboard or registered products) in the same Chrome
   profile as the authenticated Wing tab.
2. Select the intended Coupang account and press **상품 받기**. The extension
   begins `channels.wing_catalog_list`, reads the whole Wing list, and on success
   begins `channels.wing_catalog_details` with the targets the server planned
   (new products, a changed `modifiedOn`, products never detailed, and absent
   products to confirm). The screen shows each operation's own progress and result.
3. One Wing catalog operation runs per account (`account:<id>` lock): a second
   start, an excel refresh, or an upload while one runs is refused with
   `OPERATION_IN_PROGRESS`. Closing the web tab does not stop it.
4. **수집 중단** cancels the running operation from any browser. A failed or
   stopped details operation changes nothing; the next 상품 받기 plans the same
   targets again.
5. **상세 다시 받기** on a Wing listing card refetches that one product's detail.
6. **쿠팡상품정보 갱신** (mall channels screen) asks Wing to build the
   쿠팡상품정보 workbook (about seven minutes for 1,260 products), downloads it
   and applies it as `channels.wing_catalog_excel`. Sync cannot start meanwhile.
   Uploading a downloaded workbook is the same operation kind.
7. Confirm registered products show one card per listing, its options, provider
   thumbnail, and content workspace.

## Runtime Contract

The page starts operations through the extension's `operation.start`
(`operationRuntime = true` in `ping`) and reads them through
`GET /api/operations?kinds=channels.wing_catalog_list,channels.wing_catalog_details,channels.wing_catalog_excel`.
The operation contract ([ADR-0025](../adr/0025-operations-are-one-contract.md))
owns identity, token, lease (30 minutes, extended by every chunk and heartbeat),
chunk staging and rejection codes; Channels owns `plan` and `finalize`:

| Kind | Scope | Chunks | Finalize |
|---|---|---|---|
| `channels.wing_catalog_list` | `{channelAccountId}` | `listing_basics` (20 per chunk) | basics publish; `result = {listedProductCount, detailTargetProductIds, absentProductIds, next}` |
| `channels.wing_catalog_details` | `{channelAccountId, detailTargetProductIds, absentProductIds, via}` | `full_details` (20), `deletion_confirmation` (100) | details publish, `detail.modifiedOn` advance, deletions; `result` = quality |
| `channels.wing_catalog_excel` | `{channelAccountId, observedAt?}` + `fileHash` for uploads | `workbook` (base64 parts ≤ 900,000 chars) | workbook publish; `result` = counts |

The list is complete only when page and product counts match Wing's
`pagination`; otherwise it fails with `CATALOG_LIST_INCOMPLETE` and publishes
nothing. Deletion is confirmed by two `PRODUCT_ID` searches (deleted products,
then live ones): `deleted` becomes `DELETED` and inactive, `present` stays,
`not_found` is reported as unconfirmed. A detail that is gone (404) or over the
size bounds is skipped and listed in the operation progress `detailsMissing`.
Wing requests are serial, two seconds apart; detail retries wait 2 s and 6 s.
Catalog freshness (readiness) is the end of the last sync chain: a list that
needed no details or a details operation chained from the list.

Organization scope comes from authentication. Do not send or trust an
`organizationId` from extension payloads. The list plan carries the account's
Wing vendor id; list rows of another vendor are refused.

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

- Ledger facts are written only in the operation's finish transaction and
  marked `lastOperationId`; a failed, cancelled or expired operation writes
  nothing. `source_import_runs` and `channel_scrape_*` are not used.
- The list publishes observed listing/option fields and representative media.
  It preserves richer detail fields and detail/option media. An unknown stock
  value does not clear existing stock; an observed zero remains zero.
- Details apply only the planned targets; unchanged details write nothing but
  advance `detail.modifiedOn`, so the next sync does not re-target them.
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
| Extension is not detected or lacks `operationRuntime` | Reload the unpacked extension and the KidItem page, then verify the origin allowlist. |
| "쿠팡 윙 로그인이 필요합니다." | Sign in to Wing in the same profile and press 상품 받기 again; the next list re-plans every unfinished target. |
| Start refused with `OPERATION_IN_PROGRESS` | Another catalog operation (sync, excel refresh, upload) holds the account; wait for it or stop it. |
| `CATALOG_LIST_INCOMPLETE` | Wing changed while paging or returned a short page; start again. Nothing was published. |
| "상세 시작 실패" after a list | The extension did not begin the chained details; press 다시 받기. |
| Operation stuck without progress | Its lease expires 30 minutes after the last write and releases the account; or stop it. Do not edit operation rows. |
| Provider image cannot be fetched later | Keep the URL-backed catalog asset unchanged and retry only the requested thumbnail/detail operation. |
| Latest detail renderer is not detected | Reload extension version 1.2.85 and the KidItem tab; confirm `detailPageClientRasterV1 = true`. |
| Chrome shows a debugger warning | Confirm the tab URL is the KidItem `/detail-page-client-render` route, then leave the extension attached until capture completes. |
| Detail upload fails | Retry Wing preparation. A still-valid bounded IndexedDB capture is reused without another screenshot. |
| Detail finalize fails | Do not open the Wing form. Record the intent ID and inspect object metadata/dimensions; never substitute another image. |

## Verification

Run focused automated checks from the repository root:

```bash
rtk proxy npm exec --workspace=packages/shared -- vitest run src/schemas/coupang-catalog-snapshot.spec.ts
rtk proxy npm exec --workspace=apps/server -- vitest run src/channels src/common/operation src/readiness
rtk proxy npm run test:integration --workspace=apps/server -- src/channels/__tests__/channel-catalog-incremental.pg.integration.spec.ts src/channels/__tests__/wing-catalog-excel-operation.pg.integration.spec.ts src/channels/__tests__/channel-catalog-publication.repository.pg.integration.spec.ts src/readiness
rtk proxy npm exec --workspace=apps/web -- vitest run 'src/app/(product-pipeline)/product-pipeline/registered-products' src/components/readiness 'src/app/(channels)'
rtk proxy npm run build --workspace=apps/web
rtk proxy npm run extension:check && rtk proxy npm run extension:test
```

The PostgreSQL suites use disposable Testcontainers fixtures. They do not
authorize operating-database access or replace real-provider browser acceptance.

Manual browser acceptance (KID-351):

1. Confirm KidItem and Wing are signed in within the same Chrome profile.
2. First sync: the list completes and the chained details fetch every product.
3. Second sync with no Wing changes ends at the list in about a minute.
4. After an excel refresh, stored detail documents remain.
5. A deleted product becomes `DELETED`; an unconfirmed one is reported, not deactivated.
6. For one saved candidate, start Wing direct registration without submitting:
   confirm the four render phases, one 780px JPEG URL, completion within 30
   seconds, and a second preparation cache hit with no new capture.

## Blockers

Stop and report when:

- human Wing login, OTP, or account authorization is required;
- the extension does not advertise `operationRuntime`;
- direct registration lacks `detailPageClientRasterV1 = true` or exact storage
  host permission;
- the selected account is not an active `channel='coupang'` account;
- an incomplete list publishes, or a failed details operation changes existing detail/media;
- a collection changes Sellpia stock, component recipes, or operator-authored
  content;
- required automated or browser verification fails.

## Final Report Format

```text
Release: <VERSION>
Account: <channelAccountId>
Operations: list=<id> <status>; details=<id> <status>; excel=<id|none> <status>
Result: listed=<count>; detailApplied=<count>; deleted=<count>; unconfirmed=<count>
Preserved: manual content=<yes|no>; component recipes=<yes|no>
Automated gates: <commands and result>
Blockers: <none or exact blocker>
```
