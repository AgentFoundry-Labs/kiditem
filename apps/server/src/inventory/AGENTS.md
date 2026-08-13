# inventory — Sellpia Snapshot And Inventory Operations

`src/inventory/` owns Sellpia imports and authoritative physical SKU snapshots,
freshness/generation fencing, warehouses, stock transfers, return records, and
the Inventory availability boundaries consumed by matching and purchase
preview workflows. KidItem has no second mutable stock balance.

## Identity And Ownership

- `SellpiaInventorySku` is one provider product-code identity and
  `currentStock` is its physical quantity authority.
- `SourceImportRun` owns source provenance, idempotency, and attempt fencing.
- Public physical availability is exactly `availableStock === currentStock`.
- Transfer, return-transfer, and warehouse rows are operation records;
  completing them does not change `currentStock`.
- Commitment, Picking, Unshipped, and Sellpia receipt-batch capabilities are
  retired and their persistence models are absent.

The full schema is
[prisma/models/inventory.prisma](../../../../prisma/models/inventory.prisma).
Publication, freshness, availability, transfer, and controller boundaries are
executable in [the Inventory tests](__tests__/).

## Snapshot And Freshness Contract

- Sellpia import is the only writer of physical `currentStock`. It atomically
  replaces one organization/source snapshot under an import attempt fence,
  marks absent known codes inactive with zero stock, and preserves identity and
  component references.
- Automatic JSON collection and manual recovery uploads enter the same hash,
  generation, quality, and publication path.
- Publication may update only Inventory-owned source facts and the one-to-one
  canonical owner provision required by that snapshot. It never translates
  source differences into channel, order, transfer, purchase, or Rocket writes.
- Inventory owns freshness policy, generation high-water mark, source binding,
  browser lease, and advisory lock. Expired browser work follows the explicit
  retry policy; it is not silently reclaimed.
- The availability and freshness gates return `currentStock`, equal
  `availableStock`, and active state from the same fenced generation. Before a
  snapshot is collected, availability contains no SKU items. Consumers may
  join/request a target generation but cannot control leases or persistence.
- Public generation values are decimal strings and control authority derives
  from the authenticated actor without exposing owner IDs.

Read
[sellpia-inventory-freshness.md](../../../../docs/runbooks/sellpia-inventory-freshness.md)
and
[sellpia-rocket-inventory-sync.md](../../../../docs/runbooks/sellpia-rocket-inventory-sync.md)
before changing refresh or Rocket interactions.

## Published Capabilities

- Read-only physical-SKU identity and matching evidence.
- Snapshot-aware physical availability where `availableStock === currentStock`.
- Fresh-and-active capacity with same-generation gating.
- Read-only Rocket workflow progress projected from Orders-owned transmission
  intents.

External domains use these incoming ports rather than Inventory services.
Product and channel destinations are read-only projections of confirmed direct
component relations; never infer them from codes, names, or barcodes.

## Boundaries

- Controllers depend on incoming ports; application and domain code follow the
  server adapter/purity rules. Prisma imports stay in repository adapters.
- No receive, issue, adjust, reserve, release, restock, stock-ledger, or Rocket
  event may write physical stock. No active logical-hold path reduces public
  availability.
- Route order keeps static paths before parameter routes.
- Product operations enter through Products APIs. Ordinary Inventory reads and
  operation records do not mutate MasterProduct rows.
- Shipment bulk persistence remains tenant-bound, deduplicated, and
  last-write-wins rather than row-by-row.
