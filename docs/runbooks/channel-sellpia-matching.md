# Collect Channel Identities And Confirm Sellpia Recipes

## Purpose

Use this runbook to collect marketplace identities, review Sellpia evidence,
and explicitly confirm the physical component recipe consumed by a sale. The
workflow has exactly three stages:

1. collect and finalize account-scoped marketplace identities;
2. review read-only evidence and recipe proposals;
3. confirm the complete Bill of Materials (BOM) on product detail.

`SellpiaInventorySku` is the physical Sellpia product-code snapshot.
`ProductVariantComponent` is the central, reusable recipe for one KidItem
variant. They are never interchangeable, and no evidence automatically writes
a recipe.

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
- Matching is a read-only proposal surface for recipes. It may show evidence,
  candidates, and existing recipe status, but it must not save components or
  quantities.
- Product detail is the only recipe mutation surface. An operator saves the
  complete replacement recipe there after confirming the full BOM.
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

## Stage 2 — Review Read-Only Evidence

Open `/product-hub/matching` to review a channel option’s identity evidence,
candidate Sellpia rows, active state, and current recipe status. This stage
proposes work; it does not create or edit a recipe.

| Evidence | Meaning | Operator action |
| --- | --- | --- |
| Exact Sellpia code | A seller SKU, model, or explicit option token exactly identifies a Sellpia code. | Treat it as a proposal; verify the physical item and BOM before confirming a recipe. |
| Exact physical-barcode evidence | A uniquely verified physical barcode identifies one active Sellpia row. | Treat it as a proposal and verify the physical item and BOM. |
| Stored generic barcode | A value stored on marketplace or catalog metadata without physical-barcode provenance. | It is not proof of a physical barcode and cannot confirm a recipe. |
| Normalized name | Formatting-normalized registered/Sellpia names agree. | Review-only evidence; never identity or quantity proof. |
| Similarity, AI, search, or manual candidate | A potentially useful candidate based on text or operator search. | Review-only; verify independently. |

Exact code evidence is stronger than name similarity, but it remains a
proposal. Neither exact code nor any barcode field automatically creates a
`quantity=1` recipe. Normalized names intentionally remain review-only: they
do not establish identity, pack size, or BOM quantity.

Use `/product-hub/options` to inspect the complete read-only Sellpia inventory
and its recipe-coverage counters. It can show confirmed destinations and
unlinked SKU counts, but it cannot edit stock, identity, linkage, or recipe
quantity.

## Stage 3 — Confirm The Full Recipe On Product Detail

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
| Exact code or barcode looks convincing | Treat it as a proposal; verify physical identity and the entire BOM on product detail. |
| Only normalized-name/similarity/AI evidence exists | Review candidates, verify independently, then explicitly confirm the recipe on product detail. |
| Stored barcode is the only evidence | Obtain physical-barcode provenance; a generic stored value is not enough. |
| Component is inactive or foreign | Select a valid active, organization-owned Sellpia SKU and explicitly replace the full recipe. |
| Capacity is unavailable | Verify the complete active recipe and refresh Sellpia when stale. Do not substitute zero or edit stock. |

## Verification

```bash
rtk npm exec vitest -- run packages/shared/src/schemas/inventory-snapshot.spec.ts
rtk npm exec --workspace=apps/server vitest -- run src/inventory/adapter/out/repository/inventory-sku-snapshot-list.repository.adapter.spec.ts
rtk npm run test:integration --workspace=apps/server -- src/inventory/__tests__/inventory-sku-snapshot-list.repository.pg.integration.spec.ts
rtk npm exec --workspace=apps/web vitest -- run 'src/app/(catalog)/product-hub/components/ProductOptionsWorkspace.spec.tsx' 'src/app/(catalog)/product-hub/options/page.spec.tsx'
rtk npm run check:idor
rtk npm run check:tenant-scope
rtk npm run build --workspace=packages/shared
rtk npm run build --workspace=apps/server
rtk npm run build --workspace=apps/web
```

Acceptance must show that recipe coverage is exhaustive for the requested
active-status scope, linkage is organization-fenced, matching is read-only for
recipe proposals, and only product detail mutates the operator-confirmed BOM.

## Blockers

Stop and report when the active organization/account cannot be established,
the Coupang collection is unfinished, channel or physical identity provenance
is incomplete, the BOM cannot be checked component by component, a foreign or
inactive component would be used, or a non-Inventory path would write stock.

## Final Report Format

```text
Organization: <sanitized id>
Channel account: <sanitized id>; channel <coupang|rocket>
Collection: <Wing workbook|Rocket collection>; finalized <yes/no>; rows <count>
Evidence reviewed: exact code <n>; verified physical barcode <n>; normalized name <n>; candidate/AI <n>
Operator-confirmed recipes: <component shapes>
Recipe mutations outside product detail: 0
Non-Inventory currentStock writes: 0
Automated gates: <commands and result>
Blockers: <none or exact blocker>
```
