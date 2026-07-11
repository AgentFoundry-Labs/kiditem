# Channel and Sellpia SKU Matching Schema Design

## Status

Approved in the design conversation on 2026-07-11. Written-spec review is
pending before implementation planning.

This document replaces the earlier broad inventory-ledger, Rocket PO, and
procurement design. The first implementation covers only marketplace catalog
metadata, Sellpia inventory rows, and their component mapping.

## Purpose

KidItem must store each marketplace's product and option metadata independently
from Sellpia inventory data. Operators and deterministic matching rules use that
metadata to decide which Sellpia-managed physical SKU or SKUs a marketplace SKU
represents and how many units it uses.

The confirmed mapping is durable. Product names, prices, or display metadata may
change later without forcing the system to match the SKU again.

## Source Files

The initial database is rebuilt only from:

- `/Users/yhc125/Downloads/Coupang_detailinfo_260711.xlsx`;
- `/Users/yhc125/Downloads/exported-list (3).xls`.

Previous `wing-inventory-matched` workbooks, ProductOption links, reconciliation
decisions, and inferred mappings are not imported.

The Coupang file supplies 2,241 valid Wing `vendorItemId` rows. The selected
Sellpia file supplies 1,964 unique product codes. The Coupang file does not
contain a channel sale-price column, so `ChannelSku.salePrice` remains null
until another Wing source supplies it.

## Scope

In scope:

- current Sellpia physical-SKU metadata and reported stock;
- marketplace parent-product metadata;
- marketplace option/SKU metadata, including identifiers and current price when
  a source provides it;
- one marketplace SKU mapping to one or more Sellpia physical SKUs with a
  positive quantity per component;
- deterministic candidate calculation and manual confirmation;
- idempotent source-file imports that preserve confirmed mappings.

Out of scope:

- Rocket PO confirmation or supplier procurement;
- order collection and fulfillment;
- inventory reservation, issue, receipt, adjustment, or reconciliation;
- channel stock upload;
- price history;
- mapping-recipe history or order-time component snapshots;
- persisted fuzzy-match candidates;
- a generic inventory-provider framework.

## Design Principles

1. Sellpia product code is the identity of one physical stock row.
2. A Sellpia product-code row becomes one `InventorySku`. Equal names or
   barcodes never merge two codes.
3. Marketplace metadata belongs to the marketplace account and sellable SKU,
   not to `InventorySku`.
4. Every marketplace option is a `ChannelSku`. A product without selectable
   options still has one `ChannelSku`.
5. Wing and Rocket both use `ChannelProduct -> ChannelSku`; a production
   `ChannelSku` never exists without a parent `ChannelProduct`.
6. Wing uses `sellerProductId` for `ChannelProduct.externalProductId` and
   `vendorItemId` for `ChannelSku.externalSkuId`.
7. Rocket uses its parent catalog product identifier for `ChannelProduct` and
   its option-level product/SKU identifier for `ChannelSku`. A Rocket PO row
   resolves an already imported SKU; it does not create a parentless SKU.
8. Confirmed component rows are the only mapping source of truth. Names,
   barcodes, model numbers, prices, and raw metadata are matching evidence only.
9. A normal sale, same-SKU multipack, and mixed bundle use the same component
   table.
10. KidItem never changes Sellpia-reported stock through a channel mapping.
11. Only fields needed for import, display, filtering, and mapping are
    normalized. Unused source columns stay in `rawJson`.

## Target Relationship

```text
Organization
  |
  +-- ChannelAccount
  |     |
  |     +-- ChannelProduct
  |            |
  |            +-- ChannelSku
  |                   |
  |                   +-- ChannelSkuComponent -- InventorySku
  |
  +-- SourceImportRun -----------------------------+
```

The target has five business models, including the existing `ChannelAccount`,
plus one minimal file-import record. Candidate rows, commercial submodels,
identifier tables, and recipe-version tables are intentionally omitted.

## Models

### ChannelAccount

The existing organization-scoped marketplace/store account remains.

Required fields used by this design:

```text
id
organizationId
channel
name
externalAccountId
status
```

Wing and Rocket use separate accounts even when both belong to Coupang.

### InventorySku

One Sellpia product-code row and physical stock unit.

```text
id                  UUID
organizationId      UUID
sellpiaProductCode  String
name                String
optionName          String?
barcode             String?
reportedStock       Int
purchasePrice       Int?
salePrice           Int?
rawJson             Json?
lastImportRunId     UUID?
createdAt           Timestamptz
updatedAt           Timestamptz
```

Rules:

- unique `(organizationId, sellpiaProductCode)`;
- composite unique `(id, organizationId)` supports same-organization component
  foreign keys;
- barcode is not unique;
- `reportedStock` is replaced only by a completed Sellpia import;
- `reportedStock` and non-null prices must be non-negative;
- no `masterId`, marketplace option state, bundle flag, available capacity,
  reserved stock, or safety-stock calculation;
- Sellpia purchase/sale prices are source metadata and never become channel
  prices automatically.

### ChannelProduct

The marketplace's registered parent product.

```text
id                  UUID
organizationId      UUID
channelAccountId    UUID
externalProductId   String
registeredName      String?
displayName         String?
category            String?
brand               String?
manufacturer        String?
status              String?
rawJson             Json?
lastImportRunId     UUID?
createdAt           Timestamptz
updatedAt           Timestamptz
```

Rules:

- unique `(channelAccountId, externalProductId)`;
- composite unique `(id, organizationId, channelAccountId)` supports a child
  relation that preserves both organization and account ownership;
- the row may exist before any Sellpia mapping;
- the matching schema does not require a `MasterProduct` relation;
- runtime imports update metadata but do not delete or remap child SKUs.

### ChannelSku

One marketplace sellable option or the single sellable unit of an optionless
product.

```text
id                  UUID
organizationId      UUID
channelAccountId    UUID
channelProductId    UUID
externalSkuId       String
sellerSku           String?
optionName          String?
barcode             String?
modelNumber         String?
salePrice           Int?
status              String?
mappingStatus       String
rawJson             Json?
lastImportRunId     UUID?
createdAt           Timestamptz
updatedAt           Timestamptz
```

`mappingStatus` is a validated string:

```text
unmatched | needs_review | matched
```

Rules:

- `channelProductId` is required for Wing, Rocket, and every later channel;
- unique `(channelAccountId, externalSkuId)`;
- composite unique `(id, organizationId)` supports organization-safe component
  relations;
- the composite parent relation requires ChannelSku and ChannelProduct to share
  both `organizationId` and `channelAccountId`;
- canonical SKU, barcode, model number, option name, status, and price are
  normalized because matching and operator filtering use them;
- remaining provider-specific fields stay in `rawJson`;
- price belongs here because different options may have different prices;
- a non-null price must be non-negative;
- a source import may update metadata but never clears confirmed components;
- changing a canonical external SKU identifier creates a new ChannelSku rather
  than silently retargeting an existing mapping.

### ChannelSkuComponent

The confirmed marketplace-to-Sellpia mapping and the only mapping source of
truth.

```text
id                  UUID
organizationId      UUID
channelSkuId        UUID
inventorySkuId      UUID
quantity            Int
mappingSource       String?
createdBy           String?
createdAt           Timestamptz
updatedAt           Timestamptz
```

`mappingSource` is descriptive evidence such as:

```text
exact_sellpia_code | unique_barcode | manual
```

Rules:

- unique `(channelSkuId, inventorySkuId)`;
- indexes on `organizationId`, `channelSkuId`, and `inventorySkuId`;
- composite foreign keys ensure ChannelSku and InventorySku belong to the same
  organization;
- deleting a ChannelSku may cascade to its components;
- deleting an InventorySku referenced by a component is restricted;
- `quantity` must be a positive integer, enforced by DTO/domain validation;
- a matched ChannelSku has at least one component;
- component replacement and mapping-status update occur in one transaction.

Examples:

```text
single
  ChannelSku A -> InventorySku X, quantity 1

same-SKU four-pack
  ChannelSku B -> InventorySku X, quantity 4

mixed bundle
  ChannelSku C -> InventorySku X, quantity 1
               -> InventorySku Y, quantity 2
```

### SourceImportRun

Minimal idempotency and provenance for an uploaded source file.

```text
id                  UUID
organizationId      UUID
sourceType          String
channelAccountId    UUID?
fileName            String
fileHash            String
status              String
rowCount            Int
importedAt          Timestamptz?
createdBy           String?
createdAt           Timestamptz
updatedAt           Timestamptz
```

`sourceType` begins with:

```text
sellpia_inventory | coupang_wing_catalog
```

Rules:

- a partial unique index on `(organizationId, sourceType, channelAccountId,
  fileHash)` applies when `channelAccountId IS NOT NULL`;
- a separate partial unique index on `(organizationId, sourceType, fileHash)`
  applies when `channelAccountId IS NULL`;
- Sellpia imports require a null `channelAccountId`; channel imports require the
  target account;
- status is `running | completed | failed`;
- a run is metadata only; the current normalized rows retain the source
  `rawJson` and `lastImportRunId`;
- row-level immutable history is not required by the matching-only scope.

## Import Behavior

### Sellpia

1. Validate the complete file before any write.
2. Reject blank or duplicate product codes and invalid stock.
3. Upsert InventorySku by `(organizationId, sellpiaProductCode)`.
4. Replace normalized metadata, prices, reported stock, raw JSON, and last run.
5. Set previously known Sellpia codes absent from the new complete file to
   `reportedStock = 0` without deleting their rows or channel mappings.
6. Mark the import completed in the same transaction.

### Coupang Wing

1. Upsert ChannelProduct by account and `sellerProductId`.
2. Upsert ChannelSku by account and `vendorItemId`.
3. Store registered/display names, category, brand, manufacturer, status,
   option name, barcode, model number, and raw row metadata.
4. Leave `salePrice` null because the selected source file has no price column.
5. Preserve existing ChannelSkuComponent rows on every re-import.
6. Retain inactive/stopped SKUs by status rather than deleting them.

Rocket catalog import follows the same parent/SKU invariants when its catalog
source is added. Rocket PO ingestion is not part of this schema release.

## Matching Behavior

Matching candidates are calculated when the operator opens or refreshes the
matching queue. They are not durable domain records.

Priority:

1. exact Sellpia product-code evidence in normalized channel metadata;
2. exact unique barcode or model-number evidence;
3. product-name/option-name search suggestions;
4. manual InventorySku search.

Names and prices never auto-confirm a mapping. A candidate becomes real only
when the system or operator atomically writes ChannelSkuComponent rows and sets
`mappingStatus = matched`.

No component is created automatically when:

- the identifier points to more than one InventorySku;
- a bundle quantity is unclear;
- the SKU is a mixed bundle;
- the candidate crosses organization boundaries.

## Existing Schema Transition

Existing stable channel IDs are preserved:

- `ChannelListing` is promoted to the `ChannelProduct` role;
- `ChannelListingOption` is promoted to the `ChannelSku` role;
- existing table/row IDs may be retained during the expand release even if the
  Prisma model names change later.

The following are removed from the active matching contract after consumers
switch:

- `ChannelListingOption.optionId` and `isUnmatched`;
- `ProductOption.isBundle` and `availableStock`;
- `BundleComponent` as a channel recipe;
- `ChannelReconciliationItem.linkedProductOptionId` matching;
- Sellpia difference, approval, adjustment, and Rocket-compensation fields;
- `SellpiaNewProductCandidate` for this workflow;
- previous inferred channel/Sellpia mappings.

`ProductOption`, legacy Inventory, ChannelListing, and ChannelListingOption
cannot be physically dropped in the first release because unrelated order,
advertising, supply, and audit records reference them. Deployment uses:

1. expand with the new contract and stable-ID bridge;
2. import the two approved source files and switch matching reads/writes;
3. verify the new relations;
4. remove obsolete physical schema in a later contract release.

Historical orders and audit records are preserved. Historical mappings are not
treated as current truth.

## Verification

- every valid Sellpia product code creates exactly one InventorySku;
- duplicate Sellpia names or barcodes remain separate rows;
- every Wing `sellerProductId` resolves to one ChannelProduct per account;
- every valid Wing `vendorItemId` resolves to one ChannelSku per account;
- every ChannelSku has a required ChannelProduct parent;
- a re-import updates metadata without clearing components;
- direct, multipack, and mixed mappings persist with exact quantities;
- duplicate components and non-positive quantities are rejected;
- cross-organization components are rejected by relation shape and service
  validation;
- changing channel or Sellpia names does not break a confirmed mapping;
- channel and Sellpia prices never overwrite one another;
- no matching operation changes `InventorySku.reportedStock`;
- old matching results are absent from the rebuilt current mapping set.

## Open Decisions

None for the matching-only schema. Price ingestion from a different Wing source,
Rocket catalog ingestion, order processing, and versioned decision snapshots
require separate designs when they enter scope.
