# Sellpia MasterProduct and Channel Product Reconstruction Design

## Status and Authority

Approved by the user in the design conversation and independently reviewed on
2026-07-12. This is the implementation-planning authority.

This document is the authoritative design for the reconstruction. It
supersedes:

- `2026-07-11-channel-inventory-sku-reconstruction-design.md`;
- the earlier `InventorySku`-authoritative contents of this file;
- `2026-07-11-channel-sellpia-matching-schema-contracts.md`;
- `2026-07-12-sellpia-authoritative-inventory-cutover.md`.

The superseded implementation plans must not be resumed. A new plan must be
written from this reviewed design.

## Context

KidItem currently has two competing product identities:

- `MasterProduct -> ProductOption -> BundleComponent`, originally designed as
  an internal product family and option catalog;
- `InventorySku <- ChannelSkuComponent <- ChannelListingOption`, added for
  Sellpia inventory and marketplace SKU matching.

That split does not match the operating model:

- Sellpia is the inventory-management service, not a marketplace;
- one Sellpia product code is the stable identity of one physical stock item;
- KidItem imports the latest completed Sellpia full snapshot and never
  independently adjusts that stock;
- marketplace stock consolidation into Sellpia happens upstream of KidItem;
  KidItem neither recomputes nor reconciles those final quantities;
- every marketplace keeps independent parent-product and sellable-SKU
  metadata;
- a marketplace SKU consumes one or more Sellpia items at positive component
  quantities;
- a bundle has no separately stored inventory balance;
- Wing and Rocket are separate sales channels;
- 1688 and Alibaba products remain sourcing candidates before registration,
  but use the same content tooling as registered channel products.

The current dual model also breaks the product screens. Sellpia imports create
`InventorySku` rows, while registered-product queries expect a
`ChannelListing.masterId`. Imported Wing listings therefore exist but are not
valid registered-product content owners.

## Goals

- Make one Sellpia product-code row one `MasterProduct`.
- Make the latest completed Sellpia workbook the only current-stock truth.
- Keep marketplace parent products and sellable SKUs independent by channel
  account.
- Store confirmed channel-SKU component recipes with positive quantities.
- Reuse one content workspace system for sourced and registered products.
- Keep existing operator routes while replacing their data sources.
- Rewire orders, supply, analytics, and record-only inventory operations to the
  correct identity.
- Preserve project migration contracts even though the local development
  database may be rebuilt.
- Keep only fields required for identity, import, display, matching, and
  current operations.

## Non-goals

- Determining Rocket purchase-order quantities.
- Mutating Sellpia or marketplace stock from KidItem.
- Reserving or allocating stock between sales channels.
- Reconstructing receipt or issue causality from snapshot differences.
- Fuzzy name-based automatic matching.
- Persisting a separate bundle stock value.
- Modeling 1688 or Alibaba option-level price and MOQ in this reconstruction.
- Importing current live Wing content when it does not already exist in
  KidItem.

## Approved Source Facts

The initial local rebuild uses:

- `Coupang_detailinfo_260711.xlsx`;
- `exported-list (3).xls`.

The validated source counts are:

- 1,964 unique Sellpia product codes;
- 1,225 Wing parent listings;
- 2,241 valid Wing sellable SKU rows.

The Sellpia workbook contains product code, name, option name, barcode,
purchase price, sale price, current stock, and additional raw fields. It has
1,758 distinct names, including 89 duplicate-name groups. Barcode is not a
stable unique key: 117 duplicated barcode groups cover 355 rows.

The Wing workbook contains registered-product IDs, registered and display
names, category, manufacturer, brand, approval and sale state, exposure-product
IDs, option IDs and names, up to 100 search-attribute pairs, model number, and
barcode. It does not contain a channel sale price, thumbnail, or detail-page
payload.

Only operational fields are normalized. The remaining provider-specific
columns are preserved in `rawJson` or `attributesJson`.

## Core Invariants

1. One `(organizationId, MasterProduct.code)` identifies one Sellpia product
   code.
2. Equal names, option names, or barcodes never merge two Sellpia codes.
3. Only a completed Sellpia full-snapshot import writes Sellpia-owned
   `MasterProduct` metadata and `currentStock`.
4. Orders, returns, picking, transfers, mappings, Rocket actions, and UI edits
   never mutate `MasterProduct.currentStock`.
5. A completed Sellpia full snapshot replaces all seen rows. A previously
   known code absent from that snapshot remains referentially stable with
   `currentStock = 0` and `isActive = false`.
6. A reappearing Sellpia code reactivates its existing `MasterProduct` row.
7. `ChannelAccount` is the sales-channel/store identity. Wing and Rocket use
   separate accounts.
8. `ChannelListing` is a marketplace parent listing. It is not a stock item.
9. `ChannelListingOption` is the actual sellable channel SKU. An optionless
   listing still owns exactly one sellable-SKU row.
10. `ChannelSkuComponent` is the only confirmed channel-SKU-to-physical-item
    recipe.
11. Every component quantity is positive. A single-item eight-pack is one
    component row with `quantity = 8`.
12. Channel imports never delete or overwrite confirmed component recipes or
    KidItem-authored content.
13. `SourcingCandidate` is the pre-registration product state. A product
    becomes registered when a real `ChannelListing` is created.
14. `ContentWorkspace` owns thumbnail and detail-page work. `MasterProduct`
    does not own marketplace content.
15. Unmatched capacity is unknown, not zero.
16. Mapping status describes channel-SKU identity only. It is not a stock
    mismatch or reconciliation state.
17. Every cross-model organization-owned relation uses an organization-safe
    composite foreign key; tenant equality is not left to a UUID-only join.

## Target Relationship

```text
Organization
  |
  +-- SourceImportRun
  |
  +-- MasterProduct <-------------------------------+
  |       ^                                         |
  |       | quantity                                |
  |       +-- ChannelSkuComponent                   |
  |                    ^                            |
  |                    |                            |
  +-- ChannelAccount --+-- ChannelListing           |
  |                          |                      |
  |                          +-- ChannelListingOption+
  |                          |
  |                          +-- ContentWorkspace
  |
  +-- SourcingCandidate
          |
          +-- ContentWorkspace
          +-- optional 1:1 MasterProduct provenance
          +-- source of one or more ChannelListing rows
```

The three identity axes are deliberately separate:

| Meaning | Owner |
|---|---|
| Physical Sellpia item and current stock | `MasterProduct` |
| Marketplace product and sellable SKU | `ChannelListing` / `ChannelListingOption` |
| Sourced or registered product content | `ContentWorkspace` |

## Core Models

### MasterProduct

`MasterProduct` is redefined from an internal product family to one Sellpia
product-code row.

```text
id                 UUID
organizationId     UUID
code               String
name               String
optionName         String?
barcode            String?
currentStock       Int
purchasePrice      Int?
salePrice          Int?
isActive           Boolean
rawJson            Json?
lastImportRunId    UUID?
createdAt          Timestamptz
updatedAt          Timestamptz
```

Rules:

- unique `(organizationId, code)`;
- composite unique `(id, organizationId)` for tenant-safe foreign keys;
- `code` is the Sellpia product code and is not globally unique;
- barcode remains non-unique;
- `isActive` means present in the latest completed full snapshot, not merely
  in stock;
- zero stock does not by itself deactivate a row;
- `lastImportRunId` records the import that last updated, deactivated, or
  reactivated the row;
- general product-edit APIs cannot write Sellpia-owned fields;
- `purchasePrice` and `salePrice` are Sellpia source values and never populate
  a marketplace SKU price automatically;
- no internal option, bundle flag, reserved stock, safety stock, content,
  sourcing, advertising, or channel-price field remains on this model.

The final field names `code`, `name`, `barcode`, `currentStock`,
`purchasePrice`, and `salePrice` reuse established names. This is not a claim
that the current `MasterProduct.code` has the same meaning: today it is a
globally unique internal-family code. Persistent migration must first stage a
separate Sellpia-code identity, validate collisions, repoint relations, and
only then contract-rename that identity to `code` and retire its allocator.

### ChannelAccount

`ChannelAccount` remains the organization-scoped marketplace/store account.

Required fields remain:

```text
id
organizationId
channel
name
externalAccountId
sellerId
vendorId
status
isPrimary
config
createdAt
updatedAt
```

`channel = "coupang"` (Wing) and `channel = "rocket"` are separate account
identities, preserving the repository's established channel values.
Provider-specific authentication or collection configuration remains in the
account or its protected integration configuration; it is not copied into
listings.

`ChannelAccount` adds composite unique `(id, organizationId)` so every
cross-domain account reference can enforce tenant scope in its foreign key.
Every operational account referenced by a listing, order, return, import, or
metric must also have a non-null canonical `externalAccountId`, unique by
`(organizationId, channel, externalAccountId)`. Draft account setup may be
incomplete, but cannot own operational rows.

### ChannelListing

`ChannelListing` is the marketplace parent registered product.

```text
id                 UUID
organizationId     UUID
channelAccountId   UUID
sourceCandidateId  UUID?
externalId         String
channelName        String?
displayName        String?
category           String?
manufacturer       String?
brand              String?
status             String?
rawJson            Json?
lastImportRunId    UUID?
isActive           Boolean
abcGrade           String?
profitTag          String?
adTier             String?
adBudgetLimit      Int?
healthScore        Int?
healthUpdatedAt    Timestamptz?
createdAt          Timestamptz
updatedAt          Timestamptz
```

Rules:

- `channelAccountId` is required in the final schema;
- account ownership uses composite `(channelAccountId, organizationId)` to
  `ChannelAccount(id, organizationId)`;
- composite unique `(id, organizationId)` scopes child listing-option and
  content relations;
- unique `(organizationId, channelAccountId, externalId)` across active and
  inactive rows, so a returning listing reuses its identity;
- `channel` is derived from `ChannelAccount` and is not duplicated;
- `masterId` and parent-level `channelPrice` are removed;
- `sourceCandidateId` records the sourcing origin when registration began in
  KidItem;
- `abcGrade`, `profitTag`, `adTier`, `adBudgetLimit`, `healthScore`, and
  `healthUpdatedAt` are KidItem-authored listing-operation fields; channel
  collection never overwrites them;
- one sourcing candidate may produce separate Wing and Rocket listings;
- at most one active listing exists for
  `(organizationId, sourceCandidateId, channelAccountId)` when the source is
  known, and `sourceCandidateId` is immutable after attachment;
- provider-only fields such as exposure-product ID, keywords, adult flag, and
  delivery metadata stay in `rawJson` until an operational query requires a
  normalized column.

### ChannelListingOption

`ChannelListingOption` is one actual sellable channel SKU.

```text
id                 UUID
organizationId     UUID
listingId          UUID
externalOptionId   String
itemName           String?
salePrice          Int?
costPriceOverride  Int?
commissionRate     Decimal?
shippingCost       Int?
otherCost          Int?
sellerSku          String?
barcode            String?
modelNumber        String?
status             String?
mappingStatus      String
attributesJson     Json?
rawJson            Json?
lastImportRunId    UUID?
isActive           Boolean
createdAt          Timestamptz
updatedAt          Timestamptz
```

Rules:

- unique `(listingId, externalOptionId)`;
- final account scope is derived through the required parent listing;
- listing ownership uses composite `(listingId, organizationId)` to
  `ChannelListing(id, organizationId)`, and the option keeps composite unique
  `(id, organizationId)` for downstream relations;
- `optionId`, `channelAccountId`, and duplicate `isUnmatched` state are
  removed;
- `mappingStatus` is a validated string: `unmatched`, `needs_review`, or
  `matched`;
- `matched` requires at least one component, while `unmatched` and
  `needs_review` have no confirmed component rows;
- purchase and search attributes are structured in `attributesJson`, not
  spread across provider-specific columns;
- `salePrice` remains null until a Wing API or another approved source
  supplies it;
- `costPriceOverride`, `commissionRate`, `shippingCost`, and `otherCost` are
  optional KidItem-authored commercial inputs owned by the sellable channel
  SKU and are never overwritten by catalog collection;
- the default physical cost is derived as
  `sum(component.masterProduct.purchasePrice * component.quantity)` when all
  component prices are known; `costPriceOverride` takes precedence only when
  an operator or an unambiguous legacy migration supplied it;
- a missing component price or unmatched recipe yields an unknown derived
  cost, not zero;
- an optionless product still creates one row.

### ChannelSkuComponent

```text
id                 UUID
organizationId     UUID
channelSkuId       UUID
masterProductId    UUID
quantity           Int
mappingSource      String
createdBy          String?
createdAt          Timestamptz
updatedAt          Timestamptz
```

Rules:

- unique `(channelSkuId, masterProductId)`;
- both relations are composite organization-safe foreign keys;
- `quantity > 0` is enforced by domain validation;
- `mappingSource` is one of `product_code`, `barcode`, `manual`, or
  `legacy_migrated`; it is required after backfill;
- rows are confirmed recipes, not candidate suggestions;
- component replacement and `mappingStatus` update occur in one transaction,
  preserving `component count > 0` if and only if status is `matched`;
- channel collection never edits these rows.

### SourceImportRun

The existing import-run ledger remains the idempotency and provenance owner.

- A monotonic `publicationSequence` fences full-snapshot publication within
  `(organizationId, sourceType)`.
- Sellpia imports use a Sellpia inventory `sourceType` and no channel account.
- Wing and Rocket catalog imports use their real `channelAccountId`.
- `(organization, source type, account, file hash)` identifies a completed
  import.
- `MasterProduct`, `ChannelListing`, and `ChannelListingOption` keep their
  tenant-safe `(lastImportRunId, organizationId)` relation.
- source files are not embedded into schema migrations or committed as test
  fixtures.

## Sourcing and Registration Lifecycle

### SourcingCandidate

1688 and Alibaba are sourcing platforms, not sales channels. They do not use
`ChannelAccount`, `ChannelListing`, or `ChannelListingOption`.

The existing `SourcingCandidate` remains the sourcing inbox and keeps:

- `sourcePlatform`, `sourceUrl`, and `rawData`;
- source title, description, category, tags, price evidence, and images;
- sourcing status and rejection metadata;
- content relations.

Candidate disposition remains `sourced` or `rejected`; preparation and
registration are derived from account-scoped preparations and listings. The
legacy `promoted` status is removed.

No `SourcingAccount` or `SourcingCandidateOption` is added in this
reconstruction. Platform-specific option, price, and MOQ data may remain in
`rawData`.

`promotedMasterId` is replaced by optional `provenanceMasterProductId` with a
tenant-safe unique relation, preserving the approved provisional 1:1
candidate-to-Sellpia-item provenance. That link:

- never creates a `MasterProduct`;
- never decides whether the candidate appears in the registered-products UI;
- may be filled only after the referenced Sellpia code exists;
- remains null when the source-to-Sellpia relationship is not known;
- is changed only by an audited registration/provenance command;
- is not cascaded away when a candidate is archived or soft-deleted;
  reassignment requires an explicit audited unlink;
- never seeds `ChannelSkuComponent`, listing visibility, or content ownership.

The legacy sourcing-promotion path is retired. Final code removes the service,
ports, status transition, and `/promote` behavior that create a
`MasterProduct` or return a `masterId`. Product registration begins by creating
a channel-scoped preparation and ends with a real provider listing; a
compatibility route must not preserve the old Master-creation semantics.

The replacement HTTP contract is explicit:

- canonical draft creation is
  `POST /api/sourcing/candidates/:id/preparations` with required
  `channelAccountId`, selected content IDs, and editable registration input;
- during the expand release, the old
  `POST /api/sourcing/candidates/:id/promote` route accepts that same body and
  acts only as a deprecated draft-creation alias;
- draft creation returns `{ preparationId, status: "draft" }`, never a
  `masterId`;
- submission is `POST /api/sourcing/preparations/:id/submit` and returns
  `{ preparationId, status, listingId? }`;
- after all callers migrate, the compatibility `/promote` alias is removed in
  the contract release.

The registered transition is instead:

1. An accepted candidate has no successful `ChannelListing` yet.
2. A target-channel `ProductPreparation` records the account-specific
   registration state.
3. Marketplace registration succeeds and returns a real listing identity.
4. `ChannelListing` is created with `sourceCandidateId`.
5. The collected and registered views derive the transition from listing
   existence rather than duplicating it in a global candidate status.
6. The candidate row remains as sourcing history and can still be the origin
   of a later listing in another channel account.

### ProductPreparation

`ProductPreparation` becomes a per-target-channel registration attempt rather
than a per-Master application record.

Required identity:

```text
organizationId
sourceCandidateId
channelAccountId
sourceContentWorkspaceId
channelListingId?
status
submissionKey
providerSubmissionId?
lastError?
registrationInput
registrationResult?
submissionPayloadJson?
submissionPayloadHash?
selected content references
createdByUserId
timestamps
```

Rules:

- one active preparation per `(organizationId, sourceCandidateId,
  channelAccountId)`;
- `sourceContentWorkspaceId` is immutable registration input and always points
  to the candidate-owned workspace;
- preparation creation atomically gets or creates the candidate's empty active
  workspace, so content generation is optional without making the workspace
  relation nullable;
- `masterId`, `isCurrentForMaster`, and `appliedToMasterAt` are removed;
- `channelListingId` is set after successful registration;
- a candidate may have separate preparations for Wing and Rocket.

The recoverable state machine is:

```text
draft -> submitting -> registered
  |          |
  v          v
cancelled   failed --retry--> submitting
```

- `draft`, `submitting`, and retriable `failed` are active preparation states;
- `registered` and `cancelled` are terminal;
- `submissionKey` is stable and unique for retries;
- the `draft -> submitting` transition freezes registration input, selected
  content IDs, `submissionPayloadJson`, and `submissionPayloadHash`;
- every retry with that key reuses the identical frozen hash; editing a failed
  submission cancels it and creates a new attempt and key;
- before repeating an uncertain external request, the service reconciles by
  provider submission ID or returned external listing identity;
- after provider success, one local transaction creates or resolves the
  listing, attaches the source, creates the listing workspace, and marks the
  preparation registered;
- a provider success followed by local failure is recovered by reconciliation,
  never by blindly creating a second provider product.

## Content Ownership

The existing content generation, artifact, revision, and thumbnail history is
retained. The owner boundary changes.

### ContentWorkspace

`ContentWorkspace` supports these validated owner types:

```text
sourcing_candidate
channel_listing
direct_detail_page
```

It keeps `sourceCandidateId` for a sourced workspace, adds
`channelListingId` for a registered workspace, adds optional
`originWorkspaceId` for content-branch provenance, and removes
`targetMasterId`.
The owner rules are:

- a sourced workspace belongs to one `SourcingCandidate`;
- a registered workspace belongs to one `ChannelListing`;
- a direct workspace has neither owner;
- each source candidate and channel listing has at most one active,
  non-deleted workspace; direct workspaces retain title-based identity;
- owner consistency is enforced in application validation and migration
  preflight.

The workspace owns current-content selection, including current detail-page
artifact and revision plus `currentThumbnailSelectionId` for a stable product
summary.

`ContentGenerationGroup.targetMasterId` is replaced with
`contentWorkspaceId`. `ContentAsset` becomes an organization-scoped shared
managed-media identity rather than workspace-owned storage. Its current
required group owner becomes optional `originGenerationGroupId` provenance
with `onDelete: SetNull`, so deleting or archiving an origin group cannot
cascade-delete an adopted asset. A new listing/source-owned
`ContentWorkspaceThumbnailSelection` records:

```text
id
organizationId
contentWorkspaceId
contentAssetId
sourceThumbnailGenerationId?
sourceThumbnailCandidateId?
createdByUserId?
createdAt
```

The selection is adoption/provenance, not a second generation job. A manual or
external URL is copied or registered into managed `ContentAsset` storage before
it can become current.

Every current selection is closed within one workspace: the selected detail
revision belongs to the selected artifact and workspace, and the current
thumbnail selection belongs to that workspace and a non-deleted managed asset.
Optional generation/candidate provenance must resolve to a successful,
non-deleted source job. Deleted or failed rows can never be current.

`ThumbnailGeneration`, `ThumbnailAnalysis`, `DetailPageArtifact`, and related
content rows resolve ownership through `ContentWorkspace`; duplicate direct
`MasterProduct` ownership is removed. `Thumbnail` remains listing-scoped CTR
tracking for content already applied to a channel listing.

When a sourced product is registered:

- its source workspace remains intact;
- a channel-listing workspace is created with `originWorkspaceId` pointing to
  the source workspace;
- selected detail artifact and revision metadata is cloned into listing-owned
  rows while object-storage references are reused;
- the listing creates its own thumbnail-selection row pointing to the existing
  managed `ContentAsset`, with optional source generation/candidate provenance;
- generation jobs and their candidates are never cloned as if they had run a
  second time;
- a listing workspace never selects a row owned by the source workspace;
- separate Wing and Rocket workspaces may diverge afterward;
- copying does not duplicate binary content unnecessarily;
- candidate/workspace archive and storage GC include both generation-usage and
  active thumbnail-selection references;
- an asset cannot be soft-deleted or physically removed while any active
  selection or generation usage references it.

Existing KidItem-authored content appears automatically after the workspace
and registered-product queries are rewired. A provider API is needed only when
the goal is to import live Wing content that KidItem has never stored.

## Import and Matching Behavior

### Sellpia Full Snapshot

1. Parse and validate the complete workbook before database writes.
2. Acquire the existing per-`(organizationId, sourceType)` database advisory
   lock or equivalent generation lease before publishing; different files for
   the same Sellpia source are serialized.
3. Claim an organization-scoped `SourceImportRun` using file hash, attempt
   fencing, and a monotonic publication generation.
4. In one transaction, upsert every row by `(organizationId, code)` and replace
   Sellpia-owned metadata and `currentStock`.
5. Mark every seen row active.
6. Set previously known unseen rows to `currentStock = 0` and
   `isActive = false` without deleting mappings or history.
7. Complete and publish the import run in the same transaction.
8. Invalidate inventory, asset, matching, stock-ops, registered-product, and
   dashboard queries after success.

A malformed workbook leaves the previous completed snapshot visible. A
duplicate completed file returns its prior result and does not mutate stock a
second time. Overlapping imports cannot both publish a mixed active set.

### Channel Catalog Collection

1. Scope the collection to a required `ChannelAccount`.
2. Upsert parents by `(organizationId, channelAccountId, externalId)`.
3. Upsert sellable SKUs by `(listingId, externalOptionId)`.
4. Update provider-owned metadata, raw payloads, source status, and import
   provenance.
5. Never overwrite content workspace selection, source-candidate provenance,
   `mappingStatus`, or component recipes.
6. Only an explicitly complete full-account import deactivates unseen rows.
   Partial API or scrape collections never deactivate unseen products.

### Automatic Mapping

Automatic mapping runs only for a channel SKU with no confirmed components.

- An exact normalized channel product code matching one active
  `MasterProduct.code` creates a quantity-1 component.
- Otherwise, an exact barcode matching exactly one active Master creates a
  quantity-1 component.
- Conflicting exact identifiers or duplicate matches produce
  `needs_review` and no component.
- No exact candidate produces `unmatched`.
- Product name, option label, category, price, and fuzzy similarity are display
  evidence only.
- Bundles and non-unit quantities require an operator-confirmed recipe.
- Manual mappings are never replaced by a later automatic pass.

### Read-time Channel Capacity

For a matched channel SKU:

```text
sellableCapacity = min(
  floor(component.masterProduct.currentStock / component.quantity)
)
```

Examples:

```text
single:       X stock 12, quantity 1              -> 12
eight-pack:   X stock 80, quantity 8              -> 10
mixed bundle: X stock 12, quantity 1; Y 9, qty 2  -> 4
```

The value is computed and never persisted. It does not reserve or divide stock
between channels. `unmatched` and `needs_review` return unknown capacity rather
than zero.

## Dependent Domain Rewiring

All existing foreign keys follow this rule:

| Business meaning | Final reference |
|---|---|
| Sale, order, review, ad, traffic, revenue | listing or listing option |
| Physical item, supplier, purchase, pick, transfer | MasterProduct |
| Thumbnail, detail page, generation | ContentWorkspace |

### Orders

- Add required `Order.channelAccountId`.
- Enforce it with composite `(channelAccountId, organizationId)` account
  ownership.
- Remove duplicated `Order.platform` and invalid parent `Order.listingId`.
- Use unique `(organizationId, channelAccountId, externalOrderId)`.
- Keep `OrderLineItem.listingOptionId` nullable so an unknown incoming SKU can
  be retained for review.
- Remove `OrderLineItem.optionId`.
- Preserve product name, option name, SKU, price, and raw metadata as the
  order-time snapshot.
- `OrderReturn` receives required `channelAccountId`, removes duplicated
  `platform`, and uses account-scoped external-return identity even when its
  order is unknown.
- Return lines prefer a tenant-safe `orderLineItemId`; orphan lines retain
  optional `listingOptionId`, external SKU, option name, and product-name
  snapshots so removing `ProductOption` cannot erase their only identity.
- `Shipment` becomes order-level. Partial/multi-line shipment detail belongs to
  `ShipmentItem(shipmentId, orderLineItemId, quantity)`, not direct listing or
  ProductOption columns.
- `UnshippedItem` references one `OrderLineItem` and keeps its display snapshot;
  duplicated listing and ProductOption foreign keys are removed.

Account consistency is transactional and migration-validated:

- every line's listing-option parent account equals its order account;
- a linked return account equals its order account;
- an orphan return's listing option, when resolved, belongs to the return
  account;
- every shipment item references a line from that shipment's order.

### Supply and Record-only Inventory Operations

- `SupplierProduct` becomes the single organization-scoped
  supplier-to-physical-product mapping with `supplierId`, `masterProductId`,
  `supplyPrice`, `minOrderQty`, `isPrimary`, and `memo`.
- It is unique by `(supplierId, masterProductId)`, uses composite tenant-safe
  foreign keys, and allows at most one primary supplier per Master.
- `MasterSupplierProduct` is removed only after its policy fields have been
  merged into `SupplierProduct`.
- `PurchaseOrderItem.optionId` becomes `masterProductId`.
- `PickingItem`, `StockTransfer`, and `ReturnTransfer` replace
  `inventorySkuId` with `masterProductId`.
- `PurchaseOrderItem` and `PickingItem` gain explicit `organizationId` and
  composite organization-safe references.
- Shipment, unshipped, receipt-upload, transfer, return, and picking records may
  remain operational records, but none writes `currentStock`.

### Advertising, Analytics, and Collection Snapshots

- Listing-level metrics reference `ChannelListing`.
- Sellable-SKU metrics reference `ChannelListingOption`.
- All legacy `ProductOption.optionId` snapshot relations are removed.
- Collection runs and account KPIs gain real `channelAccountId` scope where
  they currently rely only on a channel string.
- `MasterProduct` advertising tier, budget, and channel-performance fields are
  removed; channel commercial settings belong to listing-owned models.

### Rocket

- Rocket catalog products use a `channel = "rocket"` account and the same
  listing, option, content, and component models as Wing.
- Existing Rocket PO analytics may remain record-only during this
  reconstruction.
- Normalizing Rocket PO lines and deciding PO quantities are deferred and may
  not be smuggled into the catalog/matching cutover.

## Removed Models and Fields

The final schema removes these duplicate or obsolete models after persistent
data preservation gates pass:

```text
InventorySku
ProductOption
BundleComponent
MasterCodeCounter
MasterProductImage
MasterSupplierProduct
ChannelReconciliationRun
ChannelReconciliationItem
```

`MasterProduct` also drops former family, sourcing, content, advertising, and
pipeline fields whose owners are now explicit. `ChannelListing.masterId`,
`ChannelListingOption.optionId`, duplicated account/channel columns, and
`isUnmatched` are removed.

## API and Screen Cutover

Existing destinations remain; their reads and actions are replaced.

### Inventory Status

- `/inventory-hub` and `/stock-ops` read `MasterProduct` Sellpia rows.
- Operators can import a Sellpia full snapshot and inspect import history.
- Current stock, purchase price, sale price, active state, and last import are
  visible.
- No receipt, issue, adjustment, reservation, or direct stock-edit control is
  rendered.
- Inactive rows remain filterable.

### Channel Matching

- The mapping screen groups by `ChannelListing` and edits recipes per
  `ChannelListingOption`.
- It displays exact-match evidence, status, component stock, quantities, and
  read-time capacity.
- Automatic, manual, and review-needed states are distinct.
- Recollection refreshes provider metadata without resetting recipes.

### Registered Products

- Registered products query `ChannelListing`, not `masterId != null`.
- One `ChannelListing` is one card, list identity, and detail-route identity;
  its options are children rather than a Master-based group.
- The canonical detail route is `/product-pipeline/registered-products/:listingId`.
  Legacy polymorphic route resolution and Master-based `/groups` contracts are
  removed rather than guessing whether an ID is a workspace, candidate,
  listing, or Master.
- The list includes parent metadata, option/SKU rows, price when available,
  channel state, mapping state, current thumbnail, and current detail page.
- A listing with no mapping or content remains visible with an explicit empty
  state.

### Collected Products

- The active list includes accepted `SourcingCandidate` rows with no successful
  `ChannelListing`; per-account preparation state is displayed separately.
- Existing generation and editor surfaces continue through the source
  workspace.
- After the first successful listing, candidates leave the active collected
  list but remain in history and may still seed another account's preparation.

### Dashboard and Collection

- Dashboard collection upserts account-scoped listing, option, order, ad,
  review, and metric data through their owner APIs.
- Channel collection never changes Sellpia current stock.
- When a completed Sellpia snapshot exists, dashboard reads can join confirmed
  recipes to current physical stock and computed capacity.
- Unmatched items remain visible and contribute to separate unmatched counts.
- `/dashboard`, `/inventory-hub`, `/stock-ops`, and
  `/product-pipeline/registered-products` use the same owner contracts rather
  than separate compatibility projections.

## Error Handling

- Invalid workbook structure, duplicate Sellpia codes, invalid quantities, or
  invalid money values fail before snapshot writes.
- A failed import does not expose partial current data.
- A missing component target is an integrity error, not zero stock.
- Null purchase price is an explicit unpriced state, not zero cost.
- Accountless channel rows are rejected by final write paths.
- Every read and mutation is organization-scoped.
- Loading, empty, stale-import, failed-import, no-active-account, unmatched,
  and no-content states remain distinguishable in the UI.

## Migration Strategy

### Local Development

The currently approved local development database is disposable and may be
hard reset after verifying the effective database target is local. The reset:

- is a database operation, never `git reset --hard`;
- preserves the source workbook files;
- applies the final Prisma schema;
- imports Sellpia first and Wing second through real application paths;
- verifies counts, mappings, content empty states, and rendered routes.

This local reset is test setup, not a deployment migration.

### Persistent Shared Environments

Staging and production never use the destructive reset. Because the deploy
workflow runs pre-schema migrations, `db push`, post-schema migrations, and
then swaps the live application, the final destructive schema cannot be pushed
in the same deployment that needs legacy rows for backfill. Promotion therefore
uses three sequential releases, not one large destructive deployment.

As of this design, `develop` is still at `0.1.7`; the branch's `0.1.8` and
`0.1.9` work has not shipped and may be rewritten safely.

#### Release 0.1.8 — Expand

- Run preflight for row counts, null account IDs, identity duplicates, content
  owners, and every incoming legacy foreign key.
- Merge or block duplicate/null operational account identities before adding
  required account relations; display names are never account keys.
- Keep `InventorySku`, legacy `MasterProduct`, `ProductOption`, and their
  columns intact.
- Add staged Sellpia identity fields, final composite keys, target foreign
  keys, preparation state, and content-owner fields without destructive drops.
- Deploy dual-compatible writers/read adapters so the still-running old app
  cannot create rows invisible to the next backfill.
- Because the blanket v0.1.9 rejecting migration is unshipped, omit it from
  the 0.1.8 registry. Replace it with a version-matched expand-only scanner and
  schema-warning gate that permits the non-destructive shared deployment while
  rejecting any contract drop or unapproved warning.

#### Release 0.1.9 — Backfill, Fresh Snapshot, and Switch

- Introduce reviewed v0.1.9 pre/post-schema preservation migrations in place of
  the discarded draft blocker; no shipped registry contains a migration that
  always rejects shared targets.
- Build an explicit source-to-target mapping ledger and perform the preservation
  rules below idempotently.
- After expansion, run a fresh serialized Sellpia full snapshot in every
  organization. `InventorySku` cannot distinguish a present zero-stock row from
  an absent row zeroed by the same run, so `MasterProduct.isActive` is set only
  from membership in this newly published snapshot, never inferred from stock
  or old provenance.
- Backfill and validate final owner relations, then deploy application reads
  and writes on Master/listing/workspace ownership.
- Retain legacy tables and columns for rollback observation; do not contract in
  this release.

#### Release 0.1.10 — Contract

- Prove legacy consumer and writer counts are zero in code and runtime checks.
- Run the exact reviewed `db push` destructive-warning allowlist and reject any
  unexpected drop or warning.
- Remove obsolete tables, columns, APIs, services, shared contracts, and web
  compatibility code.
- Regenerate Prisma, ERD, Graphify, architecture documentation, and dev-data
  bundles from the final schema.

Each release has its own root `VERSION` and version-matched durable migrations.
Schema truth remains Prisma and deploys through `db:push`. Data rewrites live
under `scripts/data-migrations/v<VERSION>/`, are registered in the migration
index, and record their result in `data_migration_runs`. A release is not
collapsed into the next one merely because all code was developed locally at
once.

### Persistent Preservation Matrix

| Legacy source | Final target | Required preservation policy |
|---|---|---|
| `InventorySku` | staged Sellpia `MasterProduct` | One target per `(organizationId, sellpiaProductCode)`; reuse the source UUID only when collision-free, otherwise stop for an explicit ledger mapping; preserve stock, prices, raw data, and import provenance. |
| `ChannelSkuComponent.inventorySkuId` | `masterProductId` | Reject non-positive quantities; normalize null or unknown sources to `legacy_migrated` with audited counts; then repoint through the mapping ledger and preserve the canonicalized row count, quantity, source, creator, and timestamps. |
| Legacy `MasterProduct` | no automatic physical identity | Never treat a family row as Sellpia inventory by name or barcode; every retained incoming reference needs an explicit target or the migration blocks. |
| `ProductOption` commercial references | `ChannelListingOption` or order-line snapshot | Use an existing unique listing-option relation and row context; block one-to-many or absent identity instead of choosing arbitrarily. |
| `ProductOption` physical references | `MasterProduct` | Use an explicit confirmed component/Sellpia mapping; bundle or ambiguous options require reviewed split/backfill instructions. |
| `BundleComponent` | no blind copy | Convert only when a real channel SKU owns the equivalent approved recipe; otherwise retain until reviewed or block contract removal. |
| `SupplierProduct` + `MasterSupplierProduct` | final `SupplierProduct` | Merge supply price, MOQ, primary policy, and memo by organization/supplier/target Master; conflicting convergences block automatic migration. |
| Orders, returns, shipments, unshipped rows | account, order line, listing option, and snapshots | Repoint by provider/account and line context; preserve explicit external SKU/name snapshots for orphan rows. |
| Master/candidate content | source or listing `ContentWorkspace` | Resolve an unambiguous owner, clone listing-owned metadata where required, preserve storage references and provenance, and block ownerless retained content. |
| Duplicate listing identities | one canonical `ChannelListing` | Scan active and inactive rows; merge only after repointing every option, recipe, content, order, snapshot, and metric FK and recording an auditable merge count; conflicting retained data blocks. |

### Account Backfill Precedence

Required account relations use deterministic evidence in this order:

1. provider seller/vendor account identity in the source payload;
2. an already linked listing or listing option's account;
3. the legacy parent listing account;
4. the sole active account for the legacy platform, only when exactly one
   exists.

Ambiguous or missing account identity blocks the migration. `OrderReturn`
follows its linked order when present and otherwise uses its own provider
identity; it never guesses from a display name. Duplicate operational accounts
with the same canonical key are merged only after all incoming references are
repointed; conflicting accounts block.

## Verification and Acceptance

### Schema and Migration

- clean schema has no `InventorySku`, `ProductOption`, or bundle stock model;
- `MasterProduct` has organization-scoped Sellpia-code identity;
- every final channel listing has a channel account;
- all component, order, supply, content, and snapshot foreign keys point to the
  correct final owner;
- persistent migration tests prove idempotency, preservation, and refusal on
  ambiguous legacy state;
- for every organization, target Sellpia Master count equals source
  `InventorySku` count after the required fresh snapshot;
- the component multiset `(channelSkuId, targetMasterId, quantity,
  mappingSource, createdBy)` equals the pre-migration multiset after applying
  the audited identity map and documented `legacy_migrated` source
  canonicalization;
- every retained physical, commercial, order, supplier, and content source row
  is accounted for by one target row, an explicit split, or a blocking report;
- listing deduplication reports canonical IDs, repointed-row counts, and every
  removed duplicate;
- release contract and migration registry checks pass.

### Source Imports

- approved Sellpia file produces 1,964 active Masters in a clean organization;
- approved Wing file produces 1,225 listings and 2,241 sellable SKUs;
- Wing mapping-status partitions sum to 2,241; every matched SKU owns at least
  one component and every unmatched/review SKU owns none;
- duplicate completed imports do not create duplicates;
- a later Sellpia snapshot updates seen rows, deactivates missing rows, and
  preserves recipes;
- channel recollection preserves manual recipes and content selection.

### Mapping and Capacity

- unique exact code and unique exact barcode create quantity-1 automatic
  mappings;
- duplicate, conflicting, and absent identifiers produce the correct review
  state without a component;
- manual single, eight-pack, and mixed-bundle recipes calculate expected
  capacity;
- unmatched capacity is null/unknown rather than zero.

### Content and Lifecycle

- sourced and registered products use the same content generation and editor
  contracts through different workspaces;
- registration creates a real listing, preserves candidate history, and
  initializes a channel-specific workspace;
- Wing and Rocket content can diverge independently;
- registered-product and dashboard reads expose current content when it exists
  and an explicit empty state when it does not.

### Required Project Gates

- `npm run db:push`;
- `npx prisma generate`;
- `npm run build --workspace=packages/shared`;
- `npm run db:erd`;
- `npm run graphify:schema`;
- `npm run dev:server` with a successful boot;
- `npm run build --workspace=apps/web`;
- focused server, shared, migration, import, mapping, and UI tests;
- browser verification of dashboard, inventory, stock-ops, matching,
  collected-products, and registered-products flows.

## Final Decisions

- `MasterProduct` is one Sellpia product-code row and owns current stock.
- Sellpia import is the only current-stock writer.
- Channel metadata remains independent by account and sellable SKU.
- `ChannelSkuComponent` owns confirmed component quantities.
- `ProductOption`, `InventorySku`, and duplicate bundle stock are removed from
  the final model.
- Sourcing candidates remain pre-registration records and do not become sales
  channels.
- Sourced and registered products share content tooling through
  `ContentWorkspace`.
- A real `ChannelListing` creation is the registered-product transition.
- Rocket is a channel, while Rocket PO decisions remain deferred.
- Existing routes remain and are rewired to the final owners.
- Local verification may rebuild its database; shared environments preserve
  data through guarded versioned migrations.
