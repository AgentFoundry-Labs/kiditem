# Import Channel Data And Match Sellpia Components

## Purpose

Use this runbook to import account-scoped marketplace identities and manage the
exact Sellpia component recipe consumed by one sale of each channel SKU.
Release `0.1.19` keeps three different concepts separate:

1. deterministic product-code or unique-barcode evidence that can create a
   one-unit automatic recipe;
2. normalized-name, similarity/AI, and manual-search candidates that are only
   suggestions;
3. the persisted `ChannelSkuComponent` recipe, which is the only confirmed
   multi-component/quantity mapping truth.

Inventory freshness and publication are owned by
[Sellpia Inventory Freshness Operations](sellpia-inventory-freshness.md).

## Prerequisites

- Root `VERSION` is `0.1.19` and the organization has a completed Sellpia
  snapshot.
- The operator is signed in to the intended KidItem organization.
- For Wing import, select an active account whose stored channel is exactly
  `coupang` and keep the approved detail workbook outside Git.
- For Rocket, select an active account whose stored channel is exactly `rocket`;
  identities arrive only from a complete extension collection with the exact
  vendor ID.
- Use the baseline `/product-hub/matching` component-recipe workspace. Do not
  identify an account by display name and do not send `organizationId` from the
  browser.

## Ownership And Safety Rules

- One `MasterProduct` represents one organization-owned Sellpia product code.
  Inventory alone publishes its active state and `currentStock`.
- `ChannelListing` and `ChannelListingOption` hold account-specific marketplace
  product/SKU identity and metadata.
- A `ChannelSkuComponent` row says how many units of one exact Sellpia product
  are consumed by one sale of the channel SKU. A recipe may contain multiple
  components.
- Recipe reads and writes are tenant-scoped. Adding an inactive or foreign
  MasterProduct is rejected.
- A confirmed recipe that later references an inactive component remains
  persisted for diagnosis and appears in `needs_review`; its status/recipe is
  not silently rewritten.
- Import, matching, status refresh, capacity reads, and Rocket preview never
  write `MasterProduct.currentStock`.

## Import Channel Identities

### Coupang Wing

1. Open `/product-hub/matching` and select an active `channel='coupang'`
   account.
2. Use **쿠팡 Wing 상품 가져오기** with the intended detail workbook. The
   endpoint accepts XLS/XLSX up to 20 MiB, requires the `Template` sheet, and
   locates the required header in the first 20 rows.
3. Import account-scoped product/SKU metadata. Re-uploading identical bytes
   reuses the completed source run; a different workbook updates metadata while
   preserving stable identities and confirmed recipes.
4. Refresh matching status and inspect the queue counts. Do not force historical
   baseline counts by deleting current recipes.

### Rocket

Rocket identities are published as part of the complete preview collection in
`/purchase-orders?tab=rocket`. The server validates the active Rocket account,
exact vendor identity, evidence completeness, and canonical artifact hash.
Unseen older Rocket identities are not inactivated by a later partial date
range. Matching uses the same component-recipe surface as Coupang.

## Evidence And Confirmation Rules

| UI reason | Behavior |
|---|---|
| `상품코드 일치` | Exact Sellpia code from seller SKU/model/explicit option token. A unique active code can create the one-component `quantity=1` automatic recipe. |
| `고유 식별자` | One active Sellpia row matches the normalized 8–14 digit model/barcode. It can create the one-component `quantity=1` automatic recipe. |
| `중복 식별자` | More than one active Sellpia row shares the identifier. It is `needs_review`; no component is saved automatically. |
| `등록상품명 일치` | Registered and Sellpia names are equal after NFKC, lowercase, and Unicode whitespace removal. Punctuation is retained. This is review evidence only. |
| `이름 제안` | Search/similarity or future AI candidate derived from option/product names. It is display-only evidence. |
| `검색 결과` | A result from the operator's explicit Sellpia search. It is a candidate, not a recipe. |

Normalized-name equality intentionally does not remove arbitrary symbols and
does not infer pack quantities. It reduces formatting-only differences while
avoiding the larger false-positive set produced by punctuation stripping.
Multiple name-equal rows are all shown for review.

AI may help rank or explain candidates, but it must never call the recipe save
endpoint by itself. A suggestion becomes truth only after an authenticated
operator reviews every component and saves the complete recipe. Candidate
labels and `needs_review` are not aliases for a persisted mapping.

## Confirm Or Replace A Recipe

1. In `/product-hub/matching`, filter **전체 / 미매칭 / 확인 필요 / 매칭
   완료** and open **Sellpia 구성 매칭** for a SKU.
2. Review channel identifiers, registered name, option, all candidate reasons,
   current active state, and existing components.
3. Add every physical Sellpia component consumed by one sale. Use positive
   integer quantities only; never infer `4개`, `8개`, `묶음`, or bundle size
   from the name alone.
4. Save once the entire recipe is correct. The server atomically replaces the
   recipe, records a manual mapping source, and returns `matched`.
5. Reopen the SKU and confirm IDs/codes/quantities round-trip. Verify Sellpia
   stock is unchanged.
6. To remove a wrong recipe, use the explicit empty replacement. The current
   evidence derives `needs_review` or `unmatched`; it does not invent a new
   component.

Representative acceptance shapes are:

```text
A -> X x 1
B -> X x 8
C -> X x 1 + Y x 2
```

## Capacity Semantics

For a confirmed active recipe:

```text
component capacity = floor(MasterProduct.currentStock / component.quantity)
sellableStock = minimum component capacity
```

- `B -> X x 8` has capacity `floor(X.currentStock / 8)`.
- A mixed recipe reports the minimum and its bottleneck components.
- A confirmed active recipe with no capacity returns zero.
- Unmapped, review-only, or inactive-component recipes cannot be treated as a
  safe sellable quantity. They remain visible for correction.
- Capacity is a read projection. It never reserves or deducts stock.

## Recovery

| Symptom | Safe recovery |
|---|---|
| Wing account not found/wrong channel | Select an active organization-owned `channel='coupang'` account. |
| Wing workbook rejected | Correct the sheet/header/required identity problem and retry. The old metadata and recipes remain. |
| Duplicate import | Treat `duplicate=true` as successful idempotent reuse; do not edit the source run. |
| Ambiguous code/barcode/name | Open `/product-hub/matching`, review all candidates, and save the exact full recipe manually. |
| Only `이름 제안`/AI candidates exist | Search and verify against Sellpia. Do not mark matched merely because a suggestion looks plausible. |
| Saved component is inactive | Keep the diagnostic evidence, identify the correct active Sellpia SKU, and atomically replace the recipe. |
| Save rejects a component | Remove duplicate/invalid quantities and confirm every component is active and owned by the same organization. |
| Capacity is unavailable | Fix/confirm the complete active recipe and refresh Sellpia if stale. Do not substitute zero. |

## Verification

```bash
rtk npm exec --workspace=packages/shared vitest -- run src/schemas/channel-sku-matching.spec.ts src/schemas/channel-sku-availability.spec.ts
rtk npm exec --workspace=apps/server vitest -- run src/inventory src/channels
rtk npm run test:integration --workspace=apps/server -- src/inventory/__tests__/sellpia-inventory-import.repository.pg.integration.spec.ts src/channels/__tests__/channel-sku-mapping.pg.integration.spec.ts src/channels/__tests__/rocket-po-catalog.repository.pg.integration.spec.ts
rtk npm exec --workspace=apps/web vitest -- run src/app/\(catalog\)/product-hub/matching src/app/\(inventory\)/inventory-hub
rtk node --test scripts/__tests__/sellpia-authoritative-inventory-contract.test.mjs
rtk npm run check:idor
rtk npm run check:tenant-scope
rtk npm run build --workspace=packages/shared
rtk npm run build --workspace=apps/server
rtk npm run build --workspace=apps/web
```

Acceptance must show that exact deterministic evidence is the only automatic
one-unit path, normalized-name/similarity/AI evidence creates no component,
inactive recipes stay diagnosable, operator replacement is atomic, and every
non-Inventory `currentStock` writer count is zero.

## Blockers

Stop and report when the active organization/account cannot be established,
channel identity provenance is incomplete, a workbook/provider artifact would
need to be committed or logged, a recipe cannot be verified component by
component, an inactive/foreign component bypasses validation, or a non-Inventory
path writes stock.

## Final Report Format

```text
Release: 0.1.19
Channel account: <sanitized id>; channel <coupang|rocket>
Catalog provenance: <wing workbook|rocket collection>; rows <count>; duplicate <yes/no>
Queue: unmatched <n>; needs review <n>; matched <n>
Candidate evidence reviewed: code <n>; identifier <n>; normalized name <n>; suggestion/AI <n>
Automatic one-unit recipes: <count>; suggestion-created recipes: 0
Operator recipes verified: <component shapes>
Inactive recipe warnings resolved/preserved: <result>
Non-Inventory currentStock writes: 0
Automated gates: <commands and result>
Blockers: <none or exact blocker>
```
