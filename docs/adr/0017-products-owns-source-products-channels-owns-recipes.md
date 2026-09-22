---
status: accepted
---

# Products owns source products; Channels owns recipes

Products owns `MasterProduct` as the single source-inventory product, including Sellpia identity, collected stock and purchase price, while Channels owns marketplace listings, sellable options and their component recipes. Sellpia publication updates that product directly and preserves its UUID, KID code and operator-managed images; internal consumers reference UUIDs while KID codes identify products in operator and external workflows. This replaces the split source-SKU/canonical-product model and supersedes [ADR-0007](0007-products-owns-channel-option-recipe-mutations.md)'s recipe ownership without changing confirmed-recipe preservation or matching safeguards.

## Consequences

- Source identity is the organization/account/product-code/option-code tuple, stored as plain fields with uniqueness; names and barcodes never merge source products.
- A successful complete collection atomically updates facts and sets absent products to zero; failures and partial results preserve the previous complete state.
- Source-scope state records the completed attempt and generation. Product rows have no import-run pointer. Purchase and Rocket calculations must verify the successful attempt they requested.
- One noncycling sequence issues `KID` plus eight digits. A one-unit singleton option may reuse its source product's code; bundles receive a separately issued code without creating another source product. Existing marketplace seller codes remain unchanged.
- Legacy references and frozen results retain their original IDs and quantities. Unmatched legacy products block cutover until inspected and explicitly resolved; migration does not invent source identities or discard them.
