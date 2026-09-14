Before working in this directory, always read this document first rather than relying on memory.

# analytics — Reporting + Read Models

`src/analytics/` owns dashboard, statistics, traffic, and supplier-stats read
models. It may read across owner-domain tables for reporting, but it does not
take mutation authority from them.

## Ownership and source boundaries

- Analytics reads, but does not own, order, channel, product, inventory, alert,
  thumbnail, supplier, purchase, or payment facts. Dashboard raw SQL and
  report hydration stay behind analytics repository adapters.
- Source owners publish their own attempts, facts, coverage manifests, and
  `COMPLETE` snapshots; attempts terminate only as `COMPLETE` or `FAILED`.
  Source terminal handling never invokes ABC. Analytics never treats a partial,
  failed, missing, or stale source as a successful zero and does not initiate
  collection.
- Products owns `MasterProduct` ABC evaluation, publication, current grade, and
  history. Analytics may read the stored result and expose reporting views, but
  it does not calculate or store a second grade and does not trigger refresh.
- ABC profitability evidence uses only the latest compatible complete source
  periods, including an exact partial month through the selected cutoff.
  Sellpia rows are eligible only with explicit
  `ORDER_TIME_SUPPLY_COST` and VAT-included provenance; legacy or unknown-cost
  facts remain readable for depletion but are not ABC evidence.

## Reporting rules

- Metric formulas are changed only with a scoped plan and behavior tests. Raw
  snapshots are audit/replay evidence; reporting APIs read owner-published
  facts and projections.
- Traffic CSV upload remains separate from advertising collection.
- If an owner changes a read schema or mutation contract consumed by analytics,
  update the reader in the same change or record an explicit compatibility
  decision.
- Product depletion matching permits only product-code exact, option-code
  exact, or a unique barcode. Missing, inactive, disconnected, or duplicate
  matches are not converted to stock zero. Sum rows resolved to the same
  Sellpia SKU before counting reorder or dead stock.
- Product revenue, operating-profit contribution, rank, and cumulative share
  are reporting metrics only. They never alter the absolute ABC score or grade.

## Cross-domain reads

Analytics may read owner-published order, channel, product, inventory, alert,
ABC, thumbnail, supplier, purchase-order, and payment projections. Every
tenant-owned table in ORM or raw-SQL joins remains organization-fenced.
