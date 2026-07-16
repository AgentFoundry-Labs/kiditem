# Coupang Channel-First MasterProduct Provisioning Design

Date: 2026-07-17  
Status: Proposed design for implementation planning  
Release: `0.1.19` (in development; no additional version bump)

## Context

The browser-based Coupang Wing collector already publishes `ChannelListing`
and `ChannelListingOption` rows incrementally. The registered-products screen
therefore shows collected Coupang products, but `/product-hub` remains empty
until a separate operator action creates and links a `MasterProduct`.

That separation no longer matches the approved operating model. A collected
channel product is already an item KidItem must operate, even when its Sellpia
recipe is unresolved. Collection must make the item visible in product
operations without claiming that a name similarity is inventory truth.

This design changes the channel-first portion of the approved
`MasterProduct Operations and Sellpia Inventory` design. It retains Sellpia as
the only physical-stock source of truth and retains explicit recipe
confirmation.

## Decisions

1. Every successfully published Coupang `ChannelListing` has an active
   `MasterProduct` link before its detail chunk transaction commits.
2. Existing confirmed product and variant links are never overwritten by
   recollection.
3. Exact deterministic identifiers may reuse an existing `MasterProduct` or
   `ProductVariant`; normalized names never auto-confirm a link.
4. If no safe existing product is resolved, Products creates a channel-origin
   `MasterProduct` and channel-origin variants and Channels links the collected
   listing and options to them in the same publication transaction.
5. Auto-created variants have no Sellpia component recipe. Their existing
   `configuration_required` state is rendered to operators as
   `재고 연결 필요` where appropriate.
6. AI matching and AI candidate recommendations are outside this work.
7. The registered-products list refreshes whenever the server reports a higher
   `publishedProducts` count, not only when the full collection completes.

## Domain Model Delta

The existing ownership graph remains:

```text
ChannelListing ────────────────> MasterProduct
ChannelListingOption ──────────> ProductVariant
ProductVariant ────────────────> ProductVariantComponent
ProductVariantComponent ───────> SellpiaInventorySku(currentStock)
```

`MasterProduct` gains nullable, immutable channel-origin provenance:

```text
originChannelListingId
```

The field is organization-fenced and unique when present. It identifies the
listing that caused an automatic product to be created; it is not the current
channel link. `ChannelListing.masterProductId` remains the current confirmed
operational link.

This separation prevents duplicate automatic products after retries or an
explicit unlink. If an operator reassigns the listing to another product, the
origin product is preserved rather than automatically deleted or deactivated.
The operator may deactivate it through the existing product editor after
reviewing any variants or recipes it owns.

No separate persisted `provisional`, `mappingStatus`, or inventory status is
added. The existing relations derive the state:

- listing linked, variant recipe absent: `재고 연결 필요`;
- listing linked, channel option unlinked: `옵션 연결 필요`;
- recipe contains an inactive component: `검토 필요`;
- valid recipe: capacity derived from Sellpia inventory.

## Deterministic Resolution Policy

Publication evaluates only active, organization-owned identities. Evidence is
allowed to select an existing target only when it resolves uniquely and all
usable evidence agrees on one `MasterProduct`.

Evidence priority is:

1. the listing or option's existing confirmed link;
2. exact `MasterProduct.code` from an explicit provider product code;
3. exact `ProductVariant.code` from a seller SKU;
4. exact active `SellpiaInventorySku.code` through a confirmed variant
   component;
5. a unique normalized barcode through a confirmed variant component.

An identifier that resolves to multiple products or variants is ambiguous and
does not auto-link. Conflicting exact identifiers also do not auto-link.

The strict registered-name normalization already implemented by the matching
workspace remains candidate evidence only:

1. Unicode NFKC;
2. lowercase;
3. remove Unicode whitespace;
4. preserve meaningful symbols such as `+`, `-`, `/`, and `&`.

Neither a unique normalized-name candidate nor an option-name similarity may
create a product, confirm a different existing product, create a recipe, or
infer component quantity.

## Publication Flow

Each validated Coupang product-detail chunk uses one existing publication
transaction:

```text
upsert ChannelListing and ChannelListingOption source facts
  -> lock the published listing rows
  -> preserve every existing confirmed link
  -> resolve exact deterministic product/variant targets
  -> reuse the channel-origin product for the listing when it already exists
  -> otherwise create one channel-origin product and its variants
  -> write only still-null ChannelListing/ChannelListingOption links
  -> publish provider media
  -> mark the chunk published
  -> commit
```

Products owns product and variant creation through a transaction-aware incoming
capability exported by `ProductsModule`. Channels passes the existing
publication transaction as an opaque transaction scope, following the current
catalog-media publication boundary. Channels remains the only writer of
`ChannelListing.masterProductId` and
`ChannelListingOption.productVariantId`.

The channel-origin product is seeded once:

- product code: deterministic from the stable `ChannelListing.id`;
- product name: registered name, then display name, then external product ID;
- category and brand: current collected values when present;
- one variant per active collected option;
- variant code: deterministic from the stable `ChannelListingOption.id`;
- no `ProductVariantComponent` rows.

Later recollection updates channel source facts but does not overwrite
operator-edited product names, codes, categories, brands, active state, or
recipes. Newly discovered options under an existing channel-origin product may
create a new channel-origin variant; missing channel options are inactivated by
Channels and do not delete the internal variant.

When exact evidence selects an existing product, only uniquely resolved
existing variants are linked. Unresolved options remain visible in the
matching queue; collection does not manufacture variants under an
operator-managed product.

## Concurrency and Idempotency

- Catalog publication keeps its account-scoped advisory lock.
- Published listing rows are locked before product resolution.
- `(organizationId, originChannelListingId)` prevents duplicate channel-origin
  products.
- Product and variant codes are deterministic and organization-unique.
- Link updates are conditional on a null current link. A concurrent manual
  confirmation wins and causes publication to preserve that confirmation.
- Replaying the same detail chunk returns its prior publication result without
  creating products or variants again.
- Final full-snapshot publication repeats identity upserts idempotently and
  performs absence reconciliation without changing confirmed links.

## Screen Behavior

### Registered products

The existing screen and card composition stay unchanged. During a running
collection, each increase in `publishedProducts` invalidates and refetches the
channel-listing query. Completion performs one final invalidation. The hook
also invalidates product-operations data so navigating to `/product-hub`
immediately reads the new products.

### Product operations

`/product-hub` continues to read only Products-owned `MasterProduct` data.
Channel-origin products appear through the existing rows and detail route. An
additive origin badge may identify `쿠팡 수집`, while the existing product
operations composition from commit
`c9e7caf875ca82574ae566a27fe0afa35c988918` remains intact.

Products with variants but no Sellpia components display the existing warning
state with the operator-facing copy `재고 연결 필요`. Their stock and capacity
remain unknown rather than zero.

### Matching

`/product-hub/matching` remains the correction workspace. Automatically linked
products remain reassignable. Options linked to channel-origin variants show
`재고 연결 필요` and direct the operator to the existing product-detail recipe
editor. Ambiguous exact identifiers and unresolved options remain explicit
review rows.

The matching screen does not invoke AI, create component recipes, or infer
quantities. The browser collector remains the canonical Coupang catalog ingest;
this work does not add another Excel-only catalog path.

## Failure Behavior

- Failure to create or link the operational product rolls back that product's
  chunk publication; no listing-only partial state becomes visible.
- Ambiguous or conflicting deterministic evidence is not an error. It creates
  or reuses the listing's channel-origin product and leaves unsafe option links
  unresolved.
- Invalid or cross-organization identifiers fail the transaction.
- Media failure retains the existing catalog-media failure semantics.
- Sellpia freshness does not block catalog collection. It blocks only the
  existing freshness-gated stock and purchase decisions.
- A failed recollection preserves the prior completed listing, product,
  variant, recipe, and inventory basis.

## Testing Strategy

### Domain and service tests

- exact code, seller SKU, Sellpia code, and unique barcode resolution;
- ambiguous and conflicting identifiers produce no existing-product decision;
- normalized names never auto-confirm;
- deterministic product/variant codes are stable and within contract limits;
- existing links always win;
- a new channel-origin product receives one variant per active option and no
  recipe.

### PostgreSQL integration tests

- chunk publication atomically creates and links the operational product;
- replay does not duplicate products or variants;
- the organization-origin unique fence prevents cross-account and cross-tenant
  collisions;
- manual product and option links survive recollection;
- concurrent manual linking wins without leaving an extra automatic product;
- unresolved exact evidence creates a channel-origin product but no Sellpia
  component;
- final absence reconciliation does not delete internal products or variants;
- product-operations list shows the newly published product with
  `configuration_required` inventory.

### Web tests

- registered-products invalidates channel-listing data on every monotonic
  `publishedProducts` increase and once on completion;
- duplicate polling values do not cause repeated invalidations;
- product operations shows channel-origin rows without changing its preserved
  layout;
- matching distinguishes `재고 연결 필요`, `옵션 연결 필요`, and
  `검토 필요` without AI actions.

### Live acceptance

1. Keep the backend and web apps in watch mode.
2. Start or resume the real scraper-driven Coupang Wing catalog collection from
   the registered-products screen; do not upload a catalog workbook manually.
3. Confirm that each published chunk increases the visible registered-product
   card count without waiting for finalization.
4. Open `/product-hub` and confirm the collected products exist as
   `MasterProduct` rows with channel links.
5. Confirm an unmatched channel-origin variant displays `재고 연결 필요` and
   no invented Sellpia quantity.
6. Configure one variant with an actual Sellpia inventory SKU and confirm
   product operations, matching, and channel availability read the same stock.
7. Resume or replay collection and confirm product, variant, and confirmed link
   IDs remain stable.

## Release and Documentation

This persisted schema and behavior change belongs to the already in-development
`0.1.19` release. Root `VERSION` remains `0.1.19`; it is not bumped for each
local change. The implementation updates the current architecture/spec and
scoped ownership guides that presently prohibit channel-first product
provisioning.

No staging product data migration is required. Development data may be rebuilt
from current authoritative Sellpia and Coupang sources, as already approved.

## Acceptance Criteria

1. A published Coupang listing appears in `/product-hub` without a separate
   product-matching action.
2. Recollection and retry do not create duplicate `MasterProduct` or
   `ProductVariant` rows.
3. Existing manual links and recipes are never overwritten.
4. Only unique, non-conflicting exact identifiers may reuse existing product
   or variant identities.
5. Registered-name normalization remains suggestion-only and never writes a
   link or recipe.
6. AI is not used or added by this work.
7. Auto-created variants have no recipe and show `재고 연결 필요` until an
   operator connects Sellpia inventory.
8. Registered-product cards refresh progressively as scraper chunks publish.
9. The preserved product management and matching layouts remain intact.
10. Live verification uses the actual browser scraper path and the current
    Sellpia inventory basis.
