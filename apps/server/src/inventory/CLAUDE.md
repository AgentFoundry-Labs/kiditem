Before working in this directory, always read this document first rather than relying on memory.

# inventory — Warehouse Operation Records

Inventory retains warehouses, stock-transfer records and the read-only Rocket
workbook-progress capability. Products owns Sellpia collection, source products,
current stock and collection status; Orders owns return-transfer records.

- Transfer records never change `MasterProduct.currentStock`.
- New transfers reference organization-validated MasterProduct UUIDs through
  Products' public read port. Preserve nullable legacy SKU IDs on old records;
  never fill a legacy ID with a new MasterProduct UUID.
- Missing current products leave historical records readable. Preserve their
  IDs and quantities without inventing a connection (ADR-0016).
- Warehouse organization/FK checks and existing record behavior remain intact.
- Consumers use published ports. Controllers do not reach persistence adapters.
