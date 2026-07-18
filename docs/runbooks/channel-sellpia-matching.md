# Collect Channel Identities And Confirm Sellpia Recipes

## Purpose

Use this runbook to collect marketplace identities, review Sellpia evidence,
and explicitly confirm the physical component recipe consumed by a sale. The
workflow has four stages:

1. collect and finalize account-scoped marketplace identities;
2. review the version-fenced deterministic preview;
3. explicitly apply only safe create-if-empty recipes;
4. confirm every remaining Bill of Materials (BOM) on product detail.

`SellpiaInventorySku` is the physical Sellpia product-code snapshot.
`ProductVariantComponent` is the central, reusable recipe for one KidItem
variant. They are never interchangeable. A recipe changes only through a
version-fenced explicit automation command or an operator's manual complete
replacement.

Inventory freshness and publication are owned by
[Sellpia Inventory Freshness Operations](sellpia-inventory-freshness.md).

## Prerequisites

- The operator is signed in to the intended KidItem organization.
- A completed Sellpia snapshot is available for that organization.
- The intended marketplace account is active and has the expected channel:
  `coupang` for Wing or `rocket` for Rocket.
- Approved provider workbooks and collection artifacts remain outside Git.
- Before starting a recipe campaign, any interrupted Coupang collection must
  be finalized. Do not review a partial collection as though it were complete.

## Safety And Ownership

- Inventory alone publishes `SellpiaInventorySku.currentStock` and active
  state. Import, matching, recipe review, and capacity preview never write
  physical stock.
- A recipe specifies every physical Sellpia component and its positive integer
  quantity for one sale. A single sale may require several components or more
  than one unit of a component.
- Recipe reads and writes are organization-scoped. Inactive or foreign
  Sellpia identities cannot be confirmed as components.
- Matching may preview evidence and existing recipe status without mutation.
  Its only write is the version-fenced, explicitly invoked deterministic
  command, which creates an empty recipe as exactly one active Sellpia
  component with quantity `1` and never replaces an existing recipe.
- Product detail remains the only manual recipe mutation surface. An operator
  saves the complete replacement recipe there after confirming the full BOM.
- A later channel recollection may change channel identity links but must not
  rewrite the central product-variant recipe.

## Stage 1 — Collect And Finalize Channel Identities

### Coupang Wing

1. Open `/product-hub/matching` and select the intended active Coupang
   account.
2. Import the approved Wing detail workbook. The import is account-scoped and
   preserves stable identities and confirmed recipes on a re-import.
3. Let collection complete, then verify the source run and matching queue are
   finalized before beginning recipe review.
4. If collection was interrupted, resolve or finalize that collection first.
   Do not begin a recipe campaign from an incomplete queue.

### Rocket

Rocket identities are published through the complete preview collection in
`/rocket-orders`. Confirm the selected active Rocket account,
exact vendor identity, collection completeness, and canonical artifact hash
before moving to evidence review. A partial collection does not inactivate
older identities.

## Stage 2 — Review The Version-Fenced Preview

Open `/product-hub/matching` to review a channel option’s identity evidence,
candidate Sellpia rows, active state, and current recipe status. This stage
proposes work; loading or filtering it does not create or edit a recipe. The
preview version hashes its business decisions, so changed evidence makes an
older apply request conflict instead of silently applying stale results.

| Evidence | Meaning | Operator action |
| --- | --- | --- |
| Exact Sellpia code | A typed seller SKU or model number exactly identifies one active Sellpia code. | It may be automatic only when all deterministic evidence agrees, the recipe is empty, and pack signatures do not require review. |
| Exact physical-barcode evidence | A valid 8–14 digit typed barcode uniquely identifies one active physical Sellpia row. | It may be automatic under the same empty-recipe, no-conflict, quantity-1 rules. |
| Stored generic barcode | A value stored on marketplace or catalog metadata without physical-barcode provenance. | It is not proof of a physical barcode and cannot confirm a recipe. |
| Strict normalized product name + option | NFKC, case-folded, whitespace-free product and option values exactly identify one active Sellpia row. | It may be automatic only as a complete pair under the same no-conflict and pack-signature rules. |
| Product name only | Only the formatting-normalized product name agrees. | Review-only evidence; never identity or quantity proof. |
| Similarity, AI, search, or manual candidate | A potentially useful candidate based on text or operator search. | Review-only; verify independently. |

Automatic eligibility requires all deterministic identifiers to resolve to the
same single active Sellpia SKU. One identifier resolving to several SKUs is
ambiguous; different identifiers resolving to different SKUs is a conflict.
Pack, set, bundle, or multi-unit signatures that disagree require quantity
review. Product-name-only matches, similarity, AI, candidate rank, raw aliases,
and every uncertain BOM remain non-automatic.

Use `/product-hub/options` to inspect the complete read-only Sellpia inventory
and its recipe-coverage counters. It can show confirmed destinations and
unlinked SKU counts, but it cannot edit stock, identity, linkage, or recipe
quantity.

## Stage 3 — Explicitly Apply Safe Empty Recipes

1. Filter the preview by automatic reason and inspect representative rows for
   exact code, unique physical barcode, and strict product-name plus option.
2. Verify that each candidate is one physical sale unit, has no hidden
   multi-component BOM, and does not contradict its channel option.
3. Open the confirmation dialog and apply the exact displayed proposal version.
4. The backend re-computes the preview. If it changed, refresh and review again.
5. Products locks each variant and creates one deterministic component with
   quantity `1` only when its recipe is still empty. Concurrent or existing
   recipes are skipped and preserved.
6. Refresh the matching, product operations, reverse-link, product-outflow, and
   Rocket preview screens. Confirm capacity now uses common availability and
   that `SellpiaInventorySku.currentStock` did not change.

Do not apply the batch when a sampled automatic row has a wrong physical item,
unrepresented pack size, or hidden BOM. Tighten the deterministic rule first
and generate a new preview.

## Stage 4 — Confirm Remaining Recipes On Product Detail

1. From the proposal, open the destination product detail and choose the
   specific KidItem variant.
2. Verify the physical Sellpia SKU IDs/codes, active status, and every unit
   consumed by one sale. Do not infer a quantity from a name, model string,
   `4개`/`8개` text, bundle wording, or candidate rank.
3. Enter every component of the BOM with a positive integer quantity. Review
   the complete replacement, including any existing components that must stay.
4. The operator explicitly saves the full recipe from product detail. The
   resulting atomic replacement is the confirmed mapping truth.
5. Reopen the detail and verify the component IDs/codes/quantities round-trip.
   Confirm that Sellpia stock did not change.

Representative confirmed shapes are:

```text
A -> X x 1
B -> X x 8
C -> X x 1 + Y x 2
```

To remove a wrong recipe, explicitly save the intended complete replacement
(including an empty recipe when appropriate). Evidence must never invent a
replacement component.

## Capacity Semantics

For a confirmed active recipe:

```text
component capacity = floor(SellpiaInventorySku.currentStock / component.quantity)
sellableStock = minimum component capacity
```

- A recipe `B -> X x 8` has capacity `floor(X.currentStock / 8)`.
- A mixed recipe reports the minimum capacity and its bottleneck component.
- Unmapped, review-only, or inactive-component recipes are not safe sellable
  quantities. Keep them visible for correction.
- Capacity is a read projection: it never reserves, issues, or deducts stock.

## Recovery

| Symptom | Safe recovery |
| --- | --- |
| Coupang collection is interrupted | Finalize or resolve the collection before starting the recipe campaign. Do not rely on a partial queue. |
| Account not found or wrong channel | Select an active organization-owned account with the expected exact channel. |
| Workbook or collection artifact is rejected | Correct the provider artifact and retry. Existing metadata and recipes remain intact. |
| Preview version conflicts on apply | Refresh the preview, inspect the changed decisions, and explicitly confirm the new version. |
| Exact code/barcode/name+option candidate has pack or BOM uncertainty | Do not automate it. Verify physical identity and the complete BOM on product detail. |
| Only product-name/similarity/AI evidence exists | Review candidates, verify independently, then explicitly confirm the recipe on product detail. |
| Stored barcode is the only evidence | Obtain physical-barcode provenance; a generic stored value is not enough. |
| Component is inactive or foreign | Select a valid active, organization-owned Sellpia SKU and explicitly replace the full recipe. |
| Capacity is unavailable | Verify the complete active recipe and refresh Sellpia when stale. Do not substitute zero or edit stock. |

## Verification

```bash
rtk npm exec vitest -- run packages/shared/src/schemas/inventory-snapshot.spec.ts
rtk npm exec --workspace=apps/server vitest -- run src/inventory/adapter/out/repository/inventory-sku-snapshot-list.repository.adapter.spec.ts
rtk npm run test:integration --workspace=apps/server -- src/channels/__tests__/channel-recipe-automation.pg.integration.spec.ts
rtk npm run test:integration --workspace=apps/server -- src/inventory/__tests__/inventory-sku-snapshot-list.repository.pg.integration.spec.ts
rtk npm exec --workspace=apps/web vitest -- run 'src/app/(catalog)/product-hub'
rtk npm run check:idor
rtk npm run check:tenant-scope
rtk npm run build --workspace=packages/shared
rtk npm run build --workspace=apps/server
rtk npm run build --workspace=apps/web
```

Acceptance must show that recipe coverage is exhaustive for the requested
active-status scope, linkage is organization-fenced, preview reads do not
mutate, deterministic apply creates only empty quantity-1 recipes, product
detail remains the only complete replacement surface, and physical stock is
unchanged.

## Blockers

Stop and report when the active organization/account cannot be established,
the Coupang collection is unfinished, sampled automatic evidence contradicts
the physical item or BOM, channel or physical identity provenance is incomplete,
the BOM cannot be checked component by component, a foreign or inactive
component would be used, or a non-Inventory path would write stock.

## Final Report Format

```text
Organization: <sanitized id>
Channel account: <sanitized id>; channel <coupang|rocket>
Collection: <Wing workbook|Rocket collection>; finalized <yes/no>; rows <count>
Evidence reviewed: exact code <n>; verified physical barcode <n>; normalized name <n>; candidate/AI <n>
Preview: auto code <n>; auto barcode <n>; auto name+option <n>; quantity review <n>; conflict/ambiguous <n>; name review <n>; no match <n>
Applied: variants <n>; affected options <n>; skipped existing <n>
Operator-confirmed remaining recipes: <component shapes>
Recipe automation writes: empty recipe only; one component; quantity 1
Non-Inventory currentStock writes: 0
Automated gates: <commands and result>
Blockers: <none or exact blocker>
```
