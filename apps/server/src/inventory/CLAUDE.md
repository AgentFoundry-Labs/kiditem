Before working in this directory, always read this document first rather than relying on memory.

# inventory — Sellpia Snapshot And Inventory Operations

`src/inventory/` owns Sellpia imports and authoritative physical SKU snapshots,
collection status/generation fencing, warehouses, stock transfers, return records, and
the Inventory availability boundaries consumed by matching and purchase
preview workflows. KidItem has no second mutable stock balance.

## Identity And Ownership

- `SellpiaInventorySku` is one provider product-code identity and
  `currentStock` is its physical quantity authority.
- `SourceImportRun` owns source provenance, idempotency, and attempt fencing.
- Public physical availability uses the Inventory-owned `currentStock` fact.
- Transfer, return-transfer, and warehouse rows are inventory workflow records;
  completing them does not change `currentStock`.
- Commitment, Picking, Unshipped, and Sellpia receipt-batch capabilities are
  retired and their persistence models are absent.

The full schema is
[prisma/models/inventory.prisma](../../../../prisma/models/inventory.prisma).
Publication, collection-status, availability, transfer, and controller boundaries are
executable in [the Inventory tests](__tests__/).

## Snapshot And Collection Status Contract

- Sellpia import is the only writer of physical `currentStock`. It atomically
  replaces one organization/source snapshot under an import attempt fence,
  retains absent known codes with zero stock, and preserves identity and
  component references.
- The import owner writes source-failure Alerts in the same transaction as
  terminal source state and resolves the same deduplicated alert on successful
  publication.
- Source completion accepts the browser-collected artifact through the source
  attempt contract; its internal parser uses the same hash, generation,
  quality, and publication path for every supported artifact format.
- Publication may update only Inventory-owned source facts and the one-to-one
  canonical owner provision required by that snapshot. It never translates
  source differences into channel, order, transfer, purchase, or Rocket writes.
- Inventory owns collection status, the generation high-water mark, source
  binding, browser lease, and advisory lock. Status is driven by the latest
  attempt and completed snapshot; time does not make a completed snapshot
  stale. An expired browser attempt follows the explicit retry policy and is
  not silently reclaimed.
- `adapter/out/persistence/transaction/sellpia-inventory-lock` holds the only
  lock key. Sellpia writers take `lockSellpiaInventory` in their own
  transaction. An availability caller takes it right before the read and
  passes the returned evidence to the reader.
- The collection-status read exposes `not_collected`, `running`, `complete`,
  or `failed`, together with source binding, generation, active lease, last
  completed attempt, and last attempt identity. It does not expose a TTL or
  synthetic `availableStock`/`isActive` gate. Consumers may observe status and
  join a source attempt but cannot control leases or persistence.
- Purchase preview uses `requireCollectedStock({ organizationId, attemptId,
  sellpiaInventorySkuIds })`. That capability proves the exact completed
  current attempt and generation, then returns the fenced `currentStock` rows.
  A caller must carry the attempt identity returned by the source owner.
- Public generation values are decimal strings and control authority derives
  from the authenticated actor without exposing owner IDs.

Read
[sellpia-inventory-freshness.md](../../../../docs/runbooks/sellpia-inventory-freshness.md)
and
[sellpia-rocket-inventory-sync.md](../../../../docs/runbooks/sellpia-rocket-inventory-sync.md)
before changing refresh or Rocket interactions.

## Published Capabilities

- Read-only physical-SKU identity and matching evidence.
- Snapshot-aware physical availability from the completed fenced generation.
- Exact-attempt collected stock for purchase preview.
- Read-only Rocket workflow progress projected from Orders-owned transmission
  intents.

External domains use these incoming ports rather than Inventory services.
Product and channel destinations are read-only projections of confirmed direct
component relations; never infer them from codes, names, or barcodes.

## Boundaries

- Controllers depend on incoming ports; application and domain code follow the
  server adapter/purity rules. Prisma imports stay in persistence adapters,
  including the `read/` and `transaction/` subdirectories.
- No receive, issue, adjust, reserve, release, restock, stock-ledger, or Rocket
  event may write physical stock. No active logical-hold path reduces public
  availability.
- Route order keeps static paths before parameter routes.
- Product mutations enter through Products APIs. Ordinary Inventory reads and
  operation records do not mutate MasterProduct rows.
