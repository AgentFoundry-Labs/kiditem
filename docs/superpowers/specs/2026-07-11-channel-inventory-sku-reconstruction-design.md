# Channel and Inventory SKU Reconstruction Design

## Status

Approved for implementation on 2026-07-11.

This design supersedes the stock-ownership, matching, and bundle assumptions in
[`2026-06-28-sellpia-rocket-inventory-sync-design.md`](./2026-06-28-sellpia-rocket-inventory-sync-design.md).
Historical Sellpia import and Rocket stock-event audit data from that release
must still be preserved during reconstruction.

## Purpose

KidItem must become the inventory system of record while keeping sales-channel
identities and external inventory-service identities outside the physical SKU
model.

The reconstruction must support:

- physical inventory at an independent SKU granularity;
- Coupang Wing and Coupang Rocket as separate channel accounts;
- Sellpia as an external inventory-management provider, not a sales channel;
- one channel SKU consuming one or more physical inventory SKUs;
- same-SKU multipacks, mixed bundles, and normal one-unit sales through the same
  component model;
- reservation-aware stock export to Sellpia;
- immutable order-component snapshots so later mapping changes do not corrupt
  shipment, cancellation, or return behavior;
- deterministic imports and explicit review for ambiguous mappings;
- preservation of all existing inventory and reconciliation audit history.

This is a platform-boundary reconstruction across Products, Inventory,
Channels, Orders, shared contracts, Prisma, and the operator UI. It is not a
rename-only change.

## Approved Business Decisions

1. KidItem owns the inventory ledger and is the source of truth.
2. Sellpia is an external inventory-management provider.
3. Coupang Wing and Coupang Rocket are distinct channels.
4. Marketplace options belong to the channel layer, not the KidItem physical
   inventory model.
5. Every stock-bearing unit is an `InventorySku`.
6. A bundle has no inventory row of its own.
7. A channel SKU always consumes inventory through component rows, including a
   normal one-to-one sale with quantity `1`.
8. A four-pack channel SKU consumes four units of its component SKU. An order
   quantity of two therefore reserves and later issues eight physical units.
9. Sellpia receives KidItem saleable stock, not raw physical current stock.
10. Emergency Sellpia edits are reconciled through a reviewed KidItem import;
    they do not silently overwrite the ledger.
11. The first outbound Sellpia integration is an operator-uploaded Excel file.
12. All valid Wing options are imported, including stopped options. Inactive
    options retain mappings but do not participate in active stock sync.
13. Unknown Sellpia product codes create independent Inventory SKUs only after
    import preview approval.
14. Pre-cutover bundle orders without provable component history are routed to
    manual review for return or reshipment.

## Evidence From Current Data

The 2026-07-11 operator-supplied Wing workbook contains:

- 2,241 rows with a valid `vendorItemId`;
- 1,225 `sellerProductId` values among those valid rows;
- 137 seller products with more than one option row;
- 773 active and 1,468 stopped channel-option rows;
- only 26 nonblank barcode cells;
- 44 seller products whose exposed `productId` is not one-to-one with the
  seller product.

Consequences:

- `vendorItemId` is the stable Wing channel-SKU identity.
- `sellerProductId` is the Wing channel-product identity.
- exposed `productId` and barcodes are aliases or diagnostics, not primary join
  keys.
- names and option text cannot safely drive automatic matching.

The latest inspected Sellpia export contains 1,963 unique product codes. Source
barcodes are not unique: multiple product codes may share a barcode. A Sellpia
product code therefore remains a provider-scoped external identity and must not
be collapsed by barcode automatically.

The inspected Rocket PO identifies a four-pack with a Rocket barcode not found
in either Sellpia or Wing. Its physical component is the Sellpia-managed base
SKU. This proves that a Rocket barcode is a channel identifier and that bundle
quantity must be explicit.

## Domain Boundaries

```text
Products
  MasterProduct
      |
      +-- MasterProductInventorySku -- InventorySku

Inventory
  InventorySku -- Inventory -- StockTransaction
       |
       +-- ExternalInventoryItem -- InventoryProvider (Sellpia)
       +-- InventoryProviderImport / Observation / Review / Export

Channels
  ChannelAccount (Coupang Wing or Coupang Rocket)
       |
       +-- ChannelProduct (optional parent)
       +-- ChannelSku -- ChannelSkuIdentifier
                      -- ChannelSkuComponent -- InventorySku

Orders
  OrderLine -- OrderLineInventoryComponent -- InventorySku
```

### Products

Products owns merchandising, content, and family-level planning.
`MasterProduct` remains a product family and does not own stock. It may be
associated with multiple physical SKUs through a relation, but that relation is
not a marketplace option state.

### Inventory

Inventory owns physical SKUs, balances, reservations, stock transactions,
external inventory providers, reconciliation, and export generation. All stock
writes go through Inventory-owned services and ports.

### Channels

Channels owns marketplace or fulfillment-account identities, external product
and SKU identifiers, channel state, channel pricing, and the mutable recipe
that maps a channel SKU to physical Inventory SKUs.

### Orders

Orders owns the immutable snapshot of the channel recipe used for each accepted
or confirmed order line. Inventory consumes that snapshot; it must never look
up the current mutable channel recipe when reversing an old order.

## Target Data Model

All provider and status values remain validated strings rather than native
PostgreSQL enums.

### InventorySku

`InventorySku` is a physical stock, purchase, scanner, and warehouse unit.

Core fields:

- `id`
- `organizationId`
- `sku`
- `name`
- `barcode`
- `costPrice`
- `otherCost`
- `status`
- `isTemporary`
- `temporaryReason`
- `isDeleted`
- timestamps

Rules:

- unique `(organizationId, sku)`;
- barcode is not a universal identity and is not globally unique;
- no `masterId` ownership requirement;
- no `legacyCode` provider identity;
- no `optionName` or option status;
- no `isBundle` or materialized bundle stock;
- an SKU may exist before it is associated with a MasterProduct or channel;
- retired SKUs remain referentially available for historical ledger rows.

### MasterProductInventorySku

This relation associates a merchandising family with a physical SKU without
making the SKU an internal marketplace option.

Fields:

- `id`
- `organizationId`
- `masterProductId`
- `inventorySkuId`
- `displayName`
- `sortOrder`
- `isPrimary`
- catalog-association visibility
- legacy reference sell price, commission rate, and shipping cost
- timestamps

Rules:

- unique `(masterProductId, inventorySkuId)`;
- both sides must belong to the same organization;
- removing an association does not delete the Inventory SKU;
- stock and cost are never duplicated on the relation;
- existing option display text may be migrated into `displayName`, but it has
  no channel availability or activation meaning;
- legacy commercial values remain durable planning references on the relation
  when no unambiguous channel destination exists; real channel pricing and fees
  belong to ChannelProduct or ChannelSku.

### Inventory

`Inventory` remains one-to-one with a physical SKU.

The existing balances remain:

- `currentStock`: physical on-hand stock;
- `reservedStock`: committed but not yet issued stock;
- `safetyStock`: withheld from sale;
- monotonic `balanceVersion`: concurrency token for every balance or safety
  mutation;
- reorder and warehouse planning fields.

The foreign key becomes `inventorySkuId`. No bundle receives an Inventory row.
Every current, reserved, or safety-stock mutation increments `balanceVersion`
atomically. Numeric balances or timestamps alone are not sufficient because a
balance can change and later return to the same value.

### InventoryProvider

An organization-scoped external inventory-management account.

Fields include:

- `id`
- `organizationId`
- `providerType`, initially `sellpia`
- `name`
- `externalAccountId`
- `status`
- `config`
- verified, versioned `reportedQuantitySemantics`, such as `on_hand` or
  `saleable`, which every import/export run snapshots immutably
- timestamps

Legacy data can prove only one Sellpia provider per organization. The migration
must create one legacy provider for each organization with Sellpia history; it
must not invent multiple accounts.

### ExternalInventoryItem

The current provider-scoped identity and mapping.

Fields include:

- `id`
- `organizationId`
- `inventoryProviderId`
- `externalItemCode`
- `displayName`
- source barcode and model-name diagnostics
- nullable `inventorySkuId`
- mapping status and review metadata
- `stockSyncEnabled`
- latest observed metadata
- timestamps

Rules:

- unique `(inventoryProviderId, externalItemCode)`;
- one external code has at most one current Inventory SKU mapping;
- historical or diagnostic external items may reference the same Inventory SKU,
  but only one active Sellpia item per provider may have stock sync enabled for
  that Inventory SKU;
- enforce the active stock-sync rule with a partial unique constraint over
  `(inventoryProviderId, inventorySkuId)` when `stockSyncEnabled = true`;
- exporting the full saleable quantity to two Sellpia codes for the same
  Inventory SKU is forbidden because it would duplicate availability;
- mapping changes do not rewrite historical import observations;
- rejected rows without an external code remain valid historical observations
  with a nullable external-item reference.

### Provider Import and Export History

`ExternalInventoryItem` stores current identity only. It must not absorb the
immutable Sellpia history.

The generic provider history must preserve:

- import file name, SHA-256, effective export time, actor, and run counts;
- immutable calculation `policyVersion`;
- every raw observation row, including rejected and duplicate rows;
- source stock, safety stock, barcodes, model name, and raw JSON;
- the mapping, Inventory row, and policy inputs observed at import time;
- calculated target, difference, warning, and blocking reasons;
- operator target, stock-at-apply, decision, note, actor, and time;
- applied `StockTransaction` IDs;
- candidate-resolution decisions and initial receive transaction IDs;
- outbound export batches, template version, file status, and upload actor.

Existing identifiers referenced by `StockTransaction.relatedId` must remain
traceable. A migration may rename the provider-specific tables, but it must
preserve row IDs and audit cardinality.

Migrated runs use `legacy_sellpia_plus_rocket_v1` and retain every stored input
and result verbatim. New runs use `kiditem_saleable_v2`. Migration never
recalculates a historical observation under a newer policy.

### ChannelProduct

The channel's parent product identity. It replaces the domain meaning of
`ChannelListing` while preserving listing analytics and content relations.

Core ownership includes a nullable `masterProductId`. Existing
`ChannelListing.masterId` values are preserved exactly. A future Rocket-only
product may remain unlinked until an operator associates it with a merchandising
family. Component mappings never infer or rewrite MasterProduct ownership.

Core identity fields are `id`, `organizationId`, `channelAccountId`,
`masterProductId`, `externalId`, name, channel status, metadata, and timestamps.
The database enforces unique `(channelAccountId, externalId)` so concurrent
imports cannot create duplicate parents.

ChannelProduct, MasterProduct, and ChannelAccount must belong to the same
organization. Deleting a MasterProduct association does not delete the channel
identity or its historical orders.

For Wing:

- canonical external ID: `sellerProductId`;
- exposed `productId`: alias or metadata only.

Rocket may omit a parent when the available feed exposes only an operational
`productNo`.

### ChannelSku

The channel-specific sellable, fulfillment, or PO item.

Fields include:

- `id`
- `organizationId`
- `channelAccountId`
- nullable `channelProductId`
- `externalId`
- `itemName`
- `salePrice`
- `status`
- `mappingStatus`
- integer `mappingVersion`
- metadata
- timestamps

Canonical external IDs:

- Wing: `vendorItemId`;
- Rocket: `productNo`.

Rules:

- unique `(channelAccountId, externalId)`;
- a `matched` SKU has at least one component;
- an `unmatched` SKU has no operational stock effect and blocks order or stock
  sync;
- no direct `inventorySkuId` shortcut exists: a normal sale uses one component
  with quantity `1`;
- every atomic component-set replacement increments `mappingVersion`;
- order acceptance locks the ChannelSku row or performs a compare-and-swap on
  `mappingVersion`, then snapshots that exact version and reserves stock in the
  same transaction.

### ChannelSkuIdentifier

Provider-specific aliases such as barcode, exposed product ID, model number, or
legacy identifier.

Aliases aid search and candidate generation. They do not bypass an explicit
component mapping and must tolerate non-unique source values.

### ChannelSkuComponent

The current mutable recipe for one channel SKU.

Fields:

- `id`
- `organizationId`
- `channelSkuId`
- `inventorySkuId`
- `quantity`
- timestamps

Rules:

- quantity is a positive integer;
- unique `(channelSkuId, inventorySkuId)`;
- channel SKU and Inventory SKU must have the same organization;
- nested bundles do not exist;
- changing a recipe affects only future order snapshots;
- delete of an Inventory SKU referenced by a component is restricted.

Examples:

```text
Wing single item
  ChannelSku(vendorItemId=A) -> InventorySku(base), quantity=1

Rocket four-pack
  ChannelSku(productNo=B) -> InventorySku(base), quantity=4

Mixed set
  ChannelSku(externalId=C) -> InventorySku(red),  quantity=1
                           -> InventorySku(blue), quantity=2
```

### OrderLineInventoryComponent

An immutable snapshot created when an order line is accepted for inventory
handling. For Rocket this occurs when the operator confirms the PO quantity and
reservation.

Fields include:

- `id`
- `organizationId`
- `orderLineId`
- `channelSkuId`
- `inventorySkuId`
- `quantityPerUnit`
- accepted order quantity
- `totalQuantity`
- source mapping version or snapshot metadata
- immutable allocation revision ID and revision number
- revision kind, order-quantity delta, and nullable reversed-revision ID
- timestamps

`totalQuantity = acceptedOrderQuantity * quantityPerUnit`.

Reservation, picking, issue, cancellation, and return operate on these rows.
They never re-read current `ChannelSkuComponent` rows for an existing order.

`acceptedOrderQuantity`, `quantityPerUnit`, and `totalQuantity` are immutable
after creation and constrained so the total equals their product.

Order-line inventory state is append-only by allocation revision. The initial
acceptance creates revision `1`. Amendments never edit an existing component
row:

- a decrease appends a reversal revision for the still-open quantity;
- a quantity-only increase appends a positive delta revision by copying the
  original acceptance component vector and mapping version;
- a pre-issue SKU remap releases the old open reservation and snapshots/reserves
  the new recipe in one command;
- issued quantities are never remapped.

Picking and mutation limits are calculated from the sum of active revisions and
their prior effects, while every original revision remains auditable.
Quantity-only increase or decrease never reads current ChannelSkuComponent
rows. Explicit pre-issue SKU remap is the only amendment allowed to lock and
snapshot the currently approved recipe.

### InventoryMutationCommand and Component Effect

A multi-component business action needs one aggregate idempotency record rather
than one unrelated idempotency row per component.

`InventoryMutationCommand` stores:

- organization, source type, source action ID, and event type;
- canonical component-vector hash;
- command status and serialized result reference;
- actor, reason, and timestamps.

It is unique by `(organizationId, sourceType, sourceActionId, eventType)`.
Component-effect children are unique by
`(inventoryMutationCommandId, orderLineInventoryComponentId)` and record every
current/reserved delta and resulting ledger reference.

All children commit in the same transaction. Replaying the same command and
hash returns the stored result. Reusing the key with a different component
vector or quantity is a conflict, not a partial retry.

Every open reservation must be owned by command effects. A separate explicit
non-order reservation-hold record may own a proven manual or migration hold,
with source, actor, quantity, reason, and release history. Unattributed
`reservedStock` is a cutover blocker.

### Picking Projection

Each picking allocation references:

- `inventorySkuId`;
- `orderLineInventoryComponentId`;
- `orderLineId`;
- fulfillment attempt identity;
- required, picked, and issued quantities.

`fulfillmentAttemptId` is not a timestamp-generated list ID. It is a stable
provider shipment/fulfillment segment identity or a persisted attempt aggregate
that is idempotently obtained before allocation. The generator claims only
eligible snapshot revisions without an allocation for that fulfillment segment,
inside a transaction. A uniqueness constraint on snapshot revision and segment
prevents duplicate picking across process restarts and repeated list generation.
Partial fulfillment assigns only the remaining quantity to a new stable
segment. Physical pick instructions may aggregate the same Inventory SKU, but
allocation children keep the order/component trace needed for partial issue,
cancellation, and return.

Before allocating any segment, the generator locks the snapshot revision or a
dedicated allocation aggregate, re-reads allocations for all segments, and
computes remaining quantity. Different segment keys therefore serialize on the
same revision. The database/service invariant is that summed active allocation
quantity never exceeds the active revision total.

Blocked or manual-review orders never enter automatic picking and expose their
exclusion reason to the operator.

### LegacyProductOptionTombstone

Only legacy bundle identities that cannot become physical Inventory SKUs use a
read-only tombstone. It preserves the old ProductOption UUID, organization,
MasterProduct, SKU, barcode, legacy code, option label, commercial fields,
materialized capacity, raw migration metadata, archive reason, and timestamps.

Pre-cutover order, picking, transfer, Rocket-ledger, and reconciliation history
that referred to such a bundle is redirected to an explicit nullable tombstone
reference or preserved scalar snapshot. No active stock mutation may target the
tombstone.

## Stock Calculations

### Physical and Saleable Stock

```text
physicalCurrentStock = Inventory.currentStock

rawSaleableStock =
  Inventory.currentStock
  - Inventory.reservedStock
  - Inventory.safetyStock

saleableStock = max(0, rawSaleableStock)
```

Sellpia receives `saleableStock` for each stock-sync-enabled external item.
`currentStock` and `reservedStock` must remain non-negative, and a reservation
must not make `reservedStock` exceed `currentStock`. Safety stock may make raw
saleable stock negative; the exported value is clamped to zero.

### Channel Availability

For a matched channel SKU:

```text
channelAvailable = min(
  floor(component.saleableStock / component.quantity)
  for every component
)
```

Missing Inventory, zero components, invalid quantities, or an unmatched mapping
produce blocked availability rather than an assumed zero-to-one fallback.

### Four-Pack Example

Starting state:

```text
currentStock = 100
reservedStock = 0
safetyStock = 0
Sellpia saleable stock = 100
```

Confirming two Rocket four-packs:

```text
required units = 2 * 4 = 8
currentStock = 100
reservedStock = 8
Sellpia saleable stock = 92
```

Completing outbound:

```text
currentStock = 92
reservedStock = 0
Sellpia saleable stock = 92
```

Cancellation before outbound releases eight reserved units. A completed return
receives the proven component quantity back into physical current stock.

## Workflows

### Initial Sellpia Bootstrap

1. Upload the latest Sellpia stock export.
2. Parse and preserve every raw observation.
3. Match exact, provenance-backed legacy Sellpia codes first. Valid provenance
   is limited to an immutable snapshot match, a terminal candidate-resolution
   decision, or a reviewed baseline explicitly identified as Sellpia.
4. Use exact unique barcode candidates only when the barcode occurs once among
   active source rows and once among eligible non-deleted Inventory SKUs in the
   organization.
5. Never merge duplicate source barcodes automatically.
6. For each still-unmatched code, preview exactly one resolution:
   `link_existing_inventory_sku`, `create_inventory_sku`, or `ignore`. The
   default for an approved unmatched code is `create_inventory_sku`, as agreed,
   but the operator may replace it with link or ignore before approval.
7. Create or update `ExternalInventoryItem` mappings.
8. Preview the resulting Inventory adjustments.
9. On approval, create explicit stock transactions that reconcile KidItem to
   the Sellpia cutover snapshot.
10. Record actor, before/after quantities, source row, and transaction IDs.

Uploading a file never mutates stock or creates SKUs before approval.
Approved Inventory SKU creation, Inventory creation, external mapping, opening
adjustment, and terminal review state commit atomically. Linking an existing SKU
does not create a separate opening receive; it follows the reviewed adjustment
path for that existing Inventory balance.

The source Sellpia safety-stock column is preserved as an observation. It does
not overwrite `Inventory.safetyStock` unless the operator separately approves a
safety-stock change.

The provider adapter stores raw reported stock and provider safety stock
separately, then derives `normalizedSaleableStock` according to the immutable
run policy and verified `reportedQuantitySemantics`. Cutover is blocked until
the actual Sellpia export and upload template semantics are verified. Inbound
normalization and outbound generation are exact inverses and never add or
subtract provider safety stock twice.

### Ongoing Sellpia Reconciliation

1. A Sellpia export creates a new immutable import run.
2. Current mappings resolve external items to Inventory SKUs.
3. KidItem and Sellpia saleable quantities are compared.
4. Differences become review proposals.
5. KidItem is not overwritten automatically.
6. An approved emergency Sellpia edit becomes an explicit KidItem adjustment.
7. The next outbound Excel export is generated from KidItem saleable stock.

The old `targetCurrentStock = sellpiaStock + rocketLedgerNet` formula is
retired. Rocket reservations and issues are already represented in KidItem
balances and must not be added a second time.

When an operator explicitly accepts a Sellpia-side quantity as the corrected
saleable quantity, the Inventory adjustment target is calculated at apply time:

```text
targetCurrentStock =
  acceptedSellpiaSaleableStock
  + lockedReservedStock
  + lockedSafetyStock
```

The apply transaction re-locks Inventory and revalidates events that occurred
after the source export time. This avoids treating a saleable value as raw
physical current stock and avoids overwriting a concurrent reservation.

Each proposal stores `observedBalanceVersion`. Approval locks Inventory and
requires an exact version match before calculating the target and mutation.

Legacy migrated runs are audit-only and cannot be approved under the new
policy. The cutover creates a fresh `kiditem_saleable_v2` run. Approval fails as
stale when current, reserved, safety, or balance version changed after proposal
calculation; there is no blanket file-level stock mutation.

### Sellpia Outbound Excel

The first outbound adapter generates an operator-downloadable Excel file with
Sellpia product codes and KidItem saleable stock. The system records:

- generation source and time;
- included external items;
- stock value at generation;
- template version and file hash;
- operator upload confirmation.

Legacy receipt-upload batches migrate only fields that existed. Unknown file
hashes, included-item observations, and generated stock values remain null with
`historyCompleteness = legacy_batch_only`; they are never reconstructed from
current balances. Every post-cutover export requires immutable item/value rows
and a file hash before entering `pending_upload`.

Direct Sellpia API upload is out of scope.

The adapter must verify how the target Sellpia template applies provider-side
safety stock. It translates KidItem's saleable target so the effective Sellpia
saleable quantity equals the exported value and must not subtract safety stock a
second time.

### Wing Catalog Import

1. Upsert `ChannelProduct` by Wing account and `sellerProductId`.
2. Upsert `ChannelSku` by Wing account and `vendorItemId`.
3. Preserve `productId`, barcode, names, and option text as aliases or metadata.
4. Import all valid rows, including stopped items.
5. Keep stopped items inactive without deleting their component mapping.
6. Apply only deterministic component matches automatically.
7. Route multi-option, duplicate-barcode, fuzzy-name, and bundle candidates to
   review.

The import is idempotent. A repeated workbook updates channel metadata without
duplicating identities or clearing approved components.

### Rocket PO

1. Upsert or resolve the Rocket `ChannelSku` by `productNo`.
2. Preserve the Rocket barcode as a channel alias.
3. Block confirmation when the channel SKU has no approved components.
4. Calculate all component requirements from the operator-confirmed PO
   quantity.
5. Lock every affected Inventory row in deterministic order.
6. Validate total saleable stock.
7. Create immutable order-line component snapshots and reservations in one
   transaction.
8. Generate the confirmation artifact only for the committed reservation, with
   an idempotency key derived from the PO and line identity.
9. Issue the snapshots on outbound, release them on cancellation, and receive
   them on a proven return.

No partial component reservation is allowed.

### General Channel Orders

Wing and future channels use the same snapshot and inventory-mutation rules.
Channel-specific ingestion may differ, but inventory semantics do not.

The inventory lifecycle is:

```text
ingested or unmatched (no stock effect)
  -> accepted (snapshot + reservation once)
  -> partially_issued | issued | cancelled
  -> partially_returned | returned, when applicable
```

Before acceptance, external upserts may update quantity and ChannelSku identity.
After acceptance, the original snapshots are immutable. A changed external
quantity or SKU requires an explicit append-only allocation-revision command:

- before issue, a decrease appends a reversal revision and an increase appends a
  delta revision, changing only the open reservation delta;
- a pre-issue SKU remap releases the old open revision and creates a new
  recipe-version snapshot plus reservation atomically;
- after partial issue, cancellation may release only the still-reserved amount;
- issued quantity cannot be reduced or remapped automatically;
- return quantity cannot exceed issued minus already returned;
- release cannot exceed the open reservation;
- out-of-order, conflicting, or unsupported amendments enter manual review.

Acceptance and every amendment have separate source-scoped idempotency keys.

## Matching Policy

Automatic matching is allowed only when evidence is deterministic.

Allowed:

- exact Sellpia product code backed by an immutable snapshot match, terminal
  candidate resolution, or reviewed Sellpia baseline;
- an already approved current mapping;
- exact barcode with cardinality one on both the active provider-import side and
  the eligible organization Inventory-SKU side;
- a legacy channel mapping whose source and target cardinality are one-to-one.

Not allowed for automatic acceptance:

- name containment or fuzzy name score;
- exposed Coupang `productId` as a seller-product key;
- duplicate barcodes;
- seller-product-only mappings for multi-option products;
- Rocket barcode directly to Inventory SKU without an approved channel recipe.

Every review decision records the actor, evidence, source identity, target SKU,
component quantity, note, and timestamp.

`ProductOption.legacyCode` alone is never mapping evidence. Conflicting proven
sources create one unmapped `ExternalInventoryItem` with
`mappingStatus = conflict`; recency does not resolve the conflict automatically.

## Legacy ProductOption and Bundle Migration

### Non-Bundle Rows

- Copy each non-bundle `ProductOption` to `InventorySku` with the same UUID.
- Create one `MasterProductInventorySku` relation from the old `masterId`.
- Move Inventory and operational foreign keys to `inventorySkuId` while
  retaining the UUID.
- Move `costPrice` and physical SKU fields to InventorySku.
- Move option display text and sort order to the MasterProduct relation.
- Seed channel price fields from old selling fields only where the target
  channel row is unambiguous; otherwise preserve the value in the catalog
  relation reference field and migration review report.

The durable field destinations are:

| Legacy ProductOption field | Destination |
|---|---|
| `id`, `sku`, `barcode`, cost and physical status | `InventorySku` with the same ID and SKU |
| `masterId`, `optionName`, `sortOrder`, catalog visibility | `MasterProductInventorySku` |
| `sellPrice` | ChannelSku when unambiguous; otherwise relation reference value |
| `commissionRate`, `shippingCost` | ChannelProduct/ChannelSku when unambiguous; otherwise relation reference values |
| `otherCost` | InventorySku cost metadata |
| `legacyCode` | ExternalInventoryItem only with provider provenance; otherwise migration identifier history |
| `isBundle`, `availableStock` | no InventorySku field; channel components and computed channel availability |
| temporary/deleted timestamps | physical SKU status plus catalog-association visibility, without deleting history |

Existing internal SKU strings never change. New independent SKU strings come
from a transaction-safe organization-scoped Inventory SKU allocator and are not
derived from a MasterProduct code or Sellpia product code.

`ProductOption.legacyCode` cannot be assumed to mean Sellpia globally. Only
codes supported by Sellpia snapshot or candidate provenance become
`ExternalInventoryItem` mappings. Other legacy-code consumers must be converted
before the column is removed.

Historical Sellpia foreign keys are converted explicitly:

- snapshot `productOptionId` becomes `observedInventorySkuId` with the preserved
  non-bundle UUID;
- candidate `resolvedProductOptionId` becomes `resolvedInventorySkuId`;
- snapshot and candidate row IDs remain unchanged;
- polymorphic StockTransaction related IDs continue to resolve through the
  retained generic history row; any `relatedType` rename and lookup registry
  change is atomic and verified in both directions.

### Direct Channel Mappings

An existing direct `ChannelListingOption.optionId` mapping to a non-bundle SKU
becomes one `ChannelSkuComponent` with quantity `1`.

Whenever possible, `ChannelListing.id` is preserved as `ChannelProduct.id` and
`ChannelListingOption.id` as `ChannelSku.id`. If preservation is impossible, a
durable old-to-new mapping rewrites every order, analytics, content, and market
snapshot foreign key, followed by keyed non-null/cardinality verification.

A preflight scanner blocks duplicate `(channelAccountId, externalId)` values
that the stronger ChannelSku identity would collapse. New component and
snapshot relations enforce organization equality with database keys in addition
to service checks.

### Bundle Rows

For every active or inactive channel option linked to a legacy bundle:

- create a `ChannelSku` identity;
- copy every legacy `BundleComponent` into that channel SKU's component rows;
- preserve component quantities;
- duplicate the recipe when one legacy bundle was linked to multiple channel
  SKUs, because the recipes may diverge after cutover;
- clear the old direct option mapping only after the new component cardinality
  is verified.

Automatic migration is blocked for:

- a bundle with no linked channel SKU;
- a bundle with no components;
- a deleted or missing component;
- cross-organization ownership;
- invalid or duplicate component quantities;
- a channel SKU whose existing mapping conflicts with the bundle recipe.

Operators must explicitly link, archive, or correct blocked rows before the
legacy contract is removed.

The preflight scanner must also classify every legacy `isBundle = true` row
that has an Inventory, non-zero balance, StockTransaction, Rocket ledger,
PickingItem, return transfer, or stock transfer. Only zero-balance bundles with
no immutable stock history can be removed automatically. A tombstone may own
identity and immutable history only; it never owns a balance.

Any non-zero bundle current, reserved, or safety balance blocks contract removal
until an operator approves an audited transfer, allocation, or write-off to
proven physical Inventory SKUs and the legacy Inventory reaches zero. A
ledger-only reference may then be redirected to a tombstone without changing
historical values. Only after these distinct balance and history conditions are
resolved may keyed zero-difference verification run.

### Historical Bundle Orders

The legacy model has no immutable bundle version. Past recipe changes cannot be
reconstructed reliably from current rows.

Therefore:

- existing bundle identity and relevant raw metadata are preserved as a
  read-only migration tombstone;
- affected pre-cutover orders are marked `manual_inventory_review`;
- automated return, reshipment, or exchange is blocked for those orders;
- an operator records the proven physical component adjustment explicitly;
- all orders accepted after cutover receive immutable component snapshots.

No legacy bundle row is treated as a physical Inventory SKU.

## Versioned Cutover

The release version becomes `0.1.8`.

The user-visible transition is a hard cutover, but the implementation follows
an expand/backfill/switch/contract sequence within the release. There is no
long-lived dual source of truth.

### 1. Preflight

- pause Sellpia approvals and channel inventory mutations for a bounded
  maintenance window;
- capture a database backup and the latest Sellpia export;
- run scanners for orphan, cross-organization, duplicate, bundle, and historical
  reference conflicts;
- classify every legacy bundle Inventory, balance, transaction, picking,
  transfer, and Rocket-ledger reference;
- require an explicit resolution for every blocking result.

### 2. Expand

- add the new models and nullable transition foreign keys;
- add new shared contracts, owner ports, and regression scanners;
- keep all old reads intact until backfill verification succeeds.

### 3. Backfill

- preserve non-bundle UUIDs;
- create MasterProduct associations;
- migrate operational references and direct channel mappings;
- expand legacy bundles into channel components;
- create quantity-`1` component snapshots for open non-bundle order lines;
- attribute every open non-bundle reservation to migrated
  OrderLineInventoryComponent revisions and InventoryMutationCommand effects
  using the old source action, without writing a second balance delta;
- place proven non-order holds in explicit reservation-hold rows and block every
  unattributed remainder;
- route open legacy bundle order lines and their picking work to manual review;
- create one legacy Sellpia provider per organization;
- create external-item mappings only from proven Sellpia history;
- migrate provider import/export history without changing IDs or decisions and
  label its policy/completeness explicitly;
- do not create any stock transaction solely because of schema backfill.

### 4. Verify

Required zero-difference checks:

- keyed Inventory equality by preserved non-bundle UUID, including
  organization, current/reserved/safety, planning, and warehouse fields;
- keyed StockTransaction equality by transaction ID, including organization,
  Inventory SKU target, type, quantity, related ID/type, actor, note, and
  timestamp;
- aggregate Inventory and transaction totals as supplemental checks only;
- non-bundle ProductOption to InventorySku cardinality;
- operational foreign-key completeness;
- provider import run and observation cardinality;
- provider-history field equality keyed by preserved run, observation,
  candidate, and export-batch IDs, including file identity/times, actor,
  metadata, row number, raw values, raw JSON checksum, observed mappings,
  policy version, calculation inputs/results, reasons, decisions, and
  transaction references;
- bidirectional provider-history orphan count and field-level mismatch count of
  zero, with cardinality checks treated as supplemental;
- direct and bundle channel-mapping cardinality;
- keyed ChannelListing/ChannelListingOption identity and downstream foreign-key
  preservation;
- organization equality across every new relation;
- no matched channel SKU with zero components;
- no blocked bundle migration issue.
- no duplicate picking allocation for any snapshot component and fulfillment
  attempt.
- keyed equality for every Inventory SKU between `reservedStock` and the sum of
  open snapshot-owned reservations plus explicit non-order reservation holds.

### 5. Switch

- deploy the new Inventory, Channels, Orders, Products, API, and UI reads and
  writes together;
- make order and PO processing consume immutable component snapshots;
- generate Sellpia stock from saleable inventory;
- create and explicitly approve selected rows from a fresh
  `kiditem_saleable_v2` Sellpia cutover run;
- resume channel processing after smoke verification.

### 6. Contract

After regression gates pass:

- remove `ProductOption`, `BundleComponent`, bundle-stock materialization, and
  their APIs;
- remove direct channel-option-to-product-option mapping;
- remove Sellpia reads and writes of `legacyCode`;
- remove the old Rocket correction formula and any duplicate Rocket ledger
  compensation;
- retain existing Rocket ledger rows as immutable history, but stop using them
  as a second balance source;
- keep only explicit historical tombstones and immutable audit records, not
  compatibility write paths.

The durable data migration lives under
`scripts/data-migrations/v0.1.8/` and is registered in the migration index.

## Error Handling and Idempotency

- Missing component mappings block order, PO, and stock sync with an actionable
  reason.
- Invalid component data fails before any Inventory row is mutated.
- All component Inventory rows are locked in deterministic ID order.
- Reservation, issue, cancellation, return, import approval, and export
  generation use source-scoped idempotency keys.
- Replayed external events return the prior result without duplicating stock
  effects.
- A multi-component mutation commits completely or rolls back completely.
- Negative `currentStock` or `reservedStock` transitions and reservations above
  physical current stock are rejected unless an existing explicit override
  policy applies with actor and reason. Safety stock may reduce raw saleable
  stock below zero; external availability remains clamped to zero.
- Organization identity is derived from authentication and verified across all
  related rows; DTOs never supply it as trusted input.
- Import parse failures preserve the run and raw error evidence without stock
  mutation.

## Operator Surfaces

Inventory Hub is divided into:

1. `실물 SKU`
   - Inventory SKU search, balance, reservations, identifiers, and linked
     MasterProducts.
2. `Sellpia 재고 대조`
   - upload preview, mapping candidates, differences, approval, and export
     batches.
3. `채널 SKU 매칭`
   - account, external IDs, status, aliases, components, quantities, and
     calculated availability.
4. `처리 차단 주문`
   - unmatched current orders and manual-review legacy bundle orders.

The Product Hub shows MasterProduct-to-InventorySku associations but no longer
labels them as marketplace option state. Bundle composition editing moves to
the Channel SKU surface.

## Verification Plan

### Domain Tests

- physical SKU has no bundle or channel-option state;
- saleable-stock calculation includes reservations and safety stock;
- channel capacity uses the minimum component quotient;
- quantity multiplication for same-SKU and mixed bundles;
- component mapping requires same organization and positive quantity;
- mapping changes do not change an existing order snapshot;
- concurrent mapping replacement and order acceptance resolves to exactly one
  recorded mapping version;
- no partially committed component set within one reservation or issue command;
- deterministic locking and idempotent replay;
- same command key with a different component hash is rejected.

### Sellpia Tests

- source encoding and Excel-text formula normalization;
- duplicate and blank product codes preserve raw rows;
- exact mapping and ambiguous barcode review;
- preview creates no SKU or stock mutation;
- approved unmatched rows create independent Inventory SKUs;
- approval creates audited adjustment transactions;
- future imports propose differences instead of overwriting stock;
- exported value is `current - reserved - safety`;
- existing snapshot, candidate, review, and transaction audit is preserved.

### Channel Tests

- Wing parent/SKU identity and idempotent upsert;
- stopped options retain mappings but do not actively sync;
- exposed product ID and barcode remain aliases;
- Rocket `productNo` is canonical and barcode is not a physical-SKU fallback;
- unmatched channel SKU blocks processing;
- one legacy bundle linked to multiple channel SKUs expands correctly;
- ChannelProduct/ChannelSku UUIDs and downstream analytics references survive
  migration.

### Order and Inventory Tests

- two Rocket four-packs reserve and issue eight physical units;
- cancellation releases eight units;
- return receives the snapshot quantity;
- mixed components are aggregated by Inventory SKU before locking;
- recipe mutation after confirmation does not change picking or return;
- accepted quantity amendments change only the permitted open reservation;
- increase, decrease, and pre-issue remap amendments produce the correct
  append-only revision total and pick quantity;
- quantity increase after a channel recipe change still copies the original
  acceptance recipe unless the action is an explicit pre-issue remap;
- partial issue, cancellation, and return cannot exceed their snapshot-derived
  limits;
- picking generation replay, including a new process and a new list-generation
  call for the same fulfillment segment, creates no duplicate allocation;
- concurrent allocation for two different fulfillment segments serializes on
  the revision and never exceeds the remaining quantity;
- physical pick aggregation retains order-component allocation children;
- pre-cutover bundle orders route to manual review;
- stock event references remain auditable after migration.

### Migration Tests

- migration is idempotent;
- row counts and stock totals are unchanged by schema backfill;
- historical Sellpia IDs and transaction references remain valid;
- orphan, cross-organization, invalid bundle, and conflicting mappings block
  contract removal;
- a legacy bundle with Inventory or immutable stock references blocks automatic
  deletion until an approved allocation or tombstone redirect is verified;
- every migrated reserved unit is attributed to an open snapshot effect or an
  explicit non-order hold without writing a duplicate reserve delta;
- legacy removal scanner passes before old tables or fields are dropped.

### Required Repository Gates

- `npm run db:push -- --accept-data-loss` only when the reviewed contract phase
  intentionally drops legacy schema;
- `npx prisma generate`;
- `cd packages/shared && npm run build`;
- focused unit and PostgreSQL integration tests for every changed domain;
- `npm run dev:server` and confirmed NestJS boot;
- `npm run build --workspace=apps/web`;
- release-contract and reconstruction PR guards.

## Rollback Policy

Before the switch, a failed migration leaves old reads and writes authoritative
and can be retried after correction.

After the switch accepts new stock events, rollback must not restore an old
database snapshot over newer operations. Recovery uses a forward fix and the
immutable stock/audit records. The maintenance window must therefore include
smoke checks for:

- one single-SKU reservation and release;
- one four-pack reservation and release;
- one Sellpia reconciliation preview;
- one Sellpia outbound export preview;
- one unmatched-channel block.

## Out of Scope

- direct Sellpia API upload;
- automatic fuzzy-name acceptance;
- automatic merge of duplicate barcodes;
- marketplace-specific option state on InventorySku;
- inventory rows for bundles;
- automatic reconstruction of unprovable pre-cutover bundle order recipes;
- a second physical stock pool for Rocket;
- marketplace stock API push beyond the explicitly designed adapters.

## External Pattern Validation

This design follows established inventory-boundary patterns rather than making
channel variants the stock owner:

- Medusa separates inventory items from product variants and supports variants
  consuming reusable inventory-item kits:
  <https://docs.medusajs.com/resources/commerce-modules/inventory/inventory-kit>
- Medusa stores ProductVariant-to-InventoryItem relations separately:
  <https://docs.medusajs.com/resources/commerce-modules/inventory/links-to-other-modules>
- ERPNext models a product bundle as a non-stock parent whose child item
  quantities drive stock deduction:
  <https://docs.frappe.io/erpnext/product-bundle>

## Implementation Preconditions

The business design is closed, but implementation must not switch production
until these evidence gates pass:

- a Sellpia export and outbound template fixture proves the provider's reported
  stock and safety-stock semantics and the inverse transformation;
- legacy bundle balance/history scanners have no unresolved result;
- channel identity collision scanners pass;
- every existing reservation has a proven owner;
- keyed migration verification and required smoke checks pass.

## Open Business Decisions

None. All material domain, stock, matching, cutover, and historical-order
policies in this document were approved in the design conversation.
