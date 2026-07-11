# Sellpia Snapshot and Channel SKU Reconstruction Design

## Status

Approved on 2026-07-11.

This design supersedes the stock-ownership, reconciliation, and bundle
assumptions in
[`2026-06-28-sellpia-rocket-inventory-sync-design.md`](./2026-06-28-sellpia-rocket-inventory-sync-design.md).
It also replaces the earlier revision of this document that treated KidItem as
the inventory ledger.

## Purpose

KidItem imports a complete Sellpia inventory workbook, stores that workbook as
the current physical-stock snapshot, maps marketplace sellable units to the
physical SKUs in the snapshot, and calculates the quantity to upload to each
channel.

Sellpia is the only inventory source of truth. KidItem is a snapshot,
identity-mapping, bundle-conversion, and channel-upload system. It is not a
second stock ledger.

The target flow is:

```text
shopping-mall activity
  -> Sellpia calculates the final inventory
  -> operator exports the complete Sellpia workbook
  -> KidItem atomically replaces its inventory snapshot
  -> KidItem converts physical quantities through ChannelSku components
  -> KidItem uploads the calculated quantity to Wing, Rocket, and later channels
```

## Approved Business Decisions

1. The complete Sellpia workbook is authoritative for every physical stock
   quantity in KidItem.
2. A successful import replaces the whole organization snapshot. It is not a
   partial update or reconciliation proposal.
3. A previously known Sellpia product code missing from the new workbook gets
   stock `0`; its identity and channel mappings are retained.
4. A valid, previously unknown Sellpia product code automatically creates a new
   independent physical `InventorySku` and its Sellpia identity mapping.
5. KidItem does not calculate differences, request stock-adjustment approval,
   apply order deltas, maintain Rocket compensation, or add ledger values to the
   Sellpia quantity.
6. KidItem does not reserve, issue, release, or receive physical stock in
   response to marketplace orders. Those effects are reflected by Sellpia and
   arrive in the next complete workbook.
7. Sellpia is an inventory-management service, not a `ChannelAccount`.
8. Coupang Wing and Coupang Rocket are distinct channels.
9. A marketplace option or Rocket item is a `ChannelSku`, not an internal
   inventory option.
10. A bundle has no independent inventory balance. Its available quantity is
    calculated from one or more `InventorySku` component rows.
11. A normal one-unit sale uses one component with quantity `1`; a same-SKU
    four-pack uses one component with quantity `4`.
12. A Rocket order quantity of two for a four-pack represents eight fulfillment
    units, but it does not subtract eight from KidItem's imported snapshot.
13. The latest imported snapshot remains in effect until the next import.
    Post-snapshot overlays and cross-import order compensation are out of scope.
14. Matching review applies only to marketplace `ChannelSku` composition. It
    does not apply to Sellpia stock quantities.

## Evidence From Current Files

The operator-supplied Wing workbook contains:

- 2,241 rows with a valid `vendorItemId`;
- 1,225 `sellerProductId` values among those rows;
- 137 seller products with more than one option row;
- 773 active and 1,468 stopped option rows;
- only 26 nonblank barcode cells;
- 44 seller products whose exposed `productId` is not one-to-one with the
  seller product.

Therefore:

- Wing `sellerProductId` is the channel-product identity;
- Wing `vendorItemId` is the channel-SKU identity;
- exposed `productId`, barcode, model number, name, and option text are aliases
  or matching evidence only;
- names and barcodes cannot be universal automatic join keys.

The inspected Sellpia export contains 1,963 unique product codes. Barcodes and
names are not unique, so Sellpia `상품코드` is the only automatic identity for
snapshot replacement.

The inspected Rocket PO contains a four-pack whose Rocket barcode does not
exist in the Sellpia or Wing files. Its component is a Sellpia-managed base SKU.
This confirms that Rocket identity and physical inventory identity must remain
separate and that component quantity must be explicit.

## Domain Boundaries

```text
Products
  MasterProduct -- MasterProductInventorySku -- InventorySku

Inventory
  SellpiaInventoryItem -- InventorySku -- Inventory
  SellpiaImportRun -- SellpiaImportRow

Channels
  ChannelAccount (Wing or Rocket)
    -> ChannelProduct
    -> ChannelSku -- ChannelSkuIdentifier
                  -- ChannelSkuComponent -- InventorySku

Orders / Fulfillment
  OrderLine -- OrderLineInventoryComponentSnapshot -- InventorySku
```

### Products

`MasterProduct` owns merchandising, content, and family-level planning. It may
be associated with physical SKUs, but that association is not marketplace
option state and does not own stock.

### Inventory

Inventory owns physical SKU identity and the latest Sellpia quantity
projection. It accepts stock writes only from the complete Sellpia snapshot
importer. Import history is audit evidence only; it is never a reconciliation
queue or a second balance calculation.

### Channels

Channels owns marketplace product/SKU identity, status, aliases, and the
component recipe that converts a physical snapshot into a channel quantity.
Wing and Rocket use the same component model through separate channel accounts.

### Orders and Fulfillment

An order or Rocket PO may snapshot the component recipe for picking, labels,
returns, and audit. That snapshot records required physical units but never
mutates the imported inventory quantity.

## Target Data Model

All provider, channel, and status fields remain validated strings rather than
native PostgreSQL enums.

### InventorySku

`InventorySku` is one physical stock, purchase, scanner, and warehouse unit.

Core fields:

- `id`
- `organizationId`
- internal `sku`
- `name`
- nullable barcode and cost metadata
- physical status
- timestamps

Rules:

- unique `(organizationId, sku)`;
- no `masterId`, marketplace option name/status, or channel identifier;
- no `isBundle` or materialized bundle capacity;
- no Sellpia product code embedded as the internal identity;
- an SKU remains addressable after it disappears from a snapshot;
- a missing SKU's stock becomes zero rather than deleting the SKU.

### MasterProductInventorySku

This relation associates a merchandising family with a physical SKU.

Rules:

- unique `(masterProductId, inventorySkuId)`;
- both records belong to the same organization;
- removing the relation never deletes the physical SKU or Sellpia identity;
- display text and sort order may live on the relation;
- stock and channel option state do not live on the relation.

### Inventory

`Inventory` remains one-to-one with `InventorySku` during the reconstruction.
Its authoritative quantity is:

```text
Inventory.currentStock = latest complete Sellpia workbook row 재고
```

Rules:

- channel availability reads `currentStock` directly;
- `reservedStock`, `safetyStock`, Rocket ledger values, and order deltas do not
  reduce or increase the channel quantity;
- the first cutover snapshot clears legacy reserved/safety projections to zero;
- Sellpia import does not create `StockTransaction` adjustments;
- existing transaction and Rocket-ledger rows remain immutable history but are
  not read for current stock;
- runtime stock-mutation APIs cannot change Sellpia-managed current stock.

A later cleanup may replace legacy balance fields with a narrower snapshot
quantity field. The user-visible switch does not depend on that physical column
rename.

### SellpiaInventoryItem

This is the current external identity mapping for the inventory service.

Core fields:

- `id`
- `organizationId`
- `sellpiaProductCode`
- `inventorySkuId`
- latest name, barcode, model number, and source metadata
- `lastSeenImportId`
- timestamps

Rules:

- unique `(organizationId, sellpiaProductCode)`;
- exactly one physical SKU per Sellpia product code;
- exactly one active Sellpia product code per physical InventorySku;
- Sellpia code is matched exactly as text and never by name or barcode;
- a missing code remains mapped and receives stock zero;
- duplicate codes in one workbook reject the entire import;
- an unknown valid code creates both the mapping and its InventorySku in the
  same transaction using the organization-scoped internal SKU allocator;
- a legacy conflict in which multiple Sellpia codes point to one InventorySku
  blocks cutover until each code has an independent physical target.

### SellpiaImportRun and SellpiaImportRow

Each uploaded workbook records immutable audit data:

- organization, actor, file name, SHA-256, imported time, row count, and status;
- every validated source row's product code, stock, metadata, and raw row;
- counts of created SKUs, updated SKUs, and zeroed missing SKUs.

The rows prove what was imported but do not store targets, differences,
recommendations, approvals, Rocket compensation, or applied transactions.
Re-uploading the same completed file hash for the same organization is
idempotent and returns the prior result.

### ChannelProduct

The channel parent identity.

- Wing canonical external ID: `sellerProductId`.
- Wing exposed `productId`: alias or metadata only.
- Rocket may omit a parent when a feed exposes only `productNo`.
- unique `(channelAccountId, externalId)` when a parent exists.

### ChannelSku

The channel-specific sellable or fulfillment unit.

- Wing canonical external ID: `vendorItemId`.
- Rocket canonical external ID: `productNo`.
- unique `(channelAccountId, externalId)`.
- status and aliases belong to the channel, not to `InventorySku`.
- no direct `inventorySkuId` shortcut exists.
- `matched` requires at least one valid component; `unmatched` blocks upload.

### ChannelSkuIdentifier

Stores barcode, exposed product ID, model number, and legacy identifiers for
search and matching evidence. An alias never bypasses the approved component
mapping and need not be globally unique.

### ChannelSkuComponent

The current channel recipe.

Core fields:

- `channelSkuId`
- `inventorySkuId`
- positive integer `quantity`
- timestamps

Rules:

- unique `(channelSkuId, inventorySkuId)`;
- channel and inventory SKU belong to the same organization;
- nested bundles and bundle inventory do not exist;
- recipe replacement is atomic;
- changes affect future calculations and future fulfillment snapshots only.

Examples:

```text
Wing single
  vendorItemId=A -> Sellpia base SKU × 1

Rocket four-pack
  productNo=B -> Sellpia base SKU × 4

Mixed set
  externalId=C -> red SKU × 1
               -> blue SKU × 2
```

### OrderLineInventoryComponentSnapshot

When a Rocket PO or marketplace order needs fulfillment support, KidItem may
store the recipe used at acceptance:

- channel SKU and mapping version;
- physical InventorySku;
- quantity per sellable unit;
- accepted sellable quantity;
- total fulfillment quantity.

The snapshot is immutable and supports picking and return evidence. It creates
no reservation, issue, release, receive, or adjustment in Inventory.

## Stock Calculations

### Physical Snapshot Quantity

```text
physicalQuantity(inventorySku) = latest Sellpia-imported currentStock
```

No KidItem field or ledger is added to or subtracted from this value.

### Channel Availability

For a matched ChannelSku:

```text
channelAvailable = min(
  floor(physicalQuantity(component.inventorySku) / component.quantity)
  for every component
)
```

Missing Inventory, no components, invalid quantities, or an unmatched mapping
blocks the upload. Stopped channel SKUs remain stored but are excluded from
active upload.

Example:

```text
Sellpia base stock = 80
Wing single quantity = 80
Rocket four-pack quantity = floor(80 / 4) = 20
```

If a Rocket PO requests two four-packs, the fulfillment snapshot records eight
base units. `Inventory.currentStock` remains 80 until a newer Sellpia workbook
replaces it.

## Workflows

### Complete Sellpia Snapshot Import

1. Parse XLS, XLSX, CSV, or supported Sellpia text export.
2. Require `상품코드` and `재고` and normalize Excel text formulas.
3. Reject blank/duplicate product codes, negative stock, non-integer stock, an
   empty file, or a file above the configured row limit.
4. Acquire one organization-scoped import lock.
5. Create an import run and immutable row records.
6. Resolve exact existing Sellpia codes.
7. Auto-create InventorySku, Inventory, and SellpiaInventoryItem for every new
   valid code.
8. Set every represented Inventory quantity exactly to the workbook value.
9. Set every organization Inventory quantity not represented by the current
   complete Sellpia snapshot to zero.
10. Update current source metadata and last-seen import IDs.
11. Commit all rows, zeroing, and the completed import result atomically.

No preview approval, per-row approval, difference threshold, safety-stock
normalization, Rocket correction, or stock ledger entry exists. A failure in
any row rolls back the entire replacement and leaves the previous snapshot
active.

### Wing Catalog Import

1. Upsert ChannelProduct by Wing account and `sellerProductId`.
2. Upsert ChannelSku by Wing account and `vendorItemId`.
3. Preserve exposed product ID, barcode, names, and option text as aliases or
   metadata.
4. Import all valid active and stopped rows.
5. Retain stopped rows and approved components but exclude them from upload.
6. Apply only deterministic one-to-one bootstrap mappings automatically.
7. Route ambiguous multi-option, duplicate-barcode, and bundle composition to
   the channel-mapping UI.

Repeated imports update metadata and status without duplicating identities or
clearing approved components.

### Rocket Catalog and PO

1. Use a separate Rocket ChannelAccount.
2. Upsert or resolve ChannelSku by `productNo`.
3. Store Rocket barcode as an alias, never as a physical-SKU foreign key.
4. Require approved component rows before calculating stock or confirming a
   fulfillment quantity.
5. Calculate Rocket availability from the latest Sellpia snapshot and component
   quantities.
6. When needed, persist the immutable fulfillment recipe and generated artifact
   idempotently.
7. Do not mutate Inventory for confirmation, outbound, cancellation, or return.

A single calculation batch may use an in-memory remaining quantity so two lines
in the same artifact do not allocate the same snapshot units twice. No persisted
overlay is carried to another batch or the next import.

### Channel Inventory Upload

For every active matched ChannelSku:

1. read the latest Sellpia-backed component quantities;
2. calculate `channelAvailable`;
3. render the channel-specific stock request or workbook;
4. record upload/result idempotency without changing physical stock.

Each channel receives the calculated quantity from the same Sellpia snapshot.
KidItem does not split inventory into channel-owned pools or anticipate orders
that Sellpia has not yet reflected.

## Matching Policy

### Sellpia to InventorySku

- exact Sellpia product code is authoritative;
- an existing proven legacy mapping is preserved;
- otherwise a new independent InventorySku is created;
- barcode and product name never merge two Sellpia codes automatically;
- stock values require no operator review.

### ChannelSku to InventorySku

Automatic bootstrap is allowed only for deterministic one-to-one evidence.
The following require review:

- fuzzy or name-only candidates;
- duplicate barcodes;
- seller-product-only matches for multi-option products;
- same-SKU multipacks whose quantity is not explicit;
- mixed bundles;
- Rocket barcode without an approved `productNo` recipe.

Every approved mapping stores the source channel identity, components,
quantities, actor, evidence, and time.

## Legacy Migration and Cutover

The user-visible reconstruction release is `0.1.8`; destructive legacy schema
cleanup is `0.1.9`.

### Release 0.1.8: Expand, Backfill, and Switch

- create InventorySku and MasterProductInventorySku;
- preserve non-bundle ProductOption UUIDs where they represent physical units;
- create SellpiaInventoryItem mappings from proven Sellpia codes;
- create ChannelProduct, ChannelSku, identifiers, and component rows;
- convert normal direct mappings to component quantity `1`;
- expand legacy bundles into ChannelSkuComponent rows without creating bundle
  inventory;
- import the first complete Sellpia snapshot and replace every current quantity;
- clear legacy reserved and safety projections;
- switch channel availability and Rocket calculations to direct snapshot
  quantity;
- stop all runtime ProductOption stock mutation, Rocket ledger compensation,
  Sellpia reconciliation approval, and Sellpia outbound export paths;
- retain legacy transactions and old Sellpia/Rocket records as read-only audit.

The first complete snapshot is the cutover boundary. After it commits, no old
balance is authoritative and no dual write is allowed.

### Release 0.1.9: Contract Cleanup

After production evidence confirms the new paths:

- verify every active channel mapping and physical reference has migrated;
- remove ProductOption-owned stock and BundleComponent-owned stock semantics;
- remove Sellpia reconciliation/review/export models and APIs that have no
  historical retention requirement;
- archive or retain immutable legacy audit rows that must remain traceable;
- remove active RocketInventoryLedger reads and writes;
- remove reservation/safety calculations from channel availability;
- physically drop obsolete schema only behind reviewed data-loss controls.

## Error Handling and Idempotency

- one invalid Sellpia row rejects the whole import;
- a transaction failure preserves the previous complete snapshot;
- concurrent imports for one organization serialize;
- a completed file hash is idempotent;
- organization identity comes from authentication, never a trusted DTO field;
- cross-organization channel components are rejected;
- missing or invalid channel components block only that ChannelSku's upload;
- channel upload retries reuse source-scoped idempotency keys;
- the system reports the age of the latest Sellpia snapshot because it does not
  maintain a post-import overlay.

## Operator Surfaces

Inventory Hub has three relevant surfaces:

1. `Sellpia 재고 가져오기`
   - upload a complete file;
   - show structural validation, row count, created/updated/zeroed counts, file
     hash, result, and latest snapshot age;
   - no difference table or per-row stock approval.
2. `실물 SKU`
   - show the latest imported quantity, Sellpia product code, source metadata,
     and MasterProduct associations;
   - quantity is read-only.
3. `채널 SKU 매칭`
   - show Wing/Rocket identities, status, aliases, components, quantities, and
     calculated upload availability;
   - this is the only mapping-review surface.

Product Hub shows MasterProduct-to-InventorySku associations without presenting
them as marketplace option state. Bundle composition editing belongs to the
Channel SKU surface.

## Verification Plan

### Sellpia Import Tests

- valid workbook atomically replaces every represented quantity;
- an unknown code creates exactly one InventorySku, Inventory, and source item;
- a previously present code omitted from the next file becomes zero;
- an unrelated legacy SKU not represented in the complete snapshot becomes
  zero;
- duplicate, blank, negative, non-integer, empty, or oversized input rolls back
  the entire import;
- retrying the same hash returns the prior completed result;
- concurrent imports serialize and expose only one complete final snapshot;
- import creates no stock adjustment or Rocket-ledger entry;
- latest import age and created/updated/zeroed counts are accurate.

### Channel Tests

- Wing identity is `sellerProductId -> ChannelProduct` and
  `vendorItemId -> ChannelSku`;
- stopped Wing options remain stored but are not uploaded;
- Rocket identity is `productNo -> ChannelSku` and barcode remains an alias;
- a single component quantity `1` exposes the Sellpia quantity;
- an 80-unit base SKU exposes 20 Rocket four-packs;
- mixed-component availability uses the minimum quotient;
- unmatched or invalid component mappings block upload;
- no name or duplicate barcode is auto-accepted.

### Rocket and Fulfillment Tests

- two four-packs produce a fulfillment requirement of eight units;
- confirmation, outbound, cancellation, and return do not mutate Inventory;
- recipe edits do not rewrite an existing fulfillment snapshot;
- repeated artifact generation is idempotent;
- a single batch does not allocate the same snapshot quantity twice.

### Migration Tests

- physical SKU identity and proven Sellpia codes survive migration;
- bundle options receive no Inventory row;
- direct options become quantity-`1` components;
- bundle component quantities survive exactly;
- the first cutover import makes every current quantity equal to the workbook
  or zero when absent;
- historical stock transactions and Sellpia/Rocket audit rows remain readable;
- no production read uses legacy reconciliation, Rocket compensation, reserved
  stock, or safety stock for channel availability.

### Required Repository Gates

- `npm run db:push` for additive schema work;
- `npx prisma generate`;
- `cd packages/shared && npm run build`;
- focused unit and PostgreSQL integration tests for Inventory, Channels,
  Products, Orders, and Rocket;
- `npm run dev:server` with confirmed NestJS boot;
- `npm run build --workspace=apps/web`;
- reconstruction and release-contract PR guards;
- `db:push --accept-data-loss` only during reviewed `0.1.9` cleanup.

## Out of Scope

- KidItem-owned inventory ledger or manual stock adjustments;
- Sellpia difference/reconciliation approval;
- exporting KidItem stock back to Sellpia;
- adding Rocket or order deltas to an imported quantity;
- persisted reservations, safety-stock subtraction, or channel stock pools;
- a post-snapshot order overlay;
- direct Sellpia API integration;
- fuzzy-name or duplicate-barcode auto matching;
- inventory rows for bundles;
- automatic reconstruction of unprovable historical bundle recipes.

## External Pattern Validation

The physical-SKU and channel-recipe separation follows established inventory
patterns:

- Medusa inventory kits allow channel/product variants to consume reusable
  inventory items:
  <https://docs.medusajs.com/resources/commerce-modules/inventory/inventory-kit>
- Medusa keeps ProductVariant-to-InventoryItem relations separate:
  <https://docs.medusajs.com/resources/commerce-modules/inventory/links-to-other-modules>
- ERPNext models a bundle as a non-stock parent whose child quantities drive
  availability:
  <https://docs.frappe.io/erpnext/product-bundle>

These patterns support the component model. Sellpia's authority and the
complete-snapshot overwrite policy are project-specific business decisions.

## Open Business Decisions

None. The accepted behavior is complete atomic replacement from Sellpia,
zero-on-absence, no KidItem stock mutation, and channel-only component mapping.
