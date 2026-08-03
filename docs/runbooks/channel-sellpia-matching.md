# Match Channel Listings And Sellpia Inventory

## Purpose

Use this runbook to connect marketplace catalog options to the physical Sellpia
inventory consumed by each sale. `MasterProduct` is the canonical inventory
product created from that source identity, not a separate channel product. The
model has three explicit layers:

```text
MasterProduct <- SellpiaInventorySku.masterProductId
SellpiaInventorySku
  <- ChannelListingOptionInventoryComponent
ChannelListing
  -> ChannelListingOption
  -> ChannelListingOptionInventoryComponent
```

`MasterProduct` is the inventory product and sole ABC-grade owner.
`ChannelListing` is one channel listing. `ChannelListingOption` is a sellable
channel option. `SellpiaInventorySku` is the physical stock authority. There is
no intermediate ProductVariant or second recipe layer. Multiple channel
products/options may consume one MasterProduct. A listing-level MasterProduct
is merely an automatic single-product summary.

Inventory freshness and publication are owned by
[Sellpia Inventory Freshness Operations](sellpia-inventory-freshness.md).

## Prerequisites

- Sign in to the intended KidItem organization.
- Complete a Sellpia inventory snapshot for that organization.
- Select an active `coupang` or `rocket` ChannelAccount.
- Finish any interrupted catalog collection before treating absent listings or
  options as inactive.

## Safety And Ownership

- Only Inventory publishes `SellpiaInventorySku.currentStock` and active state.
- Matching and capacity reads never decrement or otherwise mutate physical
  stock.
- A complete option recipe is the matching source of truth. The nullable
  `ChannelListing.masterProductId` summary is derived only when every option
  resolves to one MasterProduct. Candidate evidence is never confirmed truth.
- One option component row stores an active Sellpia SKU and the positive integer
  quantity consumed by one sale. A sale may consume multiple SKUs.
- Component reads and writes are organization-fenced. A complete replacement
  uses the expected current components, so concurrent or stale edits conflict.
- Catalog recollection preserves option component rules. It does not create a
  channel-origin MasterProduct; it derives the listing summary from recipes.

## Stage 1 — Collect Channel Listings

### Coupang Wing

1. Open `/product-hub/matching` and select the Coupang account.
2. Run the Wing catalog collection from the authenticated Chrome extension.
3. Wait for complete finalization before reviewing missing listings/options.
4. Confirm that re-collection preserved already linked products and components.

### Rocket

Rocket listings/options are published from the complete collection on
`/rocket-orders`. Confirm the active Rocket account, exact vendor identity,
collection completeness, and source artifact before reviewing components.

## Stage 2 — Configure Option Inventory Consumption

For every `ChannelListingOption`, including currently stopped options:

1. Verify the physical Sellpia SKU IDs/codes and active state.
2. Enter every SKU unit consumed by one option sale as a positive integer.
3. Review the complete component list, including components that must remain.
4. Save the complete replacement and reopen it to verify IDs and quantities
   round-trip.
5. Confirm `SellpiaInventorySku.currentStock` did not change.

Representative rules:

```text
channel option A -> Sellpia X x 1
channel option B -> Sellpia X x 8
channel option C -> Sellpia X x 1 + Sellpia Y x 2
```

Saving each recipe automatically derives the listing summary. If all options
resolve to the same MasterProduct it is linked once; if an option is missing or
the listing consumes multiple MasterProducts, the summary remains null. The
option recipes remain valid in both cases.

The deterministic matching command may fill an empty component list only when
organization-fenced evidence uniquely selects one active Sellpia SKU and the
pack ratio is a verified positive integer. It applies one common title quantity
rule to every channel: for example, `10개입` becomes 10 and `2개입 x 3세트`
becomes 6. It also corrects the quantity of an existing one-component recipe
from that rule, but never changes its selected Sellpia SKU or automatically
alters a multi-component BOM. Conflicting identifiers or title quantities, an
uncertain pack/BOM, generic barcode, raw alias, similarity, rank, or AI
requires operator review.

Use `/product-hub/options` to inspect the complete read-only Sellpia collection
and confirmed channel-option destinations. That screen cannot edit stock,
identity, or component quantity.

## Capacity And Quantity-Deduction Semantics

For one option's confirmed active component list:

```text
availableStock = max(currentStock - activeCommitmentQuantity, 0)
componentCapacity = floor(availableStock / component.quantity)
optionCapacity = minimum componentCapacity
```

Shared Sellpia SKUs consume one common availability pool during a preview or
allocation. The component list defines how many physical units one sale
consumes; it does not directly decrement `currentStock`. A completed Sellpia
snapshot remains the evidence for real-world stock changes.

An empty component list is `configuration_required`. An inactive referenced SKU
is `needs_review`. Neither is treated as a confirmed zero-capacity product.

## Recovery

| Symptom | Safe recovery |
| --- | --- |
| Catalog collection is interrupted | Resume/finalize it before reviewing absence. |
| Wrong account/channel | Select an active organization-owned account with the exact channel. |
| Listing summary points to the wrong product | Clear the option recipes and save the correct Sellpia SKU/quantity rules; the summary is rebuilt automatically. |
| Component evidence is ambiguous | Verify the physical item and full BOM, then save a complete replacement. |
| Component is inactive or foreign | Select a valid active organization-owned Sellpia SKU. |
| Expected-component conflict | Refresh the option and reapply the reviewed complete list. |
| Capacity is unavailable | Verify components and refresh Sellpia when stale; never substitute zero or edit stock. |

## Verification

```bash
rtk npm exec --workspace=apps/server vitest -- run \
  src/channels/application/service/__tests__/channel-product-matching.service.spec.ts \
  src/channels/application/service/__tests__/channel-sku-availability.service.spec.ts \
  src/products/application/service/product-operations.service.spec.ts
rtk npm exec --workspace=apps/web vitest -- run 'src/app/(catalog)/product-hub'
rtk npm run build --workspace=packages/shared
rtk npm run build --workspace=apps/server
rtk npm run build --workspace=apps/web
```

Acceptance must show that catalog collection preserves confirmed data, listing
links and option components are organization-fenced, candidate reads do not
mutate, capacity uses direct component quantities and common availability, and
physical Sellpia stock is unchanged.

## Blockers

Stop and report when the organization/account cannot be established, collection
is incomplete, the physical item or BOM cannot be verified, a foreign/inactive
component would be used, or any non-Inventory path would write physical stock.
