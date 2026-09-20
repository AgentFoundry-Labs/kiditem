---
status: accepted
---

# Inventory history retains deleted SKU identities

Deleting a current inventory SKU must preserve transfer, return and order records together with their original SKU IDs. Operational references therefore retain indexed IDs and expose a missing current SKU as no connection; for Inventory-owned `StockTransfer`, this is a scoped exception to [ADR-0013](0013-cross-owner-references-are-ids-not-foreign-keys.md)'s intra-owner FK rule, chosen over `Restrict`, cascading deletion or erasing the ID with `SetNull`. Recollecting a physically deleted code creates a new identity without relinking history, whereas absence from a complete collection retains the existing row and ID with quantity zero.

Organization, user, warehouse and shared collection-attempt foreign keys remain intact. This decision adds no delete API and does not change warehouse business behavior.
