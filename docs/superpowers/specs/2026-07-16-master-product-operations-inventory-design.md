# MasterProduct Operations and Sellpia Inventory Design

Date: 2026-07-16  
Status: Approved design  
Release: `0.1.19` (not yet shipped; this corrects the in-development reconstruction)

## Context

The current reconstruction redefined `MasterProduct` from a KidItem-operated
product family into one physical Sellpia product-code row. That made physical
stock ownership unambiguous, but it removed the internal product unit used by
the product operations center. As a result, `/product-hub` was reduced to a
Sellpia SKU list and could no longer represent KidItem-owned product metadata,
variants, channel aggregation, advertising metrics, or profitability.

The approved correction keeps Sellpia as the physical inventory source of
truth while restoring `MasterProduct` as the KidItem product-operations unit.
It does not preserve or migrate the legacy staging product rows. Development
data is rebuilt against the new final schema.

## Decisions

1. `MasterProduct` is the KidItem-operated product unit.
2. `ProductVariant` is the reusable sellable unit beneath a `MasterProduct`.
3. `SellpiaInventorySku` is one physical Sellpia product-code row and owns
   current stock.
4. `ProductVariantComponent` defines the Sellpia SKU quantities required by a
   variant.
5. `ChannelListing` links to `MasterProduct` and `ChannelListingOption` links
   to `ProductVariant`.
6. Channel-specific component recipes are removed. Capacity is derived from
   the linked variant's centrally managed component recipe.
7. `/product-hub` shows KidItem products. `/product-hub/options` shows all
   Sellpia SKUs, including unlinked inventory. `/product-hub/matching` resolves
   channel product and option links.
8. Staging's legacy product data is not preserved. The development database is
   reset and replayed from current authoritative sources.

## Goals

- Restore the product operations center without making Sellpia SKU rows act as
  KidItem products.
- Keep one authoritative current-stock writer: a completed valid Sellpia
  inventory publication.
- Define a product and variant once, then reuse it across every marketplace.
- Support single products, variants, multipacks, and bundles without repeating
  component recipes per channel.
- Make KidItem-first registration automatically connected and channel-first
  registration explicitly reviewable.
- Keep unmatched Sellpia inventory visible without manufacturing products from
  names or AI suggestions.

## Non-goals

- Restoring the legacy editable product-option screen.
- Preserving staging's approximately 1,077 historical `MasterProduct` rows.
- Editing physical stock from the product operations center.
- Treating normalized names, barcode similarity, candidate rank, or an AI
  recommendation as matching truth.
- Reintroducing a separate Rocket inventory ledger, reservation stock, or
  channel-owned physical stock.

## Domain Model

```text
MasterProduct
  └─ ProductVariant
       └─ ProductVariantComponent(quantity)
            └─ SellpiaInventorySku(currentStock)

ChannelListing ────────────────> MasterProduct
ChannelListingOption ──────────> ProductVariant
```

### MasterProduct

`MasterProduct` owns product-operations identity and metadata:

- organization-scoped code and name;
- description, category, brand, tags, images, and active state;
- ABC grade, profit/ad tags, health state, and other product-level operating
  settings required by the preserved product operations center;
- relations to its variants and channel listings.

`MasterProduct` does not own a writable physical-stock value. Product-level
inventory facts are derived from the distinct Sellpia SKUs used by its active
variants.

### ProductVariant

`ProductVariant` is the reusable sellable unit for one `MasterProduct`.

- A simple product has one default variant.
- Color, size, or other selectable choices have separate variants.
- A multipack or bundle is also a variant with component quantities greater
  than one or with multiple component SKUs.
- The model remains internal even though the old product-option management
  screen stays removed.

Creating a `MasterProduct` atomically creates its supplied variants or one
default variant. A product is therefore never persisted without an explicit
sellable unit, although that variant may temporarily have `구성 필요` status.

An organization-scoped variant code is stable matching identity. Display
names and option labels may change without changing the identity.

### SellpiaInventorySku

`SellpiaInventorySku` owns physical Sellpia facts:

- organization and Sellpia product code;
- source product name and option name;
- barcode, purchase price, sale price, active state, and raw source data;
- current stock and last completed import provenance.

Unique identity is `(organizationId, code)`. Barcode is evidence, not unique
identity. A zero-stock SKU remains active when it is present in the latest full
snapshot. A missing SKU becomes inactive only through successful full-snapshot
publication.

A Sellpia SKU is considered unlinked when no active
`ProductVariantComponent` references it. Unlinked SKUs remain visible in
`/product-hub/options` and do not create `MasterProduct` rows.

There is no redundant `masterProductId` on `SellpiaInventorySku`. A SKU may be
reused by multiple variants, including bundles, and product association is
derived only through confirmed components.

### ProductVariantComponent

`ProductVariantComponent` is the central recipe:

```text
organizationId
productVariantId
sellpiaInventorySkuId
quantity (> 0)
source (manual | deterministic)
confirmedBy
confirmedAt
```

The pair `(productVariantId, sellpiaInventorySkuId)` is unique. Every foreign
key is organization-fenced. Candidate evidence is never persisted as a
component until an authorized operator confirms it or a deterministic
KidItem-first workflow supplies exact identity.

### Channel Relations

`ChannelListing.masterProductId` is nullable. `ChannelListingOption.productVariantId`
is nullable. Null means unmatched, not deleted.

When an option link is present, its `ProductVariant.masterProductId` must equal
the parent listing's `masterProductId`. An option cannot be linked while its
parent listing is unmatched. Services enforce this invariant inside one
organization-scoped transaction.

The current `ChannelSkuComponent` direct channel-to-Sellpia recipe is removed.
Every matched channel option inherits the linked variant's component recipe.
This prevents Coupang, Naver, and other channels from storing duplicate stock
recipes for the same sellable unit.

## Reference Ownership

References follow the fact they need:

| Consumer | Reference target | Reason |
|---|---|---|
| Product content, category, grade, health, advertising aggregation | `MasterProduct` | Product-level operating fact |
| Channel product | `MasterProduct` | Same product across channels |
| Channel sellable option | `ProductVariant` | Same sellable unit across channels |
| Supplier SKU, purchase item, transfer, picking, return movement | `SellpiaInventorySku` | Physical quantity and identity |
| Variant capacity and Rocket capacity | `ProductVariantComponent` + `SellpiaInventorySku` | Central component recipe and current stock |
| Product-level processing cost | `MasterProduct` unless the cost is explicitly SKU-specific | Operating cost rather than stock identity |

Existing relations that currently point at the reconstructed physical
`MasterProduct` must be reclassified by this table rather than mechanically
renamed.

## Inventory Calculations

### Variant capacity

For every active component:

```text
component capacity = floor(SellpiaInventorySku.currentStock / quantity)
variant capacity = minimum(component capacity)
```

A variant with no confirmed components has unknown capacity and the status
`구성 필요`. An inactive component makes the variant `검토 필요`. It must not
silently contribute zero as if the recipe remained valid.

### Product operations inventory

The product-list stock number is the sum of current stock across the distinct
active Sellpia SKUs referenced by the product's active variants. Each physical
SKU is counted once even when multiple variants reuse it.

- `품절`: all active, valid variants have capacity zero;
- `일부 품절`: at least one active variant has capacity zero and at least one
  has positive capacity;
- `구성 필요`: at least one active variant has no confirmed recipe;
- `검토 필요`: an active recipe references inactive or invalid inventory;
- `판매 가능`: at least one active, valid variant has positive capacity and no
  higher-priority warning applies.

The product-level stock number is a physical inventory summary. Variant
capacity remains the authoritative sellable quantity and is shown in product
detail and channel operations.

Portfolio-level inventory totals and asset values are always calculated
directly from distinct `SellpiaInventorySku` rows. They must never sum the
product-level presentation value because one physical SKU may participate in
variants belonging to more than one product.

## Creation and Matching Flows

### KidItem-first

```text
Create MasterProduct
-> create ProductVariant(s)
-> confirm ProductVariantComponent recipe(s)
-> register channel listing
-> persist ChannelListing.masterProductId
-> persist ChannelListingOption.productVariantId
```

Because exact internal identities are known, channel registration is connected
without a separate matching step.

### Channel-first

This section is superseded by the approved
[Coupang Channel-First MasterProduct Provisioning Design](2026-07-17-coupang-channel-first-master-product-provisioning-design.md).
Published Coupang detail chunks now create or uniquely reuse Products-owned
operating identities and Channels writes only still-null links in the same
transaction. Typed seller SKU and safe barcode are the only automatic reuse
evidence; normalized names, raw aliases, and AI never auto-save a link or
recipe.

### Sellpia-first

```text
Collect full Sellpia workbook
-> upsert SellpiaInventorySku rows
-> publish stock and active state atomically
-> leave SKUs without components in the unlinked inventory pool
-> link them when a ProductVariant is created or edited
```

No Sellpia row automatically creates a `MasterProduct` or `ProductVariant`.

## API Ownership

### Products

- `GET /api/products/masters`: paged product-operations list with product-level
  stock summary, channel metrics, status, and alerts;
- `GET /api/products/masters/:id`: product detail, variants, connected channel
  listings, component summaries, and operating facts;
- create/update operations for KidItem product metadata;
- variant create/update and recipe confirmation capabilities under the Products
  domain.

### Inventory

- `GET /api/inventory/sellpia-skus`: physical SKU list, filters, provenance,
  and linked/unlinked status;
- `GET /api/inventory/sellpia-skus/:id`: physical SKU detail;
- Sellpia collection, parsing, freshness, and atomic publication continue to be
  Inventory-owned;
- only successful Inventory publication writes `currentStock` and source
  active state.

### Channels

- channel collection owns `ChannelListing` and `ChannelListingOption` source
  facts;
- matching capabilities confirm product and variant links;
- channel availability reads the linked variant recipe and current Inventory
  stock;
- matching APIs return candidate evidence separately from confirmed truth.

### Orders and Supply

- order and Rocket purchase capacity resolve through
  `ChannelListingOption -> ProductVariant -> ProductVariantComponent -> SellpiaInventorySku`;
- the existing Sellpia freshness gate remains mandatory;
- order transmission schedules inventory refresh without predicting stock;
- purchase submission remains blocked when freshness, recipe, or component
  validity is not proven.

## Screens

### `/product-hub`

Preserve the staged product operations center:

- header controls;
- command cards;
- category strip;
- search and filters;
- traffic, order, sales, advertising, profitability, and inventory columns;
- product rows and detail entry.

The page reads `MasterProduct` operations data. It does not render raw Sellpia
rows. Products with incomplete recipes remain visible with `구성 필요`; an
unlinked Sellpia SKU does not appear as a product.

### `/product-hub/options`

Keep the Sellpia read-only table. Add linked state and destination product /
variant where present. Unlinked inventory is filterable and warning-centered.
The removed editable option-management screen is not restored.

### `/product-hub/matching`

Use two explicit confirmation levels:

- channel product -> `MasterProduct`;
- channel option -> `ProductVariant`.

The screen may show the inherited Sellpia component recipe and capacity, but
does not duplicate the recipe on the channel row.

## Freshness and Failure States

- Stale or failed Sellpia state shows a shared warning on product and matching
  screens and blocks freshness-gated purchase decisions.
- Unmatched channel product or option remains `미매칭`.
- Variant without components is `구성 필요`.
- Inactive or missing component is `검토 필요`.
- Failed candidate generation does not alter confirmed links.
- Recollection updates provider facts without clearing confirmed product or
  variant links.
- A full Sellpia import failure leaves the previous published inventory basis
  active and records the failed run.
- Tenant conditions apply to every read, mutation, unique constraint, and
  cross-model relation.

## Data Reset and Release

This correction is part of the unshipped `0.1.19` reconstruction, so no
additional release bump is required. Before shipping:

1. discard development-only reconstructed data;
2. apply the final schema;
3. create the minimum organization, membership, user, and channel-account
   metadata;
4. replay the current authoritative Sellpia workbook into
   `SellpiaInventorySku`;
5. replay current channel catalogs into unlinked channel listings/options;
6. create KidItem products and variants only through explicit development data
   bundles or product workflows;
7. confirm recipes and channel links explicitly.

No staging `MasterProduct` rows or legacy `ProductOption` rows are migrated.
The rebuild remains a controlled database operation and never a Git reset.

## Verification

Automated verification covers:

- organization isolation for all four core relations;
- Sellpia full-snapshot publication and inactive-row behavior;
- unlinked Sellpia inventory without automatic product creation;
- KidItem-first automatic product and variant channel links;
- channel-first candidate generation without automatic confirmation;
- single, multipack, and multi-component capacity;
- shared-SKU deduplication in product-level stock summaries;
- inactive and missing component warnings;
- order and Rocket freshness/capacity blocking;
- product-hub, options, matching, product-detail, order, and Rocket UI
  regression contracts.

End-to-end verification uses the actual scraper-driven Sellpia Excel download,
publishes the workbook into `SellpiaInventorySku`, creates a product and
variant recipe, links a collected channel option, and confirms that product
operations, matching, order collection, and purchase preview show the same
current inventory basis.

Required repository gates remain:

```bash
npm run db:push
npx prisma generate
cd packages/shared && npm run build
npm run dev:server
npm run build --workspace=apps/web
npx vitest run
```

## Superseded Decisions

This design supersedes only the portions of the Sellpia authoritative inventory
cutover that redefine `MasterProduct` as a physical Sellpia row, discard the
KidItem product-operations unit, or store component recipes directly per
channel option. It retains the approved single-writer Sellpia stock policy,
full-snapshot publication, freshness model, direct component-based capacity
math, and the prohibition on inference-based automatic matching.
